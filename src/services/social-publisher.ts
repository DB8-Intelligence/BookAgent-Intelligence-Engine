/**
 * Social Publisher Service — BookAgent Intelligence Engine
 *
 * Serviço de publicação em redes sociais via Meta Graph API.
 * V1 suporta: Instagram (imagem) e Facebook (texto + imagem opcional).
 *
 * Autenticação:
 *   - Meta access token com escopos necessários (ver docs/SOCIAL_PUBLISHING.md)
 *   - Credenciais configuradas via variáveis de ambiente ou request body
 *
 * Limitações V1:
 *   - Instagram: requer imageUrl publicamente acessível
 *   - Facebook: texto + link (imagem opcional)
 *   - Não suporta: carrossel, reels, stories, agendamento
 *
 * Parte 51: Integração Real de Publicação Social
 * Parte 53: Parallelização, retry de erros transientes, permalink real
 */

import { logger } from '../utils/logger.js';
import type {
  MetaCredentials,
  SocialContent,
  SocialPublishOptions,
  SocialPublishResult,
  PlatformPublishResult,
  SocialPlatform,
} from '../types/social.js';

// ============================================================================
// Constants
// ============================================================================

const META_GRAPH_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

/** HTTP status codes que justificam retry (transientes) */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ============================================================================
// Helpers
// ============================================================================

/** Formata caption + hashtags em texto pronto para publicação */
function formatCaption(content: SocialContent): string {
  const parts: string[] = [content.caption.trim()];
  if (content.hashtags?.length) {
    const tags = content.hashtags
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    parts.push(tags);
  }
  return parts.join('\n\n');
}

/** Aguarda N ms */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Faz fetch com timeout e trata erros de rede */
async function fetchMeta(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    throw new Error(
      `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * fetchMeta com 1 retry automático em erros transientes.
 * Erros de rede ou status 429/5xx são retentados após RETRY_DELAY_MS.
 */
async function fetchMetaWithRetry(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const result = await fetchMeta(url, init);
    if (!result.ok && RETRYABLE_STATUS.has(result.status)) {
      logger.warn(`[SocialPublisher] Retryable status ${result.status} — retrying in ${RETRY_DELAY_MS}ms`);
      await delay(RETRY_DELAY_MS);
      return fetchMeta(url, init);
    }
    return result;
  } catch (err) {
    // Erro de rede — tentar uma vez mais
    logger.warn(`[SocialPublisher] Network error — retrying in ${RETRY_DELAY_MS}ms: ${err instanceof Error ? err.message : String(err)}`);
    await delay(RETRY_DELAY_MS);
    return fetchMeta(url, init);
  }
}

// ============================================================================
// SocialPublisherService
// ============================================================================

export class SocialPublisherService {
  // --------------------------------------------------------------------------
  // Instagram (Meta Graph API)
  // --------------------------------------------------------------------------

  /**
   * Publica imagem ou vídeo/reel no Instagram Business.
   *
   * Fluxo (3-4 steps):
   *   1. POST /{ig-user-id}/media         → cria container (image ou REELS)
   *   2. Poll status_code até FINISHED    → (somente vídeo, até 60s)
   *   3. POST /{ig-user-id}/media_publish → publica o container
   *   4. GET  /{media-id}?fields=permalink → busca URL real da publicação
   *
   * Requer:
   *   - credentials.instagramAccountId
   *   - content.imageUrl (imagem) OU content.videoUrl (reel/vídeo)
   *   - Token com instagram_basic + instagram_content_publish
   */
  async publishToInstagram(
    credentials: MetaCredentials,
    content: SocialContent,
  ): Promise<PlatformPublishResult> {
    if (!credentials.instagramAccountId) {
      return {
        platform: 'instagram',
        success: false,
        skipped: true,
        skipReason: 'Instagram account ID não configurado (META_INSTAGRAM_ACCOUNT_ID)',
      };
    }

    const isVideo = !!content.videoUrl;

    if (!content.imageUrl && !content.videoUrl) {
      return {
        platform: 'instagram',
        success: false,
        skipped: true,
        skipReason: 'Instagram requer imageUrl ou videoUrl — forneça uma URL pública',
      };
    }

    const caption = formatCaption(content);
    const igUserId = credentials.instagramAccountId;

    // Step 1: Create media container
    const createPayload: Record<string, string> = {
      caption,
      access_token: credentials.accessToken,
    };

    if (isVideo) {
      createPayload['media_type'] = 'REELS';
      createPayload['video_url'] = content.videoUrl!;
      if (content.coverUrl) {
        createPayload['cover_url'] = content.coverUrl;
      }
    } else {
      createPayload['image_url'] = content.imageUrl!;
    }

    logger.info(`[SocialPublisher] Instagram: criando container (ig_user=${igUserId})`);

    let containerId: string;
    try {
      const createRes = await fetchMetaWithRetry(
        `${META_GRAPH_BASE}/${igUserId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        },
      );

      const createData = createRes.body as Record<string, unknown>;

      if (!createRes.ok || (createData['error'] as Record<string, unknown>)) {
        const apiError = createData['error'] as Record<string, unknown> | undefined;
        return {
          platform: 'instagram',
          success: false,
          error: (apiError?.['message'] as string) ?? `HTTP ${createRes.status}`,
          payload: createPayload as Record<string, unknown>,
          responseData: createData,
        };
      }

      containerId = createData['id'] as string;
    } catch (err) {
      return {
        platform: 'instagram',
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao criar container',
        payload: createPayload as Record<string, unknown>,
      };
    }

    // Step 2 (video only): Wait for processing
    if (isVideo) {
      logger.info(`[SocialPublisher] Instagram: aguardando processamento do vídeo (container=${containerId})`);
      const maxWaitMs = 60_000;
      const intervalMs = 5_000;
      const start = Date.now();

      while (Date.now() - start < maxWaitMs) {
        try {
          const statusRes = await fetchMeta(
            `${META_GRAPH_BASE}/${containerId}?fields=status_code&access_token=${credentials.accessToken}`,
            { method: 'GET' },
          );
          const statusData = statusRes.body as Record<string, unknown>;
          const statusCode = statusData['status_code'] as string;

          if (statusCode === 'FINISHED') break;
          if (statusCode === 'ERROR') {
            return {
              platform: 'instagram',
              success: false,
              error: 'Instagram media processing failed (status=ERROR)',
              responseData: statusData,
            };
          }
          logger.debug(`[SocialPublisher] Instagram container ${containerId} status: ${statusCode}`);
        } catch {
          // polling error — continue trying
        }
        await delay(intervalMs);
      }
    }

    // Step 3: Publish container
    const publishPayload = {
      creation_id: containerId,
      access_token: credentials.accessToken,
    };

    logger.info(`[SocialPublisher] Instagram: publicando container ${containerId}`);

    let postId: string;
    let publishData: Record<string, unknown>;
    try {
      const publishRes = await fetchMetaWithRetry(
        `${META_GRAPH_BASE}/${igUserId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(publishPayload),
        },
      );

      publishData = publishRes.body as Record<string, unknown>;
      const apiError = publishData['error'] as Record<string, unknown> | undefined;

      if (!publishRes.ok || apiError) {
        return {
          platform: 'instagram',
          success: false,
          error: (apiError?.['message'] as string) ?? `HTTP ${publishRes.status}`,
          payload: publishPayload as Record<string, unknown>,
          responseData: publishData,
        };
      }

      postId = publishData['id'] as string;
    } catch (err) {
      return {
        platform: 'instagram',
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao publicar container',
        payload: publishPayload as Record<string, unknown>,
      };
    }

    // Step 3: Fetch real permalink (numeric media ID ≠ shortcode — URL direta requer API)
    let postUrl: string | undefined;
    try {
      const permalinkRes = await fetchMeta(
        `${META_GRAPH_BASE}/${postId}?fields=permalink&access_token=${credentials.accessToken}`,
        { method: 'GET' },
      );
      const permalinkData = permalinkRes.body as Record<string, unknown>;
      if (permalinkRes.ok && typeof permalinkData['permalink'] === 'string') {
        postUrl = permalinkData['permalink'];
      }
    } catch {
      // Permalink é opcional — não bloqueia o sucesso
    }

    logger.info(`[SocialPublisher] Instagram: publicado com sucesso. postId=${postId}`);

    return {
      platform: 'instagram',
      success: true,
      postId,
      postUrl,
      payload: createPayload as Record<string, unknown>,
      responseData: publishData,
    };
  }

  // --------------------------------------------------------------------------
  // Facebook (Meta Graph API — Pages)
  // --------------------------------------------------------------------------

  /**
   * Publica no feed de uma Facebook Page.
   *
   * Sem imagem → POST /{page-id}/feed   (texto + link opcional)
   * Com imagem → POST /{page-id}/photos (imagem + caption)
   * Com vídeo  → POST /{page-id}/videos (file_url + description)
   *
   * Requer:
   *   - credentials.facebookPageId
   *   - Token com pages_manage_posts + pages_read_engagement
   */
  async publishToFacebook(
    credentials: MetaCredentials,
    content: SocialContent,
  ): Promise<PlatformPublishResult> {
    if (!credentials.facebookPageId) {
      return {
        platform: 'facebook',
        success: false,
        skipped: true,
        skipReason: 'Facebook Page ID não configurado (META_FACEBOOK_PAGE_ID)',
      };
    }

    const pageId = credentials.facebookPageId;
    const message = formatCaption(content);

    const useVideo = !!content.videoUrl;
    const usePhotos = !useVideo && !!content.imageUrl;

    let endpoint: string;
    if (useVideo) {
      endpoint = `${META_GRAPH_BASE}/${pageId}/videos`;
    } else if (usePhotos) {
      endpoint = `${META_GRAPH_BASE}/${pageId}/photos`;
    } else {
      endpoint = `${META_GRAPH_BASE}/${pageId}/feed`;
    }

    const payload: Record<string, string> = {
      access_token: credentials.accessToken,
    };

    if (useVideo) {
      payload['file_url'] = content.videoUrl!;
      payload['description'] = message;
    } else {
      payload['message'] = message;
      if (usePhotos && content.imageUrl) {
        payload['url'] = content.imageUrl;
      } else if (content.linkUrl) {
        payload['link'] = content.linkUrl;
      }
    }

    const mediaType = useVideo ? 'vídeo' : usePhotos ? 'foto' : 'texto';
    logger.info(
      `[SocialPublisher] Facebook: postando em page=${pageId} (${mediaType})`,
    );

    try {
      const res = await fetchMetaWithRetry(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = res.body as Record<string, unknown>;
      const apiError = data['error'] as Record<string, unknown> | undefined;

      if (!res.ok || apiError) {
        return {
          platform: 'facebook',
          success: false,
          error: (apiError?.['message'] as string) ?? `HTTP ${res.status}`,
          payload,
          responseData: data,
        };
      }

      // Facebook retorna { id: "page-id_post-id" } ou { post_id: "..." }
      const rawId = (data['id'] ?? data['post_id']) as string | undefined;

      logger.info(`[SocialPublisher] Facebook: publicado com sucesso. postId=${rawId}`);

      return {
        platform: 'facebook',
        success: true,
        postId: rawId,
        postUrl: rawId ? `https://www.facebook.com/${rawId}` : undefined,
        payload,
        responseData: data,
      };
    } catch (err) {
      return {
        platform: 'facebook',
        success: false,
        error: err instanceof Error ? err.message : 'Erro ao publicar no Facebook',
        payload,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Multi-platform publish — paralelo
  // --------------------------------------------------------------------------

  /**
   * Publica nas plataformas especificadas em paralelo e retorna resultado consolidado.
   * Plataformas não suportadas na V1 são registradas como skipped.
   */
  async publishToPlatforms(options: SocialPublishOptions): Promise<SocialPublishResult> {
    const tasks = options.platforms.map((platform): Promise<PlatformPublishResult> => {
      if (platform === 'instagram') {
        return this.publishToInstagram(options.credentials, options.content);
      }
      if (platform === 'facebook') {
        return this.publishToFacebook(options.credentials, options.content);
      }
      return Promise.resolve({
        platform,
        success: false,
        skipped: true,
        skipReason: `Plataforma "${platform}" não suportada na V1`,
      });
    });

    const results = await Promise.all(tasks);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    let finalStatus: SocialPublishResult['finalStatus'];
    if (successCount > 0 && failureCount === 0) {
      finalStatus = 'published';
    } else if (successCount > 0 && failureCount > 0) {
      finalStatus = 'partial';
    } else {
      finalStatus = 'publish_failed';
    }

    return { jobId: options.jobId, results, successCount, failureCount, skippedCount, finalStatus };
  }
}

// Singleton para uso no controller
export const socialPublisher = new SocialPublisherService();
