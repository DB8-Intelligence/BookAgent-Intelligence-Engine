/**
 * Governance Evaluator — Human-in-the-Loop Governance
 *
 * Avalia se uma ação pode prosseguir automaticamente ou se
 * requer checkpoint humano, dado o nível de autonomia do
 * tenant e as regras de governança ativas.
 *
 * Ponto de integração principal: o campaign executor (Parte 87)
 * chama evaluateGate() antes de cada ação autônoma.
 *
 * Parte 88: Human-in-the-Loop Governance
 */

import { v4 as uuid } from 'uuid';

import type {
  GovernancePolicy,
  GovernanceRule,
  GovernanceEvaluation,
  HumanCheckpoint,
} from '../../domain/entities/governance.js';
import {
  AutonomyLevel,
  GovernanceGateType,
  GovernanceDecisionResult,
  DEFAULT_AUTONOMY_BY_PLAN,
  DEFAULT_QUALITY_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_LARGE_CAMPAIGN_THRESHOLD,
  CHECKPOINT_EXPIRY_HOURS,
} from '../../domain/entities/governance.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import type { PlanTier } from '../../plans/plan-config.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Autonomy Level Ordering (for bypass comparison)
// ---------------------------------------------------------------------------

const AUTONOMY_ORDER: Record<AutonomyLevel, number> = {
  [AutonomyLevel.MANUAL]: 0,
  [AutonomyLevel.ASSISTED]: 1,
  [AutonomyLevel.SEMI_AUTONOMOUS]: 2,
  [AutonomyLevel.SUPERVISED_AUTONOMOUS]: 3,
  [AutonomyLevel.AUTONOMOUS]: 4,
};

function levelAtOrAbove(current: AutonomyLevel, required: AutonomyLevel): boolean {
  return AUTONOMY_ORDER[current] >= AUTONOMY_ORDER[required];
}

// ---------------------------------------------------------------------------
// Default Rules
// ---------------------------------------------------------------------------

export const DEFAULT_GOVERNANCE_RULES: GovernanceRule[] = [
  {
    id: 'gov-rule-pre-publish',
    name: 'Revisão pré-publicação',
    description: 'Exige checkpoint humano antes de publicação automática',
    gate: GovernanceGateType.PRE_PUBLISH,
    bypassAtLevel: AutonomyLevel.SUPERVISED_AUTONOMOUS,
    conditionKey: 'auto_publish',
    enabled: true,
  },
  {
    id: 'gov-rule-pre-execute',
    name: 'Revisão pré-execução de campanha',
    description: 'Exige checkpoint antes de executar campaign items',
    gate: GovernanceGateType.PRE_EXECUTE,
    bypassAtLevel: AutonomyLevel.SEMI_AUTONOMOUS,
    conditionKey: 'campaign_execution',
    enabled: true,
  },
  {
    id: 'gov-rule-low-quality',
    name: 'Quality score baixo',
    description: 'Bloqueia publicação quando quality score está abaixo do threshold',
    gate: GovernanceGateType.LOW_QUALITY,
    bypassAtLevel: AutonomyLevel.AUTONOMOUS,
    conditionKey: 'quality_below_threshold',
    enabled: true,
  },
  {
    id: 'gov-rule-retry-failure',
    name: 'Retentativa após falha',
    description: 'Exige checkpoint antes de retentar publicação falhada',
    gate: GovernanceGateType.RETRY_AFTER_FAILURE,
    bypassAtLevel: AutonomyLevel.SUPERVISED_AUTONOMOUS,
    conditionKey: 'retry_after_failure',
    enabled: true,
  },
  {
    id: 'gov-rule-strategy-change',
    name: 'Mudança de estratégia',
    description: 'Exige confirmação quando estratégia muda significativamente',
    gate: GovernanceGateType.STRATEGY_CHANGE,
    bypassAtLevel: AutonomyLevel.AUTONOMOUS,
    conditionKey: 'strategy_change',
    enabled: true,
  },
  {
    id: 'gov-rule-billing',
    name: 'Incerteza de billing',
    description: 'Exige checkpoint quando billing/limite está incerto ou próximo',
    gate: GovernanceGateType.BILLING_UNCERTAINTY,
    bypassAtLevel: AutonomyLevel.AUTONOMOUS,
    conditionKey: 'billing_near_limit',
    enabled: true,
  },
  {
    id: 'gov-rule-large-campaign',
    name: 'Campanha grande',
    description: 'Exige aprovação quando campanha excede threshold de itens',
    gate: GovernanceGateType.LARGE_CAMPAIGN,
    bypassAtLevel: AutonomyLevel.SUPERVISED_AUTONOMOUS,
    conditionKey: 'large_campaign',
    enabled: true,
  },
  {
    id: 'gov-rule-new-channel',
    name: 'Canal novo',
    description: 'Exige checkpoint na primeira publicação em canal ainda não usado',
    gate: GovernanceGateType.NEW_CHANNEL,
    bypassAtLevel: AutonomyLevel.SEMI_AUTONOMOUS,
    conditionKey: 'new_channel',
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// Build Policy
// ---------------------------------------------------------------------------

/**
 * Builds a GovernancePolicy for a tenant based on plan + overrides.
 */
export function buildPolicy(
  tenantCtx: TenantContext,
  autonomyOverride?: AutonomyLevel,
): GovernancePolicy {
  const level = autonomyOverride ?? DEFAULT_AUTONOMY_BY_PLAN[tenantCtx.planTier] ?? AutonomyLevel.ASSISTED;

  // Filter rules that require checkpoint at this autonomy level
  const activeRules = DEFAULT_GOVERNANCE_RULES.filter((r) => r.enabled);
  const requiredGates = activeRules
    .filter((r) => !levelAtOrAbove(level, r.bypassAtLevel))
    .map((r) => r.gate);

  // Deduplicate gates
  const uniqueGates = [...new Set(requiredGates)];

  return {
    tenantId: tenantCtx.tenantId,
    autonomyLevel: level,
    activeRules,
    requiredGates: uniqueGates,
    qualityThreshold: DEFAULT_QUALITY_THRESHOLD,
    maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
    largeCampaignThreshold: DEFAULT_LARGE_CAMPAIGN_THRESHOLD,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Evaluate Gate
// ---------------------------------------------------------------------------

/**
 * Gate evaluation context — data passed by the caller.
 */
export interface GateContext {
  /** Gate being evaluated */
  gate: GovernanceGateType;
  /** Target entity type */
  targetType: string;
  /** Target entity ID */
  targetId: string;
  /** Quality score (if applicable) */
  qualityScore?: number;
  /** Number of consecutive failures (if applicable) */
  consecutiveFailures?: number;
  /** Campaign item count (if applicable) */
  campaignItemCount?: number;
  /** Billing usage percent (if applicable) */
  billingUsagePercent?: number;
  /** Is this a new channel? */
  isNewChannel?: boolean;
  /** Additional context */
  extra?: Record<string, unknown>;
}

/**
 * Evaluates whether a specific gate requires human checkpoint.
 * Returns a GovernanceEvaluation that the executor can act on.
 */
export function evaluateGate(
  policy: GovernancePolicy,
  ctx: GateContext,
): GovernanceEvaluation {
  // 1. Check if this gate requires checkpoint at current autonomy level
  const gateRequired = policy.requiredGates.includes(ctx.gate);

  // 2. Check if any active rule is triggered by the context
  const triggeredRules: GovernanceRule[] = [];
  for (const rule of policy.activeRules) {
    if (rule.gate !== ctx.gate) continue;
    if (levelAtOrAbove(policy.autonomyLevel, rule.bypassAtLevel)) continue;

    // Evaluate condition
    if (evaluateCondition(rule.conditionKey, ctx, policy)) {
      triggeredRules.push(rule);
    }
  }

  const triggeredGates = triggeredRules.map((r) => r.gate);
  const uniqueTriggeredGates = [...new Set(triggeredGates)];

  // 3. Determine if checkpoint is needed
  const requiresCheckpoint = triggeredRules.length > 0;

  // 4. Check if escalation is needed
  const requiresEscalation = checkEscalationNeeded(ctx, policy);

  // 5. Build evaluation
  const canProceed = !requiresCheckpoint && !requiresEscalation;

  const reason = canProceed
    ? `Autonomia ${policy.autonomyLevel} permite bypass do gate ${ctx.gate}`
    : `Gate ${ctx.gate} requer checkpoint: ${triggeredRules.map((r) => r.name).join(', ')}`;

  logger.debug(
    `[GovernanceEvaluator] Gate=${ctx.gate} tenant=${policy.tenantId}: ` +
    `canProceed=${canProceed} rules=${triggeredRules.length} escalation=${requiresEscalation}`,
  );

  return {
    canProceed,
    triggeredGates: uniqueTriggeredGates,
    triggeredRules,
    requiresCheckpoint,
    checkpointId: null, // filled by governance-engine when checkpoint is created
    requiresEscalation,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Condition Evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(
  conditionKey: string,
  ctx: GateContext,
  policy: GovernancePolicy,
): boolean {
  switch (conditionKey) {
    case 'auto_publish':
      // Always triggers at pre_publish gate (actual bypass is via autonomy level)
      return ctx.gate === GovernanceGateType.PRE_PUBLISH;

    case 'campaign_execution':
      return ctx.gate === GovernanceGateType.PRE_EXECUTE;

    case 'quality_below_threshold':
      return ctx.qualityScore !== undefined && ctx.qualityScore < policy.qualityThreshold;

    case 'retry_after_failure':
      return (ctx.consecutiveFailures ?? 0) > 0;

    case 'strategy_change':
      return ctx.gate === GovernanceGateType.STRATEGY_CHANGE;

    case 'billing_near_limit':
      return ctx.billingUsagePercent !== undefined && ctx.billingUsagePercent > 80;

    case 'large_campaign':
      return (ctx.campaignItemCount ?? 0) > policy.largeCampaignThreshold;

    case 'new_channel':
      return ctx.isNewChannel === true;

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Escalation Check
// ---------------------------------------------------------------------------

function checkEscalationNeeded(
  ctx: GateContext,
  policy: GovernancePolicy,
): boolean {
  // Escalate if too many consecutive failures
  if ((ctx.consecutiveFailures ?? 0) >= policy.maxConsecutiveFailures) {
    return true;
  }

  // Escalate if billing very high (>95%)
  if (ctx.billingUsagePercent !== undefined && ctx.billingUsagePercent > 95) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Create Checkpoint
// ---------------------------------------------------------------------------

/**
 * Creates a HumanCheckpoint from an evaluation that requires one.
 */
export function createCheckpoint(
  tenantId: string,
  evaluation: GovernanceEvaluation,
  ctx: GateContext,
): HumanCheckpoint {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHECKPOINT_EXPIRY_HOURS * 3600000);

  return {
    id: uuid(),
    tenantId,
    gate: ctx.gate,
    ruleId: evaluation.triggeredRules[0]?.id ?? 'unknown',
    targetType: ctx.targetType,
    targetId: ctx.targetId,
    context: {
      gate: ctx.gate,
      qualityScore: ctx.qualityScore,
      consecutiveFailures: ctx.consecutiveFailures,
      campaignItemCount: ctx.campaignItemCount,
      billingUsagePercent: ctx.billingUsagePercent,
      triggeredRules: evaluation.triggeredRules.map((r) => r.name),
      ...ctx.extra,
    },
    decision: null,
    status: GovernanceDecisionResult.PENDING,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
