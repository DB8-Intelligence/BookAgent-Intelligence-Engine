/**
 * WhatsApp Adapter — Publishing Adapter Layer
 *
 * Adapter para envio de mídia via Evolution API (padrão DB8 Intelligence)
 * ou WhatsApp Business Cloud API (fallback).
 *
 * Estratégia de integração (em ordem de prioridade):
 *   1. Evolution API (self-hosted em evolution-api.db8intelligence.com.br)
 *      — já usada em todo ecossistema DB8, sem custo por mensagem
 *   2. n8n Webhook (delega ao Fluxo 4 do BookAgent)
 *   3. WhatsApp Business Cloud API (direto — fallback futuro)
 *
 * Variáveis de ambiente:
 *   - EVOLUTION_API_URL:      https://evolution-api.db8intelligence.com.br
 *   - EVOLUTION_API_KEY:      global key da Evolution API
 *   - EVOLUTION_INSTANCE:     nome da instância (ex: bookagent)
 *   - WHATSAPP_WEBHOOK_URL:   URL do webhook n8n (alternativo)
 *   - WHATSAPP_API_TOKEN:     token Business API (fallback)
 *   - WHATSAPP_PHONE_NUMBER_ID: ID do número Business (fallback)
 *
 * Parte 67 (revisão): Evolution API + Business API
 */

import type { ISocialAdapter, PublishPayload, PublishResult } from '../../../domain/entities/publication.js';
import { SocialPlatform } from '../../../domain/entities/publication.js';
import { logger } from '../../../utils/logger.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    // Evolution API (DB8 standard)
    evolutionUrl: (process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, ''),
    evolutionKey: process.env.EVOLUTION_API_KEY ?? '',
    evolutionInstance: process.env.EVOLUTION_INSTANCE ?? 'bookagent',
    // n8n webhook fallback
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL ?? '',
    // Business API fallback
    apiToken: process.env.WHATSAPP_API_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  };
}

// ---------------------------------------------------------------------------
// Evolution API payloads
// ---------------------------------------------------------------------------

interface EvolutionTextPayload {
  number: string;
  options: { delay: number; presence: string };
  textMessage: { text: string };
}

interface EvolutionMediaPayload {
  number: string;
  options: { delay: number; presence: string };
  mediaMessage: {
    mediatype: 'video' | 'image' | 'audio' | 'document';
    caption?: string;
    media: string; // URL pública
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class WhatsAppAdapter implements ISocialAdapter {
  readonly platform = SocialPlatform.WHATSAPP;
  readonly name = 'WhatsApp (Evolution API)';

  isConfigured(): boolean {
    const cfg = getConfig();
    return !!(
      (cfg.evolutionUrl && cfg.evolutionKey) ||
      cfg.webhookUrl ||
      (cfg.apiToken && cfg.phoneNumberId)
    );
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (process.env.SOCIAL_PUBLISH_MODE === 'mock') {
      const fakeId = `whatsapp-mock-${Date.now()}`;
      logger.info(`[WhatsAppAdapter] MOCK: simulating send caption="${payload.caption.slice(0, 40)}..." id=${fakeId}`);
      return {
        success: true,
        platformPostId: fakeId,
        publishedAt: new Date(),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'WhatsApp adapter não configurado — defina EVOLUTION_API_URL + EVOLUTION_API_KEY ou WHATSAPP_WEBHOOK_URL',
      };
    }

    const cfg = getConfig();

    // Número destino: campo phone do userContext, ou whatsapp do payload
    const phone = payload.recipientPhone;
    if (!phone) {
      return { success: false, error: 'recipientPhone não informado no payload' };
    }

    // Estratégia 1: Evolution API (padrão DB8)
    if (cfg.evolutionUrl && cfg.evolutionKey) {
      return this.publishViaEvolution(cfg, phone, payload);
    }

    // Estratégia 2: n8n webhook
    if (cfg.webhookUrl) {
      return this.publishViaWebhook(cfg.webhookUrl, payload);
    }

    // Estratégia 3: Business Cloud API
    return this.publishViaBAPI(cfg, phone, payload);
  }

  // ---------------------------------------------------------------------------
  // Evolution API
  // ---------------------------------------------------------------------------

  private async publishViaEvolution(
    cfg: ReturnType<typeof getConfig>,
    phone: string,
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const baseUrl = `${cfg.evolutionUrl}/message`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': cfg.evolutionKey,
    };

    const hasMedia = !!(payload.videoUrl || payload.thumbnailUrl);

    try {
      if (hasMedia) {
        // Enviar mídia + caption
        const mediaUrl = payload.videoUrl ?? payload.thumbnailUrl!;
        const mediaType = payload.videoUrl ? 'video' : 'image';
        const caption = this.buildCaption(payload);

        const body: EvolutionMediaPayload = {
          number: this.normalizePhone(phone),
          options: { delay: 1000, presence: 'composing' },
          mediaMessage: {
            mediatype: mediaType,
            caption,
            media: mediaUrl,
          },
        };

        const res = await fetch(`${baseUrl}/sendMedia/${cfg.evolutionInstance}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const data = await res.json() as Record<string, unknown>;

        if (res.ok && (data.key || data.status === 'success' || data.id)) {
          const msgId = this.extractMsgId(data);
          logger.info(`[WhatsAppAdapter] Evolution mídia enviada: ${msgId}`);
          return { success: true, platformPostId: msgId, statusCode: res.status, publishedAt: new Date(), rawResponse: data };
        }

        return {
          success: false,
          statusCode: res.status,
          error: (data.error ?? data.message ?? `Evolution API HTTP ${res.status}`) as string,
        };

      } else {
        // Enviar apenas texto
        const body: EvolutionTextPayload = {
          number: this.normalizePhone(phone),
          options: { delay: 1000, presence: 'composing' },
          textMessage: { text: this.buildCaption(payload) },
        };

        const res = await fetch(`${baseUrl}/sendText/${cfg.evolutionInstance}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const data = await res.json() as Record<string, unknown>;

        if (res.ok && (data.key || data.status === 'success' || data.id)) {
          const msgId = this.extractMsgId(data);
          logger.info(`[WhatsAppAdapter] Evolution texto enviado: ${msgId}`);
          return { success: true, platformPostId: msgId, statusCode: res.status, publishedAt: new Date(), rawResponse: data };
        }

        return {
          success: false,
          statusCode: res.status,
          error: (data.error ?? data.message ?? `Evolution API HTTP ${res.status}`) as string,
        };
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[WhatsAppAdapter] Evolution API error: ${message}`);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // n8n Webhook
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
        thumbnailUrl: payload.thumbnailUrl,
        caption: this.buildCaption(payload),
        recipientPhone: payload.recipientPhone,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({})) as Record<string, unknown>;
        logger.info(`[WhatsAppAdapter] Webhook n8n entregue: ${webhookUrl}`);
        return { success: true, statusCode: response.status, publishedAt: new Date(), rawResponse: data };
      }

      return { success: false, statusCode: response.status, error: `Webhook retornou ${response.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // WhatsApp Business Cloud API
  // ---------------------------------------------------------------------------

  private async publishViaBAPI(
    cfg: ReturnType<typeof getConfig>,
    phone: string,
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const BAPI_BASE = 'https://graph.facebook.com/v19.0';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiToken}`,
    };

    try {
      const hasMedia = !!(payload.videoUrl || payload.thumbnailUrl);

      let body: Record<string, unknown>;

      if (hasMedia) {
        const mediaUrl = payload.videoUrl ?? payload.thumbnailUrl!;
        const mediaType = payload.videoUrl ? 'video' : 'image';

        body = {
          messaging_product: 'whatsapp',
          to: this.normalizePhone(phone),
          type: mediaType,
          [mediaType]: {
            link: mediaUrl,
            caption: this.buildCaption(payload),
          },
        };
      } else {
        body = {
          messaging_product: 'whatsapp',
          to: this.normalizePhone(phone),
          type: 'text',
          text: { body: this.buildCaption(payload) },
        };
      }

      const res = await fetch(`${BAPI_BASE}/${cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json() as Record<string, unknown>;

      if (res.ok) {
        const msgId = (data.messages as Array<{ id: string }>)?.[0]?.id;
        logger.info(`[WhatsAppAdapter] BAPI enviado: ${msgId}`);
        return { success: true, platformPostId: msgId, statusCode: res.status, publishedAt: new Date(), rawResponse: data };
      }

      return {
        success: false,
        statusCode: res.status,
        error: (data.error as Record<string, unknown>)?.message as string ?? `BAPI HTTP ${res.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Check status (Evolution API)
  // ---------------------------------------------------------------------------

  async checkStatus(platformPostId: string): Promise<PublishResult> {
    // Evolution API não expõe endpoint de status por message_id publicamente
    // Registramos como entregue se temos um platformPostId
    return {
      success: !!platformPostId,
      platformPostId,
      ...(platformPostId ? { publishedAt: new Date() } : { error: 'Message ID não disponível' }),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Normaliza telefone: remove +, spaces, etc. Ex: +55 71 99973-3883 → 5571999733883 */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private buildCaption(payload: PublishPayload): string {
    const tags = payload.hashtags?.join(' ') ?? '';
    return tags ? `${payload.caption}\n\n${tags}` : payload.caption;
  }

  private extractMsgId(data: Record<string, unknown>): string | undefined {
    if (data.key && typeof data.key === 'object') {
      return (data.key as Record<string, unknown>).id as string | undefined;
    }
    return data.id as string | undefined ?? data.messageId as string | undefined;
  }
}

