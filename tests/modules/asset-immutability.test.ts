/**
 * Tests: Asset Immutability Policy
 *
 * Verifica que a política de preservação dos assets está funcionando:
 * - Assets mantêm isOriginal: true
 * - Operações proibidas são bloqueadas
 * - Composição em camadas separadas é validada
 */

import { describe, it, expect } from 'vitest';
import {
  assertAssetImmutable,
  validateCompositionLayers,
  isOperationSafe,
  assertOperationAllowed,
  extractReferencedAssetIds,
  type AssetOperation,
} from '../../src/domain/policies/asset-immutability.js';
import { LayerType, AssetFitMode } from '../../src/domain/entities/composition.js';
import type { CompositionLayer, BaseAssetLayer, TextOverlayLayer } from '../../src/domain/entities/composition.js';
import { createMockAsset } from '../fixtures.js';

describe('Asset Immutability Policy', () => {
  describe('assertAssetImmutable', () => {
    it('passes for valid original asset', () => {
      const asset = createMockAsset({ isOriginal: true as const });
      expect(() => assertAssetImmutable(asset)).not.toThrow();
    });

    it('throws for asset without isOriginal flag', () => {
      const asset = { ...createMockAsset(), isOriginal: false } as any;
      expect(() => assertAssetImmutable(asset)).toThrow('AssetImmutabilityViolation');
    });
  });

  describe('isOperationSafe', () => {
    it('allows safe operations', () => {
      const safeOps: AssetOperation[] = [
        'read', 'classify', 'correlate', 'reference',
        'compose-layer', 'thumbnail', 'hash', 'metadata', 'position',
      ];
      for (const op of safeOps) {
        expect(isOperationSafe(op)).toBe(true);
      }
    });

    it('blocks prohibited operations', () => {
      const prohibited: AssetOperation[] = [
        'modify', 'overwrite', 'enhance', 'replace',
        'crop', 'resize', 'recolor', 'remove-elements',
      ];
      for (const op of prohibited) {
        expect(isOperationSafe(op)).toBe(false);
      }
    });
  });

  describe('assertOperationAllowed', () => {
    it('does not throw for safe operations', () => {
      expect(() => assertOperationAllowed('read', 'asset-1')).not.toThrow();
      expect(() => assertOperationAllowed('classify', 'asset-1')).not.toThrow();
      expect(() => assertOperationAllowed('thumbnail', 'asset-1')).not.toThrow();
    });

    it('throws for prohibited operations', () => {
      expect(() => assertOperationAllowed('modify', 'asset-1')).toThrow('PROIBIDA');
      expect(() => assertOperationAllowed('overwrite', 'asset-1')).toThrow('PROIBIDA');
      expect(() => assertOperationAllowed('enhance', 'asset-1')).toThrow('PROIBIDA');
    });
  });

  describe('validateCompositionLayers', () => {
    it('returns no warnings for correct layer ordering', () => {
      const layers: CompositionLayer[] = [
        { type: LayerType.BASE_ASSET, assetId: 'a1', fitMode: AssetFitMode.COVER, opacity: 1 },
        { type: LayerType.TEXT_OVERLAY, text: 'Hello', role: 'headline', anchor: 'center' as any, fontSize: 'large', color: '#fff', align: 'center' },
      ];
      const warnings = validateCompositionLayers(layers);
      expect(warnings).toHaveLength(0);
    });

    it('warns about FILL mode on base asset layer', () => {
      const layers: CompositionLayer[] = [
        { type: LayerType.BASE_ASSET, assetId: 'a1', fitMode: AssetFitMode.FILL, opacity: 1 },
      ];
      const warnings = validateCompositionLayers(layers);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('FILL');
    });
  });

  describe('extractReferencedAssetIds', () => {
    it('extracts asset IDs from base layers', () => {
      const layers: CompositionLayer[] = [
        { type: LayerType.BASE_ASSET, assetId: 'asset-1', fitMode: AssetFitMode.COVER, opacity: 1 },
        { type: LayerType.TEXT_OVERLAY, text: 'Hello', role: 'headline', anchor: 'center' as any, fontSize: 'large', color: '#fff', align: 'center' },
        { type: LayerType.BASE_ASSET, assetId: 'asset-2', fitMode: AssetFitMode.CONTAIN, opacity: 1 },
      ];
      const ids = extractReferencedAssetIds(layers);
      expect(ids).toEqual(['asset-1', 'asset-2']);
    });

    it('returns empty array when no base layers', () => {
      const layers: CompositionLayer[] = [
        { type: LayerType.TEXT_OVERLAY, text: 'Hello', role: 'headline', anchor: 'center' as any, fontSize: 'large', color: '#fff', align: 'center' },
      ];
      const ids = extractReferencedAssetIds(layers);
      expect(ids).toEqual([]);
    });
  });
});
