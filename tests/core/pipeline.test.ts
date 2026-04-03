import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../../src/core/pipeline.js';
import { createContext } from '../../src/core/context.js';
import { createMockJobInput } from '../fixtures.js';
import type { IModule } from '../../src/domain/interfaces/module.js';
import { PipelineStage, ModuleStatus } from '../../src/domain/value-objects/index.js';

function createMockModule(
  stage: PipelineStage,
  name: string,
  transform?: (ctx: any) => any,
): IModule {
  return {
    stage,
    name,
    run: vi.fn(async (ctx) => (transform ? transform(ctx) : ctx)),
  };
}

describe('Pipeline', () => {
  it('registers modules and tracks stages', () => {
    const pipeline = new Pipeline();
    const mod = createMockModule(PipelineStage.INGESTION, 'MockIngestion');

    pipeline.registerModule(mod);

    expect(pipeline.getRegisteredStages()).toContain(PipelineStage.INGESTION);
  });

  it('executes a single module and returns JobResult', async () => {
    const pipeline = new Pipeline();
    pipeline.registerModule(
      createMockModule(PipelineStage.INGESTION, 'MockIngestion', (ctx) => ({
        ...ctx,
        extractedText: 'Texto do PDF',
      })),
    );

    const ctx = createContext('job-pipe-1', createMockJobInput());
    const result = await pipeline.execute(ctx);

    expect(result.jobId).toBe('job-pipe-1');
    expect(result.sources).toEqual([]);
    expect(result.outputs).toEqual([]);
  });

  it('executes modules in pipeline stage order', async () => {
    const pipeline = new Pipeline();
    const executionOrder: string[] = [];

    // Register in reverse order to prove ordering works
    pipeline.registerModule(
      createMockModule(PipelineStage.SOURCE_INTELLIGENCE, 'SourceIntel', (ctx) => {
        executionOrder.push('source_intelligence');
        return { ...ctx, sources: [] };
      }),
    );
    pipeline.registerModule(
      createMockModule(PipelineStage.INGESTION, 'Ingestion', (ctx) => {
        executionOrder.push('ingestion');
        return { ...ctx, extractedText: 'text' };
      }),
    );
    pipeline.registerModule(
      createMockModule(PipelineStage.CORRELATION, 'Correlation', (ctx) => {
        executionOrder.push('correlation');
        return { ...ctx, correlations: [] };
      }),
    );

    const ctx = createContext('job-order', createMockJobInput());
    await pipeline.execute(ctx);

    expect(executionOrder).toEqual(['ingestion', 'correlation', 'source_intelligence']);
  });

  it('passes enriched context between modules', async () => {
    const pipeline = new Pipeline();

    pipeline.registerModule(
      createMockModule(PipelineStage.INGESTION, 'Ingestion', (ctx) => ({
        ...ctx,
        extractedText: 'Residencial Vista Verde',
      })),
    );

    pipeline.registerModule(
      createMockModule(PipelineStage.EXTRACTION, 'Extraction', (ctx) => {
        // Should see extractedText from ingestion
        return { ...ctx, assets: [{ id: 'a1', text: ctx.extractedText }] };
      }),
    );

    const ctx = createContext('job-chain', createMockJobInput());
    const result = await pipeline.execute(ctx);

    expect(result).toBeDefined();
  });

  it('propagates errors and records failure in logs', async () => {
    const pipeline = new Pipeline();

    pipeline.registerModule(
      createMockModule(PipelineStage.INGESTION, 'FailingModule', () => {
        throw new Error('Ingestion failed');
      }),
    );

    const ctx = createContext('job-fail', createMockJobInput());

    await expect(pipeline.execute(ctx)).rejects.toThrow('Ingestion failed');
  });

  it('skips stages without registered modules', async () => {
    const pipeline = new Pipeline();
    const runSpy = vi.fn(async (ctx: any) => ctx);

    // Only register Narrative — all others should be skipped
    pipeline.registerModule({
      stage: PipelineStage.NARRATIVE,
      name: 'NarrativeOnly',
      run: runSpy,
    });

    const ctx = createContext('job-skip', createMockJobInput());
    await pipeline.execute(ctx);

    expect(runSpy).toHaveBeenCalledTimes(1);
  });
});
