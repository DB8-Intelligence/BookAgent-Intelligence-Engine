/**
 * Trust Evaluator — Trust, Explanation & Audit Surfaces
 *
 * Avalia trust signals e risk indicators para uma entidade,
 * compondo indicadores de confiança de múltiplas fontes.
 *
 * Fontes:
 *   - Decisions (confidence)
 *   - Governance (compliance)
 *   - Recovery log (fallback/retry)
 *   - Publications (success rate)
 *   - Billing (within limits)
 *
 * Parte 97: Trust, Explanation & Audit Surfaces
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  TrustSignal,
  ConfidenceIndicator,
  RiskIndicator,
} from '../../domain/entities/explainability.js';
import {
  TrustLevel,
  RiskLevel,
  TRUST_HIGH_THRESHOLD,
  TRUST_MODERATE_THRESHOLD,
  TRUST_LOW_THRESHOLD,
} from '../../domain/entities/explainability.js';

// ---------------------------------------------------------------------------
// Main Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates the trust signal for a tenant.
 */
export async function evaluateTenantTrust(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<TrustSignal> {
  const indicators: ConfidenceIndicator[] = [];
  const risks: RiskIndicator[] = [];
  let fallbackUsed = false;
  let recoveryTriggered = false;
  let humanReviewNeeded = false;
  let governanceCompliant = true;

  if (supabase) {
    await assessDecisionConfidence(tenantId, supabase, indicators, risks);
    const govResult = await assessGovernance(tenantId, supabase, indicators, risks);
    governanceCompliant = govResult.compliant;
    humanReviewNeeded = govResult.needsReview;
    const recResult = await assessRecovery(tenantId, supabase, indicators, risks);
    recoveryTriggered = recResult.triggered;
    fallbackUsed = recResult.fallbackUsed;
    await assessPublications(tenantId, supabase, indicators, risks);
    await assessBilling(tenantId, supabase, indicators, risks);
  }

  // Compute overall score
  const score = computeOverallScore(indicators);
  const trustLevel = scoreToTrustLevel(score);

  return {
    id: uuid(),
    tenantId,
    entityId: tenantId,
    entityType: 'tenant',
    trustLevel,
    score,
    indicators,
    risks,
    fallbackUsed,
    recoveryTriggered,
    humanReviewNeeded,
    governanceCompliant,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Evaluates trust for a specific entity.
 */
export async function evaluateEntityTrust(
  tenantId: string | null,
  entityId: string,
  entityType: string,
  supabase: SupabaseClient | null,
): Promise<TrustSignal> {
  const indicators: ConfidenceIndicator[] = [];
  const risks: RiskIndicator[] = [];
  let fallbackUsed = false;
  let recoveryTriggered = false;

  if (supabase) {
    // Check recovery for this entity
    try {
      const recs = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
        filters: [
          { column: 'entity_id', operator: 'eq', value: entityId },
          { column: 'entity_type', operator: 'eq', value: entityType },
        ],
        select: 'id,result',
        limit: 20,
      });
      if (recs.length > 0) {
        recoveryTriggered = true;
        const failed = recs.filter((r) => r['result'] === 'failed').length;
        const score = recs.length > 0 ? Math.max(10, 100 - failed * 20) : 80;
        indicators.push({
          dimension: 'recovery_history',
          score,
          label: 'Recovery History',
          detail: `${recs.length} attempt(s), ${failed} failure(s)`,
        });
        if (failed > 2) {
          risks.push({
            factor: 'repeated_failures',
            level: RiskLevel.HIGH,
            description: `${failed} recovery failures for this entity`,
            mitigation: 'Manual investigation recommended',
          });
        }
      }
    } catch { /* graceful */ }

    // Check decisions about this entity
    try {
      const decs = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
        filters: [{ column: 'question', operator: 'eq', value: entityId }],
        select: 'confidence,status',
        limit: 5,
      });
      if (decs.length > 0) {
        const highConf = decs.filter((d) => d['confidence'] === 'high').length;
        const score = Math.round((highConf / decs.length) * 100);
        indicators.push({
          dimension: 'decision_confidence',
          score,
          label: 'Decision Confidence',
          detail: `${highConf}/${decs.length} decisions with high confidence`,
        });
      }
    } catch { /* graceful */ }
  }

  const score = computeOverallScore(indicators);

  return {
    id: uuid(),
    tenantId,
    entityId,
    entityType,
    trustLevel: scoreToTrustLevel(score),
    score,
    indicators,
    risks,
    fallbackUsed,
    recoveryTriggered,
    humanReviewNeeded: false,
    governanceCompliant: true,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Assessment Functions
// ---------------------------------------------------------------------------

async function assessDecisionConfidence(
  tenantId: string,
  supabase: SupabaseClient,
  indicators: ConfidenceIndicator[],
  risks: RiskIndicator[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'confidence,requires_escalation',
      limit: 50,
      orderBy: 'created_at',
      orderDesc: true,
    });
    if (rows.length === 0) return;

    const highConf = rows.filter((r) => r['confidence'] === 'high').length;
    const escalations = rows.filter((r) => r['requires_escalation'] === true).length;
    const score = rows.length > 0 ? Math.round((highConf / rows.length) * 100) : 50;

    indicators.push({
      dimension: 'decision_quality',
      score,
      label: 'Decision Quality',
      detail: `${highConf}/${rows.length} high-confidence decisions`,
    });

    if (escalations > rows.length * 0.3) {
      risks.push({
        factor: 'high_escalation_rate',
        level: RiskLevel.MEDIUM,
        description: `${escalations}/${rows.length} decisions required escalation`,
        mitigation: 'Consider adjusting autonomy level or reviewing governance rules',
      });
    }
  } catch { /* graceful */ }
}

async function assessGovernance(
  tenantId: string,
  supabase: SupabaseClient,
  indicators: ConfidenceIndicator[],
  risks: RiskIndicator[],
): Promise<{ compliant: boolean; needsReview: boolean }> {
  let compliant = true;
  let needsReview = false;

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_governance_decisions', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'decision_result',
      limit: 50,
      orderBy: 'created_at',
      orderDesc: true,
    });

    if (rows.length > 0) {
      const checkpoints = rows.filter((r) => r['decision_result'] === 'checkpoint_required').length;
      const passed = rows.filter((r) => r['decision_result'] === 'approved' || r['decision_result'] === 'pass').length;
      const score = rows.length > 0 ? Math.round((passed / rows.length) * 100) : 70;

      indicators.push({
        dimension: 'governance_compliance',
        score,
        label: 'Governance Compliance',
        detail: `${passed}/${rows.length} gates passed, ${checkpoints} pending`,
      });

      if (checkpoints > 3) {
        needsReview = true;
        risks.push({
          factor: 'pending_checkpoints',
          level: RiskLevel.MEDIUM,
          description: `${checkpoints} governance checkpoints pending review`,
          mitigation: 'Review and resolve pending checkpoints',
        });
      }

      compliant = checkpoints < 5;
    }
  } catch { /* graceful */ }

  return { compliant, needsReview };
}

async function assessRecovery(
  tenantId: string,
  supabase: SupabaseClient,
  indicators: ConfidenceIndicator[],
  risks: RiskIndicator[],
): Promise<{ triggered: boolean; fallbackUsed: boolean }> {
  let triggered = false;
  let fallbackUsed = false;

  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_recovery_log', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'result,action',
      limit: 50,
      orderBy: 'attempted_at',
      orderDesc: true,
    });

    if (rows.length > 0) {
      triggered = true;
      const succeeded = rows.filter((r) => r['result'] === 'success').length;
      const failed = rows.filter((r) => r['result'] === 'failed').length;
      fallbackUsed = rows.some((r) =>
        r['action'] === 'retry_alt_provider' || r['action'] === 'reconcile_state',
      );

      const score = rows.length > 0 ? Math.round((succeeded / rows.length) * 100) : 50;

      indicators.push({
        dimension: 'system_resilience',
        score,
        label: 'System Resilience',
        detail: `${succeeded}/${rows.length} recoveries successful`,
      });

      if (failed > 5) {
        risks.push({
          factor: 'recovery_failures',
          level: RiskLevel.HIGH,
          description: `${failed} recovery failures detected`,
          mitigation: 'Investigate persistent failure patterns',
        });
      }
    }
  } catch { /* graceful */ }

  return { triggered, fallbackUsed };
}

async function assessPublications(
  tenantId: string,
  supabase: SupabaseClient,
  indicators: ConfidenceIndicator[],
  risks: RiskIndicator[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_publications', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'status',
      limit: 100,
    });
    if (rows.length === 0) return;

    const published = rows.filter((r) => r['status'] === 'published').length;
    const failed = rows.filter((r) => r['status'] === 'failed').length;
    const pending = rows.filter((r) => r['status'] === 'pending').length;
    const score = rows.length > 0 ? Math.round((published / rows.length) * 100) : 50;

    indicators.push({
      dimension: 'publication_reliability',
      score,
      label: 'Publication Reliability',
      detail: `${published} published, ${failed} failed, ${pending} pending out of ${rows.length}`,
    });

    if (failed > rows.length * 0.2) {
      risks.push({
        factor: 'publication_failure_rate',
        level: RiskLevel.MEDIUM,
        description: `${Math.round((failed / rows.length) * 100)}% publication failure rate`,
        mitigation: 'Check channel integrations and credentials',
      });
    }
  } catch { /* graceful */ }
}

async function assessBilling(
  tenantId: string,
  supabase: SupabaseClient,
  indicators: ConfidenceIndicator[],
  risks: RiskIndicator[],
): Promise<void> {
  try {
    const rows = await supabase.select<Record<string, unknown>>('bookagent_usage_counters', {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      select: 'jobs_used,jobs_limit',
      limit: 1,
    });
    if (rows.length === 0) return;

    const used = (rows[0]['jobs_used'] as number) ?? 0;
    const limit = (rows[0]['jobs_limit'] as number) ?? 999;
    const utilization = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const score = Math.max(0, 100 - utilization);

    indicators.push({
      dimension: 'billing_headroom',
      score,
      label: 'Billing Headroom',
      detail: `${utilization}% utilized (${used}/${limit})`,
    });

    if (utilization >= 90) {
      risks.push({
        factor: 'billing_limit',
        level: utilization >= 100 ? RiskLevel.CRITICAL : RiskLevel.HIGH,
        description: `Usage at ${utilization}% — operations may be blocked`,
        mitigation: 'Upgrade plan or wait for billing cycle reset',
      });
    }
  } catch { /* graceful */ }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeOverallScore(indicators: ConfidenceIndicator[]): number {
  if (indicators.length === 0) return 50;
  const sum = indicators.reduce((s, i) => s + i.score, 0);
  return Math.round(sum / indicators.length);
}

function scoreToTrustLevel(score: number): TrustLevel {
  if (score >= TRUST_HIGH_THRESHOLD) return TrustLevel.HIGH;
  if (score >= TRUST_MODERATE_THRESHOLD) return TrustLevel.MODERATE;
  if (score >= TRUST_LOW_THRESHOLD) return TrustLevel.LOW;
  if (score > 0) return TrustLevel.DEGRADED;
  return TrustLevel.UNKNOWN;
}
