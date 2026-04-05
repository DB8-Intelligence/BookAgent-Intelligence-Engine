/**
 * Cost Tracker — BookAgent Intelligence Engine
 *
 * Estimates per-job and per-user cost based on provider usage and plan tier.
 * Used to monitor margins and detect when costs deviate from plan assumptions.
 *
 * Cost model (BRL centavos per call):
 *   Gemini Flash: ~150 (analysis, extraction)
 *   OpenAI GPT-4o: ~400 (blog copy, landing page)
 *   Anthropic Claude: ~500 (narrative, media scripts)
 *   Storage (Supabase): ~20 per artifact
 *   Meta API publish: ~50 per platform
 *
 * Parte 57: Estratégia de Crescimento Escalável
 */

import type { PlanTier } from '../plans/plan-config.js';
import { PLANS } from '../plans/plan-config.js';

// ============================================================================
// Cost constants (BRL centavos)
// ============================================================================

export const PROVIDER_COST_PER_CALL: Record<string, number> = {
  gemini:    150,
  openai:    400,
  anthropic: 500,
};

export const FIXED_COSTS = {
  storage_per_artifact: 20,
  meta_publish_per_platform: 50,
  queue_overhead_per_job: 10,
};

// ============================================================================
// Types
// ============================================================================

export interface JobCostBreakdown {
  ai_calls: { provider: string; count: number; cost: number }[];
  storage: number;
  publishing: number;
  queue: number;
  total: number;
  currency: 'BRL_centavos';
}

export interface UserMonthlyCost {
  user_id: string;
  plan_tier: PlanTier;
  jobs_count: number;
  estimated_cost: number;
  plan_revenue: number;
  estimated_margin: number;
  margin_pct: number;
  healthy: boolean;
}

// ============================================================================
// Estimation functions
// ============================================================================

/**
 * Estimates the cost of a single job based on AI providers used.
 *
 * @param aiProviders - list of provider names invoked during the job
 * @param artifactCount - number of artifacts produced
 * @param platformsPublished - number of social platforms published to
 */
export function estimateJobCost(
  aiProviders: string[],
  artifactCount: number = 3,
  platformsPublished: number = 0,
): JobCostBreakdown {
  // Count calls per provider
  const providerCounts = new Map<string, number>();
  for (const p of aiProviders) {
    const key = p.toLowerCase();
    providerCounts.set(key, (providerCounts.get(key) ?? 0) + 1);
  }

  const ai_calls = Array.from(providerCounts.entries()).map(([provider, count]) => ({
    provider,
    count,
    cost: (PROVIDER_COST_PER_CALL[provider] ?? 300) * count,
  }));

  const aiTotal = ai_calls.reduce((sum, c) => sum + c.cost, 0);
  const storage = FIXED_COSTS.storage_per_artifact * artifactCount;
  const publishing = FIXED_COSTS.meta_publish_per_platform * platformsPublished;
  const queue = FIXED_COSTS.queue_overhead_per_job;

  return {
    ai_calls,
    storage,
    publishing,
    queue,
    total: aiTotal + storage + publishing + queue,
    currency: 'BRL_centavos',
  };
}

/**
 * Estimates monthly cost and margin for a user given their job count.
 */
export function estimateUserMonthlyCost(
  userId: string,
  planTier: PlanTier,
  jobsCount: number,
): UserMonthlyCost {
  const plan = PLANS[planTier];
  const estimatedCost = plan.estimatedCostPerJobBRL * jobsCount;
  const planRevenue = plan.priceMonthlyBRL;
  const estimatedMargin = planRevenue - estimatedCost;
  const marginPct = planRevenue > 0 ? Math.round((estimatedMargin / planRevenue) * 100) : 0;

  return {
    user_id: userId,
    plan_tier: planTier,
    jobs_count: jobsCount,
    estimated_cost: estimatedCost,
    plan_revenue: planRevenue,
    estimated_margin: estimatedMargin,
    margin_pct: marginPct,
    healthy: marginPct > 30, // Below 30% margin is a warning
  };
}

/**
 * Returns the cost-optimal provider ordering for a given task type.
 * Cheapest first for cost-sensitive tasks, quality-first for user-facing copy.
 */
export function getProviderPriority(task: 'analysis' | 'copy' | 'multimodal'): string[] {
  switch (task) {
    case 'analysis':   return ['gemini', 'openai', 'anthropic'];   // cheapest first
    case 'copy':       return ['anthropic', 'openai', 'gemini'];   // quality first
    case 'multimodal': return ['gemini', 'openai', 'anthropic'];   // native multimodal
  }
}
