/**
 * Entity: Automated Strategy Layer
 *
 * Hierarquia conceitual no BookAgent:
 *
 *   INSIGHT (observação):
 *     "Seus reels têm 85% de sucesso" — dado factuado.
 *
 *   RECOMMENDATION (sugestão pontual):
 *     "Publique mais reels" — ação isolada derivada de insight.
 *
 *   STRATEGY (plano tático):
 *     "Foque em awareness via reels luxury 15s no Instagram,
 *      com 3 publicações/semana" — plano coerente com objetivo,
 *      mix de conteúdo, canais e intensidade.
 *
 *   CAMPAIGN PLAN (execução futura):
 *     Sequência temporal de posts/publicações com datas,
 *     formatos e conteúdos específicos. (Parte futura)
 *
 * Categorias estratégicas:
 *   - AWARENESS:    visibilidade, alcance, primeiras impressões
 *   - ENGAGEMENT:   interação, comentários, compartilhamentos
 *   - CONVERSION:   leads, contatos, visitas
 *   - NURTURE:      relacionamento, confiança, autoridade
 *   - SOCIAL_PROOF: prova social, depoimentos, resultados
 *   - LAUNCH:       lançamento, promoção, evento
 *
 * Parte 84: Automated Strategy Layer
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Categoria estratégica / objetivo */
export enum StrategyObjective {
  AWARENESS = 'awareness',
  ENGAGEMENT = 'engagement',
  CONVERSION = 'conversion',
  NURTURE = 'nurture',
  SOCIAL_PROOF = 'social_proof',
  LAUNCH = 'launch',
}

/** Prioridade da estratégia */
export enum StrategyPriority {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  TERTIARY = 'tertiary',
}

/** Intensidade sugerida */
export enum StrategyIntensity {
  /** 1-2 publicações/semana */
  LOW = 'low',
  /** 3-5 publicações/semana */
  MEDIUM = 'medium',
  /** 6+ publicações/semana, diário */
  HIGH = 'high',
}

// ---------------------------------------------------------------------------
// Strategy Constraint
// ---------------------------------------------------------------------------

/**
 * Restrição que limita a estratégia.
 */
export interface StrategyConstraint {
  /** Tipo da restrição */
  type: 'plan_limit' | 'feature_disabled' | 'low_assets' | 'no_history' | 'cost_limit' | 'channel_unavailable';
  /** Descrição */
  description: string;
  /** Impacto na estratégia */
  impact: string;
  /** Ação sugerida para remover a restrição */
  mitigation?: string;
}

// ---------------------------------------------------------------------------
// Strategy Rationale
// ---------------------------------------------------------------------------

/**
 * Justificativa da estratégia — explica por que cada decisão foi tomada.
 */
export interface StrategyRationale {
  /** Objetivo escolhido e por quê */
  objectiveReason: string;
  /** Por que esses canais */
  channelReason: string;
  /** Por que esses formatos */
  formatReason: string;
  /** Por que essa intensidade */
  intensityReason: string;
  /** Dados que suportam */
  supportingData: Array<{ metric: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Strategy Mix
// ---------------------------------------------------------------------------

/**
 * Mix de conteúdo recomendado — distribuição por formato e canal.
 */
export interface StrategyMix {
  /** Distribuição por formato (ex: { reel: 50, carousel: 30, post: 20 }) */
  formatDistribution: Array<{
    format: string;
    percentage: number;
    reason: string;
  }>;
  /** Canais prioritários em ordem */
  channelPriority: Array<{
    channel: string;
    priority: StrategyPriority;
    reason: string;
  }>;
  /** Template sugerido por formato */
  suggestedTemplates: Array<{
    format: string;
    templateId: string;
    styleId: string;
  }>;
  /** Preset recomendado */
  recommendedPreset: string;
}

// ---------------------------------------------------------------------------
// Strategy Recommendation
// ---------------------------------------------------------------------------

/**
 * Recomendação tática dentro da estratégia.
 */
export interface StrategyRecommendation {
  /** ID */
  id: string;
  /** Categoria */
  objective: StrategyObjective;
  /** Prioridade */
  priority: StrategyPriority;
  /** Título */
  title: string;
  /** Descrição detalhada */
  description: string;
  /** Formato sugerido */
  suggestedFormat: string;
  /** Canal sugerido */
  suggestedChannel: string;
  /** Frequência sugerida (por semana) */
  weeklyFrequency: number;
  /** Impacto estimado */
  estimatedImpact: string;
}

// ---------------------------------------------------------------------------
// Strategy Profile
// ---------------------------------------------------------------------------

/**
 * Perfil estratégico completo do tenant.
 */
export interface StrategyProfile {
  /** Objetivo principal */
  primaryObjective: StrategyObjective;
  /** Objetivo secundário */
  secondaryObjective: StrategyObjective | null;
  /** Intensidade sugerida */
  intensity: StrategyIntensity;
  /** Mix de conteúdo */
  mix: StrategyMix;
  /** Recomendações táticas ordenadas por prioridade */
  recommendations: StrategyRecommendation[];
  /** Justificativa */
  rationale: StrategyRationale;
  /** Restrições ativas */
  constraints: StrategyConstraint[];
}

// ---------------------------------------------------------------------------
// Tenant Strategy Snapshot
// ---------------------------------------------------------------------------

/**
 * Snapshot completo da estratégia de um tenant.
 */
export interface TenantStrategySnapshot {
  tenantId: string;
  planTier: PlanTier;
  /** Perfil estratégico gerado */
  strategy: StrategyProfile;
  /** Resumo executivo (1-3 frases) */
  executiveSummary: string;
  /** Ações imediatas (top 3) */
  immediateActions: string[];
  /** Gerado em */
  generatedAt: string;
  /** Válido até */
  validUntil: string;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const OBJECTIVE_LABELS: Record<StrategyObjective, string> = {
  [StrategyObjective.AWARENESS]: 'Visibilidade',
  [StrategyObjective.ENGAGEMENT]: 'Engajamento',
  [StrategyObjective.CONVERSION]: 'Conversão',
  [StrategyObjective.NURTURE]: 'Relacionamento',
  [StrategyObjective.SOCIAL_PROOF]: 'Prova Social',
  [StrategyObjective.LAUNCH]: 'Lançamento',
};

export const INTENSITY_LABELS: Record<StrategyIntensity, string> = {
  [StrategyIntensity.LOW]: '1-2 publicações/semana',
  [StrategyIntensity.MEDIUM]: '3-5 publicações/semana',
  [StrategyIntensity.HIGH]: '6+ publicações/semana',
};
