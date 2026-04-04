/**
 * Plan Configuration — BookAgent Intelligence Engine
 *
 * Define os limites, capacidades e custos por plano.
 * Fonte única de verdade para planos — usada por middlewares, workers e analytics.
 *
 * Parte 55: Escala Real e Monetização
 *
 * Planos:
 *   basic    — Produto standalone com execução manual
 *   pro      — Automação completa + publicação social
 *   business — API + multi-tenant (fase futura)
 */

// ============================================================================
// Types
// ============================================================================

export type PlanTier = 'basic' | 'pro' | 'business';

export interface PlanLimits {
  /** Máximo de jobs criados por mês por usuário */
  jobsPerMonth: number;
  /** Máximo de jobs simultâneos (in processing) */
  concurrentJobs: number;
  /** Prioridade na fila BullMQ (menor = maior prioridade) */
  queuePriority: number;
  /** Acesso a publicação automática nas redes sociais */
  autoPublish: boolean;
  /** Acesso a aprovação intermediária (prévia antes do pacote final) */
  intermediateApproval: boolean;
  /** Número máximo de plataformas de publicação simultâneas */
  maxPublishPlatforms: number;
  /** Tamanho máximo de arquivo em MB */
  maxFileSizeMB: number;
  /** Acesso à API programática (sem n8n) */
  apiAccess: boolean;
  /** Webhook customizado ao finalizar job */
  webhookOnCompletion: boolean;
  /** Rate limit: máximo de requests por minuto (por user_id) */
  requestsPerMinute: number;
  /** Rate limit: máximo de jobs iniciados por hora */
  jobsPerHour: number;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  description: string;
  /** Preço mensal em BRL (centavos para evitar float) */
  priceMonthlyBRL: number;
  limits: PlanLimits;
  /** Custo operacional estimado por job (BRL, centavos) — para controle de margem */
  estimatedCostPerJobBRL: number;
}

// ============================================================================
// Planos
// ============================================================================

export const PLANS: Record<PlanTier, PlanDefinition> = {
  basic: {
    tier: 'basic',
    name: 'BookAgent Básico',
    description: 'Processamento manual de PDF → conteúdo. Sem automação de publicação.',
    priceMonthlyBRL: 9700, // R$ 97,00
    estimatedCostPerJobBRL: 850, // R$ 8,50 (IA + storage + worker)
    limits: {
      jobsPerMonth: 10,
      concurrentJobs: 1,
      queuePriority: 10,       // baixa prioridade na fila
      autoPublish: false,
      intermediateApproval: false,
      maxPublishPlatforms: 0,
      maxFileSizeMB: 50,
      apiAccess: false,
      webhookOnCompletion: false,
      requestsPerMinute: 20,
      jobsPerHour: 3,
    },
  },

  pro: {
    tier: 'pro',
    name: 'BookAgent Pro',
    description: 'Automação completa via WhatsApp + dashboard. Publicação social integrada.',
    priceMonthlyBRL: 24700, // R$ 247,00
    estimatedCostPerJobBRL: 1200, // R$ 12,00 (IA + storage + worker + Meta API)
    limits: {
      jobsPerMonth: 50,
      concurrentJobs: 3,
      queuePriority: 5,        // prioridade média na fila
      autoPublish: true,
      intermediateApproval: true,
      maxPublishPlatforms: 2,  // Instagram + Facebook
      maxFileSizeMB: 100,
      apiAccess: false,
      webhookOnCompletion: true,
      requestsPerMinute: 60,
      jobsPerHour: 10,
    },
  },

  business: {
    tier: 'business',
    name: 'BookAgent Business',
    description: 'API programática, multi-tenant, SLA definido. Para integradores e parceiros.',
    priceMonthlyBRL: 99700, // R$ 997,00
    estimatedCostPerJobBRL: 1500, // R$ 15,00 (IA + storage + worker + suporte + SLA)
    limits: {
      jobsPerMonth: 500,
      concurrentJobs: 10,
      queuePriority: 1,        // máxima prioridade na fila
      autoPublish: true,
      intermediateApproval: true,
      maxPublishPlatforms: 4,  // Instagram + Facebook + LinkedIn + Twitter (futuro)
      maxFileSizeMB: 200,
      apiAccess: true,
      webhookOnCompletion: true,
      requestsPerMinute: 200,
      jobsPerHour: 50,
    },
  },
};

// ============================================================================
// Helpers
// ============================================================================

/** Retorna a definição do plano. Fallback para 'basic' se desconhecido. */
export function getPlan(tier: string | null | undefined): PlanDefinition {
  const t = tier as PlanTier | undefined;
  return PLANS[t ?? 'basic'] ?? PLANS.basic;
}

/** Margem bruta estimada por job em centavos de BRL. */
export function estimatedMargin(tier: PlanTier, jobsConsumedThisMonth: number): number {
  const plan = PLANS[tier];
  const revenuePerJob = Math.floor(plan.priceMonthlyBRL / plan.limits.jobsPerMonth);
  return revenuePerJob - plan.estimatedCostPerJobBRL;
}

/**
 * Verifica se o usuário pode iniciar mais um job com base no uso do mês.
 */
export function canCreateJob(tier: PlanTier, jobsThisMonth: number): boolean {
  return jobsThisMonth < PLANS[tier].limits.jobsPerMonth;
}
