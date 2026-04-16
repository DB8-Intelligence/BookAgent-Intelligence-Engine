/**
 * Trust, Explanation & Audit Surfaces — Domain Entities
 *
 * Superfícies explicáveis e auditáveis que consolidam decisões,
 * policies, ações e resultados em narrativas compreensíveis.
 *
 * Conceitos:
 *   - ExplanationRecord  — explicação formal de uma decisão/ação
 *   - TrustSignal        — indicador de confiança do sistema
 *   - ActionTrace         — trilha de uma ação de ponta a ponta
 *   - AuditSurface        — visão consolidada de auditoria por entidade
 *   - AuditNarrative      — narrativa legível do que aconteceu e por quê
 *   - ConfidenceIndicator — score de confiança com breakdown
 *   - RiskIndicator       — score de risco com fatores
 *
 * Persistência:
 *   - bookagent_explanations
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo do subject explicado. */
export enum ExplanationSubject {
  DECISION          = 'decision',
  POLICY            = 'policy',
  CAMPAIGN_EXECUTION = 'campaign_execution',
  PUBLICATION       = 'publication',
  HUMAN_OVERRIDE    = 'human_override',
  RECOVERY          = 'recovery',
  COPILOT_ADVISORY  = 'copilot_advisory',
  BILLING_BLOCK     = 'billing_block',
  GOVERNANCE_GATE   = 'governance_gate',
}

/** Público-alvo da explicação. */
export enum ExplanationAudience {
  TENANT    = 'tenant',
  ADMIN     = 'admin',
  SUPPORT   = 'support',
  SYSTEM    = 'system',
}

/** Nível de trust do sinal. */
export enum TrustLevel {
  HIGH       = 'high',
  MODERATE   = 'moderate',
  LOW        = 'low',
  DEGRADED   = 'degraded',
  UNKNOWN    = 'unknown',
}

/** Nível de risco. */
export enum RiskLevel {
  NONE     = 'none',
  LOW      = 'low',
  MEDIUM   = 'medium',
  HIGH     = 'high',
  CRITICAL = 'critical',
}

/** Status do action trace. */
export enum TraceStatus {
  STARTED   = 'started',
  COMPLETED = 'completed',
  FAILED    = 'failed',
  BLOCKED   = 'blocked',
  OVERRIDDEN = 'overridden',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Bloco de contexto dentro de uma explicação. */
export interface ExplanationBlock {
  label: string;
  value: string;
  /** Relevância deste bloco (0–100) */
  relevance: number;
}

/** Explicação formal de uma decisão ou ação do sistema. */
export interface ExplanationRecord {
  id: string;
  tenantId: string | null;
  subject: ExplanationSubject;
  /** ID da entidade explicada (decision_id, job_id, etc.) */
  entityId: string;
  entityType: string;
  audience: ExplanationAudience;
  /** Resumo de uma linha */
  headline: string;
  /** Explicação narrativa completa */
  narrative: string;
  /** Blocos estruturados da explicação */
  context: ExplanationBlock[];
  /** Inputs principais que influenciaram */
  keyInputs: ExplanationBlock[];
  /** Constraints/policies aplicados */
  appliedConstraints: string[];
  /** Alternativas consideradas e rejeitadas */
  rejectedAlternatives: string[];
  /** Ação tomada */
  actionTaken: string;
  /** Resultado observado */
  observedResult: string | null;
  /** Confidence (0–100) */
  confidence: number;
  createdAt: string;
}

/** Sinal de confiança do sistema sobre uma entidade. */
export interface TrustSignal {
  id: string;
  tenantId: string | null;
  entityId: string;
  entityType: string;
  trustLevel: TrustLevel;
  /** Score geral (0–100) */
  score: number;
  indicators: ConfidenceIndicator[];
  risks: RiskIndicator[];
  /** Se fallback foi usado */
  fallbackUsed: boolean;
  /** Se recovery foi acionado */
  recoveryTriggered: boolean;
  /** Se revisão humana é necessária */
  humanReviewNeeded: boolean;
  /** Compliance com governance */
  governanceCompliant: boolean;
  generatedAt: string;
}

/** Indicador de confiança individual. */
export interface ConfidenceIndicator {
  dimension: string;
  score: number;
  label: string;
  detail: string;
}

/** Indicador de risco individual. */
export interface RiskIndicator {
  factor: string;
  level: RiskLevel;
  description: string;
  mitigation: string | null;
}

/** Trilha de uma ação de ponta a ponta. */
export interface ActionTrace {
  id: string;
  tenantId: string | null;
  entityId: string;
  entityType: string;
  action: string;
  status: TraceStatus;
  /** Etapas da ação em ordem cronológica */
  steps: TraceStep[];
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

/** Etapa individual de um action trace. */
export interface TraceStep {
  order: number;
  name: string;
  status: TraceStatus;
  detail: string;
  timestamp: string;
  durationMs: number;
}

/** Narrativa de auditoria legível. */
export interface AuditNarrative {
  entityId: string;
  entityType: string;
  /** Narrativa em parágrafos */
  paragraphs: string[];
  /** Timeline resumida */
  timeline: AuditTimelineEntry[];
  /** Highlights (pontos importantes) */
  highlights: string[];
}

/** Entrada na timeline de auditoria. */
export interface AuditTimelineEntry {
  timestamp: string;
  event: string;
  actor: string;
  detail: string;
}

/** Superfície de auditoria consolidada. */
export interface AuditSurface {
  tenantId: string | null;
  entityId: string;
  entityType: string;
  explanation: ExplanationRecord | null;
  trust: TrustSignal | null;
  traces: ActionTrace[];
  narrative: AuditNarrative;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Labels de subject. */
export const EXPLANATION_SUBJECT_LABELS: Record<ExplanationSubject, string> = {
  [ExplanationSubject.DECISION]:           'Decision',
  [ExplanationSubject.POLICY]:             'Policy',
  [ExplanationSubject.CAMPAIGN_EXECUTION]: 'Campaign Execution',
  [ExplanationSubject.PUBLICATION]:        'Publication',
  [ExplanationSubject.HUMAN_OVERRIDE]:     'Human Override',
  [ExplanationSubject.RECOVERY]:           'Recovery',
  [ExplanationSubject.COPILOT_ADVISORY]:   'Co-Pilot Advisory',
  [ExplanationSubject.BILLING_BLOCK]:      'Billing Block',
  [ExplanationSubject.GOVERNANCE_GATE]:    'Governance Gate',
};

/** Labels de trust level. */
export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  [TrustLevel.HIGH]:     'High Trust',
  [TrustLevel.MODERATE]: 'Moderate Trust',
  [TrustLevel.LOW]:      'Low Trust',
  [TrustLevel.DEGRADED]: 'Degraded',
  [TrustLevel.UNKNOWN]:  'Unknown',
};

/** Labels de risk level. */
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  [RiskLevel.NONE]:     'None',
  [RiskLevel.LOW]:      'Low',
  [RiskLevel.MEDIUM]:   'Medium',
  [RiskLevel.HIGH]:     'High',
  [RiskLevel.CRITICAL]: 'Critical',
};

/** Labels de trace status. */
export const TRACE_STATUS_LABELS: Record<TraceStatus, string> = {
  [TraceStatus.STARTED]:    'Started',
  [TraceStatus.COMPLETED]:  'Completed',
  [TraceStatus.FAILED]:     'Failed',
  [TraceStatus.BLOCKED]:    'Blocked',
  [TraceStatus.OVERRIDDEN]: 'Overridden',
};

/** Threshold para trust HIGH. */
export const TRUST_HIGH_THRESHOLD = 80;
/** Threshold para trust MODERATE. */
export const TRUST_MODERATE_THRESHOLD = 50;
/** Threshold para trust LOW. */
export const TRUST_LOW_THRESHOLD = 25;
