/**
 * Entity: Billing / Usage Metering
 *
 * Camada de metering operacional: mede consumo por tenant,
 * aplica limites por plano e prepara base para cobrança futura.
 *
 * Modelagem escolhida:
 *   - UsageRecord: evento atômico de uso (insert-only, audit trail)
 *   - UsageCounter: contador agregado por tenant/período (upsert, fast query)
 *   - BillingEvent: evento de billing (upgrade, downgrade, trial start/end)
 *
 * Justificativa:
 *   - UsageRecord dá audit trail completo (cada evento individual)
 *   - UsageCounter dá leitura rápida de quotas (sem scan de records)
 *   - Separação permite arquivar records antigos sem perder contadores
 *
 * Persistência:
 *   - bookagent_usage (records individuais)
 *   - bookagent_usage_counters (contadores agregados)
 *   - bookagent_billing_events (eventos de billing)
 *
 * Parte 75: Billing & Usage Tracking
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de evento de uso mensurável */
export enum UsageEventType {
  JOB_CREATED = 'job_created',
  JOB_COMPLETED = 'job_completed',
  VIDEO_RENDER_REQUESTED = 'video_render_requested',
  VIDEO_RENDER_COMPLETED = 'video_render_completed',
  VARIANT_GENERATED = 'variant_generated',
  THUMBNAIL_GENERATED = 'thumbnail_generated',
  AUTO_PUBLISH_USED = 'auto_publish_used',
  EXPERIMENT_CREATED = 'experiment_created',
  LEARNING_RULE_APPLIED = 'learning_rule_applied',
  BLOG_GENERATED = 'blog_generated',
  LANDING_PAGE_GENERATED = 'landing_page_generated',
  TTS_CALL = 'tts_call',
  AI_CALL = 'ai_call',
  STORAGE_BYTES = 'storage_bytes',
  REVISION_REQUESTED = 'revision_requested',
}

/** Período de agregação para contadores */
export enum UsagePeriod {
  DAILY = 'daily',
  MONTHLY = 'monthly',
}

/** Tipo de evento de billing */
export enum BillingEventType {
  PLAN_ACTIVATED = 'plan_activated',
  PLAN_UPGRADED = 'plan_upgraded',
  PLAN_DOWNGRADED = 'plan_downgraded',
  TRIAL_STARTED = 'trial_started',
  TRIAL_ENDED = 'trial_ended',
  LIMIT_REACHED = 'limit_reached',
  LIMIT_WARNING = 'limit_warning',
  OVERAGE_DETECTED = 'overage_detected',
}

/** Resultado da verificação de limite */
export enum LimitCheckResult {
  /** Dentro do limite — operação permitida */
  ALLOWED = 'allowed',
  /** Próximo do limite (>80%) — aviso */
  WARNING = 'warning',
  /** Limite atingido — operação bloqueada */
  BLOCKED = 'blocked',
  /** Feature não habilitada no plano */
  FEATURE_DISABLED = 'feature_disabled',
}

// ---------------------------------------------------------------------------
// Usage Record (audit trail)
// ---------------------------------------------------------------------------

/**
 * Registro individual de uso — insert-only, nunca atualizado.
 * Persistido em bookagent_usage.
 */
export interface UsageRecord {
  /** ID único */
  id: string;
  /** ID do tenant */
  tenantId: string;
  /** ID do usuário que gerou o uso */
  userId: string;
  /** Tipo do evento */
  eventType: UsageEventType;
  /** Quantidade consumida (1 para contagem, bytes para storage) */
  quantity: number;
  /** ID do job associado (se aplicável) */
  jobId?: string;
  /** ID do artifact associado (se aplicável) */
  artifactId?: string;
  /** Custo estimado em USD (se calculável) */
  estimatedCostUsd?: number;
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
  /** Timestamp do evento */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Usage Counter (fast aggregation)
// ---------------------------------------------------------------------------

/**
 * Contador agregado por tenant/período/evento.
 * Upsert em bookagent_usage_counters.
 *
 * Chave: tenantId + eventType + periodKey
 * Ex: "tenant123" + "job_created" + "2026-04" → count=15
 */
export interface UsageCounter {
  /** ID do tenant */
  tenantId: string;
  /** Tipo do evento */
  eventType: UsageEventType;
  /** Chave do período (ex: "2026-04" para mensal, "2026-04-06" para diário) */
  periodKey: string;
  /** Período de agregação */
  period: UsagePeriod;
  /** Contagem acumulada */
  count: number;
  /** Valor acumulado (bytes, custo, etc.) */
  totalValue: number;
  /** Última atualização */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Billing Event
// ---------------------------------------------------------------------------

/**
 * Evento de billing — mudanças de plano, limites, trials.
 * Persistido em bookagent_billing_events.
 */
export interface BillingEvent {
  /** ID único */
  id: string;
  /** ID do tenant */
  tenantId: string;
  /** Tipo do evento */
  eventType: BillingEventType;
  /** Plano anterior (se mudança) */
  previousPlan?: PlanTier;
  /** Plano novo */
  currentPlan: PlanTier;
  /** Detalhes */
  details: string;
  /** Metadados para integração futura com gateway */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Feature Usage (snapshot for API responses)
// ---------------------------------------------------------------------------

/**
 * Uso de uma feature específica — para retorno em API/delivery.
 */
export interface FeatureUsage {
  /** Tipo do evento */
  eventType: UsageEventType;
  /** Nome legível */
  label: string;
  /** Uso atual no período */
  used: number;
  /** Limite do plano (0 = ilimitado) */
  limit: number;
  /** Restante */
  remaining: number;
  /** Percentual usado (0-100) */
  usedPercent: number;
  /** Status do limite */
  status: LimitCheckResult;
}

/**
 * Resumo completo de uso do tenant.
 */
export interface UsageSummary {
  /** ID do tenant */
  tenantId: string;
  /** Plano ativo */
  planTier: PlanTier;
  /** Período atual */
  periodKey: string;
  /** Uso por feature */
  features: FeatureUsage[];
  /** Custo estimado total no período (USD) */
  estimatedCostUsd: number;
  /** Limite de custo do plano (USD) */
  costLimitUsd: number;
  /** Alertas ativos */
  alerts: string[];
  /** Gerado em */
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Billing Plan Limits (per-period, per-event)
// ---------------------------------------------------------------------------

/**
 * Limites de uso por plano por período mensal.
 */
export interface BillingPlanLimits {
  /** Jobs criados/mês */
  jobsPerMonth: number;
  /** Renders de vídeo/mês */
  videoRendersPerMonth: number;
  /** Variantes geradas/mês */
  variantsPerMonth: number;
  /** Thumbnails geradas/mês */
  thumbnailsPerMonth: number;
  /** Publicações automáticas/mês */
  autoPublishPerMonth: number;
  /** Experimentos/mês */
  experimentsPerMonth: number;
  /** Blogs gerados/mês */
  blogsPerMonth: number;
  /** Landing pages/mês */
  landingPagesPerMonth: number;
  /** Revisões/mês */
  revisionsPerMonth: number;
  /** Chamadas TTS/mês */
  ttsCallsPerMonth: number;
  /** Chamadas IA/mês */
  aiCallsPerMonth: number;
  /** Storage total (bytes) */
  storageBytesTotal: number;
  /** Custo máximo mensal (USD) */
  maxMonthlyCostUsd: number;
}

export const BILLING_PLAN_LIMITS: Record<PlanTier, BillingPlanLimits> = {
  starter: {
    jobsPerMonth: 1,
    videoRendersPerMonth: 3,    // 3 reels / book × 1 book
    variantsPerMonth: 10,
    thumbnailsPerMonth: 30,     // 10 imagens × 3 carrosséis
    autoPublishPerMonth: 0,
    experimentsPerMonth: 0,
    blogsPerMonth: 1,
    landingPagesPerMonth: 1,
    revisionsPerMonth: 2,
    ttsCallsPerMonth: 4,        // 3 reels + 1 podcast
    aiCallsPerMonth: 20,
    storageBytesTotal: 500 * 1024 * 1024, // 500MB
    maxMonthlyCostUsd: 1.50,
  },
  pro: {
    jobsPerMonth: 3,
    videoRendersPerMonth: 9,    // 3 reels / book × 3 books
    variantsPerMonth: 50,
    thumbnailsPerMonth: 90,     // 10 imagens × 3 carrosséis × 3 books
    autoPublishPerMonth: 20,
    experimentsPerMonth: 5,
    blogsPerMonth: 3,
    landingPagesPerMonth: 3,
    revisionsPerMonth: 10,
    ttsCallsPerMonth: 12,       // (3 reels + 1 podcast) × 3 books
    aiCallsPerMonth: 100,
    storageBytesTotal: 2 * 1024 * 1024 * 1024, // 2GB
    maxMonthlyCostUsd: 5.00,
  },
  agency: {
    jobsPerMonth: 10,
    videoRendersPerMonth: 30,   // 3 reels / book × 10 books
    variantsPerMonth: 200,
    thumbnailsPerMonth: 300,    // 10 imagens × 3 carrosséis × 10 books
    autoPublishPerMonth: 100,
    experimentsPerMonth: 20,
    blogsPerMonth: 10,
    landingPagesPerMonth: 10,
    revisionsPerMonth: 30,
    ttsCallsPerMonth: 40,       // (3 reels + 1 podcast) × 10 books
    aiCallsPerMonth: 400,
    storageBytesTotal: 10 * 1024 * 1024 * 1024, // 10GB
    maxMonthlyCostUsd: 20.00,
  },
};

/**
 * Mapeamento de UsageEventType → campo em BillingPlanLimits.
 */
export const EVENT_TO_LIMIT_FIELD: Partial<Record<UsageEventType, keyof BillingPlanLimits>> = {
  [UsageEventType.JOB_CREATED]: 'jobsPerMonth',
  [UsageEventType.VIDEO_RENDER_REQUESTED]: 'videoRendersPerMonth',
  [UsageEventType.VARIANT_GENERATED]: 'variantsPerMonth',
  [UsageEventType.THUMBNAIL_GENERATED]: 'thumbnailsPerMonth',
  [UsageEventType.AUTO_PUBLISH_USED]: 'autoPublishPerMonth',
  [UsageEventType.EXPERIMENT_CREATED]: 'experimentsPerMonth',
  [UsageEventType.BLOG_GENERATED]: 'blogsPerMonth',
  [UsageEventType.LANDING_PAGE_GENERATED]: 'landingPagesPerMonth',
  [UsageEventType.REVISION_REQUESTED]: 'revisionsPerMonth',
  [UsageEventType.TTS_CALL]: 'ttsCallsPerMonth',
  [UsageEventType.AI_CALL]: 'aiCallsPerMonth',
  [UsageEventType.STORAGE_BYTES]: 'storageBytesTotal',
};

/**
 * Labels legíveis para cada evento.
 */
export const EVENT_LABELS: Record<UsageEventType, string> = {
  [UsageEventType.JOB_CREATED]: 'Jobs criados',
  [UsageEventType.JOB_COMPLETED]: 'Jobs concluídos',
  [UsageEventType.VIDEO_RENDER_REQUESTED]: 'Renders de vídeo',
  [UsageEventType.VIDEO_RENDER_COMPLETED]: 'Renders concluídos',
  [UsageEventType.VARIANT_GENERATED]: 'Variantes geradas',
  [UsageEventType.THUMBNAIL_GENERATED]: 'Thumbnails geradas',
  [UsageEventType.AUTO_PUBLISH_USED]: 'Publicações automáticas',
  [UsageEventType.EXPERIMENT_CREATED]: 'Experimentos A/B',
  [UsageEventType.LEARNING_RULE_APPLIED]: 'Regras de learning',
  [UsageEventType.BLOG_GENERATED]: 'Blogs gerados',
  [UsageEventType.LANDING_PAGE_GENERATED]: 'Landing pages geradas',
  [UsageEventType.TTS_CALL]: 'Chamadas TTS',
  [UsageEventType.AI_CALL]: 'Chamadas IA',
  [UsageEventType.STORAGE_BYTES]: 'Storage (bytes)',
  [UsageEventType.REVISION_REQUESTED]: 'Revisões solicitadas',
};
