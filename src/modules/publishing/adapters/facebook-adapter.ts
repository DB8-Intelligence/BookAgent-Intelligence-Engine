/**
 * Facebook Adapter — Publishing Adapter Layer
 *
 * Adapter para publicação no Facebook via Graph API v19.
 *
 * Fluxo de publicação de vídeo (Reels):
 *   1. POST /{pageId}/video_reels — inicializa upload, recebe video_id
 *   2. POST ao upload_url com o binário do vídeo
 *   3. POST /{pageId}/video_reels com video_id + status=PUBLISHED — publica
 *
 * Fluxo de publicação de imagem/post:
 *   1. POST /{pageId}/photos com url= + published=false — recebe photo_id
 *   2. POST /{pageId}/feed com attached_media + message — publica
 *
 * Variáveis de ambiente:
 *   - FACEBOOK_PAGE_ACCESS_TOKEN: token de acesso da página (long-lived)
 *   - FACEBOOK_PAGE_ID: ID numérico da página
 *
 * Parte 67 (revisão): Facebook Graph API real
 */

import type { ISocialAdapter, PublishPayload, PublishResult } from '../../../domain/entities/publication.js';
import { SocialPlatform, PublishContentType } from '../../../domain/entities/publication.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '',
    pageId: process.env.FACEBOOK_PAGE_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class FacebookAdapter implements ISocialAdapter {
  readonly platform = SocialPlatform.FACEBOOK;
  readonly name = 'Facebook Graph API';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.accessToken && cfg.pageId);
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (process.env.SOCIAL_PUBLISH_MODE === 'mock') {
      const fakeId = `facebook-mock-${Date.now()}`;
      logger.info(`[FacebookAdapter] MOCK: simulating publish caption="${payload.caption.slice(0, 40)}..." id=${fakeId}`);
      return {
        success: true,
        platformPostId: fakeId,
        postUrl: `https://facebook.com/${fakeId}`,
        publishedAt: new Date(),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Facebook adapter não configurado — defina FACEBOOK_PAGE_ACCESS_TOKEN e FACEBOOK_PAGE_ID',
      };
    }

    const isVideo = payload.contentType === PublishContentType.VIDEO
      || payload.contentType === PublishContentType.REEL;

    try {
      if (isVideo) {
        return await this.publishReel(payload);
      }
      return await this.publishPhoto(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[FacebookAdapter] Publish failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Reel / Vídeo
  // ---------------------------------------------------------------------------

  private async publishReel(payload: PublishPayload): Promise<PublishResult> {
    const cfg = getConfig();
    const videoUrl = payload.videoUrl;

    if (!videoUrl) {
      return { success: false, error: 'videoUrl é obrigatório para publicar Reel no Facebook' };
    }

    // Step 1: Inicializar upload
    const initEndpoint = `${GRAPH_API_BASE}/${cfg.pageId}/video_reels`;
    const initRes = await fetch(initEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_phase: 'start',
        access_token: cfg.accessToken,
      }),
    });

    const initData = await initRes.json() as Record<string, unknown>;

    if (!initRes.ok || !initData.video_id) {
      return {
        success: false,
        statusCode: initRes.status,
        error: (initData.error as Record<string, unknown>)?.message as string
          ?? `FB Reel init falhou: HTTP ${initRes.status}`,
      };
    }

    const videoId = initData.video_id as string;
    const uploadUrl = initData.upload_url as string;

    logger.info(`[FacebookAdapter] Reel init OK: video_id=${videoId}`);

    // Step 2: Upload do binário via URL pública (FB baixa diretamente)
    // Quando o vídeo está no Supabase Storage público, usamos a URL direta
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `OAuth ${cfg.accessToken}`,
        'file_url': videoUrl,
      },
    });

    if (!uploadRes.ok) {
      return {
        success: false,
        statusCode: uploadRes.status,
        error: `FB Reel upload falhou: HTTP ${uploadRes.status}`,
      };
    }

    logger.info(`[FacebookAdapter] Reel upload OK: video_id=${videoId}`);

    // Step 3: Publicar
    const caption = this.buildCaption(payload);
    const publishRes = await fetch(initEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        upload_phase: 'finish',
        video_state: 'PUBLISHED',
        description: caption,
        title: payload.title ?? '',
        access_token: cfg.accessToken,
      }),
    });

    const publishData = await publishRes.json() as Record<string, unknown>;

    if (publishRes.ok && (publishData.success || publishData.id)) {
      const postId = (publishData.post_id_fbid ?? publishData.id) as string | undefined;
      logger.info(`[FacebookAdapter] Reel publicado: ${postId ?? 'ok'}`);

      return {
        success: true,
        platformPostId: postId,
        statusCode: publishRes.status,
        publishedAt: new Date(),
        rawResponse: publishData,
      };
    }

    return {
      success: false,
      statusCode: publishRes.status,
      error: (publishData.error as Record<string, unknown>)?.message as string
        ?? `FB Reel publish falhou: HTTP ${publishRes.status}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Foto / Imagem
  // ---------------------------------------------------------------------------

  private async publishPhoto(payload: PublishPayload): Promise<PublishResult> {
    const cfg = getConfig();
    const imageUrl = payload.thumbnailUrl ?? payload.videoUrl;

    if (!imageUrl) {
      return { success: false, error: 'thumbnailUrl é obrigatório para publicar imagem no Facebook' };
    }

    const caption = this.buildCaption(payload);

    // Upload da foto + publicação direta
    const endpoint = `${GRAPH_API_BASE}/${cfg.pageId}/photos`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        message: caption,
        access_token: cfg.accessToken,
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (res.ok && data.id) {
      const postId = data.post_id as string | undefined ?? data.id as string;
      logger.info(`[FacebookAdapter] Foto publicada: ${postId}`);

      return {
        success: true,
        platformPostId: postId,
        postUrl: `https://www.facebook.com/${cfg.pageId}/posts/${postId}`,
        statusCode: res.status,
        publishedAt: new Date(),
        rawResponse: data,
      };
    }

    return {
      success: false,
      statusCode: res.status,
      error: (data.error as Record<string, unknown>)?.message as string
        ?? `FB Photo publish falhou: HTTP ${res.status}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Check status
  // ---------------------------------------------------------------------------

  async checkStatus(platformPostId: string): Promise<PublishResult> {
    const cfg = getConfig();

    try {
      const res = await fetch(
        `${GRAPH_API_BASE}/${platformPostId}?fields=id,created_time,permalink_url,message&access_token=${cfg.accessToken}`,
      );
      const data = await res.json() as Record<string, unknown>;

      if (res.ok && data.id) {
        return {
          success: true,
          platformPostId: data.id as string,
          postUrl: data.permalink_url as string | undefined,
          publishedAt: data.created_time ? new Date(data.created_time as string) : undefined,
          rawResponse: data,
        };
      }

      return {
        success: false,
        statusCode: res.status,
        error: (data.error as Record<string, unknown>)?.message as string ?? 'Post não encontrado',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildCaption(payload: PublishPayload): string {
    const tags = payload.hashtags?.join(' ') ?? '';
    return tags ? `${payload.caption}\n\n${tags}` : payload.caption;
  }
}
