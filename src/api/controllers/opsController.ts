/**
 * Ops Controller — BookAgent Intelligence Engine
 *
 * Operational dashboard for monitoring system health, growth phase,
 * queue status, cost estimates, and scaling recommendations.
 *
 * Endpoints:
 *   GET /api/v1/ops/dashboard       → Full operational overview
 *   GET /api/v1/ops/queue           → Queue health snapshot
 *   GET /api/v1/ops/costs           → Cost and margin analysis
 *   GET /api/v1/ops/growth          → Growth phase and recommendations
 *
 * All endpoints require auth (BOOKAGENT_API_KEY).
 *
 * Parte 57: Estratégia de Crescimento Escalável
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';
import { getQueueHealth } from '../../observability/queue-health.js';
import { detectGrowthPhase } from '../../observability/growth-phase.js';
import { estimateUserMonthlyCost, PROVIDER_COST_PER_CALL, FIXED_COSTS } from '../../observability/cost-tracker.js';
import { PLANS, type PlanTier } from '../../plans/plan-config.js';
import { checkProviderStatus } from '../../adapters/provider-factory.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';

// ============================================================================
// Dependency injection
// ============================================================================

let supabase: SupabaseClient | null = null;

export function setOpsSupabaseClient(client: SupabaseClient): void {
  supabase = client;
}

// ============================================================================
// Types
// ============================================================================

interface MonthlyUsageRow {
  user_id: string;
  plan_tier: string;
  jobs_count: string;
}

interface JobStatsRow {
  total_jobs: string;
  completed: string;
  failed: string;
  avg_duration_ms: string | null;
}

// ============================================================================
// GET /api/v1/ops/dashboard
// ============================================================================

export async function getOpsDashboard(_req: Request, res: Response): Promise<void> {
  try {
    const [queueHealth, growthPhase, costAnalysis, systemStatus] = await Promise.all([
      getQueueHealth(),
      supabase ? detectGrowthPhase(supabase) : null,
      supabase ? getCostAnalysis() : null,
      getSystemStatus(),
    ]);

    sendSuccess(res, {
      timestamp: new Date().toISOString(),
      system: systemStatus,
      queue: queueHealth,
      growth: growthPhase,
      costs: costAnalysis,
    });
  } catch (err) {
    logger.error(`[Ops] Dashboard error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to build ops dashboard', 500);
  }
}

// ============================================================================
// GET /api/v1/ops/queue
// ============================================================================

export async function getOpsQueue(_req: Request, res: Response): Promise<void> {
  try {
    const health = await getQueueHealth();
    sendSuccess(res, health);
  } catch (err) {
    logger.error(`[Ops] Queue health error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to read queue health', 500);
  }
}

// ============================================================================
// GET /api/v1/ops/costs
// ============================================================================

export async function getOpsCosts(_req: Request, res: Response): Promise<void> {
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  try {
    const analysis = await getCostAnalysis();
    sendSuccess(res, analysis);
  } catch (err) {
    logger.error(`[Ops] Cost analysis error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to compute cost analysis', 500);
  }
}

// ============================================================================
// GET /api/v1/ops/growth
// ============================================================================

export async function getOpsGrowth(_req: Request, res: Response): Promise<void> {
  if (!supabase) {
    sendError(res, 'SERVICE_UNAVAILABLE', 'Supabase not configured', 503);
    return;
  }

  try {
    const phase = await detectGrowthPhase(supabase);
    sendSuccess(res, phase);
  } catch (err) {
    logger.error(`[Ops] Growth phase error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Failed to detect growth phase', 500);
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function getSystemStatus() {
  const providers = checkProviderStatus();
  const concurrency = parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10);

  return {
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    node_version: process.version,
    providers: {
      ai: providers.ai,
      tts: providers.tts,
    },
    queue: {
      concurrency,
      redis_configured: !!process.env.REDIS_URL || !!process.env.REDIS_HOST,
    },
    plans: Object.keys(PLANS),
    cost_model: {
      provider_costs: PROVIDER_COST_PER_CALL,
      fixed_costs: FIXED_COSTS,
    },
  };
}

async function getCostAnalysis() {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<MonthlyUsageRow>('bookagent_monthly_usage', {});

    const userCosts = rows.map(row =>
      estimateUserMonthlyCost(
        row.user_id,
        (row.plan_tier as PlanTier) || 'basic',
        parseInt(row.jobs_count || '0', 10),
      ),
    );

    const totalRevenue = userCosts.reduce((s, u) => s + u.plan_revenue, 0);
    const totalCost = userCosts.reduce((s, u) => s + u.estimated_cost, 0);
    const totalMargin = totalRevenue - totalCost;
    const marginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;
    const unhealthyUsers = userCosts.filter(u => !u.healthy);

    return {
      summary: {
        total_users: userCosts.length,
        total_revenue_brl: totalRevenue,
        total_cost_brl: totalCost,
        total_margin_brl: totalMargin,
        margin_pct: marginPct,
        healthy: marginPct > 50,
        unhealthy_users_count: unhealthyUsers.length,
      },
      top_cost_users: userCosts
        .sort((a, b) => b.estimated_cost - a.estimated_cost)
        .slice(0, 10),
      unhealthy_users: unhealthyUsers.slice(0, 5),
    };
  } catch (err) {
    logger.warn(`[Ops] Cost analysis failed: ${err}`);
    return null;
  }
}
