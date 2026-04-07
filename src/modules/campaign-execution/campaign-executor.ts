/**
 * Campaign Executor — Autonomous Campaign Execution
 *
 * Motor de execução autônoma. Avalia readiness de cada schedule item
 * e toma ações automaticamente quando as condições são satisfeitas.
 *
 * Fluxo de um ciclo de execução:
 *   1. Avaliar readiness de cada schedule item pendente
 *   2. Tomar decisão (execute, defer, block, skip, intervene)
 *   3. Executar ação correspondente
 *   4. Registrar log de auditoria
 *   5. Atualizar schedule e campaign
 *   6. Persistir
 *
 * Princípios:
 *   - Idempotente: re-executar não duplica ações
 *   - Seguro: nunca executa com dúvida
 *   - Auditável: cada decisão tem log completo
 *   - Tenant-scoped: isolamento por tenant
 *
 * Parte 87: Autonomous Campaign Execution
 */

import { v4 as uuid } from 'uuid';

import type { SupabaseClient } from '../../persistence/supabase-client.js';
import type {
  CampaignExecution,
  CampaignExecutionItem,
  CampaignExecutionLog,
  ExecutionDecision,
  ExecutionReadinessCheck,
  AutonomousAction,
} from '../../domain/entities/campaign-execution.js';
import {
  ExecutionStatus,
  ExecutionDecisionType,
  AutonomousActionType,
  ActionResult,
} from '../../domain/entities/campaign-execution.js';
import type { CampaignSchedule } from '../../domain/entities/schedule.js';
import { ScheduleItemStatus } from '../../domain/entities/schedule.js';
import type { ContentCampaign } from '../../domain/entities/campaign.js';
import { CampaignItemStatus } from '../../domain/entities/campaign.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import { checkAllReadiness } from './readiness-checker.js';
import {
  markExecuted as scheduleMarkExecuted,
  markFailed as scheduleMarkFailed,
  skipItem as scheduleSkipItem,
  saveSchedule,
  evaluateDependencies,
} from '../scheduling/index.js';
import {
  updateItemStatus as campaignUpdateItemStatus,
  saveCampaign,
} from '../campaigns/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_campaign_executions';

/**
 * Persists an execution record.
 */
export async function saveExecution(
  execution: CampaignExecution,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  await supabase.upsert(TABLE, {
    id: execution.id,
    campaign_id: execution.campaignId,
    schedule_id: execution.scheduleId,
    tenant_id: execution.tenantId,
    status: execution.status,
    items: execution.items,
    counts: execution.counts,
    logs: execution.logs,
    started_at: execution.startedAt,
    completed_at: execution.completedAt,
    next_evaluation_at: execution.nextEvaluationAt,
  });
}

/**
 * Lists executions for a campaign.
 */
export async function listExecutions(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<CampaignExecution[]> {
  if (!supabase) return [];

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'campaign_id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    orderBy: 'started_at',
    orderDesc: true,
  });

  return rows.map(mapRowToExecution);
}

/**
 * Gets the latest execution for a campaign.
 */
export async function getLatestExecution(
  campaignId: string,
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<CampaignExecution | null> {
  if (!supabase) return null;

  const rows = await supabase.select<Record<string, unknown>>(TABLE, {
    filters: [
      { column: 'campaign_id', operator: 'eq', value: campaignId },
      { column: 'tenant_id', operator: 'eq', value: tenantId },
    ],
    orderBy: 'started_at',
    orderDesc: true,
    limit: 1,
  });

  if (rows.length === 0) return null;
  return mapRowToExecution(rows[0]!);
}

// ---------------------------------------------------------------------------
// Execute Cycle
// ---------------------------------------------------------------------------

/**
 * Runs a full execution cycle for a campaign.
 * Evaluates all pending schedule items and takes autonomous actions.
 */
export async function executeCycle(
  schedule: CampaignSchedule,
  campaign: ContentCampaign,
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<CampaignExecution> {
  const executionId = uuid();
  const now = new Date().toISOString();

  logger.info(
    `[CampaignExecutor] Starting execution cycle ${executionId} ` +
    `for campaign=${campaign.id} schedule=${schedule.id}`,
  );

  // 1. Evaluate dependencies first
  evaluateDependencies(schedule);

  // 2. Check readiness for all pending items
  const readinessResults = await checkAllReadiness(
    schedule,
    campaign,
    tenantCtx,
    supabase,
  );

  // 3. Process each item
  const executionItems: CampaignExecutionItem[] = [];
  const logs: CampaignExecutionLog[] = [];
  let executedCount = 0;
  let deferredCount = 0;
  let blockedCount = 0;
  let skippedCount = 0;
  let interventionCount = 0;

  for (const readiness of readinessResults) {
    // 3a. Make decision
    const decision = makeDecision(readiness);

    // 3b. Execute action
    const action = await executeAction(
      decision,
      schedule,
      campaign,
      supabase,
    );

    // 3c. Build execution item
    const execItem: CampaignExecutionItem = {
      scheduleItemId: readiness.scheduleItemId,
      campaignItemId: readiness.campaignItemId,
      title: readiness.title,
      readiness,
      decision,
      action,
    };
    executionItems.push(execItem);

    // 3d. Build log entry
    const logEntry: CampaignExecutionLog = {
      id: uuid(),
      executionId,
      scheduleItemId: readiness.scheduleItemId,
      decision: decision.decision,
      action: decision.action,
      result: action?.result ?? ActionResult.SKIPPED,
      blockReasons: readiness.blockReasons,
      details: action?.details ?? decision.reason,
      timestamp: new Date().toISOString(),
    };
    logs.push(logEntry);

    // 3e. Count
    switch (decision.decision) {
      case ExecutionDecisionType.EXECUTE:
        executedCount++;
        break;
      case ExecutionDecisionType.DEFER:
        deferredCount++;
        break;
      case ExecutionDecisionType.BLOCK:
        blockedCount++;
        break;
      case ExecutionDecisionType.SKIP:
        skippedCount++;
        break;
      case ExecutionDecisionType.REQUIRE_INTERVENTION:
        interventionCount++;
        break;
    }
  }

  // 4. Persist schedule and campaign updates
  await saveSchedule(schedule, supabase);
  await saveCampaign(campaign, supabase);

  // 5. Determine execution status
  const status = blockedCount > 0 || interventionCount > 0
    ? ExecutionStatus.COMPLETED_WITH_BLOCKS
    : ExecutionStatus.COMPLETED;

  // 6. Suggest next evaluation (1 hour from now if pending items exist)
  const hasPending = deferredCount > 0 || blockedCount > 0;
  const nextEval = hasPending
    ? new Date(Date.now() + 3600000).toISOString()
    : null;

  const execution: CampaignExecution = {
    id: executionId,
    campaignId: campaign.id,
    scheduleId: schedule.id,
    tenantId: campaign.tenantId,
    status,
    items: executionItems,
    counts: {
      total: readinessResults.length,
      executed: executedCount,
      deferred: deferredCount,
      blocked: blockedCount,
      skipped: skippedCount,
      interventionRequired: interventionCount,
    },
    logs,
    startedAt: now,
    completedAt: new Date().toISOString(),
    nextEvaluationAt: nextEval,
  };

  // 7. Persist execution
  await saveExecution(execution, supabase);

  logger.info(
    `[CampaignExecutor] Completed cycle ${executionId}: ` +
    `executed=${executedCount} deferred=${deferredCount} ` +
    `blocked=${blockedCount} interventions=${interventionCount}`,
  );

  return execution;
}

// ---------------------------------------------------------------------------
// Decision Making
// ---------------------------------------------------------------------------

function makeDecision(readiness: ExecutionReadinessCheck): ExecutionDecision {
  const { scheduleItemId, campaignItemId, checks, blockReasons } = readiness;

  // All checks pass → execute
  if (readiness.ready) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.EXECUTE,
      reason: 'Todas as pré-condições satisfeitas',
      readiness,
      action: AutonomousActionType.TRIGGER_PUBLISH,
    };
  }

  // Schedule not reached → defer (auto-resolvable)
  if (!checks.scheduleReached) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.DEFER,
      reason: 'Janela de execução ainda não alcançada',
      readiness,
      action: AutonomousActionType.DEFER_ITEM,
    };
  }

  // Dependencies pending → defer
  if (!checks.dependenciesSatisfied) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.DEFER,
      reason: 'Dependências de itens anteriores pendentes',
      readiness,
      action: AutonomousActionType.DEFER_ITEM,
    };
  }

  // Campaign not active → block
  if (!checks.campaignActive) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.BLOCK,
      reason: 'Campanha ou schedule não está ativo',
      readiness,
      action: AutonomousActionType.REGISTER_BLOCK,
    };
  }

  // Billing/feature issues → block
  if (!checks.billingOk || !checks.featureFlagsOk) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.BLOCK,
      reason: 'Limite de plano atingido ou feature desabilitada',
      readiness,
      action: AutonomousActionType.REGISTER_BLOCK,
    };
  }

  // Governance checkpoint pending → require intervention
  if (!checks.governanceOk) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.REQUIRE_INTERVENTION,
      reason: 'Checkpoint de governança pendente — aguardando aprovação humana',
      readiness,
      action: AutonomousActionType.REQUEST_INTERVENTION,
    };
  }

  // Previous failure → require intervention
  if (!checks.noBlockingFailure) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.REQUIRE_INTERVENTION,
      reason: 'Falha anterior não resolvida requer atenção manual',
      readiness,
      action: AutonomousActionType.REQUEST_INTERVENTION,
    };
  }

  // Approval or artifact issues → require intervention
  if (!checks.approvalOk || !checks.artifactReady) {
    const reasons: string[] = [];
    if (!checks.approvalOk) reasons.push('aprovação pendente');
    if (!checks.artifactReady) reasons.push('output não vinculado');

    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.REQUIRE_INTERVENTION,
      reason: `Intervenção necessária: ${reasons.join(', ')}`,
      readiness,
      action: AutonomousActionType.REQUEST_INTERVENTION,
    };
  }

  // Auto publish not available → require intervention
  if (!checks.autoPublishAvailable) {
    return {
      scheduleItemId,
      campaignItemId,
      decision: ExecutionDecisionType.REQUIRE_INTERVENTION,
      reason: 'Auto publish indisponível — publicação manual necessária',
      readiness,
      action: AutonomousActionType.REQUEST_INTERVENTION,
    };
  }

  // Fallback: block
  return {
    scheduleItemId,
    campaignItemId,
    decision: ExecutionDecisionType.BLOCK,
    reason: blockReasons.map((b) => b.description).join('; ') || 'Condição desconhecida',
    readiness,
    action: AutonomousActionType.REGISTER_BLOCK,
  };
}

// ---------------------------------------------------------------------------
// Action Execution
// ---------------------------------------------------------------------------

async function executeAction(
  decision: ExecutionDecision,
  schedule: CampaignSchedule,
  campaign: ContentCampaign,
  supabase: SupabaseClient | null,
): Promise<AutonomousAction | null> {
  const now = new Date().toISOString();

  switch (decision.action) {
    case AutonomousActionType.TRIGGER_PUBLISH: {
      // Mark as executed in schedule
      const scheduleOk = scheduleMarkExecuted(schedule, decision.scheduleItemId);
      // Update campaign item status
      campaignUpdateItemStatus(campaign, decision.campaignItemId, CampaignItemStatus.PUBLISHED);

      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.TRIGGER_PUBLISH,
        result: scheduleOk ? ActionResult.SUCCESS : ActionResult.FAILED,
        details: scheduleOk
          ? 'Publicação disparada e item marcado como executado'
          : 'Falha ao marcar item como executado no schedule',
        executedAt: now,
      };
    }

    case AutonomousActionType.MARK_EXECUTED: {
      scheduleMarkExecuted(schedule, decision.scheduleItemId);
      campaignUpdateItemStatus(campaign, decision.campaignItemId, CampaignItemStatus.PUBLISHED);

      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.MARK_EXECUTED,
        result: ActionResult.SUCCESS,
        details: 'Item marcado como executado',
        executedAt: now,
      };
    }

    case AutonomousActionType.DEFER_ITEM: {
      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.DEFER_ITEM,
        result: ActionResult.DEFERRED,
        details: decision.reason,
        executedAt: now,
      };
    }

    case AutonomousActionType.REGISTER_BLOCK: {
      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.REGISTER_BLOCK,
        result: ActionResult.FAILED,
        details: `Bloqueado: ${decision.reason}`,
        executedAt: now,
      };
    }

    case AutonomousActionType.REQUEST_INTERVENTION: {
      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.REQUEST_INTERVENTION,
        result: ActionResult.DEFERRED,
        details: `Intervenção solicitada: ${decision.reason}`,
        executedAt: now,
      };
    }

    case AutonomousActionType.SKIP_ITEM: {
      scheduleSkipItem(schedule, decision.scheduleItemId);
      campaignUpdateItemStatus(campaign, decision.campaignItemId, CampaignItemStatus.SKIPPED);

      return {
        scheduleItemId: decision.scheduleItemId,
        actionType: AutonomousActionType.SKIP_ITEM,
        result: ActionResult.SKIPPED,
        details: 'Item pulado',
        executedAt: now,
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Row Mapper
// ---------------------------------------------------------------------------

function mapRowToExecution(row: Record<string, unknown>): CampaignExecution {
  return {
    id: row['id'] as string,
    campaignId: row['campaign_id'] as string,
    scheduleId: row['schedule_id'] as string,
    tenantId: row['tenant_id'] as string,
    status: row['status'] as ExecutionStatus,
    items: (row['items'] ?? []) as CampaignExecutionItem[],
    counts: row['counts'] as CampaignExecution['counts'],
    logs: (row['logs'] ?? []) as CampaignExecutionLog[],
    startedAt: row['started_at'] as string,
    completedAt: (row['completed_at'] as string) ?? null,
    nextEvaluationAt: (row['next_evaluation_at'] as string) ?? null,
  };
}
