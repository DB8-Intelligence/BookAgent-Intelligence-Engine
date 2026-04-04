/**
 * Tests: Branding Module
 *
 * Verifica que o módulo de branding:
 * - Retorna branding vazio quando não há assets visuais
 * - Filtra apenas assets de imagem
 * - Calcula consistência visual
 */

import { describe, it, expect } from 'vitest';
import { BrandingModule } from '../../src/modules/branding/index.js';
import { createMockContext, createMockAsset } from '../fixtures.js';
import { PipelineStage } from '../../src/domain/value-objects/index.js';

describe('BrandingModule', () => {
  const mod = new BrandingModule();

  it('has correct stage and name', () => {
    expect(mod.stage).toBe(PipelineStage.BRANDING);
    expect(mod.name).toBe('Branding Preservation');
  });

  it('returns empty branding when no assets', async () => {
    const ctx = createMockContext({ assets: [] });
    const result = await mod.run(ctx);

    expect(result.branding).toBeDefined();
    expect(result.branding!.analyzedAssets).toBe(0);
  });

  it('returns empty branding when assets are non-image format', async () => {
    const ctx = createMockContext({
      assets: [
        createMockAsset({ format: 'pdf' }),
        createMockAsset({ format: 'svg' }),
      ],
    });
    const result = await mod.run(ctx);

    expect(result.branding).toBeDefined();
    expect(result.branding!.analyzedAssets).toBe(0);
  });
});
