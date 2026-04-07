/**
 * Social Publisher — Publishing Orchestrator
 *
 * Orquestra a publicação de conteúdo em múltiplas plataformas.
 *
 * Fluxo:
 *   1. Recebe artifacts (vídeo, caption, thumbnail)
 *   2. Resolve adapters configurados
 *   3. Publica em cada plataforma solicitada
 *   4. Retry simples (até MAX_PUBLISH_ATTEMPTS)
 *   5. Persiste resultado em bookagent_publications
 *
 * Integração:
 *   - Chamado pelo delivery module quando auto_publish=true
 *   - Chamado via API POST /api/v1/publish para publicação manual
 *
 * Parte 67: Publishing Adapter Layer
 */

import { v4 as uuid } from 'uuid';

import type {
  ISocialAdapter,
  PublishPayload,
  PublishResult,
  Publication,
} from '../../domain/entities/publication.js';
import {
  SocialPlatform,
  PublishStatus,
  MAX_PUBLISH_ATTEMPTS,
  RETRY_DELAY_MS,
} from '../../domain/entities/publication.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { InstagramAdapter } from './adapters/instagram-adapter.js';
import { FacebookAdapter } from './adapters/facebook-adapter.js';
import { WhatsAppAdapter } from './adapters/whatsapp-adapter.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Adapter Registry
// ---------------------------------------------------------------------------

const adapters = new Map<SocialPlatform, ISocialAdapter>();
adapters.set(SocialPlatform.INSTAGRAM, new InstagramAdapter());
adapters.set(SocialPlatform.FACEBOOK, new FacebookAdapter());
adapters.set(SocialPlatform.WHATSAPP, new WhatsAppAdapter());

/**
 * Registra um adapter customizado (para testes ou extensões).
 */
export function registerAdapter(adapter: ISocialAdapter): void {
  adapters.set(adapter.platform, adapter);
}

/**
 * Retorna adapters configurados (com API keys presentes).
 */
export function getConfiguredAdapters(): ISocialAdapter[] {
  return Array.from(adapters.values()).filter((a) => a.isConfigured());
}

/**
 * Retorna o adapter para uma plataforma específica.
 */
export function getAdapter(platform: SocialPlatform): ISocialAdapter | null {
  return adapters.get(platform) ?? null;
}

// ---------------------------------------------------------------------------
// Publish API
// ---------------------------------------------------------------------------

export interface PublishOptions {
  /** Plataformas alvo (se omitido, tenta todas configuradas) */
  platforms?: SocialPlatform[];
  /** Máximo de tentativas por plataforma */
  maxAttempts?: number;
  /** Cliente Supabase para persistência (opcional) */
  supabase?: SupabaseClient | null;
}

/**
 * Resultado consolidado de uma sessão de publicação.
 */
export interface PublishSessionResult {
  /** ID do job */
  jobId: string;
  /** Publicações tentadas */
  publications: Publication[];
  /** Quantas publicações com sucesso */
  successCount: number;
  /** Quantas falharam */
  failedCount: number;
  /** Quantas foram puladas (adapter não configurado) */
  skippedCount: number;
}

/**
 * Publica conteúdo em uma ou mais plataformas.
 * Orquestra retry e persistência.
 */
export async function publish(
  payload: PublishPayload,
  options?: PublishOptions,
): Promise<PublishSessionResult> {
  const maxAttempts = options?.maxAttempts ?? MAX_PUBLISH_ATTEMPTS;
  const supabase = options?.supabase ?? null;

  // Resolve target platforms
  const targetPlatforms = options?.platforms ?? [payload.platform];
  const publications: Publication[] = [];

  for (const platform of targetPlatforms) {
    const adapter = adapters.get(platform);

    if (!adapter) {
      logger.warn(`[SocialPublisher] No adapter registered for ${platform}`);
      publications.push(createPublication(payload, platform, PublishStatus.SKIPPED));
      continue;
    }

    if (!adapter.isConfigured()) {
      logger.info(`[SocialPublisher] ${adapter.name} not configured — skipping`);
      publications.push(createPublication(payload, platform, PublishStatus.SKIPPED));
      continue;
    }

    // Attempt publication with retry
    const pub = await publishWithRetry(
      adapter,
      { ...payload, platform },
      maxAttempts,
    );

    // Persist to database
    if (supabase) {
      await persistPublication(supabase, pub);
    }

    publications.push(pub);
  }

  const successCount = publications.filter((p) => p.status === PublishStatus.PUBLISHED).length;
  const failedCount = publications.filter((p) => p.status === PublishStatus.FAILED).length;
  const skippedCount = publications.filter((p) => p.status === PublishStatus.SKIPPED).length;

  logger.info(
    `[SocialPublisher] Session complete: job=${payload.jobId} ` +
    `success=${successCount} failed=${failedCount} skipped=${skippedCount}`,
  );

  return {
    jobId: payload.jobId,
    publications,
    successCount,
    failedCount,
    skippedCount,
  };
}

/**
 * Publica em todas as plataformas configuradas.
 */
export async function publishToAll(
  payload: PublishPayload,
  supabase?: SupabaseClient | null,
): Promise<PublishSessionResult> {
  const configured = getConfiguredAdapters();
  const platforms = configured.map((a) => a.platform);

  if (platforms.length === 0) {
    logger.info('[SocialPublisher] No configured adapters — skipping auto-publish');
    return {
      jobId: payload.jobId,
      publications: [],
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };
  }

  return publish(payload, { platforms, supabase });
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

async function publishWithRetry(
  adapter: ISocialAdapter,
  payload: PublishPayload,
  maxAttempts: number,
): Promise<Publication> {
  const pub = createPublication(payload, payload.platform, PublishStatus.PUBLISHING);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    pub.attempts = attempt;
    pub.status = attempt > 1 ? PublishStatus.RETRYING : PublishStatus.PUBLISHING;

    logger.info(
      `[SocialPublisher] Publishing to ${adapter.name}: ` +
      `attempt ${attempt}/${maxAttempts}, job=${payload.jobId}`,
    );

    const result = await adapter.publish(payload);
    pub.result = result;
    pub.updatedAt = new Date();

    if (result.success) {
      pub.status = PublishStatus.PUBLISHED;
      pub.publishedAt = result.publishedAt ?? new Date();

      logger.info(
        `[SocialPublisher] Published to ${adapter.name}: ` +
        `postId=${result.platformPostId ?? 'N/A'} url=${result.postUrl ?? 'N/A'}`,
      );

      return pub;
    }

    pub.lastError = result.error;
    logger.warn(
      `[SocialPublisher] ${adapter.name} attempt ${attempt} failed: ${result.error}`,
    );

    // Don't retry on final attempt
    if (attempt < maxAttempts) {
      const delay = RETRY_DELAY_MS * attempt; // Linear backoff
      logger.info(`[SocialPublisher] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  pub.status = PublishStatus.FAILED;
  logger.error(
    `[SocialPublisher] ${adapter.name} failed after ${maxAttempts} attempts: ${pub.lastError}`,
  );

  return pub;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistPublication(
  supabase: SupabaseClient,
  pub: Publication,
): Promise<void> {
  try {
    await supabase.insert('bookagent_publications', {
      id: pub.id,
      job_id: pub.jobId,
      platform: pub.platform,
      content_type: pub.contentType,
      status: pub.status,
      payload: JSON.stringify(pub.payload),
      result: pub.result ? JSON.stringify(pub.result) : null,
      attempts: pub.attempts,
      max_attempts: pub.maxAttempts,
      last_error: pub.lastError ?? null,
      platform_post_id: pub.result?.platformPostId ?? null,
      post_url: pub.result?.postUrl ?? null,
      created_at: pub.createdAt.toISOString(),
      updated_at: pub.updatedAt.toISOString(),
      published_at: pub.publishedAt?.toISOString() ?? null,
    });
  } catch (err) {
    logger.warn(`[SocialPublisher] Failed to persist publication ${pub.id}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPublication(
  payload: PublishPayload,
  platform: SocialPlatform,
  status: PublishStatus,
): Publication {
  const now = new Date();
  return {
    id: uuid(),
    jobId: payload.jobId,
    platform,
    contentType: payload.contentType,
    status,
    payload: { ...payload, platform },
    attempts: 0,
    maxAttempts: MAX_PUBLISH_ATTEMPTS,
    createdAt: now,
    updatedAt: now,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
