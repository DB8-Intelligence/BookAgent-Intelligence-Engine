/**
 * Rule Engine — Learning Engine
 *
 * Gera e aplica regras de otimização baseadas nas agregações.
 * Regras seguem o padrão: if conditions → prefer/boost/reduce target.
 *
 * Exemplos:
 *   - Se reels 15s performa melhor → priorizar
 *   - Se preset luxury tem score alto → boost
 *   - Se layout overlay tem score baixo → reduce
 *
 * Ajustes são progressivos e nunca quebram outputs existentes.
 *
 * Parte 73: Learning Engine
 */

import { v4 as uuid } from 'uuid';

import type {
  FeedbackAggregate,
  OptimizationRule,
  RuleCondition,
  RuleAdjustment,
  LearningProfile,
  LearningRecommendation,
  LearningSignal,
} from '../../domain/entities/learning.js';
import {
  OptimizationCategory,
  RuleStatus,
  AdjustmentDirection,
  MIN_CONFIDENCE_FOR_RULE,
  RULE_EXPIRY_DAYS,
  POSITIVE_SIGNAL_THRESHOLD,
  NEGATIVE_SIGNAL_THRESHOLD,
} from '../../domain/entities/learning.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { logger } from '../../utils/logger.js';

import { aggregateSignals, findTopPerformers, findWorstPerformers } from './aggregator.js';

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const TABLE = 'bookagent_learning';

// ---------------------------------------------------------------------------
// Generate Rules from Aggregates
// ---------------------------------------------------------------------------

/**
 * Gera regras de otimização a partir das agregações.
 * Regras são geradas para top e worst performers.
 */
export function generateRules(
  aggregates: FeedbackAggregate[],
  existingRules: OptimizationRule[] = [],
): OptimizationRule[] {
  const newRules: OptimizationRule[] = [];
  const existingKeys = new Set(existingRules.map((r) => r.name));

  const categories: OptimizationCategory[] = [
    OptimizationCategory.PRESET,
    OptimizationCategory.DURATION,
    OptimizationCategory.LAYOUT,
    OptimizationCategory.FORMAT,
    OptimizationCategory.TONE,
  ];

  for (const category of categories) {
    // Top performers → BOOST/PREFER
    const topPerformers = findTopPerformers(aggregates, category, 2);
    for (const top of topPerformers) {
      if (top.averageScore < POSITIVE_SIGNAL_THRESHOLD) continue;
      if (top.confidence < MIN_CONFIDENCE_FOR_RULE) continue;

      const ruleName = `boost_${top.key}`;
      if (existingKeys.has(ruleName)) continue;

      const value = top.key.split(':')[1] ?? top.key;

      newRules.push(createRule({
        name: ruleName,
        category,
        conditions: buildConditions(top),
        adjustments: [{
          category,
          direction: AdjustmentDirection.BOOST,
          target: value,
          magnitude: magnitudeFromScore(top.averageScore),
          description: `Boost ${value} (avg score: ${top.averageScore}, samples: ${top.sampleSize})`,
        }],
        confidence: top.confidence,
        supportingSignals: top.sampleSize,
      }));
    }

    // Worst performers → REDUCE/AVOID
    const worstPerformers = findWorstPerformers(aggregates, category, 2);
    for (const worst of worstPerformers) {
      if (worst.averageScore > NEGATIVE_SIGNAL_THRESHOLD) continue;
      if (worst.confidence < MIN_CONFIDENCE_FOR_RULE) continue;

      const ruleName = `reduce_${worst.key}`;
      if (existingKeys.has(ruleName)) continue;

      const value = worst.key.split(':')[1] ?? worst.key;

      newRules.push(createRule({
        name: ruleName,
        category,
        conditions: buildConditions(worst),
        adjustments: [{
          category,
          direction: AdjustmentDirection.REDUCE,
          target: value,
          magnitude: magnitudeFromScore(100 - worst.averageScore),
          description: `Reduce ${value} (avg score: ${worst.averageScore}, samples: ${worst.sampleSize})`,
        }],
        confidence: worst.confidence,
        supportingSignals: worst.sampleSize,
      }));
    }
  }

  logger.info(`[RuleEngine] Generated ${newRules.length} new rules from ${aggregates.length} aggregates`);
  return newRules;
}

// ---------------------------------------------------------------------------
// Apply Rules
// ---------------------------------------------------------------------------

/**
 * Avalia quais regras se aplicam a um dado contexto.
 * Retorna recomendações ordenadas por confiança.
 */
export function evaluateRules(
  rules: OptimizationRule[],
  context: Record<string, unknown>,
): LearningRecommendation[] {
  const recommendations: LearningRecommendation[] = [];

  const activeRules = rules.filter((r) =>
    r.status === RuleStatus.ACTIVE &&
    r.confidence >= MIN_CONFIDENCE_FOR_RULE &&
    new Date() < r.expiresAt,
  );

  for (const rule of activeRules) {
    if (matchesConditions(rule.conditions, context)) {
      for (const adj of rule.adjustments) {
        recommendations.push({
          category: adj.category,
          outputFormat: typeof context.outputFormat === 'string' ? context.outputFormat : undefined,
          recommendation: adj.description,
          value: adj.target,
          confidence: rule.confidence * rule.successRate,
        });
      }

      // Track application
      rule.appliedCount++;
    }
  }

  // Sort by confidence descending
  recommendations.sort((a, b) => b.confidence - a.confidence);

  return recommendations;
}

/**
 * Registra feedback sobre a aplicação de uma regra.
 */
export function recordRuleOutcome(
  rule: OptimizationRule,
  positive: boolean,
): void {
  if (positive) {
    rule.positiveOutcomes++;
  } else {
    rule.negativeOutcomes++;
  }

  rule.successRate = rule.appliedCount > 0
    ? rule.positiveOutcomes / rule.appliedCount
    : 0;

  rule.updatedAt = new Date();

  // Disable rules with consistently poor outcomes
  if (rule.appliedCount >= 10 && rule.successRate < 0.3) {
    rule.status = RuleStatus.DISABLED;
    logger.info(`[RuleEngine] Disabled rule ${rule.name}: successRate=${rule.successRate}`);
  }
}

// ---------------------------------------------------------------------------
// Build Learning Profile
// ---------------------------------------------------------------------------

/**
 * Constrói um LearningProfile completo a partir de sinais acumulados.
 */
export function buildLearningProfile(
  signals: LearningSignal[],
  existingRules: OptimizationRule[] = [],
): LearningProfile {
  // Aggregate
  const aggregates = aggregateSignals(signals);

  // Generate new rules
  const newRules = generateRules(aggregates, existingRules);
  const allRules = [...existingRules, ...newRules];

  // Filter active rules
  const now = new Date();
  const activeRules = allRules.filter((r) =>
    r.status === RuleStatus.ACTIVE && now < r.expiresAt,
  );

  // Build recommendations from active rules
  const recommendations: LearningRecommendation[] = [];
  for (const rule of activeRules) {
    for (const adj of rule.adjustments) {
      recommendations.push({
        category: adj.category,
        recommendation: adj.description,
        value: adj.target,
        confidence: rule.confidence,
      });
    }
  }

  recommendations.sort((a, b) => b.confidence - a.confidence);

  const profile: LearningProfile = {
    totalSignals: signals.length,
    aggregates,
    activeRules,
    recommendations: recommendations.slice(0, 20), // top 20
    updatedAt: now,
  };

  logger.info(
    `[RuleEngine] Learning profile built: ` +
    `signals=${signals.length} aggregates=${aggregates.length} ` +
    `rules=${activeRules.length} recommendations=${recommendations.length}`,
  );

  return profile;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface LearningRow {
  id: string;
  type: string;
  key: string;
  tenant_id: string | null;
  data: string;
  created_at: string;
  updated_at: string;
}

/**
 * Persiste sinais no Supabase.
 */
export async function persistSignals(
  signals: LearningSignal[],
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase || signals.length === 0) return;

  try {
    const rows = signals.map((s) => ({
      id: s.id,
      type: 'signal',
      key: `${s.source}:${s.dimension}`,
      tenant_id: s.tenantId ?? null,
      data: JSON.stringify(s),
      created_at: s.createdAt.toISOString(),
      updated_at: s.createdAt.toISOString(),
    }));

    await supabase.insert(TABLE, rows);
  } catch (err) {
    logger.warn(`[RuleEngine] Failed to persist ${signals.length} signals: ${err}`);
  }
}

/**
 * Persiste regras no Supabase.
 */
export async function persistRules(
  rules: OptimizationRule[],
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase || rules.length === 0) return;

  try {
    const rows = rules.map((r) => ({
      id: r.id,
      type: 'rule',
      key: r.name,
      tenant_id: r.tenantId ?? null,
      data: JSON.stringify(r),
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    }));

    await supabase.upsert(TABLE, rows);
  } catch (err) {
    logger.warn(`[RuleEngine] Failed to persist ${rules.length} rules: ${err}`);
  }
}

/**
 * Carrega sinais do Supabase.
 * @param tenantId — se fornecido, filtra por tenant (Parte 74)
 * @param includeGlobal — se true, inclui sinais sem tenant (globais)
 */
export async function loadSignals(
  supabase: SupabaseClient | null,
  limit: number = 1000,
  tenantId?: string,
  includeGlobal: boolean = true,
): Promise<LearningSignal[]> {
  if (!supabase) return [];

  try {
    const filters: Array<{ column: string; operator: 'eq'; value: string }> = [
      { column: 'type', operator: 'eq', value: 'signal' },
    ];

    // Tenant scoping: if tenantId provided, filter by it
    if (tenantId) {
      filters.push({ column: 'tenant_id', operator: 'eq', value: tenantId });
    }

    const rows = await supabase.select<LearningRow>(TABLE, {
      filters,
      orderBy: 'created_at',
      orderDesc: true,
      limit,
    });

    let signals = rows.map((r) => JSON.parse(r.data) as LearningSignal);

    // If tenant-scoped but also wants global, load global signals separately
    if (tenantId && includeGlobal) {
      const globalRows = await supabase.select<LearningRow>(TABLE, {
        filters: [
          { column: 'type', operator: 'eq', value: 'signal' },
          { column: 'tenant_id', operator: 'is', value: null },
        ],
        orderBy: 'created_at',
        orderDesc: true,
        limit: Math.floor(limit / 2),
      });
      const globalSignals = globalRows.map((r) => JSON.parse(r.data) as LearningSignal);
      signals = [...signals, ...globalSignals];
    }

    return signals;
  } catch (err) {
    logger.warn(`[RuleEngine] Failed to load signals: ${err}`);
    return [];
  }
}

/**
 * Carrega regras do Supabase.
 * @param tenantId — se fornecido, inclui regras do tenant + globais (Parte 74)
 */
export async function loadRules(
  supabase: SupabaseClient | null,
  tenantId?: string,
): Promise<OptimizationRule[]> {
  if (!supabase) return [];

  try {
    const filters: Array<{ column: string; operator: 'eq' | 'is'; value: string | null }> = [
      { column: 'type', operator: 'eq', value: 'rule' },
    ];

    const rows = await supabase.select<LearningRow>(TABLE, {
      filters,
      orderBy: 'updated_at',
      orderDesc: true,
    });

    let rules = rows.map((r) => JSON.parse(r.data) as OptimizationRule);

    // Filter to tenant + global rules
    if (tenantId) {
      rules = rules.filter((r) => !r.tenantId || r.tenantId === tenantId);
    }

    return rules;
  } catch (err) {
    logger.warn(`[RuleEngine] Failed to load rules: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CreateRuleInput {
  name: string;
  category: OptimizationCategory;
  conditions: RuleCondition[];
  adjustments: RuleAdjustment[];
  confidence: number;
  supportingSignals: number;
}

function createRule(input: CreateRuleInput): OptimizationRule {
  const now = new Date();
  const expiry = new Date(now.getTime() + RULE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  return {
    id: uuid(),
    name: input.name,
    category: input.category,
    conditions: input.conditions,
    adjustments: input.adjustments,
    status: RuleStatus.TESTING, // new rules start in testing
    confidence: input.confidence,
    appliedCount: 0,
    supportingSignals: input.supportingSignals,
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    successRate: 0,
    source: 'scoring' as OptimizationRule['source'],
    createdAt: now,
    updatedAt: now,
    expiresAt: expiry,
  };
}

function buildConditions(aggregate: FeedbackAggregate): RuleCondition[] {
  const conditions: RuleCondition[] = [];

  // Add format condition if specific
  if (aggregate.outputFormat) {
    conditions.push({
      field: 'outputFormat',
      operator: 'eq',
      value: aggregate.outputFormat,
    });
  }

  // Add category-specific condition
  const value = aggregate.key.split(':')[1];
  if (value) {
    conditions.push({
      field: aggregate.category,
      operator: 'eq',
      value,
    });
  }

  return conditions;
}

function matchesConditions(
  conditions: RuleCondition[],
  context: Record<string, unknown>,
): boolean {
  for (const cond of conditions) {
    const actual = context[cond.field];
    if (actual === undefined) continue; // skip if field not in context

    switch (cond.operator) {
      case 'eq':
        if (actual !== cond.value) return false;
        break;
      case 'neq':
        if (actual === cond.value) return false;
        break;
      case 'gt':
        if (typeof actual !== 'number' || typeof cond.value !== 'number') return false;
        if (actual <= cond.value) return false;
        break;
      case 'lt':
        if (typeof actual !== 'number' || typeof cond.value !== 'number') return false;
        if (actual >= cond.value) return false;
        break;
      case 'in':
        if (!Array.isArray(cond.value) || !cond.value.includes(actual as string)) return false;
        break;
      case 'contains':
        if (typeof actual !== 'string' || typeof cond.value !== 'string') return false;
        if (!actual.includes(cond.value)) return false;
        break;
    }
  }

  return true;
}

function magnitudeFromScore(score: number): number {
  // Map score (0-100) to magnitude (0.1-0.9)
  return Math.max(0.1, Math.min(0.9, score / 100));
}
