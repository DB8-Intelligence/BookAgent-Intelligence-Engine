import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../src/core/orchestrator.js';
import { createMockJobInput } from '../fixtures.js';
import type { IModule } from '../../src/domain/interfaces/module.js';
import { PipelineStage, JobStatus } from '../../src/domain/value-objects/index.js';

describe('Orchestrator', () => {
  it('processes a job and returns completed status', async () => {
    const orchestrator = new Orchestrator();

    // Register a minimal pass-through module
    const mod: IModule = {
      stage: PipelineStage.INGESTION,
      name: 'PassThrough',
      run: async (ctx) => ctx,
    };
    orchestrator.registerModule(mod);

    const input = createMockJobInput();
    const job = await orchestrator.process(input);

    expect(job.status).toBe(JobStatus.COMPLETED);
    expect(job.result).toBeDefined();
    expect(job.result!.sources).toEqual([]);
  });

  it('marks job as failed when pipeline throws', async () => {
    const orchestrator = new Orchestrator();

    const failingMod: IModule = {
      stage: PipelineStage.INGESTION,
      name: 'Failing',
      run: async () => {
        throw new Error('boom');
      },
    };
    orchestrator.registerModule(failingMod);

    const job = await orchestrator.process(createMockJobInput());

    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error).toBe('boom');
  });

  it('assigns unique job IDs', async () => {
    const orchestrator = new Orchestrator();

    const job1 = await orchestrator.process(createMockJobInput());
    const job2 = await orchestrator.process(createMockJobInput());

    expect(job1.id).not.toBe(job2.id);
  });

  it('lists and retrieves jobs', async () => {
    const orchestrator = new Orchestrator();
    const job = await orchestrator.process(createMockJobInput());

    expect(orchestrator.getJobStatus(job.id)).toBeDefined();
    expect(orchestrator.listJobs().length).toBeGreaterThanOrEqual(1);
  });
});
