/**
 * Entity: Self-Healing Operations & Recovery
 *
 * Conceitos:
 *
 *   FAILURE CLASS:
 *     Categoria de falha no sistema. Define a natureza do problema
 *     e qual política de recovery se aplica.
 *
 *   RECOVERY POLICY:
 *     Conjunto de regras para tratar uma classe de falha.
 *     Define max retries, backoff, escalation threshold e ações.
 *
 *   RECOVERY ACTION:
 *     Ação concreta de recuperação: retry, requeue, remarcar,
 *     regenerar, freeze + escalar.
 *
 *   STUCK STATE SIGNAL:
 *     Detecção de entidade presa em estado intermediário por
 *     tempo excessivo (job queued, render processing, etc.).
 *
 *   RECONCILIATION TASK:
 *     Tarefa de verificação e correção de inconsistências.
 *     Ex: job completed sem artifact, pub success sem ref externa.
 *
 *   RECOVERY ATTEMPT:
 *     Registro de uma tentativa de recuperação com resultado.
 *
 *   RECOVERY DECISION:
 *     Decisão tomada pelo engine: recuperar automaticamente,
 *     escalar para humano, ou marcar como irrecuperável.
 *
 *   RECOVERY AUDIT ENTRY:
 *     Log completo de auditoria de cada ação de recovery.
 *
 * Princípios:
 *   - Seguro: nunca piora o estado
 *   - Idempotente: re-executar não duplica efeitos
 *   - Auditável: cada ação tem log
 *   - Escalável: sabe quando parar e pedir humano
 *
 * Persistência: bookagent_recovery_log
 *
 * Parte 91: Self-Healing Operations & Recovery
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Classe de falha */
export enum FailureClass {
  /** Provider AI/TTS indisponível */
  PROVIDER_FAILURE = 'provider_failure',
  /** Render de vídeo falhou */
  RENDER_FAILURE = 'render_failure',
  /** Publicação em rede social falhou */
  PUBLICATION_FAILURE = 'publication_failure',
  /** Webhook não entregue */
  WEBHOOK_FAILURE = 'webhook_failure',
  /** Sincronização de billing falhou */
  BILLING_SYNC_FAILURE = 'billing_sync_failure',
  /** Inconsistência de persistência */
  PERSISTENCE_INCONSISTENCY = 'persistence_inconsistency',
  /** Artifact/state órfão */
  ORPHAN_STATE = 'orphan_state',
  /** Job ou item preso em estado intermediário */
  STUCK_STATE = 'stuck_state',
  /** Falha de integração externa */
  INTEGRATION_FAILURE = 'integration_failure',
}

/** Tipo de ação de recovery */
export enum RecoveryActionType {
  /** Retry simples com backoff */
  RETRY = 'retry',
  /** Retry com provider alternativo */
  RETRY_ALT_PROVIDER = 'retry_alt_provider',
  /** Requeue parcial do job */
  REQUEUE = 'requeue',
  /** Reenviar webhook */
  RESEND_WEBHOOK = 'resend_webhook',
  /** Remarcar publicação */
  RESCHEDULE_PUBLICATION = 'reschedule_publication',
  /** Regenerar artifact intermediário */
  REGENERATE_ARTIFACT = 'regenerate_artifact',
  /** Reconciliar estado inconsistente */
  RECONCILE_STATE = 'reconcile_state',
  /** Limpar estado órfão */
  CLEANUP_ORPHAN = 'cleanup_orphan',
  /** Freeze + escalar para humano */
  FREEZE_AND_ESCALATE = 'freeze_and_escalate',
  /** Marcar como irrecuperável */
  MARK_IRRECOVERABLE = 'mark_irrecoverable',
}

/** Resultado de uma tentativa de recovery */
export enum RecoveryResult {
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial',
  ESCALATED = 'escalated',
  SKIPPED = 'skipped',
}

/** Status de uma reconciliation task */
export enum ReconcileStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  COMPLETED_WITH_ISSUES = 'completed_with_issues',
  FAILED = 'failed',
}

/** Severidade de um stuck state */
export enum StuckSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ---------------------------------------------------------------------------
// Recovery Policy
// ---------------------------------------------------------------------------

/**
 * Política de recovery para uma classe de falha.
 */
export interface RecoveryPolicy {
  /** Classe de falha */
  failureClass: FailureClass;
  /** Máximo de tentativas automáticas */
  maxRetries: number;
  /** Backoff base em segundos */
  backoffBaseSec: number;
  /** Multiplicador de backoff (exponential) */
  backoffMultiplier: number;
  /** Ações permitidas (em ordem de preferência) */
  actions: RecoveryActionType[];
  /** Threshold para escalação (tentativas) */
  escalationThreshold: number;
  /** Auto-recovery habilitado? */
  autoRecoveryEnabled: boolean;
  /** Descrição */
  description: string;
}

// ---------------------------------------------------------------------------
// Stuck State Signal
// ---------------------------------------------------------------------------

/**
 * Sinal de entidade presa em estado intermediário.
 */
export interface StuckStateSignal {
  /** ID */
  id: string;
  /** Tipo da entidade (job, render, publication, schedule_item, etc.) */
  entityType: string;
  /** ID da entidade */
  entityId: string;
  /** Estado atual */
  currentState: string;
  /** Estado esperado (ou terminal) */
  expectedState: string;
  /** Tempo stuck (minutos) */
  stuckMinutes: number;
  /** Severidade */
  severity: StuckSeverity;
  /** Tenant ID */
  tenantId: string;
  /** Detectado em */
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Recovery Decision
// ---------------------------------------------------------------------------

/**
 * Decisão do recovery engine.
 */
export interface RecoveryDecision {
  /** Classe de falha */
  failureClass: FailureClass;
  /** Ação escolhida */
  action: RecoveryActionType;
  /** Tentativa número */
  attemptNumber: number;
  /** Pode recuperar automaticamente? */
  canAutoRecover: boolean;
  /** Deve escalar? */
  shouldEscalate: boolean;
  /** Justificativa */
  reason: string;
  /** Backoff delay (segundos, 0 se imediato) */
  backoffDelaySec: number;
}

// ---------------------------------------------------------------------------
// Recovery Attempt
// ---------------------------------------------------------------------------

/**
 * Registro de uma tentativa de recovery.
 */
export interface RecoveryAttempt {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Classe de falha */
  failureClass: FailureClass;
  /** Tipo da entidade alvo */
  entityType: string;
  /** ID da entidade alvo */
  entityId: string;
  /** Ação executada */
  action: RecoveryActionType;
  /** Tentativa número */
  attemptNumber: number;
  /** Resultado */
  result: RecoveryResult;
  /** Detalhes */
  details: string;
  /** Erro (se falhou) */
  error: string | null;
  /** Timestamp */
  attemptedAt: string;
  /** Duração (ms) */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Reconciliation Task
// ---------------------------------------------------------------------------

/**
 * Tarefa de reconciliação — verifica e corrige inconsistências.
 */
export interface ReconciliationTask {
  /** ID */
  id: string;
  /** Tipo (jobs, publications, billing, artifacts, schedules) */
  scope: 'jobs' | 'publications' | 'billing' | 'artifacts' | 'schedules';
  /** Status */
  status: ReconcileStatus;
  /** Tenant (null = global scan) */
  tenantId: string | null;
  /** Inconsistências encontradas */
  issuesFound: number;
  /** Inconsistências corrigidas */
  issuesFixed: number;
  /** Detalhes dos issues */
  issues: Array<{
    entityType: string;
    entityId: string;
    issue: string;
    fixed: boolean;
    action: string;
  }>;
  /** Iniciado em */
  startedAt: string;
  /** Concluído em */
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Recovery Audit Entry
// ---------------------------------------------------------------------------

/**
 * Entrada de auditoria de recovery.
 */
export interface RecoveryAuditEntry {
  /** ID */
  id: string;
  /** Tenant */
  tenantId: string;
  /** Classe de falha */
  failureClass: FailureClass;
  /** Entidade alvo */
  entityType: string;
  entityId: string;
  /** Ação */
  action: RecoveryActionType;
  /** Resultado */
  result: RecoveryResult;
  /** Escalado? */
  escalated: boolean;
  /** Detalhes */
  details: string;
  /** Timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Default Recovery Policies
// ---------------------------------------------------------------------------

export const DEFAULT_RECOVERY_POLICIES: RecoveryPolicy[] = [
  {
    failureClass: FailureClass.PROVIDER_FAILURE,
    maxRetries: 3,
    backoffBaseSec: 30,
    backoffMultiplier: 2,
    actions: [RecoveryActionType.RETRY, RecoveryActionType.RETRY_ALT_PROVIDER, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 3,
    autoRecoveryEnabled: true,
    description: 'Provider AI/TTS indisponível — retry com backoff, fallback para provider alternativo',
  },
  {
    failureClass: FailureClass.RENDER_FAILURE,
    maxRetries: 2,
    backoffBaseSec: 60,
    backoffMultiplier: 2,
    actions: [RecoveryActionType.RETRY, RecoveryActionType.REGENERATE_ARTIFACT, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 2,
    autoRecoveryEnabled: true,
    description: 'Render de vídeo falhou — retry, regenerar artifact se necessário',
  },
  {
    failureClass: FailureClass.PUBLICATION_FAILURE,
    maxRetries: 3,
    backoffBaseSec: 120,
    backoffMultiplier: 3,
    actions: [RecoveryActionType.RETRY, RecoveryActionType.RESCHEDULE_PUBLICATION, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 3,
    autoRecoveryEnabled: true,
    description: 'Publicação falhou — retry com backoff, remarcar se persistir',
  },
  {
    failureClass: FailureClass.WEBHOOK_FAILURE,
    maxRetries: 5,
    backoffBaseSec: 60,
    backoffMultiplier: 2,
    actions: [RecoveryActionType.RESEND_WEBHOOK, RecoveryActionType.MARK_IRRECOVERABLE],
    escalationThreshold: 5,
    autoRecoveryEnabled: true,
    description: 'Webhook não entregue — retry com backoff exponencial',
  },
  {
    failureClass: FailureClass.BILLING_SYNC_FAILURE,
    maxRetries: 3,
    backoffBaseSec: 300,
    backoffMultiplier: 2,
    actions: [RecoveryActionType.RECONCILE_STATE, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 2,
    autoRecoveryEnabled: true,
    description: 'Billing sync falhou — reconciliar estado, escalar se persistir',
  },
  {
    failureClass: FailureClass.PERSISTENCE_INCONSISTENCY,
    maxRetries: 1,
    backoffBaseSec: 0,
    backoffMultiplier: 1,
    actions: [RecoveryActionType.RECONCILE_STATE, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 1,
    autoRecoveryEnabled: true,
    description: 'Inconsistência de persistência — reconciliar, escalar imediatamente se falhar',
  },
  {
    failureClass: FailureClass.ORPHAN_STATE,
    maxRetries: 1,
    backoffBaseSec: 0,
    backoffMultiplier: 1,
    actions: [RecoveryActionType.CLEANUP_ORPHAN, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 1,
    autoRecoveryEnabled: true,
    description: 'Estado órfão — cleanup seguro, escalar se arriscado',
  },
  {
    failureClass: FailureClass.STUCK_STATE,
    maxRetries: 2,
    backoffBaseSec: 0,
    backoffMultiplier: 1,
    actions: [RecoveryActionType.REQUEUE, RecoveryActionType.RECONCILE_STATE, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 2,
    autoRecoveryEnabled: true,
    description: 'Entidade stuck — requeue ou reconciliar, escalar se persistir',
  },
  {
    failureClass: FailureClass.INTEGRATION_FAILURE,
    maxRetries: 3,
    backoffBaseSec: 120,
    backoffMultiplier: 2,
    actions: [RecoveryActionType.RETRY, RecoveryActionType.FREEZE_AND_ESCALATE],
    escalationThreshold: 3,
    autoRecoveryEnabled: true,
    description: 'Integração externa falhou — retry com backoff',
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutos sem progresso para considerar stuck */
export const STUCK_THRESHOLD_MINUTES: Record<string, number> = {
  job_queued: 30,
  job_processing: 60,
  render_processing: 45,
  publication_pending: 120,
  schedule_item_ready: 240,
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const FAILURE_CLASS_LABELS: Record<FailureClass, string> = {
  [FailureClass.PROVIDER_FAILURE]: 'Falha de provider',
  [FailureClass.RENDER_FAILURE]: 'Falha de render',
  [FailureClass.PUBLICATION_FAILURE]: 'Falha de publicação',
  [FailureClass.WEBHOOK_FAILURE]: 'Falha de webhook',
  [FailureClass.BILLING_SYNC_FAILURE]: 'Falha de billing',
  [FailureClass.PERSISTENCE_INCONSISTENCY]: 'Inconsistência',
  [FailureClass.ORPHAN_STATE]: 'Estado órfão',
  [FailureClass.STUCK_STATE]: 'Estado stuck',
  [FailureClass.INTEGRATION_FAILURE]: 'Falha de integração',
};

export const RECOVERY_ACTION_LABELS: Record<RecoveryActionType, string> = {
  [RecoveryActionType.RETRY]: 'Retry',
  [RecoveryActionType.RETRY_ALT_PROVIDER]: 'Retry (provider alt.)',
  [RecoveryActionType.REQUEUE]: 'Requeue',
  [RecoveryActionType.RESEND_WEBHOOK]: 'Reenviar webhook',
  [RecoveryActionType.RESCHEDULE_PUBLICATION]: 'Remarcar publicação',
  [RecoveryActionType.REGENERATE_ARTIFACT]: 'Regenerar artifact',
  [RecoveryActionType.RECONCILE_STATE]: 'Reconciliar estado',
  [RecoveryActionType.CLEANUP_ORPHAN]: 'Limpar órfão',
  [RecoveryActionType.FREEZE_AND_ESCALATE]: 'Freeze + escalar',
  [RecoveryActionType.MARK_IRRECOVERABLE]: 'Irrecuperável',
};

export const RECOVERY_RESULT_LABELS: Record<RecoveryResult, string> = {
  [RecoveryResult.SUCCESS]: 'Sucesso',
  [RecoveryResult.FAILED]: 'Falhou',
  [RecoveryResult.PARTIAL]: 'Parcial',
  [RecoveryResult.ESCALATED]: 'Escalado',
  [RecoveryResult.SKIPPED]: 'Pulado',
};
