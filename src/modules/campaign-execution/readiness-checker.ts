/**
 * Readiness Checker — Autonomous Campaign Execution
 *
 * Avalia a prontidão de cada schedule item para execução autônoma.
 * Cada check é independente e produz um resultado booleano.
 *
 * Checks realizados:
 *   1. scheduleReached    — janela de execução alcançada
 *   2. dependenciesSatisfied — dependências do schedule satisfeitas
 *   3. approvalOk         — aprovação ok (ou não requerida)
 *   4. artifactReady      — output vinculado ao campaign item
 *   5. billingOk          — limites de billing/plano ok
 *   6. featureFlagsOk     — features do plano habilitadas
 *   7. autoPublishAvailable — auto publish disponível (se requerido)
 *   8. noBlockingFailure  — sem falha anterior não resolvida
 *   9. campaignActive     — campanha e schedule ativos
 *
 * Parte 87: Autonomous Campaign Execution
 */

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type { ExecutionReadinessCheck, ExecutionBlockReason } from '../../domain/entities/campaign-execution.js';
import { BlockReasonType } from '../../domain/entities/campaign-execution.js';
import type { CampaignSchedule, ScheduleItem } from '../../domain/entities/schedule.js';
import { ScheduleItemStatus, CampaignScheduleStatus } from '../../domain/entities/schedule.js';
import type { ContentCampaign, CampaignItem } from '../../domain/entities/campaign.js';
import { CampaignStatus, CampaignItemStatus } from '../../domain/entities/campaign.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { UsageEventType, LimitCheckResult } from '../../domain/entities/billing.js';
import { checkUsageLimit } from '../billing/index.js';
import { GovernanceGateType } from '../../domain/entities/governance.js';
import { evaluateAndGate } from '../governance/index.js';

// ---------------------------------------------------------------------------
// Main Check
// ---------------------------------------------------------------------------

/**
 * Evaluates full readiness for a single schedule item.
 */
export async function checkReadiness(
  scheduleItem: ScheduleItem,
  campaignItem: CampaignItem,
  schedule: CampaignSchedule,
  campaign: ContentCampaign,
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<ExecutionReadinessCheck> {
  const blockReasons: ExecutionBlockReason[] = [];
  const now = new Date();

  // 1. Schedule reached
  const scheduleReached = now >= new Date(scheduleItem.window.earliestAt);
  if (!scheduleReached) {
    blockReasons.push({
      type: BlockReasonType.SCHEDULE_NOT_REACHED,
      description: `Janela de execução inicia em ${scheduleItem.window.earliestAt}`,
      suggestedAction: 'Aguardar até a janela de execução',
      autoResolvable: true,
    });
  }

  // 2. Dependencies satisfied
  const dependenciesSatisfied = checkDependencies(scheduleItem, schedule);
  if (!dependenciesSatisfied) {
    blockReasons.push({
      type: BlockReasonType.DEPENDENCY_PENDING,
      description: `${scheduleItem.dependencies.length} dependência(s) pendente(s)`,
      suggestedAction: 'Aguardar execução dos itens anteriores',
      autoResolvable: true,
    });
  }

  // 3. Approval ok
  const approvalOk = checkApproval(scheduleItem, campaignItem);
  if (!approvalOk) {
    const rejected = campaignItem.status === CampaignItemStatus.FAILED;
    blockReasons.push({
      type: rejected ? BlockReasonType.APPROVAL_REJECTED : BlockReasonType.APPROVAL_PENDING,
      description: rejected
        ? 'Item teve aprovação rejeitada'
        : 'Item aguardando aprovação',
      suggestedAction: rejected
        ? 'Revisar e resubmeter o conteúdo'
        : 'Aprovar o conteúdo no painel de revisão',
      autoResolvable: false,
    });
  }

  // 4. Artifact ready
  const artifactReady = campaignItem.outputLink !== undefined && campaignItem.outputLink.outputId !== '';
  if (!artifactReady) {
    blockReasons.push({
      type: BlockReasonType.ARTIFACT_NOT_READY,
      description: 'Output/artifact ainda não vinculado ao item',
      suggestedAction: 'Gerar output via pipeline ou vincular manualmente',
      autoResolvable: false,
    });
  }

  // 5. Billing ok
  const billingOk = await checkBilling(tenantCtx, supabase);
  if (!billingOk) {
    blockReasons.push({
      type: BlockReasonType.BILLING_LIMIT_REACHED,
      description: 'Limite de publicações do plano atingido',
      suggestedAction: 'Fazer upgrade do plano ou aguardar próximo ciclo',
      autoResolvable: false,
    });
  }

  // 6. Feature flags ok
  const featureFlagsOk = checkFeatureFlags(tenantCtx);
  if (!featureFlagsOk) {
    blockReasons.push({
      type: BlockReasonType.FEATURE_DISABLED,
      description: 'Feature de publicação automática não disponível no plano',
      suggestedAction: 'Fazer upgrade para plano Pro ou Business',
      autoResolvable: false,
    });
  }

  // 7. Auto publish available
  const autoPublishAvailable = !scheduleItem.autoPublish || tenantCtx.features.autoPublish;
  if (!autoPublishAvailable) {
    blockReasons.push({
      type: BlockReasonType.AUTO_PUBLISH_UNAVAILABLE,
      description: 'Auto publish requerido mas não disponível no plano',
      suggestedAction: 'Habilitar auto publish (plano Pro+) ou publicar manualmente',
      autoResolvable: false,
    });
  }

  // 8. No blocking failure
  const noBlockingFailure = checkNoBlockingFailure(scheduleItem, campaignItem);
  if (!noBlockingFailure) {
    blockReasons.push({
      type: BlockReasonType.PREVIOUS_FAILURE,
      description: 'Falha anterior não resolvida',
      suggestedAction: 'Resolver falha anterior e retentar',
      autoResolvable: false,
    });
  }

  // 9. Campaign active
  const campaignActive = checkCampaignActive(campaign, schedule);
  if (!campaignActive) {
    blockReasons.push({
      type: BlockReasonType.CAMPAIGN_INACTIVE,
      description: 'Campanha ou schedule não está ativo',
      suggestedAction: 'Ativar a campanha antes de executar',
      autoResolvable: false,
    });
  }

  // 10. Governance ok
  let governanceOk = true;
  let governanceCheckpointId: string | undefined;
  if (scheduleReached && dependenciesSatisfied && campaignActive) {
    const govResult = await evaluateAndGate(
      tenantCtx,
      {
        gate: GovernanceGateType.PRE_EXECUTE,
        targetType: 'schedule_item',
        targetId: scheduleItem.id,
      },
      supabase,
    );
    governanceOk = govResult.canProceed;
    governanceCheckpointId = govResult.checkpointId ?? undefined;
    if (!governanceOk) {
      blockReasons.push({
        type: BlockReasonType.GOVERNANCE_CHECKPOINT,
        description: govResult.reason,
        suggestedAction: 'Aprovar checkpoint de governança no painel',
        autoResolvable: false,
      });
    }
  }

  const checks = {
    scheduleReached,
    dependenciesSatisfied,
    approvalOk,
    artifactReady,
    billingOk,
    featureFlagsOk,
    autoPublishAvailable,
    noBlockingFailure,
    campaignActive,
    governanceOk,
  };

  return {
    scheduleItemId: scheduleItem.id,
    campaignItemId: scheduleItem.campaignItemId,
    title: scheduleItem.title,
    checks,
    ready: Object.values(checks).every(Boolean),
    blockReasons,
    governanceCheckpointId,
  };
}

// ---------------------------------------------------------------------------
// Individual Checks
// ---------------------------------------------------------------------------

function checkDependencies(
  scheduleItem: ScheduleItem,
  schedule: CampaignSchedule,
): boolean {
  if (scheduleItem.dependencies.length === 0) return true;

  return scheduleItem.dependencies.every((dep) => {
    const depItem = schedule.items.find(
      (si) => si.campaignItemId === dep.dependsOnItemId,
    );
    if (!depItem) return false;

    // Check required status
    if (dep.requiredStatus === ScheduleItemStatus.EXECUTED) {
      return depItem.status === ScheduleItemStatus.EXECUTED;
    }
    // Also accept skipped as "satisfied"
    return depItem.status === ScheduleItemStatus.EXECUTED ||
           depItem.status === ScheduleItemStatus.SKIPPED;
  });
}

function checkApproval(
  scheduleItem: ScheduleItem,
  campaignItem: CampaignItem,
): boolean {
  // If approval not required, always ok
  if (!scheduleItem.requiresApproval) return true;

  // Campaign item must be approved or published
  return campaignItem.status === CampaignItemStatus.APPROVED ||
         campaignItem.status === CampaignItemStatus.SCHEDULED ||
         campaignItem.status === CampaignItemStatus.PUBLISHED;
}

async function checkBilling(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<boolean> {
  const limitCheck = await checkUsageLimit(
    tenantCtx,
    UsageEventType.AUTO_PUBLISH_USED,
    supabase,
  );
  return limitCheck.result === LimitCheckResult.ALLOWED ||
         limitCheck.result === LimitCheckResult.WARNING;
}

function checkFeatureFlags(tenantCtx: TenantContext): boolean {
  // For autonomous execution, auto publish must be available
  return tenantCtx.features.autoPublish;
}

function checkNoBlockingFailure(
  scheduleItem: ScheduleItem,
  campaignItem: CampaignItem,
): boolean {
  return scheduleItem.status !== ScheduleItemStatus.FAILED &&
         campaignItem.status !== CampaignItemStatus.FAILED;
}

function checkCampaignActive(
  campaign: ContentCampaign,
  schedule: CampaignSchedule,
): boolean {
  const activeCampaignStatuses = [
    CampaignStatus.READY,
    CampaignStatus.IN_PROGRESS,
    CampaignStatus.PARTIALLY_PUBLISHED,
  ];
  const activeScheduleStatuses = [
    CampaignScheduleStatus.ACTIVE,
  ];

  return activeCampaignStatuses.includes(campaign.status) &&
         activeScheduleStatuses.includes(schedule.status);
}

// ---------------------------------------------------------------------------
// Batch Check
// ---------------------------------------------------------------------------

/**
 * Evaluates readiness for all items in a schedule.
 */
export async function checkAllReadiness(
  schedule: CampaignSchedule,
  campaign: ContentCampaign,
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<ExecutionReadinessCheck[]> {
  const itemMap = new Map(campaign.items.map((i) => [i.id, i]));
  const results: ExecutionReadinessCheck[] = [];

  for (const scheduleItem of schedule.items) {
    // Skip already terminal items
    if (
      scheduleItem.status === ScheduleItemStatus.EXECUTED ||
      scheduleItem.status === ScheduleItemStatus.SKIPPED
    ) {
      continue;
    }

    const campaignItem = itemMap.get(scheduleItem.campaignItemId);
    if (!campaignItem) continue;

    const result = await checkReadiness(
      scheduleItem,
      campaignItem,
      schedule,
      campaign,
      tenantCtx,
      supabase,
    );
    results.push(result);
  }

  return results;
}
