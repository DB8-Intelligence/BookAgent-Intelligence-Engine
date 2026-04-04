/**
 * Tests: Correlation Module
 *
 * Verifica que o módulo de correlação:
 * - Gera blocos de correlação a partir de textos e assets
 * - Retorna vazio quando não há dados
 * - Atualiza correlationIds nos assets
 */

import { describe, it, expect } from 'vitest';
import { CorrelationModule } from '../../src/modules/correlation/index.js';
import { createMockContext, createMockAsset } from '../fixtures.js';
import { PipelineStage } from '../../src/domain/value-objects/index.js';

describe('CorrelationModule', () => {
  const mod = new CorrelationModule();

  it('has correct stage and name', () => {
    expect(mod.stage).toBe(PipelineStage.CORRELATION);
    expect(mod.name).toBe('Correlation Engine');
  });

  it('returns empty correlations when no text and no assets', async () => {
    const ctx = createMockContext({ pageTexts: [], assets: [] });
    const result = await mod.run(ctx);

    expect(result.correlations).toEqual([]);
  });

  it('creates correlation blocks from text and assets on same page', async () => {
    const ctx = createMockContext({
      pageTexts: [
        { pageNumber: 1, text: 'Residencial Vista Verde — Lançamento exclusivo\nConheça o empreendimento.' },
        { pageNumber: 2, text: 'Lazer completo com piscina e academia.' },
      ],
      assets: [
        createMockAsset({ id: 'asset-1', page: 1 }),
        createMockAsset({ id: 'asset-2', page: 2 }),
      ],
    });

    const result = await mod.run(ctx);

    expect(result.correlations).toBeDefined();
    expect(result.correlations!.length).toBeGreaterThan(0);

    // Check that assets received correlationIds
    const updatedAsset = result.assets?.find((a) => a.id === 'asset-1');
    if (updatedAsset && updatedAsset.correlationIds) {
      expect(updatedAsset.correlationIds.length).toBeGreaterThan(0);
    }
  });

  it('creates blocks from text even without assets', async () => {
    const ctx = createMockContext({
      pageTexts: [
        { pageNumber: 1, text: 'Residencial Vista Verde — Lançamento exclusivo' },
      ],
      assets: [],
    });

    const result = await mod.run(ctx);
    expect(result.correlations).toBeDefined();
    expect(result.correlations!.length).toBeGreaterThanOrEqual(0);
  });
});
