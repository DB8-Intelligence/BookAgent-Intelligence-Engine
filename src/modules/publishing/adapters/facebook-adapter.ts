/**
 * Facebook Adapter — Publishing Adapter Layer
 *
 * Adapter para publicação no Facebook via Graph API.
 *
 * Fluxo de publicação (Facebook Graph API):
 *   1. Upload de vídeo via resumable upload
 *   2. Publicar com caption
 *
 * Variáveis de ambiente necessárias:
 *   - FACEBOOK_PAGE_ACCESS_TOKEN: token de acesso da página
 *   - FACEBOOK_PAGE_ID: ID da página
 *
 * Status: Stub — estrutura pronta para integração real.
 *
 * Parte 67: Publishing Adapter Layer
 */

import type { ISocialAdapter, PublishPayload, PublishResult } from '../../../domain/entities/publication.js';
import { SocialPlatform } from '../../../domain/entities/publication.js';
import { logger } from '../../../utils/logger.js';

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
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Facebook adapter not configured — set FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID',
      };
    }

    // TODO: Implement Facebook Graph API video/image upload
    // For now, log the intent and return stub result
    logger.info(
      `[FacebookAdapter] Publish requested: type=${payload.contentType} ` +
      `job=${payload.jobId} caption="${payload.caption.slice(0, 50)}..."`,
    );

    return {
      success: false,
      error: 'Facebook publishing not yet implemented — Graph API integration pending',
    };
  }

  async checkStatus(platformPostId: string): Promise<PublishResult> {
    logger.debug(`[FacebookAdapter] checkStatus called for ${platformPostId}`);

    return {
      success: false,
      error: 'Facebook status check not yet implemented',
    };
  }
}
