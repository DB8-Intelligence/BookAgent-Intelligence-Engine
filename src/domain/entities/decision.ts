/**
 * Decision Intelligence Layer — Domain Entities
 *
 * Formaliza decisões explícitas, explicáveis e auditáveis que
 * consolidam sinais de múltiplos módulos do BookAgent.
 *
 * Conceitos:
 *   - DecisionRecord     — decisão formal com outcome, rationale e confidence
 *   - DecisionContext     — snapshot dos inputs que alimentaram a decisão
 *   - DecisionCandidate   — opção avaliada pela engine (selecionada ou rejeitada)
 *   - DecisionRationale   — explicação do raciocínio que levou à decisão
 *   - DecisionConstraint  — restrição que limitou as opções
 *   - DecisionConflict    — conflito entre sinais de diferentes módulos
 *   - DecisionOutcome     — resultado da decisão aplicada
 *
 * Persistência:
 *   - bookagent_decisions
 *
 * Parte 94: Decision Intelligence Layer
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Categoria da decisão. */
export enum DecisionCategory {
  /** Decisão de longo prazo (escolha de goal, strategy) */
  STRATEGIC     = 'strategic',
  /** Decisão de campanha / planejamento */
  TACTICAL      = 'tactical',
  /** Decisão de execução imediata (publicar, esperar, etc.) */
  OPERATIONAL   = 'operational',
  /** Decisão sobre checkpoint, override, escalation */
  GOVERNANCE    = 'governance',
  /** Decisão de otimização (custo vs qualidade, cadência, etc.) */
  OPTIMIZATION  = 'optimization',
  /** Decisão de escalar para humano */
  ESCALATION    = 'escalation',
}

/** Tipo específico da decisão dentro da categoria. */
export enum DecisionType {
  PRIORITIZE_CAMPAIGN     = 'prioritize_campaign',
  SELECT_CHANNEL          = 'select_channel',
  PUBLISH_NOW_OR_WAIT     = 'publish_now_or_wait',
  AUTO_EXECUTE_OR_CHECKPOINT = 'auto_execute_or_checkpoint',
  COST_VS_QUALITY         = 'cost_vs_quality',
  REPLAN_OR_PERSIST       = 'replan_or_persist',
  SELECT_TEMPLATE         = 'select_template',
  ADJUST_CADENCE          = 'adjust_cadence',
  ESCALATE_TO_HUMAN       = 'escalate_to_human',
  APPROVE_OR_REJECT       = 'approve_or_reject',
  SKIP_OR_DEFER           = 'skip_or_defer',
}

/** Status da decisão no ciclo de vida. */
export enum DecisionStatus {
  PENDING       = 'pending',
  DECIDED       = 'decided',
  APPLIED       = 'applied',
  OVERRIDDEN    = 'overridden',
  EXPIRED       = 'expired',
}

/** Nível de confiança da decisão. */
export enum DecisionConfidence {
  HIGH     = 'high',
  MEDIUM   = 'medium',
  LOW      = 'low',
  UNKNOWN  = 'unknown',
}

/** Fonte de input para a decisão. */
export enum DecisionInputSource {
  ANALYTICS        = 'analytics',
  INSIGHTS         = 'insights',
  LEARNING_RULES   = 'learning_rules',
  TENANT_MEMORY    = 'tenant_memory',
  KNOWLEDGE_GRAPH  = 'knowledge_graph',
  SIMULATION       = 'simulation',
  GOAL_OPTIMIZATION = 'goal_optimization',
  GOVERNANCE_POLICY = 'governance_policy',
  BILLING_LIMITS   = 'billing_limits',
  CAMPAIGN_STATE   = 'campaign_state',
  SCHEDULE_STATE   = 'schedule_state',
  EXECUTION_STATE  = 'execution_state',
}

/** Severidade do conflito entre sinais. */
export enum ConflictSeverity {
  LOW      = 'low',
  MEDIUM   = 'medium',
  HIGH     = 'high',
  BLOCKING = 'blocking',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Constraint que limitou opções de decisão. */
export interface DecisionConstraint {
  source: DecisionInputSource;
  description: string;
  /** O que ela impediu */
  blocked: string;
  /** Se o constraint é hard (inviolável) ou soft (preferência) */
  hard: boolean;
}

/** Conflito entre sinais de módulos diferentes. */
export interface DecisionConflict {
  sourceA: DecisionInputSource;
  sourceB: DecisionInputSource;
  description: string;
  severity: ConflictSeverity;
  /** Como o conflito foi resolvido */
  resolution: string;
}

/** Input consumido por uma decisão (snapshot de sinal). */
export interface DecisionInput {
  source: DecisionInputSource;
  signal: string;
  value: string | number | boolean;
  weight: number;
}

/** Contexto completo da decisão — o que a engine viu ao decidir. */
export interface DecisionContext {
  tenantId: string | null;
  inputs: DecisionInput[];
  constraints: DecisionConstraint[];
  conflicts: DecisionConflict[];
  /** Timestamp do snapshot */
  capturedAt: string;
}

/** Candidato avaliado pela engine. */
export interface DecisionCandidate {
  id: string;
  label: string;
  /** Score calculado (0–100) */
  score: number;
  /** Se foi o candidato selecionado */
  selected: boolean;
  /** Razão da seleção ou rejeição */
  reason: string;
  /** Pros deste candidato */
  pros: string[];
  /** Cons deste candidato */
  cons: string[];
}

/** Rationale — explicação do raciocínio. */
export interface DecisionRationale {
  summary: string;
  factors: string[];
  /** Quais inputs tiveram maior peso */
  dominantInputs: DecisionInputSource[];
  /** Trade-offs aceitos */
  tradeoffs: string[];
}

/** Outcome — resultado após aplicação da decisão. */
export interface DecisionOutcome {
  /** O que foi feito */
  action: string;
  /** Se a decisão foi aplicada ou overridden */
  applied: boolean;
  /** Se foi overridden, por quem */
  overriddenBy: string | null;
  /** Reason do override */
  overrideReason: string | null;
  appliedAt: string | null;
}

/** Registro formal de uma decisão. */
export interface DecisionRecord {
  id: string;
  tenantId: string | null;
  category: DecisionCategory;
  type: DecisionType;
  status: DecisionStatus;
  /** Pergunta que a decisão responde */
  question: string;
  /** Resposta / decisão tomada */
  answer: string;
  confidence: DecisionConfidence;
  context: DecisionContext;
  candidates: DecisionCandidate[];
  rationale: DecisionRationale;
  outcome: DecisionOutcome | null;
  /** Pode ser overridden por humano? */
  overrideable: boolean;
  /** Requer escalonamento humano? */
  requiresEscalation: boolean;
  /** Expiração (decisão temporária) */
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Labels de categoria. */
export const DECISION_CATEGORY_LABELS: Record<DecisionCategory, string> = {
  [DecisionCategory.STRATEGIC]:    'Strategic',
  [DecisionCategory.TACTICAL]:     'Tactical',
  [DecisionCategory.OPERATIONAL]:  'Operational',
  [DecisionCategory.GOVERNANCE]:   'Governance',
  [DecisionCategory.OPTIMIZATION]: 'Optimization',
  [DecisionCategory.ESCALATION]:   'Escalation',
};

/** Labels de tipo. */
export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  [DecisionType.PRIORITIZE_CAMPAIGN]:       'Prioritize Campaign',
  [DecisionType.SELECT_CHANNEL]:            'Select Channel',
  [DecisionType.PUBLISH_NOW_OR_WAIT]:       'Publish Now or Wait',
  [DecisionType.AUTO_EXECUTE_OR_CHECKPOINT]: 'Auto-Execute or Checkpoint',
  [DecisionType.COST_VS_QUALITY]:           'Cost vs Quality',
  [DecisionType.REPLAN_OR_PERSIST]:         'Replan or Persist',
  [DecisionType.SELECT_TEMPLATE]:           'Select Template',
  [DecisionType.ADJUST_CADENCE]:            'Adjust Cadence',
  [DecisionType.ESCALATE_TO_HUMAN]:         'Escalate to Human',
  [DecisionType.APPROVE_OR_REJECT]:         'Approve or Reject',
  [DecisionType.SKIP_OR_DEFER]:             'Skip or Defer',
};

/** Labels de status. */
export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  [DecisionStatus.PENDING]:    'Pending',
  [DecisionStatus.DECIDED]:    'Decided',
  [DecisionStatus.APPLIED]:    'Applied',
  [DecisionStatus.OVERRIDDEN]: 'Overridden',
  [DecisionStatus.EXPIRED]:    'Expired',
};

/** Labels de confidence. */
export const DECISION_CONFIDENCE_LABELS: Record<DecisionConfidence, string> = {
  [DecisionConfidence.HIGH]:    'High',
  [DecisionConfidence.MEDIUM]:  'Medium',
  [DecisionConfidence.LOW]:     'Low',
  [DecisionConfidence.UNKNOWN]: 'Unknown',
};

/** Labels de input source. */
export const INPUT_SOURCE_LABELS: Record<DecisionInputSource, string> = {
  [DecisionInputSource.ANALYTICS]:         'Analytics',
  [DecisionInputSource.INSIGHTS]:          'Insights',
  [DecisionInputSource.LEARNING_RULES]:    'Learning Rules',
  [DecisionInputSource.TENANT_MEMORY]:     'Tenant Memory',
  [DecisionInputSource.KNOWLEDGE_GRAPH]:   'Knowledge Graph',
  [DecisionInputSource.SIMULATION]:        'Simulation',
  [DecisionInputSource.GOAL_OPTIMIZATION]: 'Goal Optimization',
  [DecisionInputSource.GOVERNANCE_POLICY]: 'Governance Policy',
  [DecisionInputSource.BILLING_LIMITS]:    'Billing Limits',
  [DecisionInputSource.CAMPAIGN_STATE]:    'Campaign State',
  [DecisionInputSource.SCHEDULE_STATE]:    'Schedule State',
  [DecisionInputSource.EXECUTION_STATE]:   'Execution State',
};

/** Score mínimo para confiança HIGH. */
export const HIGH_CONFIDENCE_THRESHOLD = 75;

/** Score mínimo para confiança MEDIUM. */
export const MEDIUM_CONFIDENCE_THRESHOLD = 45;

/** Score mínimo para que um candidato seja elegível. */
export const MIN_CANDIDATE_SCORE = 10;

/** Quando há conflito BLOCKING, escalonamento é obrigatório. */
export const BLOCKING_CONFLICT_FORCES_ESCALATION = true;
