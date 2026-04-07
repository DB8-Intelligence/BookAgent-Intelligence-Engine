/**
 * WhatsApp Adapter — Publishing Adapter Layer
 *
 * Adapter para envio de mídia via WhatsApp Business API / n8n webhook.
 *
 * Estratégia de integração:
 *   - Opção 1: WhatsApp Business Cloud API (direto)
 *   - Opção 2: Webhook para n8n (recomendado — BookAgent já usa n8n)
 *
 * Variáveis de ambiente:
 *   - WHATSAPP_WEBHOOK_URL: URL do webhook n8n para envio
 *   - WHATSAPP_API_TOKEN: token da Business API (alternativo)
 *   - WHATSAPP_PHONE_NUMBER_ID: ID do número (alternativo)
 *
 * Status: Stub funcional via webhook.
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
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL ?? '',
    apiToken: process.env.WHATSAPP_API_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class WhatsAppAdapter implements ISocialAdapter {
  readonly platform = SocialPlatform.WHATSAPP;
  readonly name = 'WhatsApp Business';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(cfg.webhookUrl || (cfg.apiToken && cfg.phoneNumberId));
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'WhatsApp adapter not configured — set WHATSAPP_WEBHOOK_URL or WHATSAPP_API_TOKEN + WHATSAPP_PHONE_NUMBER_ID',
      };
    }

    const cfg = getConfig();

    // Strategy: prefer n8n webhook (simpler, already in BookAgent infra)
    if (cfg.webhookUrl) {
      return this.publishViaWebhook(cfg.webhookUrl, payload);
    }

    // Fallback: direct WhatsApp Business Cloud API
    return this.publishViaBAPI(cfg, payload);
  }

  // ---------------------------------------------------------------------------
  // Webhook (n8n)
  // ---------------------------------------------------------------------------

  private async publishViaWebhook(
    webhookUrl: string,
    payload: PublishPayload,
  ): Promise<PublishResult> {
    try {
      const body = {
        source: 'bookagent-publisher',
        platform: 'whatsapp',
        contentType: payload.contentType,
        jobId: payload.jobId,
        videoUrl: payload.videoUrl,
        videoPath: payload.videoPath,
        thumbnailUrl: payload.thumbnailUrl,
        caption: payload.caption,
        hashtags: payload.hashtags,
        variantId: payload.variantId,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({})) as Record<string, unknown>;
        logger.info(`[WhatsAppAdapter] Webhook delivered: ${webhookUrl}`);

        return {
          success: true,
          statusCode: response.status,
          publishedAt: new Date(),
          rawResponse: data,
        };
      }

      return {
        success: false,
        statusCode: response.status,
        error: `Webhook returned ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[WhatsAppAdapter] Webhook failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Business Cloud API (stub)
  // ---------------------------------------------------------------------------

  private async publishViaBAPI(
    _cfg: { apiToken: string; phoneNumberId: string },
    payload: PublishPayload,
  ): Promise<PublishResult> {
    // TODO: Implement WhatsApp Business Cloud API media upload + send
    logger.info(
      `[WhatsAppAdapter] BAPI publish requested: type=${payload.contentType} ` +
      `job=${payload.jobId}`,
    );

    return {
      success: false,
      error: 'WhatsApp Business API direct publishing not yet implemented — use webhook instead',
    };
  }
}
