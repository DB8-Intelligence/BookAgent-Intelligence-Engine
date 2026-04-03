import { describe, it, expect } from 'vitest';
import { createContext } from '../../src/core/context.js';
import { createMockJobInput } from '../fixtures.js';

describe('ProcessingContext', () => {
  it('creates a context with jobId and input', () => {
    const input = createMockJobInput();
    const ctx = createContext('job-001', input);

    expect(ctx.jobId).toBe('job-001');
    expect(ctx.input).toBe(input);
    expect(ctx.input.fileUrl).toBe('https://example.com/book-empreendimento.pdf');
  });

  it('initializes with empty executionLogs', () => {
    const ctx = createContext('job-002', createMockJobInput());
    expect(ctx.executionLogs).toEqual([]);
  });

  it('starts with all optional fields undefined', () => {
    const ctx = createContext('job-003', createMockJobInput());

    expect(ctx.extractedText).toBeUndefined();
    expect(ctx.pageTexts).toBeUndefined();
    expect(ctx.assets).toBeUndefined();
    expect(ctx.correlations).toBeUndefined();
    expect(ctx.branding).toBeUndefined();
    expect(ctx.sources).toBeUndefined();
    expect(ctx.narratives).toBeUndefined();
    expect(ctx.selectedOutputs).toBeUndefined();
    expect(ctx.mediaPlans).toBeUndefined();
    expect(ctx.blogPlans).toBeUndefined();
    expect(ctx.landingPagePlans).toBeUndefined();
    expect(ctx.personalization).toBeUndefined();
  });

  it('preserves userContext from input', () => {
    const input = createMockJobInput();
    const ctx = createContext('job-004', input);

    expect(ctx.input.userContext.name).toBe('Douglas Silva');
    expect(ctx.input.userContext.whatsapp).toBe('11999887766');
  });

  it('context can be spread with new fields', () => {
    const ctx = createContext('job-005', createMockJobInput());
    const enriched = { ...ctx, extractedText: 'Texto extraído do PDF' };

    expect(enriched.jobId).toBe('job-005');
    expect(enriched.extractedText).toBe('Texto extraído do PDF');
  });
});
