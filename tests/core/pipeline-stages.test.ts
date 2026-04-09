/**
 * Tests: Pipeline Stage Order
 *
 * Verifica que os 15 estágios do pipeline estão na ordem correta
 * e que o pipeline executa na sequência definida.
 */

import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../../src/core/pipeline.js';
import { createContext } from '../../src/core/context.js';
import { createMockJobInput } from '../fixtures.js';
import type { IModule } from '../../src/domain/interfaces/module.js';
import { PipelineStage } from '../../src/domain/value-objects/index.js';

describe('Pipeline Stage Order (17 stages)', () => {
  it('PipelineStage enum has all 17 stages', () => {
    const stages = Object.values(PipelineStage);
    expect(stages).toHaveLength(17);
    expect(stages).toContain('ingestion');
    expect(stages).toContain('book_analysis');
    expect(stages).toContain('reverse_engineering');
    expect(stages).toContain('extraction');
    expect(stages).toContain('branding');
    expect(stages).toContain('correlation');
    expect(stages).toContain('source_intelligence');
    expect(stages).toContain('narrative');
    expect(stages).toContain('output_selection');
    expect(stages).toContain('media_generation');
    expect(stages).toContain('blog');
    expect(stages).toContain('landing_page');
    expect(stages).toContain('personalization');
    expect(stages).toContain('content_scoring');
    expect(stages).toContain('render_export');
    expect(stages).toContain('delivery');
    expect(stages).toContain('performance_monitoring');
  });

  it('executes branding BEFORE correlation', async () => {
    const pipeline = new Pipeline();
    const order: string[] = [];

    pipeline.registerModule({
      stage: PipelineStage.CORRELATION,
      name: 'Corr',
      run: vi.fn(async (ctx) => { order.push('correlation'); return ctx; }),
    });
    pipeline.registerModule({
      stage: PipelineStage.BRANDING,
      name: 'Brand',
      run: vi.fn(async (ctx) => { order.push('branding'); return ctx; }),
    });

    const ctx = createContext('test-order', createMockJobInput());
    await pipeline.execute(ctx);

    expect(order.indexOf('branding')).toBeLessThan(order.indexOf('correlation'));
  });

  it('executes blog and landing_page AFTER media_generation', async () => {
    const pipeline = new Pipeline();
    const order: string[] = [];

    const makeModule = (stage: PipelineStage, label: string): IModule => ({
      stage,
      name: label,
      run: vi.fn(async (ctx) => { order.push(label); return ctx; }),
    });

    pipeline.registerModule(makeModule(PipelineStage.MEDIA_GENERATION, 'media'));
    pipeline.registerModule(makeModule(PipelineStage.BLOG, 'blog'));
    pipeline.registerModule(makeModule(PipelineStage.LANDING_PAGE, 'landing_page'));

    const ctx = createContext('test-content-order', createMockJobInput());
    await pipeline.execute(ctx);

    expect(order).toEqual(['media', 'blog', 'landing_page']);
  });

  it('executes delivery as the last stage', async () => {
    const pipeline = new Pipeline();
    const order: string[] = [];

    const makeModule = (stage: PipelineStage, label: string): IModule => ({
      stage,
      name: label,
      run: vi.fn(async (ctx) => { order.push(label); return ctx; }),
    });

    pipeline.registerModule(makeModule(PipelineStage.INGESTION, 'ingestion'));
    pipeline.registerModule(makeModule(PipelineStage.RENDER_EXPORT, 'render'));
    pipeline.registerModule(makeModule(PipelineStage.DELIVERY, 'delivery'));
    pipeline.registerModule(makeModule(PipelineStage.PERSONALIZATION, 'personalization'));

    const ctx = createContext('test-delivery-last', createMockJobInput());
    await pipeline.execute(ctx);

    expect(order[order.length - 1]).toBe('delivery');
    expect(order[0]).toBe('ingestion');
  });

  it('executes all 17 stages in correct order when all registered', async () => {
    const pipeline = new Pipeline();
    const order: string[] = [];

    const expectedOrder = [
      PipelineStage.INGESTION,
      PipelineStage.BOOK_ANALYSIS,
      PipelineStage.REVERSE_ENGINEERING,
      PipelineStage.EXTRACTION,
      PipelineStage.BRANDING,
      PipelineStage.CORRELATION,
      PipelineStage.SOURCE_INTELLIGENCE,
      PipelineStage.NARRATIVE,
      PipelineStage.OUTPUT_SELECTION,
      PipelineStage.MEDIA_GENERATION,
      PipelineStage.BLOG,
      PipelineStage.LANDING_PAGE,
      PipelineStage.PERSONALIZATION,
      PipelineStage.CONTENT_SCORING,
      PipelineStage.RENDER_EXPORT,
      PipelineStage.DELIVERY,
      PipelineStage.PERFORMANCE_MONITORING,
    ];

    // Register in reverse to prove ordering
    for (const stage of [...expectedOrder].reverse()) {
      pipeline.registerModule({
        stage,
        name: stage,
        run: vi.fn(async (ctx) => { order.push(stage); return ctx; }),
      });
    }

    const ctx = createContext('test-full-order', createMockJobInput());
    await pipeline.execute(ctx);

    expect(order).toEqual(expectedOrder);
  });
});
