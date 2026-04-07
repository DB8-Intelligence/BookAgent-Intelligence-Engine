/**
 * Entity: Memory & Longitudinal Tenant Intelligence
 *
 * Conceitos:
 *
 *   TENANT MEMORY:
 *     Conhecimento consolidado e durável sobre um tenant.
 *     Diferente de signal (pontual) e aggregate (curto prazo).
 *     Memória é um padrão persistente confirmado por dados
 *     recorrentes ao longo do tempo.
 *
 *   MEMORY SIGNAL:
 *     Evento observado que pode contribuir para formação de
 *     memória. Vem de learning, analytics, reviews, publications,
 *     usage, campaigns, governance. Cada signal tem peso e timestamp.
 *
 *   MEMORY PATTERN:
 *     Padrão detectado a partir de múltiplos signals convergentes.
 *     Ex: "tenant prefere reels luxury" (visto em 15 de 20 jobs).
 *     Tem confidence e strength que crescem com confirmação.
 *
 *   LONGITUDINAL TENANT PROFILE:
 *     Visão consolidada do tenant composta por múltiplos patterns.
 *     6 sub-perfis: editorial, operational, publication, approval,
 *     growth, cost.
 *
 *   MEMORY SNAPSHOT:
 *     Foto da memória do tenant em um ponto no tempo.
 *     Permite comparar evolução e detectar mudanças.
 *
 *   MEMORY DECAY:
 *     Patterns antigos perdem peso ao longo do tempo.
 *     Se não confirmados por novos signals, decaem gradualmente.
 *     Permite adaptação a mudanças de comportamento.
 *
 * Hierarquia:
 *   Signal (evento) → Pattern (padrão) → Profile (visão consolidada)
 *
 * Persistência: bookagent_tenant_memory
 *
 * Parte 90: Memory & Longitudinal Tenant Intelligence
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Categoria de memória */
export enum MemoryCategory {
  /** Preferências de conteúdo/estilo (formato, preset, template, tom) */
  CONTENT_STYLE = 'content_style',
  /** Comportamento de publicação (canais, horários, frequência) */
  PUBLICATION = 'publication',
  /** Comportamento de aprovação/revisão (taxa, tempo, critérios) */
  APPROVAL = 'approval',
  /** Comportamento de uso/billing (consumo, limites, upgrades) */
  PLAN_USAGE = 'plan_usage',
  /** Maturidade operacional (autonomia, erro, aprendizado) */
  OPERATIONAL_MATURITY = 'operational_maturity',
  /** Comportamento de campanha (tamanho, duração, objetivo) */
  CAMPAIGN = 'campaign',
  /** Preferência de canal (Instagram, WhatsApp, etc.) */
  CHANNEL = 'channel',
  /** Perfil de custo/eficiência */
  COST_EFFICIENCY = 'cost_efficiency',
}

/** Força/confiança da memória */
export enum MemoryStrength {
  /** Observado poucas vezes — hipótese */
  WEAK = 'weak',
  /** Confirmado múltiplas vezes — padrão provável */
  MODERATE = 'moderate',
  /** Consistentemente confirmado — padrão estabelecido */
  STRONG = 'strong',
  /** Altamente confiável — comportamento estável */
  VERY_STRONG = 'very_strong',
}

/** Status de um pattern de memória */
export enum PatternStatus {
  /** Detectado recentemente, ainda em confirmação */
  EMERGING = 'emerging',
  /** Confirmado por múltiplas observações */
  CONFIRMED = 'confirmed',
  /** Estável ao longo do tempo */
  STABLE = 'stable',
  /** Em declínio — novos signals contradizem */
  DECLINING = 'declining',
  /** Obsoleto — não confirmado há muito tempo */
  OBSOLETE = 'obsolete',
}

/** Fonte do memory signal */
export enum MemorySignalSource {
  LEARNING = 'learning',
  ANALYTICS = 'analytics',
  REVIEW = 'review',
  PUBLICATION = 'publication',
  USAGE = 'usage',
  CAMPAIGN = 'campaign',
  GOVERNANCE = 'governance',
  GOAL = 'goal',
  STRATEGY = 'strategy',
}

// ---------------------------------------------------------------------------
// Memory Signal
// ---------------------------------------------------------------------------

/**
 * Evento observado que pode contribuir para formação de memória.
 */
export interface MemorySignal {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Fonte */
  source: MemorySignalSource;
  /** Categoria */
  category: MemoryCategory;
  /** Chave do padrão (ex: "preferred_format", "avg_approval_time") */
  patternKey: string;
  /** Valor observado */
  value: string;
  /** Peso do signal (0-1, default 1) */
  weight: number;
  /** Timestamp */
  observedAt: string;
}

// ---------------------------------------------------------------------------
// Memory Pattern
// ---------------------------------------------------------------------------

/**
 * Padrão detectado a partir de signals convergentes.
 */
export interface MemoryPattern {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Categoria */
  category: MemoryCategory;
  /** Chave identificadora (ex: "preferred_format") */
  key: string;
  /** Valor consolidado do padrão */
  value: string;
  /** Descrição legível */
  description: string;
  /** Força */
  strength: MemoryStrength;
  /** Confiança (0-100) */
  confidence: number;
  /** Status */
  status: PatternStatus;
  /** Número de signals que confirmam */
  confirmationCount: number;
  /** Número de signals que contradizem */
  contradictionCount: number;
  /** Primeira observação */
  firstSeenAt: string;
  /** Última confirmação */
  lastConfirmedAt: string;
  /** Fator de decaimento aplicado (0-1, 1 = sem decaimento) */
  decayFactor: number;
}

// ---------------------------------------------------------------------------
// Longitudinal Tenant Profile
// ---------------------------------------------------------------------------

/**
 * Sub-perfil: editorial/conteúdo.
 */
export interface EditorialProfile {
  preferredFormats: Array<{ format: string; weight: number }>;
  preferredPreset: string | null;
  preferredStyle: string | null;
  preferredTone: string | null;
  avgQualityScore: number | null;
  qualityTrend: 'improving' | 'stable' | 'declining' | null;
}

/**
 * Sub-perfil: operacional.
 */
export interface OperationalProfile {
  avgJobsPerMonth: number;
  avgCampaignSize: number;
  avgTurnaroundDays: number;
  failureRate: number;
  autonomyLevel: string | null;
  maturityScore: number;
  maturityTrend: 'improving' | 'stable' | 'declining' | null;
}

/**
 * Sub-perfil: publicação.
 */
export interface PublicationProfile {
  preferredChannels: Array<{ channel: string; weight: number }>;
  preferredTimes: Array<{ time: string; successRate: number }>;
  avgPublicationsPerWeek: number;
  publishSuccessRate: number;
  usesAutoPublish: boolean;
}

/**
 * Sub-perfil: aprovação/governança.
 */
export interface ApprovalProfile {
  avgApprovalTimeHours: number;
  approvalRate: number;
  revisionRate: number;
  usesGovernanceCheckpoints: boolean;
  overrideFrequency: number;
}

/**
 * Sub-perfil: crescimento/maturidade.
 */
export interface GrowthProfile {
  currentPlan: string;
  planHistory: Array<{ plan: string; since: string }>;
  monthsActive: number;
  totalJobs: number;
  totalCampaigns: number;
  growthPhase: 'onboarding' | 'growing' | 'established' | 'power_user';
}

/**
 * Sub-perfil: custo/eficiência.
 */
export interface CostProfile {
  avgCostPerJob: number;
  avgCostPerCampaign: number;
  costTrend: 'increasing' | 'stable' | 'decreasing' | null;
  costSensitivity: 'low' | 'medium' | 'high';
  budgetUtilization: number;
}

/**
 * Perfil longitudinal completo do tenant.
 */
export interface LongitudinalTenantProfile {
  /** Tenant ID */
  tenantId: string;
  /** Sub-perfis */
  editorial: EditorialProfile;
  operational: OperationalProfile;
  publication: PublicationProfile;
  approval: ApprovalProfile;
  growth: GrowthProfile;
  cost: CostProfile;
  /** Total de patterns ativos */
  totalPatterns: number;
  /** Patterns por categoria */
  patternsByCategory: Record<MemoryCategory, number>;
  /** Gerado em */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Memory Snapshot
// ---------------------------------------------------------------------------

/**
 * Foto da memória do tenant em um ponto no tempo.
 */
export interface MemorySnapshot {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Patterns ativos neste snapshot */
  patterns: MemoryPattern[];
  /** Perfil longitudinal */
  profile: LongitudinalTenantProfile;
  /** Resumo */
  summary: string;
  /** Timestamp */
  snapshotAt: string;
}

// ---------------------------------------------------------------------------
// Tenant Memory (aggregate root)
// ---------------------------------------------------------------------------

/**
 * Raiz de agregação — toda a memória do tenant.
 */
export interface TenantMemory {
  /** Tenant ID */
  tenantId: string;
  /** Patterns ativos */
  patterns: MemoryPattern[];
  /** Último perfil gerado */
  latestProfile: LongitudinalTenantProfile | null;
  /** Total de signals processados */
  totalSignalsProcessed: number;
  /** Última consolidação */
  lastConsolidatedAt: string;
  /** Última atualização */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dias sem confirmação para iniciar decay */
export const DECAY_START_DAYS = 60;

/** Fator de decay por período (multiply confidence) */
export const DECAY_FACTOR_PER_PERIOD = 0.85;

/** Confidence mínima antes de obsolescence */
export const MIN_CONFIDENCE_THRESHOLD = 15;

/** Signals mínimos para emerging → confirmed */
export const CONFIRM_THRESHOLD = 5;

/** Signals mínimos para confirmed → stable */
export const STABLE_THRESHOLD = 15;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  [MemoryCategory.CONTENT_STYLE]: 'Conteúdo e Estilo',
  [MemoryCategory.PUBLICATION]: 'Publicação',
  [MemoryCategory.APPROVAL]: 'Aprovação',
  [MemoryCategory.PLAN_USAGE]: 'Uso e Plano',
  [MemoryCategory.OPERATIONAL_MATURITY]: 'Maturidade Operacional',
  [MemoryCategory.CAMPAIGN]: 'Campanha',
  [MemoryCategory.CHANNEL]: 'Canal',
  [MemoryCategory.COST_EFFICIENCY]: 'Custo e Eficiência',
};

export const STRENGTH_LABELS: Record<MemoryStrength, string> = {
  [MemoryStrength.WEAK]: 'Fraco',
  [MemoryStrength.MODERATE]: 'Moderado',
  [MemoryStrength.STRONG]: 'Forte',
  [MemoryStrength.VERY_STRONG]: 'Muito forte',
};

export const PATTERN_STATUS_LABELS: Record<PatternStatus, string> = {
  [PatternStatus.EMERGING]: 'Emergente',
  [PatternStatus.CONFIRMED]: 'Confirmado',
  [PatternStatus.STABLE]: 'Estável',
  [PatternStatus.DECLINING]: 'Em declínio',
  [PatternStatus.OBSOLETE]: 'Obsoleto',
};
