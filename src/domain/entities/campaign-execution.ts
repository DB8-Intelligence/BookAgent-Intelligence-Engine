/**
 * Entity: Autonomous Campaign Execution
 *
 * Conceitos:
 *
 *   CAMPAIGN EXECUTION:
 *     Sessão de execução autônoma de uma campanha. Agrupa todos os
 *     checks, decisões e ações tomadas em um ciclo de avaliação.
 *     Cada execução é idempotente e auditável.
 *
 *   EXECUTION READINESS CHECK:
 *     Avaliação de prontidão de um schedule item. Verifica se todas
 *     as pré-condições estão satisfeitas: schedule, dependências,
 *     aprovação, artifact, billing, features, canal.
 *
 *   EXECUTION DECISION:
 *     Resultado da avaliação de readiness — ação recomendada pelo
 *     sistema (executar, adiar, bloquear, solicitar intervenção).
 *
 *   EXECUTION BLOCK REASON:
 *     Motivo específico que impede a execução de um item.
 *     Cada bloqueio tem tipo, descrição e ação sugerida.
 *
 *   AUTONOMOUS ACTION:
 *     Ação efetivamente tomada pelo sistema sobre um item.
 *     Registra o que foi feito, resultado e contexto.
 *
 *   EXECUTION LOG:
 *     Registro completo de auditoria — decisão tomada, bloqueios,
 *     ação executada, resultado, timestamps.
 *
 * Princípios:
 *   - Segurança: nunca executa se há dúvida
 *   - Explicabilidade: cada decisão tem justificativa
 *   - Idempotência: re-executar o ciclo não causa efeitos duplicados
 *   - Tenant-scoped: isolamento por tenant
 *   - Não-destrutiva: erros não corrompem estado
 *
 * Relações:
 *   CampaignSchedule → CampaignExecution → ExecutionItems → Logs
 *
 * Persistência: bookagent_campaign_executions
 *
 * Parte 87: Autonomous Campaign Execution
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status da sessão de execução */
export enum ExecutionStatus {
  /** Avaliação em andamento */
  EVALUATING = 'evaluating',
  /** Concluída — todas as decisões tomadas */
  COMPLETED = 'completed',
  /** Concluída com bloqueios pendentes */
  COMPLETED_WITH_BLOCKS = 'completed_with_blocks',
  /** Falha no ciclo de execução */
  FAILED = 'failed',
}

/** Decisão do executor sobre um item */
export enum ExecutionDecisionType {
  /** Executar (publicar/entregar) */
  EXECUTE = 'execute',
  /** Adiar (schedule não alcançou ou dependência pendente) */
  DEFER = 'defer',
  /** Bloquear (pré-condição não satisfeita) */
  BLOCK = 'block',
  /** Pular (item já executado ou skipado) */
  SKIP = 'skip',
  /** Solicitar intervenção manual */
  REQUIRE_INTERVENTION = 'require_intervention',
}

/** Tipo de bloqueio de execução */
export enum BlockReasonType {
  /** Schedule ainda não alcançou a janela */
  SCHEDULE_NOT_REACHED = 'schedule_not_reached',
  /** Dependência não satisfeita */
  DEPENDENCY_PENDING = 'dependency_pending',
  /** Aprovação pendente */
  APPROVAL_PENDING = 'approval_pending',
  /** Aprovação rejeitada */
  APPROVAL_REJECTED = 'approval_rejected',
  /** Artifact/output não pronto */
  ARTIFACT_NOT_READY = 'artifact_not_ready',
  /** Limite de billing/plano atingido */
  BILLING_LIMIT_REACHED = 'billing_limit_reached',
  /** Feature desabilitada no plano */
  FEATURE_DISABLED = 'feature_disabled',
  /** Auto publish não disponível */
  AUTO_PUBLISH_UNAVAILABLE = 'auto_publish_unavailable',
  /** Falha anterior não resolvida */
  PREVIOUS_FAILURE = 'previous_failure',
  /** Canal indisponível */
  CHANNEL_UNAVAILABLE = 'channel_unavailable',
  /** Campanha pausada ou cancelada */
  CAMPAIGN_INACTIVE = 'campaign_inactive',
  /** Checkpoint de governança pendente */
  GOVERNANCE_CHECKPOINT = 'governance_checkpoint',
}

/** Tipo de ação autônoma */
export enum AutonomousActionType {
  /** Disparar publicação */
  TRIGGER_PUBLISH = 'trigger_publish',
  /** Disparar entrega */
  TRIGGER_DELIVERY = 'trigger_delivery',
  /** Marcar item como executado */
  MARK_EXECUTED = 'mark_executed',
  /** Adiar item no schedule */
  DEFER_ITEM = 'defer_item',
  /** Registrar bloqueio */
  REGISTER_BLOCK = 'register_block',
  /** Solicitar intervenção manual */
  REQUEST_INTERVENTION = 'request_intervention',
  /** Pular item */
  SKIP_ITEM = 'skip_item',
}

/** Resultado de uma ação autônoma */
export enum ActionResult {
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  DEFERRED = 'deferred',
}

// ---------------------------------------------------------------------------
// Execution Block Reason
// ---------------------------------------------------------------------------

/**
 * Motivo de bloqueio de execução de um item.
 */
export interface ExecutionBlockReason {
  /** Tipo do bloqueio */
  type: BlockReasonType;
  /** Descrição legível */
  description: string;
  /** Ação sugerida para resolver */
  suggestedAction: string;
  /** Bloqueio é resolvível automaticamente? */
  autoResolvable: boolean;
}

// ---------------------------------------------------------------------------
// Execution Readiness Check
// ---------------------------------------------------------------------------

/**
 * Resultado da avaliação de prontidão de um item.
 */
export interface ExecutionReadinessCheck {
  /** ID do schedule item avaliado */
  scheduleItemId: string;
  /** ID do campaign item */
  campaignItemId: string;
  /** Título do item */
  title: string;
  /** Checks individuais */
  checks: {
    scheduleReached: boolean;
    dependenciesSatisfied: boolean;
    approvalOk: boolean;
    artifactReady: boolean;
    billingOk: boolean;
    featureFlagsOk: boolean;
    autoPublishAvailable: boolean;
    noBlockingFailure: boolean;
    campaignActive: boolean;
    governanceOk: boolean;
  };
  /** Todos os checks passaram? */
  ready: boolean;
  /** Motivos de bloqueio (se houver) */
  blockReasons: ExecutionBlockReason[];
  /** ID do checkpoint de governança (se criado) */
  governanceCheckpointId?: string;
}

// ---------------------------------------------------------------------------
// Execution Decision
// ---------------------------------------------------------------------------

/**
 * Decisão tomada pelo executor sobre um item.
 */
export interface ExecutionDecision {
  /** ID do schedule item */
  scheduleItemId: string;
  /** ID do campaign item */
  campaignItemId: string;
  /** Decisão */
  decision: ExecutionDecisionType;
  /** Justificativa */
  reason: string;
  /** Readiness check completo */
  readiness: ExecutionReadinessCheck;
  /** Ação a ser tomada */
  action: AutonomousActionType;
}

// ---------------------------------------------------------------------------
// Autonomous Action
// ---------------------------------------------------------------------------

/**
 * Ação efetivamente tomada pelo sistema.
 */
export interface AutonomousAction {
  /** ID do schedule item */
  scheduleItemId: string;
  /** Tipo da ação */
  actionType: AutonomousActionType;
  /** Resultado */
  result: ActionResult;
  /** Detalhes do resultado */
  details: string;
  /** Timestamp */
  executedAt: string;
}

// ---------------------------------------------------------------------------
// Campaign Execution Log
// ---------------------------------------------------------------------------

/**
 * Entrada de log de execução — auditoria completa.
 */
export interface CampaignExecutionLog {
  /** ID */
  id: string;
  /** ID da execução */
  executionId: string;
  /** ID do schedule item */
  scheduleItemId: string;
  /** Decisão tomada */
  decision: ExecutionDecisionType;
  /** Ação executada */
  action: AutonomousActionType;
  /** Resultado */
  result: ActionResult;
  /** Bloqueios ativos (se houver) */
  blockReasons: ExecutionBlockReason[];
  /** Detalhes */
  details: string;
  /** Timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Campaign Execution Item
// ---------------------------------------------------------------------------

/**
 * Item dentro de uma sessão de execução — um schedule item avaliado.
 */
export interface CampaignExecutionItem {
  /** ID do schedule item */
  scheduleItemId: string;
  /** ID do campaign item */
  campaignItemId: string;
  /** Título */
  title: string;
  /** Readiness check */
  readiness: ExecutionReadinessCheck;
  /** Decisão */
  decision: ExecutionDecision;
  /** Ação tomada */
  action: AutonomousAction | null;
}

// ---------------------------------------------------------------------------
// Campaign Execution
// ---------------------------------------------------------------------------

/**
 * Sessão de execução autônoma — um ciclo de avaliação completo.
 */
export interface CampaignExecution {
  /** ID */
  id: string;
  /** ID da campanha */
  campaignId: string;
  /** ID do schedule */
  scheduleId: string;
  /** ID do tenant */
  tenantId: string;
  /** Status da execução */
  status: ExecutionStatus;
  /** Itens avaliados */
  items: CampaignExecutionItem[];
  /** Contadores */
  counts: {
    total: number;
    executed: number;
    deferred: number;
    blocked: number;
    skipped: number;
    interventionRequired: number;
  };
  /** Logs de execução */
  logs: CampaignExecutionLog[];
  /** Início do ciclo */
  startedAt: string;
  /** Fim do ciclo */
  completedAt: string | null;
  /** Próxima avaliação sugerida */
  nextEvaluationAt: string | null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  [ExecutionStatus.EVALUATING]: 'Avaliando',
  [ExecutionStatus.COMPLETED]: 'Concluída',
  [ExecutionStatus.COMPLETED_WITH_BLOCKS]: 'Concluída com bloqueios',
  [ExecutionStatus.FAILED]: 'Falhou',
};

export const DECISION_LABELS: Record<ExecutionDecisionType, string> = {
  [ExecutionDecisionType.EXECUTE]: 'Executar',
  [ExecutionDecisionType.DEFER]: 'Adiar',
  [ExecutionDecisionType.BLOCK]: 'Bloquear',
  [ExecutionDecisionType.SKIP]: 'Pular',
  [ExecutionDecisionType.REQUIRE_INTERVENTION]: 'Intervenção necessária',
};

export const BLOCK_REASON_LABELS: Record<BlockReasonType, string> = {
  [BlockReasonType.SCHEDULE_NOT_REACHED]: 'Schedule não alcançado',
  [BlockReasonType.DEPENDENCY_PENDING]: 'Dependência pendente',
  [BlockReasonType.APPROVAL_PENDING]: 'Aprovação pendente',
  [BlockReasonType.APPROVAL_REJECTED]: 'Aprovação rejeitada',
  [BlockReasonType.ARTIFACT_NOT_READY]: 'Artifact não pronto',
  [BlockReasonType.BILLING_LIMIT_REACHED]: 'Limite de billing',
  [BlockReasonType.FEATURE_DISABLED]: 'Feature desabilitada',
  [BlockReasonType.AUTO_PUBLISH_UNAVAILABLE]: 'Auto publish indisponível',
  [BlockReasonType.PREVIOUS_FAILURE]: 'Falha anterior',
  [BlockReasonType.CHANNEL_UNAVAILABLE]: 'Canal indisponível',
  [BlockReasonType.CAMPAIGN_INACTIVE]: 'Campanha inativa',
  [BlockReasonType.GOVERNANCE_CHECKPOINT]: 'Checkpoint de governança',
};

export const ACTION_TYPE_LABELS: Record<AutonomousActionType, string> = {
  [AutonomousActionType.TRIGGER_PUBLISH]: 'Disparar publicação',
  [AutonomousActionType.TRIGGER_DELIVERY]: 'Disparar entrega',
  [AutonomousActionType.MARK_EXECUTED]: 'Marcar executado',
  [AutonomousActionType.DEFER_ITEM]: 'Adiar item',
  [AutonomousActionType.REGISTER_BLOCK]: 'Registrar bloqueio',
  [AutonomousActionType.REQUEST_INTERVENTION]: 'Solicitar intervenção',
  [AutonomousActionType.SKIP_ITEM]: 'Pular item',
};
