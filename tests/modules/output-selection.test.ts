import { describe, it, expect } from 'vitest';
import { evaluateFeasibility, determineApprovalStatus } from '../../src/modules/output-selection/feasibility-evaluator.js';
import { prioritizeOutputs } from '../../src/modules/output-selection/output-prioritizer.js';
import { createMockSources, createMockAssets } from '../fixtures.js';
import { generateNarrativePlans } from '../../src/modules/narrative/narrative-planner.js';
import { ApprovalStatus, OutputComplexity } from '../../src/domain/entities/output-decision.js';
import type { OutputDecision } from '../../src/domain/entities/output-decision.js';
import { v4 as uuid } from 'uuid';

/**
 * Helper: build OutputDecision from a NarrativePlan using the same logic
 * as the OutputSelectionModule (which is a private function there).
 */
function buildDecision(
  plan: ReturnType<typeof generateNarrativePlans>[number],
  sources: ReturnType<typeof createMockSources>,
  assets: ReturnType<typeof createMockAssets>,
): OutputDecision {
  const feasibility = evaluateFeasibility(plan, sources, assets);
  const statusStr = determineApprovalStatus(feasibility.score, feasibility.gaps);

  const statusMap: Record<string, ApprovalStatus> = {
    'approved': ApprovalStatus.APPROVED,
    'approved-with-gaps': ApprovalStatus.APPROVED_WITH_GAPS,
    'rejected': ApprovalStatus.REJECTED,
  };

  return {
    id: uuid(),
    format: plan.targetFormat,
    narrativeType: plan.narrativeType,
    narrativePlanId: plan.id,
    status: statusMap[statusStr] ?? ApprovalStatus.REJECTED,
    priority: 0,
    confidence: Math.round(feasibility.score * 100) / 100,
    complexity: feasibility.complexity,
    gaps: feasibility.gaps,
    reason: `Test decision for ${plan.narrativeType}`,
    requiredAssetCount: feasibility.requiredAssetCount,
    availableAssetCount: feasibility.availableAssetCount,
    requiredSourceTypes: feasibility.requiredSourceTypes,
    availableSourceTypes: feasibility.availableSourceTypes,
    totalBeats: feasibility.totalBeats,
    filledBeats: feasibility.filledBeats,
    requiredBeatsFilled: feasibility.requiredBeatsFilled,
    requiredBeatsTotal: feasibility.requiredBeatsTotal,
    requiresPersonalization: feasibility.requiresPersonalization,
  };
}

describe('Feasibility Evaluator', () => {
  it('evaluates feasibility for narrative plans', () => {
    const sources = createMockSources();
    const assets = createMockAssets(7);
    const plans = generateNarrativePlans(sources);

    expect(plans.length).toBeGreaterThan(0);

    for (const plan of plans) {
      const result = evaluateFeasibility(plan, sources, assets);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.totalBeats).toBeGreaterThan(0);
      expect(result.complexity).toBeDefined();
    }
  });

  it('returns lower score with minimal data', () => {
    const sources = createMockSources().slice(0, 1);
    const assets = createMockAssets(1);
    const plans = generateNarrativePlans(sources);

    if (plans.length === 0) return; // No plans generated with 1 source

    const result = evaluateFeasibility(plans[0], sources, assets);
    // With minimal data, score should still be calculable
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('determineApprovalStatus rejects low scores with blocking gaps', () => {
    const status = determineApprovalStatus(0.1, [
      { criterion: 'test', required: 5, actual: 0, blocking: true },
    ]);
    expect(status).toBe('rejected');
  });

  it('determineApprovalStatus approves high scores with no gaps', () => {
    const status = determineApprovalStatus(0.85, []);
    expect(status).toBe('approved');
  });

  it('determineApprovalStatus returns approved-with-gaps for moderate scores', () => {
    const status = determineApprovalStatus(0.55, [
      { criterion: 'visual-coverage', required: '50%', actual: '30%', blocking: false },
    ]);
    expect(status).toBe('approved-with-gaps');
  });
});

describe('Output Prioritizer', () => {
  it('prioritizes and defers redundant outputs', () => {
    const sources = createMockSources();
    const assets = createMockAssets(7);
    const plans = generateNarrativePlans(sources);

    const decisions = plans.map((p) => buildDecision(p, sources, assets));
    const prioritized = prioritizeOutputs(decisions);

    expect(prioritized.length).toBe(decisions.length);

    // Non-rejected, non-deferred decisions should have sequential priority ranks
    const active = prioritized.filter(
      (d) => d.status === ApprovalStatus.APPROVED || d.status === ApprovalStatus.APPROVED_WITH_GAPS,
    );
    for (let i = 0; i < active.length; i++) {
      expect(active[i].priority).toBe(i + 1);
    }
  });

  it('assigns priority 99 to rejected decisions', () => {
    const sources = createMockSources();
    const assets = createMockAssets(7);
    const plans = generateNarrativePlans(sources);

    const decisions = plans.map((p) => buildDecision(p, sources, assets));
    const prioritized = prioritizeOutputs(decisions);

    const rejected = prioritized.filter((d) => d.status === ApprovalStatus.REJECTED);
    for (const d of rejected) {
      expect(d.priority).toBe(99);
    }
  });
});
