/**
 * Explanation Builder — Trust, Explanation & Audit Surfaces
 *
 * Constrói ExplanationRecords a partir de entidades do sistema.
 * Cada subject type tem um builder especializado que compõe
 * headline, narrative, context blocks e constraints.
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  ExplanationRecord,
  ExplanationBlock,
} from '../../domain/entities/explainability.js';
import {
  ExplanationSubject,
  ExplanationAudience,
} from '../../domain/entities/explainability.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_explanations';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function saveExplanation(
  record: ExplanationRecord,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.upsert(TABLE, {
      id: record.id,
      tenant_id: record.tenantId,
      subject: record.subject,
      entity_id: record.entityId,
      entity_type: record.entityType,
      audience: record.audience,
      headline: record.headline,
      narrative: record.narrative,
      context: JSON.stringify(record.context),
      key_inputs: JSON.stringify(record.keyInputs),
      applied_constraints: JSON.stringify(record.appliedConstraints),
      rejected_alternatives: JSON.stringify(record.rejectedAlternatives),
      action_taken: record.actionTaken,
      observed_result: record.observedResult,
      confidence: record.confidence,
      created_at: record.createdAt,
    }, 'id');
  } catch {
    logger.warn(`[ExplanationBuilder] Failed to persist explanation ${record.id}`);
  }
}

export async function loadExplanation(
  entityId: string,
  supabase: SupabaseClient | null,
): Promise<ExplanationRecord | null> {
  if (!supabase) return null;
  try {
    const rows = await supabase.select<Record<string, unknown>>(TABLE, {
      filters: [{ column: 'entity_id', operator: 'eq', value: entityId }],
      limit: 1,
      orderBy: 'created_at',
      orderDesc: true,
    });
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } catch { return null; }
}

export async function listExplanations(
  tenantId: string | null,
  supabase: SupabaseClient | null,
  subject?: ExplanationSubject,
  limit = 50,
): Promise<ExplanationRecord[]> {
  if (!supabase) return [];
  type Filter = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };
  const filters: Filter[] = [];
  if (tenantId) filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
  if (subject) filters.push({ column: 'subject', operator: 'eq', value: subject });
  try {
    const rows = await supabase.select<Record<string, unknown>>(TABLE, {
      filters, orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapRow);
  } catch { return []; }
}

function mapRow(r: Record<string, unknown>): ExplanationRecord {
  function pj<T>(v: unknown, fb: T): T {
    if (!v) return fb;
    try { return typeof v === 'string' ? JSON.parse(v) : v as T; }
    catch { return fb; }
  }
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? null,
    subject: r['subject'] as ExplanationSubject,
    entityId: r['entity_id'] as string,
    entityType: r['entity_type'] as string,
    audience: (r['audience'] as ExplanationAudience) ?? ExplanationAudience.TENANT,
    headline: (r['headline'] as string) ?? '',
    narrative: (r['narrative'] as string) ?? '',
    context: pj(r['context'], []),
    keyInputs: pj(r['key_inputs'], []),
    appliedConstraints: pj(r['applied_constraints'], []),
    rejectedAlternatives: pj(r['rejected_alternatives'], []),
    actionTaken: (r['action_taken'] as string) ?? '',
    observedResult: (r['observed_result'] as string) ?? null,
    confidence: (r['confidence'] as number) ?? 0,
    createdAt: r['created_at'] as string,
  };
}

// ---------------------------------------------------------------------------
// Subject-specific Builders
// ---------------------------------------------------------------------------

/**
 * Builds an explanation for a Decision record.
 */
export async function explainDecision(
  tenantId: string | null,
  decisionId: string,
  supabase: SupabaseClient | null,
): Promise<ExplanationRecord> {
  const now = new Date().toISOString();
  let headline = 'Decision made by the system';
  let narrative = '';
  const context: ExplanationBlock[] = [];
  const keyInputs: ExplanationBlock[] = [];
  const constraints: string[] = [];
  const rejected: string[] = [];
  let actionTaken = '';
  let confidence = 50;

  if (supabase) {
    try {
      const rows = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
        filters: [{ column: 'id', operator: 'eq', value: decisionId }],
        limit: 1,
      });
      if (rows.length > 0) {
        const d = rows[0];
        headline = `${d['type']}: "${d['answer']}"`;
        actionTaken = (d['answer'] as string) ?? '';
        confidence = (d['confidence'] as string) === 'high' ? 85
          : (d['confidence'] as string) === 'medium' ? 60
          : (d['confidence'] as string) === 'low' ? 35 : 20;

        context.push({ label: 'Question', value: (d['question'] as string) ?? '', relevance: 100 });
        context.push({ label: 'Category', value: (d['category'] as string) ?? '', relevance: 80 });
        context.push({ label: 'Status', value: (d['status'] as string) ?? '', relevance: 70 });

        // Parse rationale
        try {
          const rat = typeof d['rationale'] === 'string' ? JSON.parse(d['rationale']) : d['rationale'];
          if (rat) {
            narrative = (rat as Record<string, unknown>)['summary'] as string ?? '';
            const factors = (rat as Record<string, unknown>)['factors'] as string[] ?? [];
            for (const f of factors) {
              keyInputs.push({ label: 'Factor', value: f, relevance: 75 });
            }
            const tradeoffs = (rat as Record<string, unknown>)['tradeoffs'] as string[] ?? [];
            for (const t of tradeoffs) {
              rejected.push(t);
            }
          }
        } catch { /* skip */ }

        // Parse constraints from context
        try {
          const ctx = typeof d['context'] === 'string' ? JSON.parse(d['context']) : d['context'];
          if (ctx) {
            const cons = (ctx as Record<string, unknown>)['constraints'] as Array<Record<string, unknown>> ?? [];
            for (const c of cons) {
              constraints.push((c['description'] as string) ?? '');
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* graceful */ }
  }

  if (!narrative) {
    narrative = `The system evaluated the question and selected "${actionTaken}" ` +
      `with ${confidence}% confidence. ${constraints.length > 0 ? `${constraints.length} constraint(s) were applied.` : ''}`;
  }

  const record: ExplanationRecord = {
    id: uuid(),
    tenantId,
    subject: ExplanationSubject.DECISION,
    entityId: decisionId,
    entityType: 'decision',
    audience: ExplanationAudience.TENANT,
    headline,
    narrative,
    context,
    keyInputs,
    appliedConstraints: constraints,
    rejectedAlternatives: rejected,
    actionTaken,
    observedResult: null,
    confidence,
    createdAt: now,
  };

  await saveExplanation(record, supabase);
  return record;
}

/**
 * Builds an explanation for a Job/Pipeline execution.
 */
export async function explainJob(
  tenantId: string | null,
  jobId: string,
  supabase: SupabaseClient | null,
): Promise<ExplanationRecord> {
  const now = new Date().toISOString();
  const context: ExplanationBlock[] = [];
  const keyInputs: ExplanationBlock[] = [];
  let headline = `Pipeline execution for job ${jobId.slice(0, 8)}`;
  let narrative = '';
  let actionTaken = 'Pipeline execution';
  let observedResult: string | null = null;
  let confidence = 70;

  if (supabase) {
    try {
      const rows = await supabase.select<Record<string, unknown>>('bookagent_job_meta', {
        filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
        limit: 1,
      });
      if (rows.length > 0) {
        const j = rows[0];
        const status = (j['approval_status'] as string) ?? 'unknown';
        context.push({ label: 'Status', value: status, relevance: 100 });
        context.push({ label: 'Tenant', value: (j['tenant_id'] as string) ?? 'default', relevance: 60 });
        observedResult = `Job ${status}`;
        headline = `Pipeline ${status} for job ${jobId.slice(0, 8)}`;

        if (status === 'final_approved') confidence = 90;
        else if (status === 'completed') confidence = 80;
        else if (status === 'failed') confidence = 30;
      }
    } catch { /* graceful */ }

    // Check artifacts
    try {
      const arts = await supabase.select<Record<string, unknown>>('bookagent_job_artifacts', {
        filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
        select: 'id',
        limit: 100,
      });
      keyInputs.push({ label: 'Artifacts generated', value: String(arts.length), relevance: 85 });
    } catch { /* graceful */ }

    // Check recovery events
    try {
      const recs = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
        filters: [
          { column: 'entity_id', operator: 'eq', value: jobId },
          { column: 'entity_type', operator: 'eq', value: 'job' },
        ],
        select: 'id,result',
        limit: 10,
      });
      if (recs.length > 0) {
        keyInputs.push({ label: 'Recovery attempts', value: String(recs.length), relevance: 90 });
        confidence = Math.max(20, confidence - recs.length * 10);
      }
    } catch { /* graceful */ }
  }

  narrative = `Job ${jobId.slice(0, 8)} was processed through the 17-stage pipeline. ` +
    `${keyInputs.map((i) => `${i.label}: ${i.value}`).join('. ')}. ` +
    `Overall confidence: ${confidence}%.`;

  const record: ExplanationRecord = {
    id: uuid(),
    tenantId,
    subject: ExplanationSubject.CAMPAIGN_EXECUTION,
    entityId: jobId,
    entityType: 'job',
    audience: ExplanationAudience.TENANT,
    headline,
    narrative,
    context,
    keyInputs,
    appliedConstraints: [],
    rejectedAlternatives: [],
    actionTaken,
    observedResult,
    confidence,
    createdAt: now,
  };

  await saveExplanation(record, supabase);
  return record;
}

/**
 * Builds an explanation for a Publication event.
 */
export async function explainPublication(
  tenantId: string | null,
  publicationId: string,
  supabase: SupabaseClient | null,
): Promise<ExplanationRecord> {
  const now = new Date().toISOString();
  const context: ExplanationBlock[] = [];
  const constraints: string[] = [];
  let headline = `Publication ${publicationId.slice(0, 8)}`;
  let narrative = '';
  let actionTaken = '';
  let observedResult: string | null = null;
  let confidence = 60;

  if (supabase) {
    try {
      const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
        filters: [{ column: 'id', operator: 'eq', value: publicationId }],
        limit: 1,
      });
      if (rows.length > 0) {
        const p = rows[0];
        const status = (p['status'] as string) ?? 'unknown';
        const platform = (p['platform'] as string) ?? 'unknown';
        context.push({ label: 'Platform', value: platform, relevance: 90 });
        context.push({ label: 'Status', value: status, relevance: 100 });
        headline = `Publication to ${platform}: ${status}`;
        actionTaken = `Published to ${platform}`;
        observedResult = status;

        if (status === 'published') confidence = 95;
        else if (status === 'pending') confidence = 50;
        else if (status === 'failed') confidence = 20;

        if (!p['external_id'] && status === 'published') {
          constraints.push('Published but no external reference received — verify manually');
          confidence = Math.max(20, confidence - 20);
        }
      }
    } catch { /* graceful */ }
  }

  narrative = headline + '. ' +
    (constraints.length > 0 ? `Constraints: ${constraints.join('; ')}. ` : '') +
    `Confidence: ${confidence}%.`;

  const record: ExplanationRecord = {
    id: uuid(),
    tenantId,
    subject: ExplanationSubject.PUBLICATION,
    entityId: publicationId,
    entityType: 'publication',
    audience: ExplanationAudience.TENANT,
    headline,
    narrative,
    context,
    keyInputs: [],
    appliedConstraints: constraints,
    rejectedAlternatives: [],
    actionTaken,
    observedResult,
    confidence,
    createdAt: now,
  };

  await saveExplanation(record, supabase);
  return record;
}
