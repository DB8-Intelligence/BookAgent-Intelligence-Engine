/**
 * Facebook Adapter — Publishing Adapter Layer
 *
 * Adapter para publicação no Facebook via Graph API.
 *
 * Fluxo de publicação (Facebook Graph API):
 *   - Texto/link → POST /{page-id}/feed   (message + link opcional)
 *   - Imagem    → POST /{page-id}/photos  (url + message)
 *   - Vídeo     → POST /{page-id}/videos  (file_url + description)
 *
 * Variáveis de ambiente (META_* preferencial, fallback para FACEBOOK_*):
 *   - META_ACCESS_TOKEN / FACEBOOK_PAGE_ACCESS_TOKEN
 *   - META_FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ID
 *
 * Parte 67: Publishing Adapter Layer
 * Ativação real: Graph API v19.0
 */

import type { ISocialAdapter, PublishPayload, PublishResult } from '../../../domain/entities/publication.js';
import { SocialPlatform, PublishContentType } from '../../../domain/entities/publication.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const REQUEST_TIMEOUT_MS = 30_000;

function getConfig() {
  return {
    accessToken: process.env.META_ACCESS_TOKEN ?? process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '',
    pageId: process.env.META_FACEBOOK_PAGE_ID ?? process.env.FACEBOOK_PAGE_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCaption(payload: PublishPayload): string {
  const parts: string[] = [payload.caption.trim()];
  if (payload.hashtags?.length) {
    const tags = payload.hashtags
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    parts.push(tags);
  }
  return parts.join('\n\n');
}

async function fetchGraph(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
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
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Facebook adapter not configured — set META_ACCESS_TOKEN and META_FACEBOOK_PAGE_ID',
      };
    }

    const cfg = getConfig();

    try {
      // Route by content type
      const isVideo = payload.contentType === PublishContentType.VIDEO
        || payload.contentType === PublishContentType.REEL;
      const hasImage = !!(payload.thumbnailUrl || payload.videoUrl) && !isVideo;

      if (isVideo && payload.videoUrl) {
        return await this.publishVideo(cfg, payload);
      }
      if (hasImage && payload.thumbnailUrl) {
        return await this.publishPhoto(cfg, payload);
      }
      return await this.publishFeed(cfg, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[FacebookAdapter] Publish failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async checkStatus(platformPostId: string): Promise<PublishResult> {
    const cfg = getConfig();
    try {
      const res = await fetchGraph(
        `${GRAPH_API_BASE}/${platformPostId}?fields=id,message,created_time,permalink_url&access_token=${cfg.accessToken}`,
        { method: 'GET' },
      );

      if (res.ok && res.body['id']) {
        return {
          success: true,
          platformPostId: res.body['id'] as string,
          postUrl: (res.body['permalink_url'] as string) ?? undefined,
          statusCode: res.status,
          publishedAt: res.body['created_time']
            ? new Date(res.body['created_time'] as string)
            : undefined,
        };
      }

      const apiError = res.body['error'] as Record<string, unknown> | undefined;
      return {
        success: false,
        statusCode: res.status,
        error: (apiError?.['message'] as string) ?? 'Unknown error',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Feed post (texto + link opcional)
  // ---------------------------------------------------------------------------

  private async publishFeed(
    cfg: { accessToken: string; pageId: string },
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const message = formatCaption(payload);
    const endpoint = `${GRAPH_API_BASE}/${cfg.pageId}/feed`;

    const body: Record<string, string> = {
      message,
      access_token: cfg.accessToken,
    };

    if (payload.platformMeta?.['link']) {
      body['link'] = payload.platformMeta['link'] as string;
    }

    logger.info(`[FacebookAdapter] Publishing feed post to page=${cfg.pageId}`);

    const res = await fetchGraph(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return this.parseResponse(res, body);
  }

  // ---------------------------------------------------------------------------
  // Photo post (imagem + caption)
  // ---------------------------------------------------------------------------

  private async publishPhoto(
    cfg: { accessToken: string; pageId: string },
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const message = formatCaption(payload);
    const endpoint = `${GRAPH_API_BASE}/${cfg.pageId}/photos`;

    const body: Record<string, string> = {
      url: payload.thumbnailUrl!,
      message,
      access_token: cfg.accessToken,
    };

    logger.info(`[FacebookAdapter] Publishing photo to page=${cfg.pageId}`);

    const res = await fetchGraph(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return this.parseResponse(res, body);
  }

  // ---------------------------------------------------------------------------
  // Video post
  // ---------------------------------------------------------------------------

  private async publishVideo(
    cfg: { accessToken: string; pageId: string },
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const description = formatCaption(payload);
    const endpoint = `${GRAPH_API_BASE}/${cfg.pageId}/videos`;

    const body: Record<string, string> = {
      file_url: payload.videoUrl!,
      description,
      access_token: cfg.accessToken,
    };

    if (payload.title) {
      body['title'] = payload.title;
    }

    logger.info(`[FacebookAdapter] Publishing video to page=${cfg.pageId}`);

    const res = await fetchGraph(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return this.parseResponse(res, body);
  }

  // ---------------------------------------------------------------------------
  // Response parser
  // ---------------------------------------------------------------------------

  private parseResponse(
    res: { ok: boolean; status: number; body: Record<string, unknown> },
    _sentPayload: Record<string, string>,
  ): PublishResult {
    const apiError = res.body['error'] as Record<string, unknown> | undefined;

    if (!res.ok || apiError) {
      const errorMsg = (apiError?.['message'] as string) ?? `HTTP ${res.status}`;
      logger.warn(`[FacebookAdapter] Publish failed: ${errorMsg}`);
      return {
        success: false,
        statusCode: res.status,
        error: errorMsg,
        rawResponse: res.body,
      };
    }

    // Facebook returns { id: "page-id_post-id" } or { post_id: "..." }
    const rawId = (res.body['id'] ?? res.body['post_id']) as string | undefined;

    logger.info(`[FacebookAdapter] Published successfully. postId=${rawId}`);

    return {
      success: true,
      platformPostId: rawId,
      postUrl: rawId ? `https://www.facebook.com/${rawId}` : undefined,
      statusCode: res.status,
      publishedAt: new Date(),
      rawResponse: res.body,
    };
  }
}
