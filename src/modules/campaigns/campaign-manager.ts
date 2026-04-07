/**
 * Campaign Manager — Content Campaign Orchestration
 *
 * Gerencia o ciclo de vida de campanhas:
 *   - Persistência (create, read, update)
 *   - Transições de status (DRAFT → PLANNED → READY → IN_PROGRESS → ...)
 *   - Vinculação de outputs (linkOutput)
 *   - Atualização de progresso (recalculateProgress)
 *
 * Persistência: bookagent_campaigns (Supabase)
 *
 * Parte 85: Content Campaign Orchestration
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  ContentCampaign,
  CampaignItem,
  CampaignOutputLink,
} from '../../domain/entities/campaign.js';
import {
  CampaignStatus,
  CampaignItemStatus,
} from '../../domain/entities/campaign.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_campaigns';

/**
 * Persists a campaign to Supabase.
 */
export async function saveCampaign(
  campaign: ContentCampaign,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    id: campaign.id,
    tenant_id: campaign.tenantId,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    blueprint: campaign.blueprint,
    items: campaign.items,
    job_ids: campaign.jobIds,
    strategy_snapshot_id: campaign.strategySnapshotId ?? null,
    planned_duration_days: campaign.plannedDurationDays,
    progress_percent: campaign.progressPercent,
    counts: campaign.counts,
    planned_start_at: campaign.plannedStartAt?.toISOString() ?? null,
    completed_at: campaign.completedAt?.toISOString() ?? null,
    created_at: campaign.createdAt.toISOString(),
    updated_at: campaign.updatedAt.toISOString(),
  });
}

/**
 * Lists campaigns for a tenant.
 */
export async function listCampaigns(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<ContentCampaign[]> {
  if (!supabase) return [];

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
    orderBy: 'created_at',
    orderDesc: true,
  });

  return rows.map(mapRowToCampaign);
}

/**
 * Gets a single campaign by ID (tenant-scoped).
 */
export async function getCampaign(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<ContentCampaign | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    limit: 1,
  });

  if (rows.length === 0) return null;
  return mapRowToCampaign(rows[0]!);
}

// ---------------------------------------------------------------------------
// Status Transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.PLANNED, CampaignStatus.ARCHIVED],
  [CampaignStatus.PLANNED]: [CampaignStatus.AWAITING_APPROVAL, CampaignStatus.READY, CampaignStatus.ARCHIVED],
  [CampaignStatus.AWAITING_APPROVAL]: [CampaignStatus.READY, CampaignStatus.DRAFT, CampaignStatus.ARCHIVED],
  [CampaignStatus.READY]: [CampaignStatus.IN_PROGRESS, CampaignStatus.ARCHIVED],
  [CampaignStatus.IN_PROGRESS]: [CampaignStatus.PARTIALLY_PUBLISHED, CampaignStatus.COMPLETED, CampaignStatus.FAILED],
  [CampaignStatus.PARTIALLY_PUBLISHED]: [CampaignStatus.COMPLETED, CampaignStatus.FAILED],
  [CampaignStatus.COMPLETED]: [CampaignStatus.ARCHIVED],
  [CampaignStatus.FAILED]: [CampaignStatus.DRAFT, CampaignStatus.ARCHIVED],
  [CampaignStatus.ARCHIVED]: [],
};

/**
 * Transitions a campaign to a new status (validates transition).
 */
export function transitionStatus(
  campaign: ContentCampaign,
  newStatus: CampaignStatus,
): boolean {
  const allowed = VALID_TRANSITIONS[campaign.status];
  if (!allowed.includes(newStatus)) {
    logger.warn(
      `[CampaignManager] Invalid transition ${campaign.status} → ${newStatus} ` +
      `for campaign=${campaign.id}`,
    );
    return false;
  }

  campaign.status = newStatus;
  campaign.updatedAt = new Date();

  if (newStatus === CampaignStatus.COMPLETED) {
    campaign.completedAt = new Date();
  }

  return true;
}

// ---------------------------------------------------------------------------
// Item Management
// ---------------------------------------------------------------------------

/**
 * Links an output to a campaign item.
 */
export function linkOutput(
  campaign: ContentCampaign,
  itemId: string,
  link: CampaignOutputLink,
): boolean {
  const item = campaign.items.find((i) => i.id === itemId);
  if (!item) return false;

  item.outputLink = link;
  item.status = CampaignItemStatus.PENDING_OUTPUT;
  campaign.updatedAt = new Date();

  if (link.outputId) {
    item.status = CampaignItemStatus.APPROVED;
  }

  return true;
}

/**
 * Updates a campaign item status.
 */
export function updateItemStatus(
  campaign: ContentCampaign,
  itemId: string,
  newStatus: CampaignItemStatus,
): boolean {
  const item = campaign.items.find((i) => i.id === itemId);
  if (!item) return false;

  item.status = newStatus;
  campaign.updatedAt = new Date();

  recalculateProgress(campaign);
  return true;
}

/**
 * Recalculates campaign progress and counts from item statuses.
 */
export function recalculateProgress(campaign: ContentCampaign): void {
  const total = campaign.items.length;
  if (total === 0) {
    campaign.progressPercent = 0;
    campaign.counts = { total: 0, published: 0, approved: 0, pending: 0, failed: 0 };
    return;
  }

  let published = 0;
  let approved = 0;
  let pending = 0;
  let failed = 0;

  for (const item of campaign.items) {
    switch (item.status) {
      case CampaignItemStatus.PUBLISHED:
        published++;
        break;
      case CampaignItemStatus.APPROVED:
      case CampaignItemStatus.SCHEDULED:
        approved++;
        break;
      case CampaignItemStatus.FAILED:
        failed++;
        break;
      case CampaignItemStatus.SKIPPED:
        break;
      default:
        pending++;
    }
  }

  campaign.counts = { total, published, approved, pending, failed };
  campaign.progressPercent = Math.round(((published + approved) / total) * 100);

  // Auto-transition based on progress
  if (published === total) {
    transitionStatus(campaign, CampaignStatus.COMPLETED);
  } else if (published > 0 && campaign.status === CampaignStatus.IN_PROGRESS) {
    transitionStatus(campaign, CampaignStatus.PARTIALLY_PUBLISHED);
  } else if (failed > 0 && pending === 0 && published === 0) {
    transitionStatus(campaign, CampaignStatus.FAILED);
  }
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToCampaign(row: Record<string, unknown>): ContentCampaign {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    name: row['name'] as string,
    objective: row['objective'] as ContentCampaign['objective'],
    status: row['status'] as ContentCampaign['status'],
    blueprint: row['blueprint'] as ContentCampaign['blueprint'],
    items: (row['items'] ?? []) as CampaignItem[],
    jobIds: (row['job_ids'] ?? []) as string[],
    strategySnapshotId: (row['strategy_snapshot_id'] as string) ?? undefined,
    plannedDurationDays: row['planned_duration_days'] as number,
    progressPercent: row['progress_percent'] as number,
    counts: row['counts'] as ContentCampaign['counts'],
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
    plannedStartAt: row['planned_start_at'] ? new Date(row['planned_start_at'] as string) : undefined,
    completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
  };
}
