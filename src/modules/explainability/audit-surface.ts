/**
 * Audit Surface — Trust, Explanation & Audit Surfaces
 *
 * Constrói superfícies de auditoria consolidadas que combinam
 * explanations, trust signals, action traces e narrativas
 * numa visão coerente por entidade.
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  AuditSurface,
  AuditNarrative,
  AuditTimelineEntry,
  ActionTrace,
  TraceStep,
} from '../../domain/entities/explainability.js';
import { TraceStatus } from '../../domain/entities/explainability.js';
import { loadExplanation } from './explanation-builder.js';
import { evaluateEntityTrust } from './trust-evaluator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Audit Surface Builder
// ---------------------------------------------------------------------------

/**
 * Builds a full audit surface for an entity (job, campaign, publication, etc.).
 */
export async function buildAuditSurface(
  tenantId: string | null,
  entityId: string,
  entityType: string,
  supabase: SupabaseClient | null,
): Promise<AuditSurface> {
  // Load explanation
  const explanation = await loadExplanation(entityId, supabase);

  // Evaluate trust
  const trust = supabase && tenantId
    ? await evaluateEntityTrust(tenantId, entityId, entityType, supabase)
    : null;

  // Build action traces
  const traces = await buildActionTraces(entityId, entityType, supabase);

  // Build narrative
  const narrative = buildNarrative(entityId, entityType, explanation, trust, traces);

  logger.info(
    `[AuditSurface] Built surface for ${entityType}/${entityId}: ` +
    `explanation=${explanation ? 'yes' : 'no'}, trust=${trust?.trustLevel ?? 'n/a'}, ` +
    `traces=${traces.length}`,
  );

  return {
    tenantId,
    entityId,
    entityType,
    explanation,
    trust,
    traces,
    narrative,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Action Trace Builder
// ---------------------------------------------------------------------------

async function buildActionTraces(
  entityId: string,
  entityType: string,
  supabase: SupabaseClient | null,
): Promise<ActionTrace[]> {
  const traces: ActionTrace[] = [];
  if (!supabase) return traces;

  // Governance decisions as traces
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [{ column: 'entity_id', operator: 'eq', value: entityId }],
      select: 'id,gate_type,decision_result,autonomy_level,created_at',
      limit: 20,
      orderBy: 'created_at',
      orderDesc: true,
    });
    for (const r of rows) {
      const result = (r['decision_result'] as string) ?? 'unknown';
      traces.push({
        id: uuid(),
        tenantId: null,
        entityId,
        entityType,
        action: `Governance gate: ${r['gate_type']}`,
        status: result === 'approved' || result === 'pass' ? TraceStatus.COMPLETED
          : result === 'checkpoint_required' ? TraceStatus.BLOCKED
          : TraceStatus.COMPLETED,
        steps: [{
          order: 1,
          name: `Gate ${r['gate_type']}`,
          status: result === 'approved' || result === 'pass' ? TraceStatus.COMPLETED : TraceStatus.BLOCKED,
          detail: `Result: ${result}, Autonomy: ${r['autonomy_level']}`,
          timestamp: r['created_at'] as string,
          durationMs: 0,
        }],
        triggeredBy: 'governance_engine',
        startedAt: r['created_at'] as string,
        completedAt: r['created_at'] as string,
        durationMs: 0,
      });
    }
  } catch { /* graceful */ }

  // Recovery attempts as traces
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
      filters: [
        { column: 'entity_id', operator: 'eq', value: entityId },
        { column: 'entity_type', operator: 'eq', value: entityType },
      ],
      select: 'id,action,result,details,attempted_at,duration_ms',
      limit: 20,
      orderBy: 'attempted_at',
      orderDesc: true,
    });
    for (const r of rows) {
      const result = (r['result'] as string) ?? 'unknown';
      traces.push({
        id: uuid(),
        tenantId: null,
        entityId,
        entityType,
        action: `Recovery: ${r['action']}`,
        status: result === 'success' ? TraceStatus.COMPLETED
          : result === 'failed' ? TraceStatus.FAILED
          : result === 'escalated' ? TraceStatus.BLOCKED
          : TraceStatus.COMPLETED,
        steps: [{
          order: 1,
          name: r['action'] as string,
          status: result === 'success' ? TraceStatus.COMPLETED : TraceStatus.FAILED,
          detail: (r['details'] as string) ?? '',
          timestamp: r['attempted_at'] as string,
          durationMs: (r['duration_ms'] as number) ?? 0,
        }],
        triggeredBy: 'recovery_engine',
        startedAt: r['attempted_at'] as string,
        completedAt: r['attempted_at'] as string,
        durationMs: (r['duration_ms'] as number) ?? 0,
      });
    }
  } catch { /* graceful */ }

  // Decisions as traces
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: entityId }],
      select: 'id,type,answer,status,confidence,created_at',
      limit: 10,
      orderBy: 'created_at',
      orderDesc: true,
    });
    for (const r of rows) {
      traces.push({
        id: uuid(),
        tenantId: null,
        entityId,
        entityType: 'decision',
        action: `Decision: ${r['type']}`,
        status: (r['status'] as string) === 'applied' ? TraceStatus.COMPLETED
          : (r['status'] as string) === 'overridden' ? TraceStatus.OVERRIDDEN
          : TraceStatus.COMPLETED,
        steps: [{
          order: 1,
          name: r['type'] as string,
          status: TraceStatus.COMPLETED,
          detail: `Answer: ${r['answer']}, Confidence: ${r['confidence']}`,
          timestamp: r['created_at'] as string,
          durationMs: 0,
        }],
        triggeredBy: 'decision_engine',
        startedAt: r['created_at'] as string,
        completedAt: r['created_at'] as string,
        durationMs: 0,
      });
    }
  } catch { /* graceful */ }

  return traces;
}

// ---------------------------------------------------------------------------
// Narrative Builder
// ---------------------------------------------------------------------------

function buildNarrative(
  entityId: string,
  entityType: string,
  explanation: import('../../domain/entities/explainability.js').ExplanationRecord | null,
  trust: import('../../domain/entities/explainability.js').TrustSignal | null,
  traces: ActionTrace[],
): AuditNarrative {
  const paragraphs: string[] = [];
  const timeline: AuditTimelineEntry[] = [];
  const highlights: string[] = [];

  // Intro paragraph
  paragraphs.push(
    `Audit report for ${entityType} ${entityId.slice(0, 8)}.`,
  );

  // Explanation paragraph
  if (explanation) {
    paragraphs.push(explanation.narrative);
    if (explanation.appliedConstraints.length > 0) {
      highlights.push(`${explanation.appliedConstraints.length} constraint(s) were applied`);
    }
    if (explanation.rejectedAlternatives.length > 0) {
      highlights.push(`${explanation.rejectedAlternatives.length} alternative(s) were rejected`);
    }
  }

  // Trust paragraph
  if (trust) {
    paragraphs.push(
      `Trust level: ${trust.trustLevel} (score ${trust.score}/100). ` +
      `${trust.indicators.length} confidence indicators, ${trust.risks.length} risk factor(s). ` +
      (trust.recoveryTriggered ? 'Recovery was triggered. ' : '') +
      (trust.humanReviewNeeded ? 'Human review is needed. ' : '') +
      (trust.governanceCompliant ? 'Governance compliant.' : 'Governance compliance issues detected.'),
    );

    for (const risk of trust.risks) {
      highlights.push(`Risk: ${risk.factor} (${risk.level}) — ${risk.description}`);
    }
  }

  // Traces → timeline
  const sortedTraces = [...traces].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  for (const trace of sortedTraces) {
    timeline.push({
      timestamp: trace.startedAt,
      event: trace.action,
      actor: trace.triggeredBy,
      detail: `Status: ${trace.status}` +
        (trace.durationMs > 0 ? `, Duration: ${trace.durationMs}ms` : ''),
    });
  }

  if (traces.length > 0) {
    const completed = traces.filter((t) => t.status === TraceStatus.COMPLETED).length;
    const failed = traces.filter((t) => t.status === TraceStatus.FAILED).length;
    paragraphs.push(
      `${traces.length} action(s) traced: ${completed} completed, ${failed} failed.`,
    );
  }

  return { entityId, entityType, paragraphs, timeline, highlights };
}

// ---------------------------------------------------------------------------
// Campaign Audit (shortcut)
// ---------------------------------------------------------------------------

export async function buildCampaignAudit(
  tenantId: string | null,
  campaignId: string,
  supabase: SupabaseClient | null,
): Promise<AuditSurface> {
  return buildAuditSurface(tenantId, campaignId, 'campaign', supabase);
}

export async function buildPublicationAudit(
  tenantId: string | null,
  publicationId: string,
  supabase: SupabaseClient | null,
): Promise<AuditSurface> {
  return buildAuditSurface(tenantId, publicationId, 'publication', supabase);
}
