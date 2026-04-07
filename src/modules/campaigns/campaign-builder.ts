/**
 * Campaign Builder — Content Campaign Orchestration
 *
 * Transforma uma StrategyProfile em CampaignBlueprint e ContentCampaign.
 *
 * Fluxo:
 *   StrategyProfile → CampaignBlueprint → ContentCampaign (com CampaignItems)
 *
 * Regras de geração:
 *   - Cada recommendation da strategy gera um ou mais CampaignItems
 *   - O role de cada item é derivado do objetivo da recommendation
 *   - O schedule hint distribui itens ao longo da duração planejada
 *   - O blueprint preserva o plano abstrato antes de vincular outputs
 *
 * Parte 85: Content Campaign Orchestration
 */

import { v4 as uuid } from 'uuid';

import type {
  ContentCampaign,
  CampaignBlueprint,
  CampaignItem,
  CampaignScheduleHint,
} from '../../domain/entities/campaign.js';
import {
  CampaignStatus,
  CampaignItemRole,
  CampaignItemStatus,
  CampaignObjective,
} from '../../domain/entities/campaign.js';
import type { StrategyProfile, TenantStrategySnapshot } from '../../domain/entities/strategy.js';
import { StrategyObjective, StrategyPriority } from '../../domain/entities/strategy.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Objective mapping
// ---------------------------------------------------------------------------

/** Maps StrategyObjective → CampaignObjective */
const OBJECTIVE_MAP: Record<StrategyObjective, CampaignObjective> = {
  [StrategyObjective.AWARENESS]: CampaignObjective.AWARENESS,
  [StrategyObjective.ENGAGEMENT]: CampaignObjective.ENGAGEMENT,
  [StrategyObjective.CONVERSION]: CampaignObjective.CONVERSION,
  [StrategyObjective.NURTURE]: CampaignObjective.NURTURE,
  [StrategyObjective.SOCIAL_PROOF]: CampaignObjective.SOCIAL_PROOF,
  [StrategyObjective.LAUNCH]: CampaignObjective.LAUNCH,
};

/** Maps StrategyObjective + priority → CampaignItemRole */
function resolveItemRole(
  objective: StrategyObjective,
  priority: StrategyPriority,
): CampaignItemRole {
  if (priority === StrategyPriority.PRIMARY) {
    return CampaignItemRole.HERO;
  }

  switch (objective) {
    case StrategyObjective.AWARENESS:
      return CampaignItemRole.TEASER;
    case StrategyObjective.SOCIAL_PROOF:
      return CampaignItemRole.SOCIAL_PROOF;
    case StrategyObjective.CONVERSION:
      return CampaignItemRole.LANDING;
    case StrategyObjective.LAUNCH:
      return CampaignItemRole.FOLLOW_UP;
    default:
      return CampaignItemRole.SUPPORTING;
  }
}

// ---------------------------------------------------------------------------
// Build Blueprint from Strategy
// ---------------------------------------------------------------------------

/**
 * Builds an abstract CampaignBlueprint from a StrategyProfile.
 */
export function buildBlueprint(strategy: StrategyProfile): CampaignBlueprint {
  const objective = OBJECTIVE_MAP[strategy.primaryObjective];
  const recs = strategy.recommendations;

  // Planned items from recommendations
  const plannedItems: CampaignBlueprint['plannedItems'] = [];
  let dayOffset = 0;

  for (const rec of recs) {
    const role = resolveItemRole(rec.objective, rec.priority);
    const suggested = strategy.mix.suggestedTemplates.find(
      (t) => t.format === rec.suggestedFormat,
    );

    plannedItems.push({
      role,
      format: rec.suggestedFormat,
      channel: rec.suggestedChannel,
      description: rec.description,
      dayOffset,
      templateId: suggested?.templateId,
      styleId: suggested?.styleId,
    });

    // Primary items on day 0, secondary on day 2, tertiary on day 4+
    if (rec.priority === StrategyPriority.PRIMARY) {
      dayOffset += 1;
    } else if (rec.priority === StrategyPriority.SECONDARY) {
      dayOffset += 2;
    } else {
      dayOffset += 3;
    }
  }

  // Duration based on format distribution spread
  const durationDays = Math.max(7, dayOffset + 2);

  return {
    objective,
    strategyDescription: strategy.rationale.objectiveReason,
    plannedItems,
    durationDays,
    recommendedPreset: strategy.mix.recommendedPreset,
  };
}

// ---------------------------------------------------------------------------
// Build Campaign from Blueprint
// ---------------------------------------------------------------------------

/**
 * Creates a ContentCampaign with CampaignItems from a Blueprint.
 */
export function buildCampaign(
  tenantId: string,
  name: string,
  blueprint: CampaignBlueprint,
): ContentCampaign {
  const campaignId = uuid();
  const now = new Date();

  // Generate items from planned items
  const items: CampaignItem[] = blueprint.plannedItems.map((planned, idx) => {
    const scheduleHint: CampaignScheduleHint = {
      dayOffset: planned.dayOffset,
      orderInDay: 0,
      suggestedTime: planned.dayOffset === 0 ? '10:00' : '18:00',
    };

    return {
      id: uuid(),
      role: planned.role,
      status: CampaignItemStatus.DRAFT,
      order: idx,
      title: `${planned.format} — ${planned.channel}`,
      description: planned.description,
      format: planned.format,
      channel: planned.channel,
      templateId: planned.templateId,
      styleId: planned.styleId,
      scheduleHint,
      dependsOn: idx === 0 ? [] : [/* first hero must publish before supporting */],
    };
  });

  // Set dependencies: non-hero items depend on the first hero
  const heroId = items.find((i) => i.role === CampaignItemRole.HERO)?.id;
  if (heroId) {
    for (const item of items) {
      if (item.role !== CampaignItemRole.HERO && item.dependsOn.length === 0) {
        item.dependsOn = [heroId];
      }
    }
  }

  const campaign: ContentCampaign = {
    id: campaignId,
    tenantId,
    name,
    objective: blueprint.objective,
    status: CampaignStatus.DRAFT,
    blueprint,
    items,
    jobIds: [],
    plannedDurationDays: blueprint.durationDays,
    progressPercent: 0,
    counts: {
      total: items.length,
      published: 0,
      approved: 0,
      pending: items.length,
      failed: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  logger.info(
    `[CampaignBuilder] Built campaign "${name}" (${campaignId}) ` +
    `for tenant=${tenantId}: ${items.length} items, ` +
    `duration=${blueprint.durationDays}d, objective=${blueprint.objective}`,
  );

  return campaign;
}

// ---------------------------------------------------------------------------
// Build Campaign from Strategy Snapshot (convenience)
// ---------------------------------------------------------------------------

/**
 * Full flow: StrategySnapshot → Blueprint → Campaign
 */
export function buildCampaignFromStrategy(
  snapshot: TenantStrategySnapshot,
  campaignName?: string,
): ContentCampaign {
  const blueprint = buildBlueprint(snapshot.strategy);
  const name = campaignName ?? `Campanha ${snapshot.strategy.primaryObjective} — ${new Date().toISOString().slice(0, 10)}`;
  return buildCampaign(snapshot.tenantId, name, blueprint);
}
