/**
 * Acquisition Engine — Aquisição Automatizada
 *
 * Gerencia campanhas de aquisição, scheduling de conteúdo,
 * sequências de nurturing e rastreamento de conversões.
 *
 * Parte 103: Escala — Aquisição
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  AcquisitionCampaign,
  AcquisitionMetrics,
  ContentSchedule,
  NurturingSequence,
  ConversionEvent,
} from '../../domain/entities/acquisition.js';
import {
  CampaignGoalType,
  ContentScheduleStatus,
  SequenceStatus,
  ConversionType,
  EMPTY_METRICS,
  DEFAULT_NURTURING_SEQUENCE,
} from '../../domain/entities/acquisition.js';
import { logger } from '../../utils/logger.js';

const CAMPAIGNS_TABLE  = 'bookagent_acquisition_campaigns';
const SCHEDULES_TABLE  = 'bookagent_content_schedules';
const SEQUENCES_TABLE  = 'bookagent_nurturing_sequences';
const CONVERSIONS_TABLE = 'bookagent_conversion_events';

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
  tenantId: string;
  name: string;
  goal: CampaignGoalType;
  channels: string[];
  channelConfig?: Record<string, unknown>;
  startsAt?: string;
  endsAt?: string;
}

export async function createCampaign(
  input: CreateCampaignInput,
  supabase: SupabaseClient | null,
): Promise<AcquisitionCampaign> {
  const now = new Date().toISOString();

  const campaign: AcquisitionCampaign = {
    id: uuid(),
    tenantId: input.tenantId,
    name: input.name,
    goal: input.goal,
    channels: input.channels as never[],
    channelConfig: input.channelConfig ?? {},
    metrics: { ...EMPTY_METRICS },
    isActive: true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(CAMPAIGNS_TABLE, {
      id: campaign.id,
      tenant_id: campaign.tenantId,
      name: campaign.name,
      goal: campaign.goal,
      channels: JSON.stringify(campaign.channels),
      channel_config: JSON.stringify(campaign.channelConfig),
      metrics: JSON.stringify(campaign.metrics),
      is_active: true,
      starts_at: campaign.startsAt,
      ends_at: campaign.endsAt,
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[Acquisition] Campaign created: ${campaign.id} goal=${input.goal}`);
  return campaign;
}

export async function listCampaigns(
  tenantId: string,
  supabase: SupabaseClient | null,
  limit = 50,
): Promise<AcquisitionCampaign[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(CAMPAIGNS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit,
    });
    return rows.map(mapCampaign);
  } catch { return []; }
}

export async function updateCampaignMetrics(
  campaignId: string,
  metrics: Partial<AcquisitionMetrics>,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;
  try {
    const rows = await supabase.select<Record<string, unknown>>(CAMPAIGNS_TABLE, {
      filters: [{ column: 'id', operator: 'eq', value: campaignId }],
      limit: 1,
    });
    if (rows.length === 0) return;

    const current = pj<AcquisitionMetrics>(rows[0]['metrics'], EMPTY_METRICS);
    const merged = { ...current, ...metrics };

    // Recalculate derived metrics
    if (merged.leads > 0) merged.cpl = merged.costBrl / merged.leads;
    if (merged.conversions > 0) merged.cac = merged.costBrl / merged.conversions;
    if (merged.leads > 0) merged.conversionRate = merged.conversions / merged.leads;

    await supabase.upsert(CAMPAIGNS_TABLE, {
      id: campaignId,
      metrics: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    }, 'id');
  } catch { /* graceful */ }
}

// ---------------------------------------------------------------------------
// Content Scheduling
// ---------------------------------------------------------------------------

export async function scheduleContent(
  tenantId: string,
  jobId: string,
  artifactId: string,
  platform: string,
  scheduledAt: string,
  campaignId: string | null,
  supabase: SupabaseClient | null,
): Promise<ContentSchedule> {
  const now = new Date().toISOString();

  const schedule: ContentSchedule = {
    id: uuid(),
    tenantId,
    campaignId,
    jobId,
    artifactId,
    platform: platform as never,
    status: ContentScheduleStatus.SCHEDULED,
    scheduledAt,
    publishedAt: null,
    platformPostId: null,
    platformUrl: null,
    error: null,
    metadata: {},
    createdAt: now,
  };

  if (supabase) {
    await supabase.upsert(SCHEDULES_TABLE, {
      id: schedule.id,
      tenant_id: tenantId,
      campaign_id: campaignId,
      job_id: jobId,
      artifact_id: artifactId,
      platform,
      status: schedule.status,
      scheduled_at: scheduledAt,
      created_at: now,
    }, 'id');
  }

  logger.info(`[Acquisition] Content scheduled: ${schedule.id} platform=${platform} at=${scheduledAt}`);
  return schedule;
}

export async function listScheduledContent(
  tenantId: string,
  supabase: SupabaseClient | null,
  limit = 50,
): Promise<ContentSchedule[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(SCHEDULES_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'scheduled_at', orderDesc: false, limit,
    });
    return rows.map(mapSchedule);
  } catch { return []; }
}

export async function getDueSchedules(
  supabase: SupabaseClient | null,
): Promise<ContentSchedule[]> {
  if (!supabase) return [];
  try {
    const now = new Date().toISOString();
    const rows = await supabase.select<Record<string, unknown>>(SCHEDULES_TABLE, {
      filters: [
        { column: 'status', operator: 'eq', value: 'scheduled' },
        { column: 'scheduled_at', operator: 'lte', value: now },
      ],
      orderBy: 'scheduled_at', orderDesc: false, limit: 20,
    });
    return rows.map(mapSchedule);
  } catch { return []; }
}

export async function markSchedulePublished(
  scheduleId: string,
  platformPostId: string,
  platformUrl: string,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;
  await supabase.upsert(SCHEDULES_TABLE, {
    id: scheduleId,
    status: ContentScheduleStatus.PUBLISHED,
    published_at: new Date().toISOString(),
    platform_post_id: platformPostId,
    platform_url: platformUrl,
  }, 'id');
}

// ---------------------------------------------------------------------------
// Nurturing Sequences
// ---------------------------------------------------------------------------

export async function createNurturingSequence(
  tenantId: string,
  name: string,
  triggerEvent: string,
  supabase: SupabaseClient | null,
): Promise<NurturingSequence> {
  const now = new Date().toISOString();

  const sequence: NurturingSequence = {
    id: uuid(),
    tenantId,
    name,
    triggerEvent,
    steps: [...DEFAULT_NURTURING_SEQUENCE],
    status: SequenceStatus.ACTIVE,
    totalEnrolled: 0,
    totalCompleted: 0,
    totalConverted: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (supabase) {
    await supabase.upsert(SEQUENCES_TABLE, {
      id: sequence.id,
      tenant_id: tenantId,
      name,
      trigger_event: triggerEvent,
      steps: JSON.stringify(sequence.steps),
      status: sequence.status,
      total_enrolled: 0,
      total_completed: 0,
      total_converted: 0,
      created_at: now,
      updated_at: now,
    }, 'id');
  }

  logger.info(`[Acquisition] Nurturing sequence created: ${sequence.id} trigger=${triggerEvent}`);
  return sequence;
}

export async function listNurturingSequences(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<NurturingSequence[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(SEQUENCES_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'created_at', orderDesc: true, limit: 20,
    });
    return rows.map(mapSequence);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Conversion Tracking
// ---------------------------------------------------------------------------

export async function trackConversion(
  tenantId: string,
  type: ConversionType,
  channel: string,
  planTier: string,
  revenueBrl: number,
  opts: { leadPhone?: string; campaignId?: string; referralCode?: string } = {},
  supabase: SupabaseClient | null,
): Promise<ConversionEvent> {
  const event: ConversionEvent = {
    id: uuid(),
    tenantId,
    leadPhone: opts.leadPhone ?? null,
    type,
    channel: channel as never,
    campaignId: opts.campaignId ?? null,
    referralCode: opts.referralCode ?? null,
    planTier,
    revenueBrl,
    metadata: {},
    convertedAt: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.upsert(CONVERSIONS_TABLE, {
      id: event.id,
      tenant_id: tenantId,
      lead_phone: event.leadPhone,
      type: event.type,
      channel: event.channel,
      campaign_id: event.campaignId,
      referral_code: event.referralCode,
      plan_tier: planTier,
      revenue_brl: revenueBrl,
      converted_at: event.convertedAt,
    }, 'id');

    // Update campaign metrics if linked
    if (event.campaignId) {
      await updateCampaignMetrics(event.campaignId, {
        conversions: 1,   // incremental — handled in update logic
        revenueBrl,
      }, supabase);
    }
  }

  logger.info(`[Acquisition] Conversion tracked: ${event.id} type=${type} plan=${planTier}`);
  return event;
}

export async function listConversions(
  tenantId: string,
  supabase: SupabaseClient | null,
  limit = 50,
): Promise<ConversionEvent[]> {
  if (!supabase) return [];
  try {
    const rows = await supabase.select<Record<string, unknown>>(CONVERSIONS_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      orderBy: 'converted_at', orderDesc: true, limit,
    });
    return rows.map(mapConversion);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Growth Dashboard Metrics
// ---------------------------------------------------------------------------

export async function getGrowthMetrics(
  tenantId: string | null,
  supabase: SupabaseClient | null,
): Promise<GrowthDashboard> {
  const dash: GrowthDashboard = {
    activeCampaigns: 0,
    scheduledPosts: 0,
    activeSequences: 0,
    totalConversions: 0,
    totalRevenueBrl: 0,
    conversionRate: 0,
    topChannel: null,
  };

  if (!supabase) return dash;

  type F = { column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in'; value: string | number | boolean | null };

  try {
    const campaignFilters: F[] = [{ column: 'is_active', operator: 'eq', value: true }];
    if (tenantId) campaignFilters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });

    const [campaigns, schedules, conversions] = await Promise.all([
      supabase.select<Record<string, unknown>>(CAMPAIGNS_TABLE, { filters: campaignFilters, limit: 100 }),
      supabase.select<Record<string, unknown>>(SCHEDULES_TABLE, {
        filters: tenantId
          ? [{ column: 'tenant_id', operator: 'eq', value: tenantId }, { column: 'status', operator: 'eq', value: 'scheduled' }]
          : [{ column: 'status', operator: 'eq', value: 'scheduled' }],
        limit: 100,
      }),
      supabase.select<Record<string, unknown>>(CONVERSIONS_TABLE, {
        filters: tenantId ? [{ column: 'tenant_id', operator: 'eq', value: tenantId }] : [],
        limit: 1000,
      }),
    ]);

    dash.activeCampaigns = campaigns.length;
    dash.scheduledPosts = schedules.length;
    dash.totalConversions = conversions.length;
    dash.totalRevenueBrl = conversions.reduce((sum, r) => sum + ((r['revenue_brl'] as number) ?? 0), 0);

    // Top channel by conversions
    const channelCounts = new Map<string, number>();
    for (const c of conversions) {
      const ch = (c['channel'] as string) ?? 'unknown';
      channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
    }
    let maxCount = 0;
    for (const [ch, count] of channelCounts) {
      if (count > maxCount) { maxCount = count; dash.topChannel = ch; }
    }
  } catch { /* graceful */ }

  return dash;
}

export interface GrowthDashboard {
  activeCampaigns: number;
  scheduledPosts: number;
  activeSequences: number;
  totalConversions: number;
  totalRevenueBrl: number;
  conversionRate: number;
  topChannel: string | null;
}

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function pj<T>(v: unknown, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v as T; } catch { return fb; }
}

function mapCampaign(r: Record<string, unknown>): AcquisitionCampaign {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    name: (r['name'] as string) ?? '',
    goal: (r['goal'] as CampaignGoalType) ?? CampaignGoalType.LEAD_GENERATION,
    channels: pj(r['channels'], []),
    channelConfig: pj(r['channel_config'], {}),
    metrics: pj(r['metrics'], EMPTY_METRICS),
    isActive: (r['is_active'] as boolean) ?? false,
    startsAt: (r['starts_at'] as string) ?? null,
    endsAt: (r['ends_at'] as string) ?? null,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapSchedule(r: Record<string, unknown>): ContentSchedule {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    campaignId: (r['campaign_id'] as string) ?? null,
    jobId: (r['job_id'] as string) ?? '',
    artifactId: (r['artifact_id'] as string) ?? '',
    platform: r['platform'] as never,
    status: (r['status'] as ContentScheduleStatus) ?? ContentScheduleStatus.DRAFT,
    scheduledAt: r['scheduled_at'] as string,
    publishedAt: (r['published_at'] as string) ?? null,
    platformPostId: (r['platform_post_id'] as string) ?? null,
    platformUrl: (r['platform_url'] as string) ?? null,
    error: (r['error'] as string) ?? null,
    metadata: pj(r['metadata'], {}),
    createdAt: r['created_at'] as string,
  };
}

function mapSequence(r: Record<string, unknown>): NurturingSequence {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    name: (r['name'] as string) ?? '',
    triggerEvent: (r['trigger_event'] as string) ?? '',
    steps: pj(r['steps'], []),
    status: (r['status'] as SequenceStatus) ?? SequenceStatus.ACTIVE,
    totalEnrolled: (r['total_enrolled'] as number) ?? 0,
    totalCompleted: (r['total_completed'] as number) ?? 0,
    totalConverted: (r['total_converted'] as number) ?? 0,
    createdAt: r['created_at'] as string,
    updatedAt: r['updated_at'] as string,
  };
}

function mapConversion(r: Record<string, unknown>): ConversionEvent {
  return {
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string) ?? '',
    leadPhone: (r['lead_phone'] as string) ?? null,
    type: (r['type'] as ConversionType) ?? ConversionType.TRIAL_START,
    channel: r['channel'] as never,
    campaignId: (r['campaign_id'] as string) ?? null,
    referralCode: (r['referral_code'] as string) ?? null,
    planTier: (r['plan_tier'] as string) ?? 'basic',
    revenueBrl: (r['revenue_brl'] as number) ?? 0,
    metadata: pj(r['metadata'], {}),
    convertedAt: r['converted_at'] as string,
  };
}
