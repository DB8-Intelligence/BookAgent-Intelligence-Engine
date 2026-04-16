/**
 * Instagram Adapter — Publishing Adapter Layer
 *
 * Adapter para publicação no Instagram via Graph API.
 *
 * Fluxo de publicação (Instagram Graph API):
 *   1. Upload de mídia (vídeo/imagem) para container
 *   2. Publicar container no feed/reels
 *   3. Verificar status (polling)
 *
 * Variáveis de ambiente necessárias:
 *   - INSTAGRAM_ACCESS_TOKEN: token de acesso (page token com permissões)
 *   - INSTAGRAM_BUSINESS_ACCOUNT_ID: ID da conta business
 *
 * Status: Stub funcional — pronto para integração real.
 *
 * Parte 67: Publishing Adapter Layer
 */

import type { ISocialAdapter, PublishPayload, PublishResult } from '../../../domain/entities/publication.js';
import { SocialPlatform } from '../../../domain/entities/publication.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getConfig() {
  return {
    accessToken: process.env.META_ACCESS_TOKEN ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? '',
    accountId: process.env.META_INSTAGRAM_ACCOUNT_ID ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class InstagramAdapter implements ISocialAdapter {
  readonly platform = SocialPlatform.INSTAGRAM;
  readonly name = 'Instagram Graph API';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.accessToken && cfg.accountId);
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (process.env.SOCIAL_PUBLISH_MODE === 'mock') {
      const fakeId = `instagram-mock-${Date.now()}`;
      logger.info(`[InstagramAdapter] MOCK: simulating Reel upload caption="${payload.caption.slice(0, 40)}..." id=${fakeId}`);
      return {
        success: true,
        platformPostId: fakeId,
        postUrl: `https://instagram.com/p/${fakeId}`,
        publishedAt: new Date(),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Instagram adapter not configured — set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID',
      };
    }

    const cfg = getConfig();

    try {
      // Step 1: Create media container
      const containerId = await this.createMediaContainer(cfg, payload);
      if (!containerId) {
        return { success: false, error: 'Failed to create media container' };
      }

      // Step 2: Wait for processing (Instagram processes async)
      await this.waitForProcessing(cfg, containerId);

      // Step 3: Publish the container
      const result = await this.publishContainer(cfg, containerId);

      logger.info(
        `[InstagramAdapter] Published: postId=${result.platformPostId} ` +
        `url=${result.postUrl ?? 'pending'}`,
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[InstagramAdapter] Publish failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async checkStatus(platformPostId: string): Promise<PublishResult> {
    const cfg = getConfig();
    try {
      const response = await fetch(
        `${GRAPH_API_BASE}/${platformPostId}?fields=id,media_type,permalink,timestamp&access_token=${cfg.accessToken}`,
      );
      const data = await response.json() as Record<string, unknown>;

      if (response.ok && data.id) {
        return {
          success: true,
          platformPostId: data.id as string,
          postUrl: data.permalink as string | undefined,
          statusCode: response.status,
          publishedAt: data.timestamp ? new Date(data.timestamp as string) : undefined,
        };
      }

      return {
        success: false,
        statusCode: response.status,
        error: (data.error as Record<string, unknown>)?.message as string ?? 'Unknown error',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---------------------------------------------------------------------------
  // Graph API Steps
  // ---------------------------------------------------------------------------

  private async createMediaContainer(
    cfg: { accessToken: string; accountId: string },
    payload: PublishPayload,
  ): Promise<string | null> {
    const isVideo = !!payload.videoUrl;
    const endpoint = `${GRAPH_API_BASE}/${cfg.accountId}/media`;

    const params: Record<string, string> = {
      access_token: cfg.accessToken,
      caption: payload.caption,
    };

    if (isVideo) {
      params.media_type = 'REELS';
      params.video_url = payload.videoUrl!;
      if (payload.thumbnailUrl) {
        params.cover_url = payload.thumbnailUrl;
      }
    } else if (payload.thumbnailUrl) {
      params.image_url = payload.thumbnailUrl;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json() as Record<string, unknown>;

    if (response.ok && data.id) {
      logger.info(`[InstagramAdapter] Container created: ${data.id}`);
      return data.id as string;
    }

    logger.warn(
      `[InstagramAdapter] Container creation failed: ` +
      `${response.status} — ${JSON.stringify(data)}`,
    );
    return null;
  }

  private async waitForProcessing(
    cfg: { accessToken: string },
    containerId: string,
    maxWaitMs = 60_000,
    intervalMs = 5_000,
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const response = await fetch(
        `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${cfg.accessToken}`,
      );
      const data = await response.json() as Record<string, unknown>;
      const status = data.status_code as string;

      if (status === 'FINISHED') return;
      if (status === 'ERROR') throw new Error('Instagram media processing failed');

      logger.debug(`[InstagramAdapter] Container ${containerId} status: ${status}`);
      await sleep(intervalMs);
    }

    logger.warn(`[InstagramAdapter] Processing timeout for container ${containerId}`);
  }

  private async publishContainer(
    cfg: { accessToken: string; accountId: string },
    containerId: string,
  ): Promise<PublishResult> {
    const endpoint = `${GRAPH_API_BASE}/${cfg.accountId}/media_publish`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: cfg.accessToken,
      }),
    });

    const data = await response.json() as Record<string, unknown>;

    if (response.ok && data.id) {
      return {
        success: true,
        platformPostId: data.id as string,
        statusCode: response.status,
        publishedAt: new Date(),
        rawResponse: data,
      };
    }

    return {
      success: false,
      statusCode: response.status,
      error: (data.error as Record<string, unknown>)?.message as string ?? `HTTP ${response.status}`,
      rawResponse: data,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
