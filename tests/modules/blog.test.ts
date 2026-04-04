/**
 * Tests: Blog Module
 *
 * Verifica que o módulo de blog:
 * - Tem o stage correto (PipelineStage.BLOG)
 * - Retorna vazio quando não há decisões ou narrativas
 * - Gera planos de blog quando há decisões aprovadas
 */

import { describe, it, expect } from 'vitest';
import { BlogModule } from '../../src/modules/blog/index.js';
import { createMockContext, createMockSources } from '../fixtures.js';
import { PipelineStage, OutputFormat } from '../../src/domain/value-objects/index.js';
import { NarrativeType, ToneOfVoice } from '../../src/domain/entities/narrative.js';
import { ApprovalStatus, OutputComplexity } from '../../src/domain/entities/output-decision.js';
import type { OutputDecision } from '../../src/domain/entities/output-decision.js';

function createBlogDecision(narrativePlanId: string): OutputDecision {
  return {
    id: 'dec-blog',
    format: OutputFormat.BLOG,
    narrativeType: NarrativeType.BLOG,
    narrativePlanId,
    status: ApprovalStatus.APPROVED,
    priority: 1,
    confidence: 0.85,
    complexity: OutputComplexity.HIGH,
    gaps: [],
    reason: 'Sufficient content for blog',
    requiredAssetCount: 2,
    availableAssetCount: 5,
    requiredSourceTypes: ['hero'],
    availableSourceTypes: ['hero', 'lifestyle'],
    totalBeats: 5,
    filledBeats: 5,
    requiredBeatsFilled: 3,
    requiredBeatsTotal: 3,
    requiresPersonalization: false,
  };
}

describe('BlogModule', () => {
  const mod = new BlogModule();

  it('has correct stage BLOG (not MEDIA_GENERATION)', () => {
    expect(mod.stage).toBe(PipelineStage.BLOG);
    expect(mod.stage).not.toBe(PipelineStage.MEDIA_GENERATION);
  });

  it('returns empty blogPlans when no decisions', async () => {
    const ctx = createMockContext({ selectedOutputs: [], narratives: [] });
    const result = await mod.run(ctx);
    expect(result.blogPlans).toEqual([]);
  });

  it('returns empty blogPlans when no narratives', async () => {
    const ctx = createMockContext({
      selectedOutputs: [createBlogDecision('nar-blog')],
      narratives: [],
    });
    const result = await mod.run(ctx);
    expect(result.blogPlans).toEqual([]);
  });

  it('generates blog plans for approved blog decisions', async () => {
    const sources = createMockSources();
    const ctx = createMockContext({
      selectedOutputs: [createBlogDecision('nar-blog')],
      narratives: [{
        id: 'nar-blog',
        narrativeType: NarrativeType.BLOG,
        title: 'Artigo — Vista Verde: O Empreendimento do Ano',
        tone: ToneOfVoice.INFORMATIVO,
        beats: [
          { id: 'b1', role: 'hook' as any, sourceId: 'src-hero', text: 'Abertura do empreendimento', order: 0, durationHint: 0 },
          { id: 'b2', role: 'showcase' as any, sourceId: 'src-lifestyle', text: 'Áreas de lazer completas', order: 1, durationHint: 0 },
          { id: 'b3', role: 'closing' as any, sourceId: 'src-cta', text: 'Agende sua visita agora', order: 2, durationHint: 0 },
        ],
        sourceIds: ['src-hero', 'src-lifestyle', 'src-cta'],
        confidence: 0.9,
        estimatedDurationSeconds: 0,
        estimatedSlides: 0,
        estimatedWordCount: 800,
      }],
      sources,
    });

    const result = await mod.run(ctx);
    expect(result.blogPlans).toBeDefined();
    expect(result.blogPlans!.length).toBeGreaterThan(0);

    const plan = result.blogPlans![0];
    expect(plan.title).toBeTruthy();
    expect(plan.slug).toBeTruthy();
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.estimatedWordCount).toBeGreaterThan(0);
  });
});
