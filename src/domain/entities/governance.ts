/**
 * Entity: Human-in-the-Loop Governance
 *
 * Conceitos:
 *
 *   AUTONOMY LEVEL:
 *     Grau de autonomia do sistema para um tenant/contexto.
 *     De "manual" (tudo precisa de humano) a "autonomous"
 *     (sistema executa sozinho com auditoria).
 *
 *   GOVERNANCE POLICY:
 *     Política de governança de um tenant. Define o nível de
 *     autonomia, regras de checkpoint e escalation thresholds.
 *     Cada tenant tem uma policy derivada do plano + overrides.
 *
 *   GOVERNANCE RULE:
 *     Regra individual que determina quando o sistema deve
 *     parar e pedir intervenção humana. Avaliada no ponto
 *     de decisão (gate) pelo governance evaluator.
 *
 *   HUMAN CHECKPOINT:
 *     Ponto formal de intervenção humana. Registra o que foi
 *     avaliado, quem decidiu, e o resultado.
 *
 *   GOVERNANCE DECISION:
 *     Decisão humana sobre um checkpoint — aprovar, rejeitar,
 *     liberar override ou escalar.
 *
 *   MANUAL OVERRIDE:
 *     Liberação excepcional por humano para pular um gate
 *     que normalmente bloquearia a execução. Registra
 *     justificativa e responsável.
 *
 *   ESCALATION REQUEST:
 *     Pedido de escalação quando o sistema detecta algo que
 *     excede o nível de autonomia — enviado para admin/owner.
 *
 *   GOVERNANCE AUDIT ENTRY:
 *     Log completo de cada decisão de governança para
 *     rastreabilidade e compliance.
 *
 * Modelo de convivência:
 *   O executor autônomo (Parte 87) consulta o governance evaluator
 *   antes de cada ação. Se a governance exigir checkpoint, a ação
 *   é suspensa até decisão humana. Se não, segue automaticamente.
 *
 * Persistência: bookagent_governance_decisions
 *
 * Parte 88: Human-in-the-Loop Governance
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Nível de autonomia */
export enum AutonomyLevel {
  /** Tudo manual — sistema sugere, humano executa */
  MANUAL = 'manual',
  /** Assistido — sistema prepara, humano confirma cada ação */
  ASSISTED = 'assisted',
  /** Semi-autônomo — sistema executa rotinas, humano valida decisões críticas */
  SEMI_AUTONOMOUS = 'semi_autonomous',
  /** Autônomo supervisionado — sistema executa tudo, humano revisa depois */
  SUPERVISED_AUTONOMOUS = 'supervised_autonomous',
  /** Totalmente autônomo — sistema executa e audita sozinho */
  AUTONOMOUS = 'autonomous',
}

/** Tipo de gate de governança */
export enum GovernanceGateType {
  /** Antes de publicação automática */
  PRE_PUBLISH = 'pre_publish',
  /** Antes de executar campaign item */
  PRE_EXECUTE = 'pre_execute',
  /** Quando quality score está baixo */
  LOW_QUALITY = 'low_quality',
  /** Quando publicação falhou e será retentada */
  RETRY_AFTER_FAILURE = 'retry_after_failure',
  /** Mudança de estratégia */
  STRATEGY_CHANGE = 'strategy_change',
  /** Billing/limite incerto */
  BILLING_UNCERTAINTY = 'billing_uncertainty',
  /** Escopo de campanha grande */
  LARGE_CAMPAIGN = 'large_campaign',
  /** Primeiro uso de canal novo */
  NEW_CHANNEL = 'new_channel',
}

/** Resultado da decisão de governança */
export enum GovernanceDecisionResult {
  /** Aprovado — pode seguir */
  APPROVED = 'approved',
  /** Rejeitado — não pode seguir */
  REJECTED = 'rejected',
  /** Override — exceção liberada */
  OVERRIDE = 'override',
  /** Escalado — enviado para nível superior */
  ESCALATED = 'escalated',
  /** Pendente — aguardando decisão */
  PENDING = 'pending',
}

/** Status da escalação */
export enum EscalationStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

/** Severidade da escalação */
export enum EscalationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ---------------------------------------------------------------------------
// Governance Rule
// ---------------------------------------------------------------------------

/**
 * Regra individual de governança.
 */
export interface GovernanceRule {
  /** ID */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Gate onde esta regra se aplica */
  gate: GovernanceGateType;
  /** Nível de autonomia mínimo para bypass (se tenant tem esse nível ou acima, não precisa de checkpoint) */
  bypassAtLevel: AutonomyLevel;
  /** Condição que dispara a regra (avaliada pelo evaluator) */
  conditionKey: string;
  /** Ativa? */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Governance Policy
// ---------------------------------------------------------------------------

/**
 * Política de governança de um tenant.
 */
export interface GovernancePolicy {
  /** ID do tenant */
  tenantId: string;
  /** Nível de autonomia efetivo */
  autonomyLevel: AutonomyLevel;
  /** Regras ativas */
  activeRules: GovernanceRule[];
  /** Gates que requerem checkpoint humano neste nível */
  requiredGates: GovernanceGateType[];
  /** Quality score threshold — abaixo desse valor, exige revisão */
  qualityThreshold: number;
  /** Máximo de falhas consecutivas antes de escalação */
  maxConsecutiveFailures: number;
  /** Máximo de itens por campanha antes de exigir aprovação */
  largeCampaignThreshold: number;
  /** Atualizado em */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Human Checkpoint
// ---------------------------------------------------------------------------

/**
 * Ponto de intervenção humana — registra o que foi avaliado.
 */
export interface HumanCheckpoint {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Gate que disparou */
  gate: GovernanceGateType;
  /** Regra que disparou */
  ruleId: string;
  /** Entidade alvo (campaign, schedule item, publication, etc.) */
  targetType: string;
  /** ID da entidade alvo */
  targetId: string;
  /** Contexto — dados relevantes para a decisão */
  context: Record<string, unknown>;
  /** Decisão (preenchida quando humano decide) */
  decision: GovernanceDecision | null;
  /** Status */
  status: GovernanceDecisionResult;
  /** Criado em */
  createdAt: string;
  /** Expiração — se não decidido até aqui, escala */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Governance Decision
// ---------------------------------------------------------------------------

/**
 * Decisão humana sobre um checkpoint.
 */
export interface GovernanceDecision {
  /** Resultado */
  result: GovernanceDecisionResult;
  /** Quem decidiu (userId ou email) */
  decidedBy: string;
  /** Justificativa */
  justification: string;
  /** Timestamp */
  decidedAt: string;
}

// ---------------------------------------------------------------------------
// Manual Override
// ---------------------------------------------------------------------------

/**
 * Liberação excepcional — bypass de gate por humano.
 */
export interface ManualOverride {
  /** ID */
  id: string;
  /** ID do checkpoint */
  checkpointId: string;
  /** Tenant */
  tenantId: string;
  /** Gate sendo bypassed */
  gate: GovernanceGateType;
  /** Quem liberou */
  overriddenBy: string;
  /** Justificativa obrigatória */
  justification: string;
  /** Risco aceito */
  riskAcknowledged: boolean;
  /** Timestamp */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Escalation Request
// ---------------------------------------------------------------------------

/**
 * Pedido de escalação para nível superior.
 */
export interface EscalationRequest {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** ID do checkpoint de origem */
  checkpointId: string;
  /** Severidade */
  severity: EscalationSeverity;
  /** Status */
  status: EscalationStatus;
  /** Título */
  title: string;
  /** Descrição */
  description: string;
  /** Dados de contexto */
  context: Record<string, unknown>;
  /** Escalado para (userId, role, etc.) */
  escalatedTo: string;
  /** Resolução (se resolvida) */
  resolution: string | null;
  /** Criado em */
  createdAt: string;
  /** Resolvido em */
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Governance Audit Entry
// ---------------------------------------------------------------------------

/**
 * Entrada de auditoria completa.
 */
export interface GovernanceAuditEntry {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Gate */
  gate: GovernanceGateType;
  /** Target type + ID */
  targetType: string;
  targetId: string;
  /** Autonomy level no momento */
  autonomyLevel: AutonomyLevel;
  /** Resultado */
  result: GovernanceDecisionResult;
  /** Override? */
  wasOverride: boolean;
  /** Escalado? */
  wasEscalated: boolean;
  /** Quem decidiu (null se automático) */
  decidedBy: string | null;
  /** Justificativa */
  justification: string;
  /** Timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Governance Evaluation Result (returned by evaluator)
// ---------------------------------------------------------------------------

/**
 * Resultado da avaliação de governança — informa o executor se pode
 * seguir ou se precisa de checkpoint humano.
 */
export interface GovernanceEvaluation {
  /** Pode seguir automaticamente? */
  canProceed: boolean;
  /** Gates disparados */
  triggeredGates: GovernanceGateType[];
  /** Regras disparadas */
  triggeredRules: GovernanceRule[];
  /** Checkpoint necessário? */
  requiresCheckpoint: boolean;
  /** ID do checkpoint criado (se necessário) */
  checkpointId: string | null;
  /** Escalação necessária? */
  requiresEscalation: boolean;
  /** Justificativa */
  reason: string;
}

// ---------------------------------------------------------------------------
// Default Policies per Plan
// ---------------------------------------------------------------------------

export const DEFAULT_AUTONOMY_BY_PLAN: Record<PlanTier, AutonomyLevel> = {
  starter: AutonomyLevel.ASSISTED,
  pro: AutonomyLevel.SEMI_AUTONOMOUS,
  agency: AutonomyLevel.SUPERVISED_AUTONOMOUS,
};

export const DEFAULT_QUALITY_THRESHOLD = 50;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
export const DEFAULT_LARGE_CAMPAIGN_THRESHOLD = 10;
export const CHECKPOINT_EXPIRY_HOURS = 48;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const AUTONOMY_LEVEL_LABELS: Record<AutonomyLevel, string> = {
  [AutonomyLevel.MANUAL]: 'Manual',
  [AutonomyLevel.ASSISTED]: 'Assistido',
  [AutonomyLevel.SEMI_AUTONOMOUS]: 'Semi-autônomo',
  [AutonomyLevel.SUPERVISED_AUTONOMOUS]: 'Autônomo supervisionado',
  [AutonomyLevel.AUTONOMOUS]: 'Totalmente autônomo',
};

export const GATE_LABELS: Record<GovernanceGateType, string> = {
  [GovernanceGateType.PRE_PUBLISH]: 'Pré-publicação',
  [GovernanceGateType.PRE_EXECUTE]: 'Pré-execução',
  [GovernanceGateType.LOW_QUALITY]: 'Qualidade baixa',
  [GovernanceGateType.RETRY_AFTER_FAILURE]: 'Retentativa após falha',
  [GovernanceGateType.STRATEGY_CHANGE]: 'Mudança de estratégia',
  [GovernanceGateType.BILLING_UNCERTAINTY]: 'Incerteza de billing',
  [GovernanceGateType.LARGE_CAMPAIGN]: 'Campanha grande',
  [GovernanceGateType.NEW_CHANNEL]: 'Canal novo',
};

export const DECISION_RESULT_LABELS: Record<GovernanceDecisionResult, string> = {
  [GovernanceDecisionResult.APPROVED]: 'Aprovado',
  [GovernanceDecisionResult.REJECTED]: 'Rejeitado',
  [GovernanceDecisionResult.OVERRIDE]: 'Override',
  [GovernanceDecisionResult.ESCALATED]: 'Escalado',
  [GovernanceDecisionResult.PENDING]: 'Pendente',
};
