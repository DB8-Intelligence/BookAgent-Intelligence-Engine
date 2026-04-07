/**
 * Memory Profiler — Memory & Longitudinal Tenant Intelligence
 *
 * Gera LongitudinalTenantProfile a partir dos patterns consolidados
 * na TenantMemory. O profile é composto por 6 sub-perfis que dão
 * uma visão 360° do tenant.
 *
 * Parte 90: Memory & Longitudinal Tenant Intelligence
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  TenantMemory,
  MemoryPattern,
  LongitudinalTenantProfile,
  EditorialProfile,
  OperationalProfile,
  PublicationProfile,
  ApprovalProfile,
  GrowthProfile,
  CostProfile,
  MemorySnapshot,
} from '../../domain/entities/tenant-memory.js';
import {
  MemoryCategory,
  PatternStatus,
} from '../../domain/entities/tenant-memory.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { loadTenantMemory, saveTenantMemory } from './memory-consolidator.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Profile Generation
// ---------------------------------------------------------------------------

/**
 * Generates a LongitudinalTenantProfile from memory patterns.
 */
export function generateProfile(
  memory: TenantMemory,
  tenantCtx: TenantContext,
): LongitudinalTenantProfile {
  const patterns = memory.patterns.filter(
    (p) => p.status !== PatternStatus.OBSOLETE,
  );

  const editorial = buildEditorialProfile(patterns);
  const operational = buildOperationalProfile(patterns);
  const publication = buildPublicationProfile(patterns);
  const approval = buildApprovalProfile(patterns);
  const growth = buildGrowthProfile(patterns, tenantCtx);
  const cost = buildCostProfile(patterns);

  // Pattern counts by category
  const patternsByCategory = {} as Record<MemoryCategory, number>;
  for (const cat of Object.values(MemoryCategory)) {
    patternsByCategory[cat] = patterns.filter((p) => p.category === cat).length;
  }

  return {
    tenantId: memory.tenantId,
    editorial,
    operational,
    publication,
    approval,
    growth,
    cost,
    totalPatterns: patterns.length,
    patternsByCategory,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Sub-profile Builders
// ---------------------------------------------------------------------------

function buildEditorialProfile(patterns: MemoryPattern[]): EditorialProfile {
  const contentPatterns = patterns.filter((p) => p.category === MemoryCategory.CONTENT_STYLE);

  const formatPattern = findPattern(contentPatterns, 'preferred_format');
  const presetPattern = findPattern(contentPatterns, 'preferred_preset');
  const stylePattern = findPattern(contentPatterns, 'preferred_style');
  const tonePattern = findPattern(contentPatterns, 'preferred_tone');
  const qualityPattern = findPattern(patterns, 'avg_quality_score');

  return {
    preferredFormats: formatPattern
      ? [{ format: formatPattern.value, weight: formatPattern.confidence / 100 }]
      : [],
    preferredPreset: presetPattern?.value ?? null,
    preferredStyle: stylePattern?.value ?? null,
    preferredTone: tonePattern?.value ?? null,
    avgQualityScore: qualityPattern ? parseFloat(qualityPattern.value) || null : null,
    qualityTrend: deriveTrend(qualityPattern),
  };
}

function buildOperationalProfile(patterns: MemoryPattern[]): OperationalProfile {
  const opPatterns = patterns.filter((p) => p.category === MemoryCategory.OPERATIONAL_MATURITY);

  const jobsPattern = findPattern(opPatterns, 'avg_jobs_per_period');
  const successPattern = findPattern(opPatterns, 'job_success_rate');
  const campaignSizePattern = findPattern(patterns, 'avg_campaign_size');

  const totalJobs = jobsPattern ? parseInt(jobsPattern.value, 10) || 0 : 0;
  const successRate = successPattern ? parseFloat(successPattern.value) || 0 : 0;
  const failureRate = 100 - successRate;

  // Maturity score: based on volume + success + stability
  const volumeScore = Math.min(40, totalJobs * 2);
  const successScore = Math.min(30, successRate * 0.3);
  const stabilityScore = opPatterns.filter((p) => p.status === PatternStatus.STABLE).length * 10;
  const maturityScore = Math.min(100, volumeScore + successScore + stabilityScore);

  return {
    avgJobsPerMonth: totalJobs,
    avgCampaignSize: campaignSizePattern ? parseInt(campaignSizePattern.value, 10) || 4 : 4,
    avgTurnaroundDays: 3,
    failureRate,
    autonomyLevel: null,
    maturityScore,
    maturityTrend: deriveTrend(successPattern),
  };
}

function buildPublicationProfile(patterns: MemoryPattern[]): PublicationProfile {
  const pubPatterns = patterns.filter((p) => p.category === MemoryCategory.PUBLICATION);
  const channelPatterns = patterns.filter((p) => p.category === MemoryCategory.CHANNEL);

  const channelPattern = findPattern(channelPatterns, 'preferred_channel');
  const successPattern = findPattern(pubPatterns, 'publish_success_rate');
  const volumePattern = findPattern(pubPatterns, 'avg_publications_per_period');
  const autoPublishPattern = findPattern(pubPatterns, 'uses_auto_publish');

  return {
    preferredChannels: channelPattern
      ? [{ channel: channelPattern.value, weight: channelPattern.confidence / 100 }]
      : [{ channel: 'instagram', weight: 0.5 }],
    preferredTimes: [],
    avgPublicationsPerWeek: volumePattern ? Math.round(parseInt(volumePattern.value, 10) / 4) || 1 : 1,
    publishSuccessRate: successPattern ? parseFloat(successPattern.value) || 0 : 0,
    usesAutoPublish: autoPublishPattern?.value === 'true',
  };
}

function buildApprovalProfile(patterns: MemoryPattern[]): ApprovalProfile {
  const approvalPatterns = patterns.filter((p) => p.category === MemoryCategory.APPROVAL);

  const timePattern = findPattern(approvalPatterns, 'avg_approval_time');
  const ratePattern = findPattern(approvalPatterns, 'approval_rate');
  const revisionPattern = findPattern(approvalPatterns, 'revision_rate');
  const overridePattern = findPattern(approvalPatterns, 'override_frequency');

  return {
    avgApprovalTimeHours: timePattern ? parseFloat(timePattern.value) || 24 : 24,
    approvalRate: ratePattern ? parseFloat(ratePattern.value) || 80 : 80,
    revisionRate: revisionPattern ? parseFloat(revisionPattern.value) || 10 : 10,
    usesGovernanceCheckpoints: false,
    overrideFrequency: overridePattern ? parseFloat(overridePattern.value) || 0 : 0,
  };
}

function buildGrowthProfile(patterns: MemoryPattern[], tenantCtx: TenantContext): GrowthProfile {
  const planPattern = findPattern(patterns, 'current_plan');
  const jobsPattern = findPattern(patterns, 'avg_jobs_per_period');
  const totalJobs = jobsPattern ? parseInt(jobsPattern.value, 10) || 0 : 0;

  // Determine growth phase
  let growthPhase: GrowthProfile['growthPhase'] = 'onboarding';
  if (totalJobs > 50) growthPhase = 'power_user';
  else if (totalJobs > 20) growthPhase = 'established';
  else if (totalJobs > 5) growthPhase = 'growing';

  return {
    currentPlan: tenantCtx.planTier,
    planHistory: [{ plan: tenantCtx.planTier, since: new Date().toISOString() }],
    monthsActive: 1,
    totalJobs,
    totalCampaigns: 0,
    growthPhase,
  };
}

function buildCostProfile(patterns: MemoryPattern[]): CostProfile {
  const costPatterns = patterns.filter((p) => p.category === MemoryCategory.COST_EFFICIENCY);

  const costPerJobPattern = findPattern(costPatterns, 'avg_cost_per_job');
  const costTrendPattern = findPattern(costPatterns, 'cost_trend');

  return {
    avgCostPerJob: costPerJobPattern ? parseFloat(costPerJobPattern.value) || 0 : 0,
    avgCostPerCampaign: 0,
    costTrend: (costTrendPattern?.value as CostProfile['costTrend']) ?? null,
    costSensitivity: 'medium',
    budgetUtilization: 50,
  };
}

// ---------------------------------------------------------------------------
// Full Pipeline: Consolidate + Profile
// ---------------------------------------------------------------------------

/**
 * Generates a full profile and persists it into the tenant memory.
 */
export async function generateAndSaveProfile(
  memory: TenantMemory,
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<LongitudinalTenantProfile> {
  const profile = generateProfile(memory, tenantCtx);

  memory.latestProfile = profile;
  memory.updatedAt = new Date().toISOString();
  await saveTenantMemory(memory, supabase);

  logger.info(
    `[MemoryProfiler] Generated profile for tenant=${tenantCtx.tenantId}: ` +
    `patterns=${profile.totalPatterns} growth=${profile.growth.growthPhase} ` +
    `maturity=${profile.operational.maturityScore}`,
  );

  return profile;
}

/**
 * Creates a snapshot of current memory state.
 */
export function createSnapshot(memory: TenantMemory, profile: LongitudinalTenantProfile): MemorySnapshot {
  const activePatterns = memory.patterns.filter(
    (p) => p.status !== PatternStatus.OBSOLETE,
  );

  const stableCount = activePatterns.filter((p) => p.status === PatternStatus.STABLE).length;
  const emergingCount = activePatterns.filter((p) => p.status === PatternStatus.EMERGING).length;

  return {
    id: uuid(),
    tenantId: memory.tenantId,
    patterns: activePatterns,
    profile,
    summary: `${activePatterns.length} patterns ativos (${stableCount} estáveis, ${emergingCount} emergentes). ` +
      `Maturidade: ${profile.operational.maturityScore}/100. Fase: ${profile.growth.growthPhase}.`,
    snapshotAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPattern(patterns: MemoryPattern[], key: string): MemoryPattern | undefined {
  return patterns.find((p) => p.key === key);
}

function deriveTrend(pattern: MemoryPattern | undefined): 'improving' | 'stable' | 'declining' | null {
  if (!pattern) return null;
  if (pattern.status === PatternStatus.DECLINING) return 'declining';
  if (pattern.status === PatternStatus.STABLE) return 'stable';
  if (pattern.confirmationCount > pattern.contradictionCount * 2) return 'improving';
  return 'stable';
}
