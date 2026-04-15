/**
 * Plan Configuration — BookAgent Intelligence Engine
 *
 * Define os limites, capacidades e custos por plano.
 * Fonte única de verdade para planos — usada por middlewares, workers e analytics.
 *
 * Planos (revisão 2026-04):
 *   starter  — 1 book/mês · R$ 47 · corretor individual
 *   pro      — 3 books/mês · R$ 97 · corretor ativo
 *   agency   — 10 books/mês · R$ 247 · imobiliária / agência
 *
 * Composição de output por book:
 *   - 3 reels com narração (TTS) 30–60s
 *   - 1 podcast estilo NotebookLM (2 vozes, até 60s)
 *   - 3 carrosséis com até 10 imagens cada (IA)
 *   - 3 stories com texto e CTA
 *   - 1 landing page HTML
 *   - 1 blog post SEO
 *
 * Custo operacional por book (stack completa): ~R$ 5,61
 *   Creatomate 3× = R$0,84 | Fal.ai 30 imgs = R$3,60
 *   ElevenLabs 3×+podcast = R$0,90 | Claude = R$0,12 | Infra = R$0,15
 */

// ============================================================================
// Types
// ============================================================================

export type PlanTier = 'starter' | 'pro' | 'agency';

export interface PlanLimits {
  /** Máximo de books processados por mês */
  jobsPerMonth: number;
  /** Máximo de jobs simultâneos (in processing) */
  concurrentJobs: number;
  /** Prioridade na fila BullMQ (menor = maior prioridade) */
  queuePriority: number;
  /** Reels gerados por book (com narração TTS) */
  reelsPerBook: number;
  /** Podcasts gerados por book (2 vozes, estilo NotebookLM) */
  podcastsPerBook: number;
  /** Carrosséis gerados por book (até 10 imagens cada) */
  carouselsPerBook: number;
  /** Stories gerados por book (com texto e CTA) */
  storiesPerBook: number;
  /** Acesso a publicação automática nas redes sociais */
  autoPublish: boolean;
  /** Aprovação via WhatsApp antes da entrega final */
  whatsappApproval: boolean;
  /** Número máximo de plataformas de publicação simultâneas */
  maxPublishPlatforms: number;
  /** Tamanho máximo de arquivo em MB */
  maxFileSizeMB: number;
  /** Acesso à API programática */
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
  starter: {
    tier: 'starter',
    name: 'Starter',
    description: 'Ideal para o corretor que quer experimentar. 1 book por mês com o pacote completo de conteúdo.',
    priceMonthlyBRL: 4700, // R$ 47,00
    estimatedCostPerJobBRL: 561, // R$ 5,61 / book (stack completa)
    limits: {
      jobsPerMonth: 1,
      concurrentJobs: 1,
      queuePriority: 10,
      reelsPerBook: 3,
      podcastsPerBook: 1,
      carouselsPerBook: 3,
      storiesPerBook: 3,
      autoPublish: false,
      whatsappApproval: false,
      maxPublishPlatforms: 0,
      maxFileSizeMB: 50,
      apiAccess: false,
      webhookOnCompletion: false,
      requestsPerMinute: 10,
      jobsPerHour: 10,
    },
  },

  pro: {
    tier: 'pro',
    name: 'Pro',
    description: 'Para o corretor ativo. 3 books por mês com aprovação via WhatsApp e publicação automática.',
    priceMonthlyBRL: 9700, // R$ 97,00
    estimatedCostPerJobBRL: 561, // R$ 5,61 / book
    limits: {
      jobsPerMonth: 3,
      concurrentJobs: 2,
      queuePriority: 5,
      reelsPerBook: 3,
      podcastsPerBook: 1,
      carouselsPerBook: 3,
      storiesPerBook: 3,
      autoPublish: true,
      whatsappApproval: true,
      maxPublishPlatforms: 2, // Instagram + Facebook
      maxFileSizeMB: 100,
      apiAccess: false,
      webhookOnCompletion: true,
      requestsPerMinute: 30,
      jobsPerHour: 3,
    },
  },

  agency: {
    tier: 'agency',
    name: 'Agência',
    description: 'Para imobiliárias e agências. 10 books por mês com máxima prioridade e API programática.',
    priceMonthlyBRL: 24700, // R$ 247,00
    estimatedCostPerJobBRL: 561, // R$ 5,61 / book
    limits: {
      jobsPerMonth: 10,
      concurrentJobs: 5,
      queuePriority: 1,
      reelsPerBook: 3,
      podcastsPerBook: 1,
      carouselsPerBook: 3,
      storiesPerBook: 3,
      autoPublish: true,
      whatsappApproval: true,
      maxPublishPlatforms: 3, // Instagram + Facebook + WhatsApp
      maxFileSizeMB: 200,
      apiAccess: true,
      webhookOnCompletion: true,
      requestsPerMinute: 60,
      jobsPerHour: 10,
    },
  },
};

// ============================================================================
// Helpers
// ============================================================================

/** Retorna a definição do plano. Fallback para 'starter' se desconhecido. */
export function getPlan(tier: string | null | undefined): PlanDefinition {
  const t = tier as PlanTier | undefined;
  return PLANS[t ?? 'starter'] ?? PLANS.starter;
}

/** Margem bruta estimada por job em centavos de BRL. */
export function estimatedMargin(tier: PlanTier, jobsConsumedThisMonth: number): number {
  const plan = PLANS[tier];
  const revenuePerJob = Math.floor(plan.priceMonthlyBRL / plan.limits.jobsPerMonth);
  return revenuePerJob - plan.estimatedCostPerJobBRL;
}

/** Verifica se o usuário pode iniciar mais um job com base no uso do mês. */
export function canCreateJob(tier: PlanTier, jobsThisMonth: number): boolean {
  return jobsThisMonth < PLANS[tier].limits.jobsPerMonth;
}

/** Descrição legível dos outputs inclusos por book. */
export function planOutputSummary(tier: PlanTier): string {
  const l = PLANS[tier].limits;
  return [
    `${l.reelsPerBook} reels com narração`,
    `${l.podcastsPerBook} podcast (2 vozes)`,
    `${l.carouselsPerBook} carrosséis (10 imagens cada)`,
    `${l.storiesPerBook} stories com CTA`,
    '1 landing page',
    '1 blog post',
  ].join(' · ');
}
