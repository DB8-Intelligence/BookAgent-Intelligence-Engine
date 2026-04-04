/**
 * Tests: Delivery Module
 *
 * Verifica que o módulo de delivery:
 * - Tem o stage correto (PipelineStage.DELIVERY)
 * - Monta manifesto a partir de exportResult
 * - Retorna pending_upload quando não há artifacts
 * - Retorna ready quando há artifacts
 */

import { describe, it, expect } from 'vitest';
import { DeliveryModule } from '../../src/modules/delivery/index.js';
import { createMockContext } from '../fixtures.js';
import { PipelineStage } from '../../src/domain/value-objects/index.js';
import { DeliveryStatus } from '../../src/domain/entities/delivery.js';
import { ArtifactType, ExportFormat, ArtifactStatus } from '../../src/domain/entities/export-artifact.js';
import { NarrativeType } from '../../src/domain/entities/narrative.js';
import { OutputFormat } from '../../src/domain/value-objects/index.js';

describe('DeliveryModule', () => {
  const mod = new DeliveryModule();

  it('has correct stage and name', () => {
    expect(mod.stage).toBe(PipelineStage.DELIVERY);
    expect(mod.name).toBe('Delivery');
  });

  it('returns pending_upload when no exportResult', async () => {
    const ctx = createMockContext();
    const result = await mod.run(ctx);

    expect(result.deliveryResult).toBeDefined();
    expect(result.deliveryResult!.status).toBe(DeliveryStatus.PENDING_UPLOAD);
    expect(result.deliveryResult!.totalArtifacts).toBe(0);
  });

  it('returns pending_upload when exportResult has no artifacts', async () => {
    const ctx = createMockContext({
      exportResult: {
        totalArtifacts: 0,
        mediaSpecs: 0,
        blogArticles: 0,
        landingPages: 0,
        withWarnings: 0,
        invalid: 0,
        artifacts: [],
      },
    });
    const result = await mod.run(ctx);

    expect(result.deliveryResult!.status).toBe(DeliveryStatus.PENDING_UPLOAD);
  });

  it('returns ready with manifest when artifacts exist', async () => {
    const ctx = createMockContext({
      exportResult: {
        totalArtifacts: 2,
        mediaSpecs: 1,
        blogArticles: 1,
        landingPages: 0,
        withWarnings: 0,
        invalid: 0,
        artifacts: [
          {
            id: 'art-1',
            artifactType: ArtifactType.MEDIA_RENDER_SPEC,
            exportFormat: ExportFormat.JSON,
            outputFormat: OutputFormat.REEL,
            narrativeType: NarrativeType.REEL_60,
            planId: 'plan-1',
            title: 'Reel Vista Verde',
            content: '{}',
            sizeBytes: 1024,
            filePath: '/storage/output/reel.json',
            status: ArtifactStatus.VALID,
            warnings: [],
            referencedAssetIds: ['asset-1'],
            createdAt: new Date(),
          },
          {
            id: 'art-2',
            artifactType: ArtifactType.BLOG_ARTICLE,
            exportFormat: ExportFormat.MARKDOWN,
            outputFormat: OutputFormat.BLOG,
            narrativeType: NarrativeType.BLOG_ARTICLE,
            planId: 'plan-2',
            title: 'Blog Vista Verde',
            content: '# Blog',
            sizeBytes: 512,
            filePath: '/storage/output/blog.md',
            status: ArtifactStatus.VALID,
            warnings: [],
            referencedAssetIds: [],
            createdAt: new Date(),
          },
        ],
      },
    });

    const result = await mod.run(ctx);

    expect(result.deliveryResult!.status).toBe(DeliveryStatus.READY);
    expect(result.deliveryResult!.totalArtifacts).toBe(2);
    expect(result.deliveryResult!.manifest.length).toBe(2);
    expect(result.deliveryResult!.manifest[0].artifactId).toBe('art-1');
    expect(result.deliveryResult!.manifest[1].artifactId).toBe('art-2');
    expect(result.deliveryResult!.webhookSent).toBe(false);
  });
});
