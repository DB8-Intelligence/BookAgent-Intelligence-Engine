/**
 * Entity: Goal-Driven Optimization Profiles
 *
 * Camada acima da estratégia e da campanha — define O QUE o tenant
 * quer otimizar e QUAIS trade-offs aceita.
 *
 * Diferença vs campaign-optimization.ts (Parte 89 runtime):
 *   campaign-optimization mede progresso DURANTE a execução.
 *   goal-optimization define a INTENÇÃO ANTES de gerar estratégia.
 *
 * Conceitos:
 *
 *   OPTIMIZATION OBJECTIVE:
 *     O que o tenant quer maximizar/minimizar como resultado.
 *     Ex: awareness, conversion, quality, speed, cost.
 *
 *   OPTIMIZATION PROFILE:
 *     Configuração completa de objetivos, pesos, trade-offs e
 *     constraints. Cada tenant tem um profile ativo.
 *
 *   GOAL PRIORITY:
 *     Peso relativo de cada objetivo (0-100). Soma não precisa
 *     ser 100 — indica importância relativa.
 *
 *   OPTIMIZATION TRADE-OFF:
 *     Tensão explícita entre dois objetivos. Ex: qualidade vs
 *     velocidade. O profile define qual lado pesa mais.
 *
 *   OPTIMIZATION CONSTRAINT:
 *     Restrição hard que não pode ser violada independente dos
 *     objetivos. Ex: max cost, min quality, max items.
 *
 *   GOAL-DRIVEN RECOMMENDATION:
 *     Recomendação do otimizador que explica como o goal ativo
 *     influencia uma decisão do sistema (strategy, template,
 *     scheduling, cadence, etc.).
 *
 *   GOAL EVALUATION RESULT:
 *     Resultado completo: profile aplicado, decisões influenciadas,
 *     trade-offs resolvidos, rationale explicável.
 *
 *   TENANT GOAL PREFERENCE:
 *     Preferência persistida do tenant — goal default, profile
 *     preferido, constraints customizados.
 *
 * Relações:
 *   TenantGoalPreference → OptimizationProfile → GoalEvaluation
 *   GoalEvaluation → Strategy, Campaign, Scheduling, Execution
 *
 * Persistência: bookagent_goal_preferences
 *
 * Parte 89: Goal-Driven Optimization (upstream layer)
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Objetivo de otimização */
export enum OptimizationObjective {
  /** Maximizar visibilidade e alcance */
  AWARENESS = 'awareness',
  /** Maximizar engajamento (comentários, compartilhamentos) */
  ENGAGEMENT = 'engagement',
  /** Maximizar conversões (leads, contatos) */
  CONVERSION = 'conversion',
  /** Minimizar custo por campanha */
  LOW_COST = 'low_cost',
  /** Maximizar qualidade de outputs */
  HIGH_QUALITY = 'high_quality',
  /** Minimizar tempo de produção */
  FAST_TURNAROUND = 'fast_turnaround',
  /** Equilíbrio entre todos os fatores */
  BALANCED = 'balanced',
}

/** Dimensão de trade-off */
export enum TradeOffDimension {
  QUALITY = 'quality',
  SPEED = 'speed',
  COST = 'cost',
  VOLUME = 'volume',
  AUTOMATION = 'automation',
  CONTROL = 'control',
  VARIETY = 'variety',
  SIMPLICITY = 'simplicity',
}

/** Nível de agressividade do otimizador */
export enum OptimizationAggressiveness {
  /** Conservador — mudanças mínimas */
  CONSERVATIVE = 'conservative',
  /** Moderado — ajustes graduais */
  MODERATE = 'moderate',
  /** Agressivo — mudanças significativas */
  AGGRESSIVE = 'aggressive',
}

// ---------------------------------------------------------------------------
// Goal Priority
// ---------------------------------------------------------------------------

/**
 * Peso relativo de cada objetivo no profile.
 * Valores de 0 a 100. Maior = mais importante.
 */
export interface GoalPriorities {
  awareness: number;
  engagement: number;
  conversion: number;
  cost: number;
  quality: number;
  speed: number;
}

// ---------------------------------------------------------------------------
// Optimization Trade-Off
// ---------------------------------------------------------------------------

/**
 * Trade-off explícito entre duas dimensões.
 * Valor de -100 a +100:
 *   -100 = totalmente a favor de dimensionA
 *   +100 = totalmente a favor de dimensionB
 *      0 = equilíbrio
 */
export interface OptimizationTradeOff {
  /** Dimensão A */
  dimensionA: TradeOffDimension;
  /** Dimensão B */
  dimensionB: TradeOffDimension;
  /** Valor (-100 a +100, positivo favorece B) */
  bias: number;
  /** Descrição legível */
  description: string;
}

// ---------------------------------------------------------------------------
// Optimization Constraint
// ---------------------------------------------------------------------------

/**
 * Restrição hard que não pode ser violada.
 */
export interface OptimizationConstraint {
  /** Nome */
  name: string;
  /** Tipo */
  type: 'max_cost_usd' | 'min_quality_score' | 'max_items_per_campaign' | 'max_publications_per_day' | 'min_approval_rate' | 'max_duration_days';
  /** Valor limite */
  value: number;
  /** Ativa? */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Optimization Profile
// ---------------------------------------------------------------------------

/**
 * Profile completo de otimização — como o tenant quer que o sistema
 * priorize decisões.
 */
export interface OptimizationProfile {
  /** ID */
  id: string;
  /** Nome do profile */
  name: string;
  /** Descrição */
  description: string;
  /** Objetivo primário */
  primaryObjective: OptimizationObjective;
  /** Objetivo secundário */
  secondaryObjective: OptimizationObjective | null;
  /** Pesos por objetivo */
  priorities: GoalPriorities;
  /** Trade-offs explícitos */
  tradeOffs: OptimizationTradeOff[];
  /** Constraints hard */
  constraints: OptimizationConstraint[];
  /** Agressividade do otimizador */
  aggressiveness: OptimizationAggressiveness;
}

// ---------------------------------------------------------------------------
// Goal-Driven Recommendation
// ---------------------------------------------------------------------------

/**
 * Recomendação do otimizador explicando como o goal ativo influencia
 * uma decisão específica do sistema.
 */
export interface GoalDrivenRecommendation {
  /** Área do sistema influenciada */
  area: 'strategy' | 'campaign' | 'scheduling' | 'template' | 'preset' | 'cadence' | 'auto_publish' | 'variant';
  /** Decisão recomendada */
  recommendation: string;
  /** Racional: por que o goal ativo leva a essa decisão */
  rationale: string;
  /** Objetivo que gerou esta recomendação */
  drivenBy: OptimizationObjective;
  /** Trade-off aplicado (se houver) */
  tradeOffApplied: string | null;
  /** Impacto estimado */
  impact: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Goal Evaluation Result
// ---------------------------------------------------------------------------

/**
 * Resultado completo da avaliação goal-driven — aplicado antes de
 * gerar estratégia, campanha ou schedule.
 */
export interface GoalEvaluationResult {
  /** Profile usado */
  profileId: string;
  /** Profile name */
  profileName: string;
  /** Objetivo primário */
  primaryObjective: OptimizationObjective;
  /** Recomendações goal-driven */
  recommendations: GoalDrivenRecommendation[];
  /** Trade-offs resolvidos */
  resolvedTradeOffs: Array<{
    tradeOff: OptimizationTradeOff;
    resolution: string;
  }>;
  /** Constraints ativos */
  activeConstraints: OptimizationConstraint[];
  /** Parâmetros derivados para o sistema */
  derivedParams: GoalDerivedParams;
  /** Resumo executivo */
  summary: string;
  /** Timestamp */
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Goal-Derived Parameters
// ---------------------------------------------------------------------------

/**
 * Parâmetros concretos derivados do goal profile — usados pelo
 * strategy generator, campaign builder e scheduler.
 */
export interface GoalDerivedParams {
  /** Formato preferido (ex: 'reel', 'carousel') */
  preferredFormat: string;
  /** Canal preferido (ex: 'instagram') */
  preferredChannel: string;
  /** Preset recomendado */
  recommendedPreset: string;
  /** Intensidade sugerida */
  suggestedIntensity: 'low' | 'medium' | 'high';
  /** Quality score mínimo aceitável */
  minQualityScore: number;
  /** Auto publish: agressividade */
  autoPublishEnabled: boolean;
  /** Máximo de itens por campanha */
  maxCampaignItems: number;
  /** Cadência: publicações por dia */
  maxPublicationsPerDay: number;
  /** Cadência: intervalo mínimo (horas) */
  minIntervalHours: number;
  /** Usar templates premium? */
  usePremiumTemplates: boolean;
  /** Priorizar variantes? */
  prioritizeVariants: boolean;
}

// ---------------------------------------------------------------------------
// Tenant Goal Preference
// ---------------------------------------------------------------------------

/**
 * Preferência persistida do tenant — goal default e overrides.
 */
export interface TenantGoalPreference {
  /** Tenant ID */
  tenantId: string;
  /** Profile ativo */
  activeProfileId: string;
  /** Objetivo primário escolhido pelo tenant */
  primaryObjective: OptimizationObjective;
  /** Constraints customizados pelo tenant */
  customConstraints: OptimizationConstraint[];
  /** Trade-off overrides */
  tradeOffOverrides: OptimizationTradeOff[];
  /** Agressividade preferida */
  aggressiveness: OptimizationAggressiveness;
  /** Atualizado em */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Preset Profiles
// ---------------------------------------------------------------------------

export const PRESET_PROFILES: Record<OptimizationObjective, OptimizationProfile> = {
  [OptimizationObjective.AWARENESS]: {
    id: 'profile-awareness',
    name: 'Visibilidade Máxima',
    description: 'Prioriza alcance e frequência. Mais formatos visuais, maior cadência.',
    primaryObjective: OptimizationObjective.AWARENESS,
    secondaryObjective: OptimizationObjective.ENGAGEMENT,
    priorities: { awareness: 90, engagement: 60, conversion: 30, cost: 20, quality: 50, speed: 70 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.QUALITY, dimensionB: TradeOffDimension.VOLUME, bias: 40, description: 'Priorizar volume sobre qualidade premium' },
      { dimensionA: TradeOffDimension.COST, dimensionB: TradeOffDimension.SPEED, bias: 30, description: 'Aceitar custo maior por mais velocidade' },
    ],
    constraints: [],
    aggressiveness: OptimizationAggressiveness.AGGRESSIVE,
  },
  [OptimizationObjective.ENGAGEMENT]: {
    id: 'profile-engagement',
    name: 'Engajamento Máximo',
    description: 'Prioriza interação. Carrosséis, enquetes, CTAs fortes.',
    primaryObjective: OptimizationObjective.ENGAGEMENT,
    secondaryObjective: OptimizationObjective.AWARENESS,
    priorities: { awareness: 50, engagement: 95, conversion: 40, cost: 30, quality: 70, speed: 40 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.SPEED, dimensionB: TradeOffDimension.QUALITY, bias: 30, description: 'Priorizar qualidade para gerar mais interação' },
    ],
    constraints: [],
    aggressiveness: OptimizationAggressiveness.MODERATE,
  },
  [OptimizationObjective.CONVERSION]: {
    id: 'profile-conversion',
    name: 'Conversão Máxima',
    description: 'Prioriza leads e contatos. CTAs diretos, landing pages, reels com CTA.',
    primaryObjective: OptimizationObjective.CONVERSION,
    secondaryObjective: OptimizationObjective.ENGAGEMENT,
    priorities: { awareness: 40, engagement: 60, conversion: 95, cost: 40, quality: 70, speed: 50 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.VARIETY, dimensionB: TradeOffDimension.SIMPLICITY, bias: 30, description: 'Focar em formatos que convertem, menos variedade' },
    ],
    constraints: [
      { name: 'Quality mínima', type: 'min_quality_score', value: 60, enabled: true },
    ],
    aggressiveness: OptimizationAggressiveness.MODERATE,
  },
  [OptimizationObjective.LOW_COST]: {
    id: 'profile-low-cost',
    name: 'Custo Mínimo',
    description: 'Minimiza custo por campanha. Menos variantes, formatos simples, menos renders.',
    primaryObjective: OptimizationObjective.LOW_COST,
    secondaryObjective: OptimizationObjective.AWARENESS,
    priorities: { awareness: 50, engagement: 30, conversion: 30, cost: 95, quality: 40, speed: 60 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.QUALITY, dimensionB: TradeOffDimension.COST, bias: -60, description: 'Reduzir qualidade premium para economizar' },
      { dimensionA: TradeOffDimension.VARIETY, dimensionB: TradeOffDimension.SIMPLICITY, bias: 60, description: 'Menos formatos = menos custo' },
    ],
    constraints: [
      { name: 'Max itens', type: 'max_items_per_campaign', value: 5, enabled: true },
      { name: 'Max publicações/dia', type: 'max_publications_per_day', value: 1, enabled: true },
    ],
    aggressiveness: OptimizationAggressiveness.CONSERVATIVE,
  },
  [OptimizationObjective.HIGH_QUALITY]: {
    id: 'profile-high-quality',
    name: 'Qualidade Premium',
    description: 'Prioriza qualidade de output. Templates premium, scoring alto, revisão.',
    primaryObjective: OptimizationObjective.HIGH_QUALITY,
    secondaryObjective: OptimizationObjective.ENGAGEMENT,
    priorities: { awareness: 40, engagement: 60, conversion: 50, cost: 20, quality: 95, speed: 20 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.SPEED, dimensionB: TradeOffDimension.QUALITY, bias: 80, description: 'Sacrificar velocidade por qualidade máxima' },
      { dimensionA: TradeOffDimension.AUTOMATION, dimensionB: TradeOffDimension.CONTROL, bias: 60, description: 'Mais controle humano sobre outputs' },
    ],
    constraints: [
      { name: 'Score mínimo', type: 'min_quality_score', value: 75, enabled: true },
    ],
    aggressiveness: OptimizationAggressiveness.CONSERVATIVE,
  },
  [OptimizationObjective.FAST_TURNAROUND]: {
    id: 'profile-fast-turnaround',
    name: 'Velocidade Máxima',
    description: 'Prioriza rapidez. Mais automação, menos checkpoints, cadência alta.',
    primaryObjective: OptimizationObjective.FAST_TURNAROUND,
    secondaryObjective: OptimizationObjective.AWARENESS,
    priorities: { awareness: 60, engagement: 40, conversion: 30, cost: 40, quality: 40, speed: 95 },
    tradeOffs: [
      { dimensionA: TradeOffDimension.QUALITY, dimensionB: TradeOffDimension.SPEED, bias: -70, description: 'Velocidade sobre qualidade premium' },
      { dimensionA: TradeOffDimension.CONTROL, dimensionB: TradeOffDimension.AUTOMATION, bias: 70, description: 'Máxima automação, mínimo controle manual' },
    ],
    constraints: [
      { name: 'Max duração', type: 'max_duration_days', value: 7, enabled: true },
    ],
    aggressiveness: OptimizationAggressiveness.AGGRESSIVE,
  },
  [OptimizationObjective.BALANCED]: {
    id: 'profile-balanced',
    name: 'Equilíbrio',
    description: 'Balanceia todos os fatores. Sem extremos, decisões moderadas.',
    primaryObjective: OptimizationObjective.BALANCED,
    secondaryObjective: null,
    priorities: { awareness: 60, engagement: 60, conversion: 50, cost: 50, quality: 60, speed: 50 },
    tradeOffs: [],
    constraints: [],
    aggressiveness: OptimizationAggressiveness.MODERATE,
  },
};

// ---------------------------------------------------------------------------
// Default per Plan
// ---------------------------------------------------------------------------

export const DEFAULT_OBJECTIVE_BY_PLAN: Record<PlanTier, OptimizationObjective> = {
  starter: OptimizationObjective.LOW_COST,
  pro: OptimizationObjective.BALANCED,
  agency: OptimizationObjective.HIGH_QUALITY,
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const OBJECTIVE_OPT_LABELS: Record<OptimizationObjective, string> = {
  [OptimizationObjective.AWARENESS]: 'Visibilidade',
  [OptimizationObjective.ENGAGEMENT]: 'Engajamento',
  [OptimizationObjective.CONVERSION]: 'Conversão',
  [OptimizationObjective.LOW_COST]: 'Custo Mínimo',
  [OptimizationObjective.HIGH_QUALITY]: 'Qualidade Premium',
  [OptimizationObjective.FAST_TURNAROUND]: 'Velocidade',
  [OptimizationObjective.BALANCED]: 'Equilibrado',
};

export const AGGRESSIVENESS_LABELS: Record<OptimizationAggressiveness, string> = {
  [OptimizationAggressiveness.CONSERVATIVE]: 'Conservador',
  [OptimizationAggressiveness.MODERATE]: 'Moderado',
  [OptimizationAggressiveness.AGGRESSIVE]: 'Agressivo',
};
