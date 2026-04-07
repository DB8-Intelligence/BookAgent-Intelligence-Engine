/**
 * Decision Engine — Decision Intelligence Layer
 *
 * Motor decisório central. Recebe um DecisionContext e um tipo de
 * decisão, avalia candidatos, aplica constraints, resolve conflitos
 * e produz um DecisionRecord explicável e auditável.
 *
 * Fluxo:
 *   1. Coletar contexto (via context-collector)
 *   2. Gerar candidatos para o tipo de decisão
 *   3. Aplicar constraints (eliminar inelegíveis)
 *   4. Pontuar candidatos com base nos inputs
 *   5. Selecionar melhor candidato
 *   6. Construir rationale
 *   7. Determinar se requer escalation
 *   8. Persistir decisão
 *
 * Parte 94: Decision Intelligence Layer
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  DecisionRecord,
  DecisionContext,
  DecisionCandidate,
  DecisionRationale,
  DecisionInput,
} from '../../domain/entities/decision.js';
import {
  DecisionCategory,
  DecisionType,
  DecisionStatus,
  DecisionConfidence,
  DecisionInputSource,
  ConflictSeverity,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  MIN_CANDIDATE_SCORE,
  BLOCKING_CONFLICT_FORCES_ESCALATION,
} from '../../domain/entities/decision.js';
import { collectContext } from './context-collector.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const DECISIONS_TABLE = 'bookagent_decisions';

// ---------------------------------------------------------------------------
// Decision Request
// ---------------------------------------------------------------------------

export interface DecisionRequest {
  type: DecisionType;
  question: string;
  /** Optional: entity ID related to the decision */
  entityId?: string;
  /** Optional: extra params */
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Main Entry: Make Decision
// ---------------------------------------------------------------------------

/**
 * Makes a decision for a tenant based on the full system context.
 */
export async function makeDecision(
  tenantId: string,
  request: DecisionRequest,
  supabase: SupabaseClient | null,
): Promise<DecisionRecord> {
  // 1. Collect context
  const context = await collectContext(tenantId, supabase);

  // 2. Generate candidates
  const candidates = generateCandidates(request.type, context, request.params);

  // 3. Apply constraints
  applyConstraints(candidates, context);

  // 4. Score candidates
  scoreCandidates(candidates, context, request.type);

  // 5. Select best
  const eligible = candidates.filter((c) => c.score >= MIN_CANDIDATE_SCORE);
  eligible.sort((a, b) => b.score - a.score);

  const selected = eligible[0] ?? candidates[0];
  if (selected) selected.selected = true;

  // 6. Build rationale
  const rationale = buildRationale(selected, candidates, context, request);

  // 7. Determine confidence
  const confidence = determineConfidence(selected, context);

  // 8. Check escalation
  const hasBlockingConflict = context.conflicts.some((c) => c.severity === ConflictSeverity.BLOCKING);
  const requiresEscalation = (BLOCKING_CONFLICT_FORCES_ESCALATION && hasBlockingConflict)
    || confidence === DecisionConfidence.UNKNOWN
    || (selected?.score ?? 0) < 30;

  // 9. Build record
  const record: DecisionRecord = {
    id: uuid(),
    tenantId,
    category: typeToCategory(request.type),
    type: request.type,
    status: requiresEscalation ? DecisionStatus.PENDING : DecisionStatus.DECIDED,
    question: request.question,
    answer: selected?.label ?? 'No viable option found',
    confidence,
    context,
    candidates,
    rationale,
    outcome: null,
    overrideable: true,
    requiresEscalation,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 10. Persist
  await saveDecision(record, supabase);

  logger.info(
    `[DecisionEngine] ${request.type} for tenant=${tenantId}: ` +
    `answer="${record.answer}" confidence=${confidence} ` +
    `escalation=${requiresEscalation} candidates=${candidates.length}`,
  );

  return record;
}

// ---------------------------------------------------------------------------
// Candidate Generation (per type)
// ---------------------------------------------------------------------------

function generateCandidates(
  type: DecisionType,
  context: DecisionContext,
  params?: Record<string, unknown>,
): DecisionCandidate[] {
  switch (type) {
    case DecisionType.PUBLISH_NOW_OR_WAIT:
      return generatePublishCandidates(context);
    case DecisionType.AUTO_EXECUTE_OR_CHECKPOINT:
      return generateExecutionCandidates(context);
    case DecisionType.COST_VS_QUALITY:
      return generateCostQualityCandidates(context);
    case DecisionType.REPLAN_OR_PERSIST:
      return generateReplanCandidates(context);
    case DecisionType.SELECT_CHANNEL:
      return generateChannelCandidates(context, params);
    case DecisionType.PRIORITIZE_CAMPAIGN:
      return generatePriorityCandidates(context);
    case DecisionType.ADJUST_CADENCE:
      return generateCadenceCandidates(context);
    case DecisionType.ESCALATE_TO_HUMAN:
      return generateEscalationCandidates(context);
    case DecisionType.APPROVE_OR_REJECT:
      return generateApprovalCandidates(context);
    case DecisionType.SKIP_OR_DEFER:
      return generateSkipDeferCandidates(context);
    case DecisionType.SELECT_TEMPLATE:
      return generateTemplateCandidates(context);
    default:
      return [
        makeCand('proceed', 'Proceed with default behavior', [], ['No specific optimization']),
        makeCand('wait', 'Wait for more information', ['Lower risk'], ['Delays action']),
      ];
  }
}

function makeCand(id: string, label: string, pros: string[], cons: string[]): DecisionCandidate {
  return { id, label, score: 50, selected: false, reason: '', pros, cons };
}

function generatePublishCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('publish_now', 'Publish now',
      ['Faster reach', 'Maintains cadence'],
      ['No additional review time']),
    makeCand('wait_optimal', 'Wait for optimal time slot',
      ['Better engagement potential', 'Allows review'],
      ['Delays publication', 'May miss audience window']),
    makeCand('defer_next_cycle', 'Defer to next campaign cycle',
      ['More preparation time', 'Lower risk'],
      ['Significant delay', 'Cadence disruption']),
  ];
}

function generateExecutionCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('auto_execute', 'Auto-execute without human review',
      ['Speed', 'No bottleneck'],
      ['No human oversight', 'Higher risk']),
    makeCand('checkpoint', 'Require human checkpoint',
      ['Human oversight', 'Quality assurance'],
      ['Slower execution', 'Human bottleneck']),
    makeCand('partial_auto', 'Auto-execute with notification',
      ['Speed with awareness', 'Human can intervene async'],
      ['Human may not review in time']),
  ];
}

function generateCostQualityCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('optimize_cost', 'Optimize for cost',
      ['Lower generation costs', 'Better margins'],
      ['Potentially lower quality', 'Fewer variants']),
    makeCand('optimize_quality', 'Optimize for quality',
      ['Higher output quality', 'Better audience reception'],
      ['Higher costs', 'Slower production']),
    makeCand('balanced', 'Balanced cost/quality',
      ['Good tradeoff', 'Sustainable'],
      ['Not optimal in either dimension']),
  ];
}

function generateReplanCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('replan', 'Replan schedule',
      ['Adapts to current state', 'May improve outcomes'],
      ['Disrupts existing timeline', 'Rework effort']),
    makeCand('persist', 'Keep current plan',
      ['Stability', 'No rework'],
      ['May not reflect current reality']),
  ];
}

function generateChannelCandidates(ctx: DecisionContext, params?: Record<string, unknown>): DecisionCandidate[] {
  const channels = (params?.['channels'] as string[]) ?? ['instagram', 'youtube', 'tiktok', 'blog'];
  return channels.map((ch) =>
    makeCand(`channel_${ch}`, `Publish to ${ch}`,
      [`${ch} audience reach`],
      [`Requires ${ch}-specific format`]),
  );
}

function generatePriorityCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('highest_progress', 'Prioritize campaign closest to completion',
      ['Quick win', 'Momentum'],
      ['May neglect newer campaigns']),
    makeCand('highest_impact', 'Prioritize campaign with highest potential impact',
      ['Best ROI', 'Aligned with goals'],
      ['May require more effort']),
    makeCand('oldest_first', 'Prioritize oldest active campaign',
      ['Fair ordering', 'Prevents stalling'],
      ['May not be the most impactful']),
  ];
}

function generateCadenceCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('increase', 'Increase publication cadence',
      ['More reach', 'Faster campaign completion'],
      ['Higher costs', 'Quality risk']),
    makeCand('decrease', 'Decrease publication cadence',
      ['Better quality per piece', 'Lower cost'],
      ['Slower reach', 'Longer campaigns']),
    makeCand('maintain', 'Maintain current cadence',
      ['Consistency', 'No disruption'],
      ['May not be optimal']),
  ];
}

function generateEscalationCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('escalate', 'Escalate to human operator',
      ['Human judgment', 'Risk mitigation'],
      ['Delay', 'Human dependency']),
    makeCand('handle_auto', 'Handle autonomously',
      ['Speed', 'No bottleneck'],
      ['Risk of wrong decision', 'No human validation']),
  ];
}

function generateApprovalCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('approve', 'Approve',
      ['Moves forward', 'Maintains flow'],
      ['May approve suboptimal work']),
    makeCand('reject', 'Reject and request revision',
      ['Quality control', 'Better output'],
      ['Delay', 'Rework cost']),
    makeCand('approve_with_notes', 'Approve with improvement notes',
      ['Forward momentum with feedback', 'Learning signal'],
      ['Notes may be ignored']),
  ];
}

function generateSkipDeferCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('skip', 'Skip this item',
      ['Resource savings', 'Focus on higher value'],
      ['Missed opportunity', 'Incomplete campaign']),
    makeCand('defer', 'Defer to later',
      ['Keeps option open', 'May find better time'],
      ['Scheduling complexity', 'Delayed delivery']),
    makeCand('execute', 'Execute as planned',
      ['Consistency', 'Complete campaign'],
      ['May not be optimal timing']),
  ];
}

function generateTemplateCandidates(ctx: DecisionContext): DecisionCandidate[] {
  return [
    makeCand('keep_current', 'Keep current template',
      ['Consistency', 'No rework'],
      ['May not be optimal']),
    makeCand('try_new', 'Try a new template',
      ['Potential improvement', 'Fresh approach'],
      ['Unknown results', 'Adaptation cost']),
    makeCand('ab_test', 'A/B test templates',
      ['Data-driven decision', 'Learn preferences'],
      ['Requires more variants', 'Higher cost']),
  ];
}

// ---------------------------------------------------------------------------
// Constraint Application
// ---------------------------------------------------------------------------

function applyConstraints(
  candidates: DecisionCandidate[],
  context: DecisionContext,
): void {
  for (const constraint of context.constraints) {
    for (const candidate of candidates) {
      if (constraint.hard && candidate.id.includes(constraint.blocked)) {
        candidate.score = 0;
        candidate.reason = `Blocked by constraint: ${constraint.description}`;
        candidate.cons.push(`BLOCKED: ${constraint.description}`);
      } else if (!constraint.hard && candidate.id.includes(constraint.blocked)) {
        candidate.score = Math.max(0, candidate.score - 20);
        candidate.cons.push(`Soft constraint: ${constraint.description}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Candidate Scoring
// ---------------------------------------------------------------------------

function scoreCandidates(
  candidates: DecisionCandidate[],
  context: DecisionContext,
  type: DecisionType,
): void {
  for (const candidate of candidates) {
    if (candidate.score === 0) continue; // Already blocked

    let score = 50; // Base score

    // Boost based on goal alignment
    const goalInput = context.inputs.find(
      (i) => i.source === DecisionInputSource.GOAL_OPTIMIZATION && i.signal === 'active_objective',
    );
    if (goalInput) {
      score += scoreGoalAlignment(candidate.id, String(goalInput.value), type);
    }

    // Boost based on autonomy
    const autonomyInput = context.inputs.find(
      (i) => i.source === DecisionInputSource.GOVERNANCE_POLICY && i.signal === 'autonomy_level',
    );
    if (autonomyInput) {
      score += scoreAutonomyAlignment(candidate.id, String(autonomyInput.value));
    }

    // Boost based on memory depth
    const memoryInput = context.inputs.find(
      (i) => i.source === DecisionInputSource.TENANT_MEMORY && i.signal === 'memory_patterns',
    );
    if (memoryInput && Number(memoryInput.value) > 5) {
      // More memory = more confidence in data-driven candidates
      if (candidate.id.includes('auto') || candidate.id.includes('optimize')) {
        score += 5;
      }
    }

    // Penalize based on billing pressure
    const billingInput = context.inputs.find(
      (i) => i.source === DecisionInputSource.BILLING_LIMITS && i.signal === 'usage_utilization',
    );
    if (billingInput && Number(billingInput.value) >= 80) {
      if (candidate.id.includes('increase') || candidate.id.includes('quality')) {
        score -= 10;
      }
      if (candidate.id.includes('cost') || candidate.id.includes('decrease')) {
        score += 10;
      }
    }

    candidate.score = Math.max(0, Math.min(100, score));
  }
}

function scoreGoalAlignment(candidateId: string, goal: string, type: DecisionType): number {
  if (goal === 'low_cost' && candidateId.includes('cost')) return 15;
  if (goal === 'high_quality' && candidateId.includes('quality')) return 15;
  if (goal === 'fast_turnaround' && (candidateId.includes('now') || candidateId.includes('auto'))) return 15;
  if (goal === 'engagement' && candidateId.includes('increase')) return 10;
  if (goal === 'balanced' && candidateId.includes('balanced')) return 10;
  return 0;
}

function scoreAutonomyAlignment(candidateId: string, autonomy: string): number {
  if ((autonomy === 'autonomous' || autonomy === 'supervised_autonomous') &&
      candidateId.includes('auto')) return 10;
  if ((autonomy === 'manual' || autonomy === 'assisted') &&
      candidateId.includes('checkpoint')) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// Rationale Builder
// ---------------------------------------------------------------------------

function buildRationale(
  selected: DecisionCandidate | undefined,
  allCandidates: DecisionCandidate[],
  context: DecisionContext,
  request: DecisionRequest,
): DecisionRationale {
  if (!selected) {
    return {
      summary: 'No viable candidate found — escalation required.',
      factors: ['All candidates scored below minimum threshold.'],
      dominantInputs: [],
      tradeoffs: [],
    };
  }

  const rejected = allCandidates.filter((c) => c.id !== selected.id && c.score > 0);
  const factors: string[] = [];
  const dominantInputs: DecisionInputSource[] = [];

  // Find top-weight inputs that influenced the decision
  const sortedInputs = [...context.inputs].sort((a, b) => b.weight - a.weight);
  for (const input of sortedInputs.slice(0, 3)) {
    factors.push(`${INPUT_SOURCE_LABELS[input.source]}: ${input.signal}=${String(input.value)} (weight=${input.weight})`);
    if (!dominantInputs.includes(input.source)) {
      dominantInputs.push(input.source);
    }
  }

  // Constraints that affected outcomes
  if (context.constraints.length > 0) {
    factors.push(`${context.constraints.length} constraint(s) applied`);
  }

  // Conflicts
  if (context.conflicts.length > 0) {
    factors.push(`${context.conflicts.length} conflict(s) detected and resolved`);
  }

  // Tradeoffs
  const tradeoffs: string[] = [];
  if (selected.cons.length > 0) {
    tradeoffs.push(`Accepted tradeoffs: ${selected.cons.join('; ')}`);
  }
  if (rejected.length > 0) {
    const best = rejected[0];
    tradeoffs.push(
      `Best rejected alternative "${best.label}" (score=${best.score}): ${best.pros.join(', ')}`,
    );
  }

  return {
    summary: `Selected "${selected.label}" (score=${selected.score}) for "${request.question}". ` +
      `${factors.length} factors considered, ${allCandidates.length} candidates evaluated.`,
    factors,
    dominantInputs,
    tradeoffs,
  };
}

// ---------------------------------------------------------------------------
// Confidence Determination
// ---------------------------------------------------------------------------

function determineConfidence(
  selected: DecisionCandidate | undefined,
  context: DecisionContext,
): DecisionConfidence {
  if (!selected || selected.score === 0) return DecisionConfidence.UNKNOWN;

  const score = selected.score;
  const inputCount = context.inputs.length;
  const hasConflicts = context.conflicts.length > 0;

  if (score >= HIGH_CONFIDENCE_THRESHOLD && inputCount >= 5 && !hasConflicts) {
    return DecisionConfidence.HIGH;
  }
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD && inputCount >= 3) {
    return DecisionConfidence.MEDIUM;
  }
  if (score >= MIN_CANDIDATE_SCORE) {
    return DecisionConfidence.LOW;
  }
  return DecisionConfidence.UNKNOWN;
}

// ---------------------------------------------------------------------------
// Type → Category Mapping
// ---------------------------------------------------------------------------

function typeToCategory(type: DecisionType): DecisionCategory {
  switch (type) {
    case DecisionType.PRIORITIZE_CAMPAIGN:
    case DecisionType.SELECT_CHANNEL:
      return DecisionCategory.TACTICAL;
    case DecisionType.PUBLISH_NOW_OR_WAIT:
    case DecisionType.SKIP_OR_DEFER:
      return DecisionCategory.OPERATIONAL;
    case DecisionType.AUTO_EXECUTE_OR_CHECKPOINT:
    case DecisionType.APPROVE_OR_REJECT:
    case DecisionType.ESCALATE_TO_HUMAN:
      return DecisionCategory.GOVERNANCE;
    case DecisionType.COST_VS_QUALITY:
    case DecisionType.ADJUST_CADENCE:
    case DecisionType.SELECT_TEMPLATE:
      return DecisionCategory.OPTIMIZATION;
    case DecisionType.REPLAN_OR_PERSIST:
      return DecisionCategory.STRATEGIC;
    default:
      return DecisionCategory.OPERATIONAL;
  }
}

// Need this for rationale builder — import not possible since it's in the entity
const INPUT_SOURCE_LABELS: Record<DecisionInputSource, string> = {
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

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function saveDecision(
  record: DecisionRecord,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.upsert(DECISIONS_TABLE, {
      id: record.id,
      tenant_id: record.tenantId,
      category: record.category,
      type: record.type,
      status: record.status,
      question: record.question,
      answer: record.answer,
      confidence: record.confidence,
      context: JSON.stringify(record.context),
      candidates: JSON.stringify(record.candidates),
      rationale: JSON.stringify(record.rationale),
      outcome: record.outcome ? JSON.stringify(record.outcome) : null,
      overrideable: record.overrideable,
      requires_escalation: record.requiresEscalation,
      expires_at: record.expiresAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    }, 'id');
  } catch {
    logger.warn(`[DecisionEngine] Failed to persist decision ${record.id}`);
  }
}

/**
 * Loads a decision by ID.
 */
export async function loadDecision(
  decisionId: string,
  supabase: SupabaseClient | null,
): Promise<DecisionRecord | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<Record<string, unknown>>(DECISIONS_TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: decisionId }],
      limit: 1,
    });
    if (rows.length === 0) return null;
    return mapRowToDecision(rows[0]);
  } catch {
    return null;
  }
}

/**
 * Lists recent decisions for a tenant.
 */
export async function listDecisions(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  category?: DecisionCategory,
  limit = 50,
): Promise<DecisionRecord[]> {
  if (!supabase) return [];

  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];
  if (tenantId) filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  if (category) filters.push({ column: 'category', operator: 'eq', value: category });

  try {
    const rows = await supabase.select<Record<string, unknown>>(DECISIONS_TABLE, {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });
    return rows.map(mapRowToDecision);
  } catch {
    return [];
  }
}

/**
 * Override a decision (human override).
 */
export async function overrideDecision(
  decisionId: string,
  overriddenBy: string,
  newAnswer: string,
  reason: string,
  supabase: SupabaseClient | null,
): Promise<DecisionRecord | null> {
  const record = await loadDecision(decisionId, supabase);
  if (!record) return null;
  if (!record.overrideable) return null;

  record.status = DecisionStatus.OVERRIDDEN;
  record.answer = newAnswer;
  record.outcome = {
    action: newAnswer,
    applied: true,
    overriddenBy,
    overrideReason: reason,
    appliedAt: new Date().toISOString(),
  };
  record.updatedAt = new Date().toISOString();

  await saveDecision(record, supabase);

  logger.info(
    `[DecisionEngine] Decision ${decisionId} overridden by "${overriddenBy}": "${newAnswer}"`,
  );

  return record;
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToDecision(row: Record<string, unknown>): DecisionRecord {
  function parseJson<T>(val: unknown, fallback: T): T {
    if (!val) return fallback;
    try {
      return typeof val === 'string' ? JSON.parse(val) : val as T;
    } catch {
      return fallback;
    }
  }

  return {
    id: row['id'] as string,
    tenantId: (row['tenant_id'] as string) ?? null,
    category: (row['category'] as DecisionCategory) ?? DecisionCategory.OPERATIONAL,
    type: (row['type'] as DecisionType) ?? DecisionType.PUBLISH_NOW_OR_WAIT,
    status: (row['status'] as DecisionStatus) ?? DecisionStatus.DECIDED,
    question: (row['question'] as string) ?? '',
    answer: (row['answer'] as string) ?? '',
    confidence: (row['confidence'] as DecisionConfidence) ?? DecisionConfidence.UNKNOWN,
    context: parseJson(row['context'], { tenantId: null, inputs: [], constraints: [], conflicts: [], capturedAt: '' }),
    candidates: parseJson(row['candidates'], []),
    rationale: parseJson(row['rationale'], { summary: '', factors: [], dominantInputs: [], tradeoffs: [] }),
    outcome: parseJson(row['outcome'], null),
    overrideable: row['overrideable'] as boolean ?? true,
    requiresEscalation: row['requires_escalation'] as boolean ?? false,
    expiresAt: (row['expires_at'] as string) ?? null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}
