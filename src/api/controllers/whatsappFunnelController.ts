/**
 * WhatsApp Funnel Controller — Go-To-Market Acquisition
 *
 * Endpoint que recebe webhooks do WhatsApp (Evolution API),
 * detecta PDFs enviados, dispara o pipeline e responde com
 * preview dos resultados.
 *
 * Fluxo:
 *   1. WhatsApp webhook → POST /funnel/whatsapp/webhook
 *   2. Detecta mensagem com PDF/documento
 *   3. Cria job no pipeline
 *   4. Envia mensagem de confirmacao via Evolution API
 *   5. Quando job completa → envia preview via WhatsApp
 *
 * Parte 102: Go-To-Market
 */

import type { Request, Response } from 'express';
import { sendSuccess } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import { InputType } from '../../domain/value-objects/index.js';
import type { IOrchestratorLike } from '../types/orchestrator.js';
import { getQueue, enqueueJob } from '../../queue/queue.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;
let orchestrator: IOrchestratorLike | null = null;

export function setSupabaseClientForWhatsAppFunnel(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

export function setOrchestratorForWhatsAppFunnel(orch: IOrchestratorLike): void {
  orchestrator = orch;
}

// ============================================================================
// Config
// ============================================================================

function getEvolutionConfig() {
  return {
    apiUrl: process.env.EVOLUTION_API_URL ?? '',
    apiKey: process.env.EVOLUTION_API_GLOBAL_KEY ?? '',
    instance: process.env.EVOLUTION_INSTANCE ?? 'bookagent',
  };
}

// ============================================================================
// WhatsApp Message Sender
// ============================================================================

async function sendWhatsAppText(phone: string, text: string): Promise<void> {
  const cfg = getEvolutionConfig();
  if (!cfg.apiUrl || !cfg.apiKey) {
    logger.warn('[WhatsAppFunnel] Evolution API not configured — message not sent');
    return;
  }

  try {
    await fetch(`${cfg.apiUrl}/message/sendText/${cfg.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apiKey,
      },
      body: JSON.stringify({ number: phone, text }),
    });
  } catch (err) {
    logger.error(`[WhatsAppFunnel] Failed to send WhatsApp: ${err}`);
  }
}

// ============================================================================
// Funnel Messages
// ============================================================================

const MSG_WELCOME =
  `Ola! Eu sou o *BookAgent* 📘\n\n` +
  `Envie o *PDF do book* de um empreendimento e eu vou gerar automaticamente:\n\n` +
  `📱 Reels prontos para Instagram\n` +
  `✍️ Artigo para blog\n` +
  `🌐 Landing page\n` +
  `🎬 Media plans completos\n\n` +
  `Tudo com o *branding do proprio material*.\n\n` +
  `Envie o PDF agora para comecar!`;

const MSG_RECEIVED =
  `Recebi seu PDF! 📄\n\n` +
  `Estou processando em 17 etapas de IA:\n` +
  `extracao → branding → narrativa → media → blog → landing page\n\n` +
  `Voce recebera os resultados aqui em alguns minutos. ⏳`;

const MSG_COMPLETED = (artifactCount: number, dashboardUrl: string) =>
  `Pronto! ✅\n\n` +
  `Gerei *${artifactCount} conteudo(s)* a partir do seu book:\n` +
  `📱 Reels e media plans\n` +
  `✍️ Artigos para blog\n` +
  `🌐 Landing pages\n\n` +
  `Acesse seu dashboard para ver tudo:\n` +
  `${dashboardUrl}\n\n` +
  `Quer fazer *upgrade para o plano Pro* e publicar automaticamente no Instagram? ` +
  `Responda *PRO* para saber mais!`;

const MSG_PRO_UPSELL =
  `*Plano Pro — R$ 247/mes* 🚀\n\n` +
  `✅ 50 books/mes\n` +
  `✅ Publicacao automatica no Instagram e Facebook\n` +
  `✅ Campanhas e scheduling\n` +
  `✅ A/B testing\n` +
  `✅ WhatsApp integrado\n\n` +
  `7 dias gratis para testar.\n\n` +
  `Quer ativar? Responda *SIM*`;

const MSG_NOT_PDF =
  `Desculpe, por enquanto so consigo processar *arquivos PDF* 📄\n\n` +
  `Envie o book do empreendimento em PDF que eu cuido do resto!`;

// ============================================================================
// Webhook Handler
// ============================================================================

/**
 * POST /funnel/whatsapp/webhook — Evolution API webhook receiver
 */
export async function handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  // Always respond 200 to webhooks
  res.status(200).json({ received: true });

  try {
    const body = req.body as Record<string, unknown>;
    const event = body['event'] as string | undefined;

    // Only process incoming messages
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') return;

    const data = body['data'] as Record<string, unknown> | undefined;
    if (!data) return;

    const key = data['key'] as Record<string, unknown> | undefined;
    const message = data['message'] as Record<string, unknown> | undefined;
    const fromMe = key?.['fromMe'] as boolean | undefined;

    // Skip our own messages
    if (fromMe) return;

    const remoteJid = key?.['remoteJid'] as string | undefined;
    if (!remoteJid) return;

    // Extract phone number
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');

    // Check message type
    const conversation = message?.['conversation'] as string | undefined;
    const documentMessage = message?.['documentMessage'] as Record<string, unknown> | undefined;

    // Text message handling
    if (conversation) {
      const text = conversation.trim().toLowerCase();

      if (text === 'oi' || text === 'ola' || text === 'start' || text === 'comecar') {
        await sendWhatsAppText(phone, MSG_WELCOME);
        return;
      }

      if (text === 'pro' || text === 'upgrade') {
        await sendWhatsAppText(phone, MSG_PRO_UPSELL);
        return;
      }

      if (text === 'sim' && conversation.trim().toUpperCase() === 'SIM') {
        await sendWhatsAppText(phone, `Otimo! Acesse para ativar seu trial:\nhttps://bookagent.app/signup?plan=pro&phone=${phone}`);
        return;
      }

      // Default: suggest sending PDF
      await sendWhatsAppText(phone, MSG_WELCOME);
      return;
    }

    // Document/PDF handling
    if (documentMessage) {
      const mimetype = (documentMessage['mimetype'] as string) ?? '';
      const url = (documentMessage['url'] as string) ?? '';

      if (!mimetype.includes('pdf')) {
        await sendWhatsAppText(phone, MSG_NOT_PDF);
        return;
      }

      // Confirm receipt
      await sendWhatsAppText(phone, MSG_RECEIVED);

      // Log the funnel event
      if (supabaseClient) {
        try {
          await supabaseClient.upsert('bookagent_funnel_events', {
            id: require('crypto').randomUUID(),
            phone,
            event: 'pdf_received',
            metadata: JSON.stringify({ mimetype, url }),
            created_at: new Date().toISOString(),
          });
        } catch { /* graceful */ }
      }

      // Trigger pipeline — queue mode (async) or sync fallback
      const webhookUrl = process.env.N8N_WEBHOOK_BASE_URL
        ? `${process.env.N8N_WEBHOOK_BASE_URL}/webhook/bookagent/concluido`
        : undefined;

      const queue = getQueue();
      if (queue) {
        // Async — enqueue and let worker process
        const jobId = require('crypto').randomUUID() as string;
        try {
          await enqueueJob({
            jobId,
            fileUrl: url,
            type: 'pdf',
            userContext: { whatsapp: phone },
            webhookUrl,
          });
          logger.info(`[WhatsAppFunnel] Job enqueued: ${jobId} for phone=${phone}`);
        } catch (err) {
          logger.error(`[WhatsAppFunnel] Failed to enqueue job: ${err}`);
        }
      } else if (orchestrator) {
        // Sync — process inline (fire-and-forget, don't block webhook response)
        const orch = orchestrator;
        setImmediate(async () => {
          try {
            const job = await orch.process({
              fileUrl: url,
              type: InputType.PDF,
              userContext: { whatsapp: phone },
            });
            const artifactCount = job.result?.exportResult?.artifacts?.length ?? 0;
            const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://bookagent.db8intelligence.com.br/dashboard';
            await sendWhatsAppText(phone, MSG_COMPLETED(artifactCount, dashboardUrl));
            logger.info(`[WhatsAppFunnel] Job completed: ${job.id} artifacts=${artifactCount}`);
          } catch (err) {
            logger.error(`[WhatsAppFunnel] Pipeline failed for phone=${phone}: ${err}`);
            await sendWhatsAppText(phone, 'Desculpe, ocorreu um erro ao processar seu PDF. Tente novamente em alguns minutos.');
          }
        });
      } else {
        logger.warn('[WhatsAppFunnel] No orchestrator or queue available — PDF not processed');
      }

      logger.info(`[WhatsAppFunnel] PDF received from ${phone}: ${mimetype}`);
      return;
    }

    // Image/other media — suggest PDF
    await sendWhatsAppText(phone, MSG_NOT_PDF);
  } catch (err) {
    logger.error(`[WhatsAppFunnel] Webhook processing error: ${err}`);
  }
}

/**
 * GET /funnel/whatsapp/status — Check funnel status
 */
export async function getFunnelStatus(_req: Request, res: Response): Promise<void> {
  const cfg = getEvolutionConfig();

  sendSuccess(res, {
    whatsapp: {
      configured: !!(cfg.apiUrl && cfg.apiKey),
      instance: cfg.instance,
      apiUrl: cfg.apiUrl ? cfg.apiUrl.replace(/\/+$/, '') : null,
    },
    funnel: {
      active: !!(cfg.apiUrl && cfg.apiKey),
      entryPoint: 'WhatsApp message → PDF upload → Pipeline → Preview → Upgrade CTA',
    },
  });
}
