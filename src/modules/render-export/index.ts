/**
 * Módulo: Render/Export Engine
 *
 * Estágio final do pipeline — transforma planos (MediaPlan, BlogPlan,
 * LandingPagePlan) em artefatos exportáveis prontos para consumo.
 *
 * Pipeline interno:
 * 1. Exportar MediaPlans → RENDER_SPEC (JSON) + MEDIA_METADATA (JSON)
 * 2. Exportar BlogPlans → HTML + Markdown + JSON
 * 3. Exportar LandingPagePlans → HTML + JSON
 * 4. Validar artefatos e consolidar resultado
 *
 * Cada artefato é auto-contido e rastreável ao plano de origem.
 * Assets são referenciados por ID ({{asset:<id>}}) nos templates,
 * permitindo resolução lazy no momento da renderização final.
 *
 * Este módulo NÃO renderiza vídeo/imagem — ele gera especificações
 * técnicas (render specs) que podem ser consumidas por motores
 * externos (FFmpeg, Remotion, Canvas, Sharp, etc.).
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { ExportResult, ExportArtifact } from '../../domain/entities/export-artifact.js';
import { ArtifactType, ArtifactStatus } from '../../domain/entities/export-artifact.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';

import { exportMediaPlans } from './media-exporter.js';
import { exportBlogPlans } from './blog-exporter.js';
import { exportLandingPagePlans } from './lp-exporter.js';

export class RenderExportModule implements IModule {
  readonly stage = PipelineStage.PERSONALIZATION; // Runs after personalization
  readonly name = 'Render/Export Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const mediaPlans = context.mediaPlans ?? [];
    const blogPlans = context.blogPlans ?? [];
    const lpPlans = context.landingPagePlans ?? [];

    logger.info(
      `[RenderExport] Exportando: ` +
        `${mediaPlans.length} media, ${blogPlans.length} blog, ${lpPlans.length} LP`,
    );

    // --- Etapa 1: Exportar MediaPlans ---
    const mediaArtifacts = mediaPlans.length > 0
      ? exportMediaPlans(mediaPlans)
      : [];

    // --- Etapa 2: Exportar BlogPlans ---
    const blogArtifacts = blogPlans.length > 0
      ? exportBlogPlans(blogPlans)
      : [];

    // --- Etapa 3: Exportar LandingPagePlans ---
    const lpArtifacts = lpPlans.length > 0
      ? exportLandingPagePlans(lpPlans)
      : [];

    // --- Consolidar resultado ---
    const allArtifacts = [...mediaArtifacts, ...blogArtifacts, ...lpArtifacts];

    const result: ExportResult = {
      totalArtifacts: allArtifacts.length,
      mediaSpecs: countByType(allArtifacts, ArtifactType.MEDIA_RENDER_SPEC) +
        countByType(allArtifacts, ArtifactType.MEDIA_METADATA),
      blogArticles: countByType(allArtifacts, ArtifactType.BLOG_ARTICLE),
      landingPages: countByType(allArtifacts, ArtifactType.LANDING_PAGE),
      withWarnings: allArtifacts.filter((a) => a.warnings.length > 0).length,
      invalid: allArtifacts.filter((a) => a.status === ArtifactStatus.INVALID).length,
      artifacts: allArtifacts,
    };

    logExportSummary(result);

    return {
      ...context,
      exportResult: result,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByType(artifacts: ExportArtifact[], type: ArtifactType): number {
  return artifacts.filter((a) => a.artifactType === type).length;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logExportSummary(result: ExportResult): void {
  logger.info(
    `[RenderExport] ${result.totalArtifacts} artefatos gerados: ` +
      `${result.mediaSpecs} media, ` +
      `${result.blogArticles} blog, ` +
      `${result.landingPages} landing page`,
  );

  if (result.withWarnings > 0) {
    logger.info(`[RenderExport] ${result.withWarnings} artefatos com warnings`);
  }

  if (result.invalid > 0) {
    logger.warn(`[RenderExport] ${result.invalid} artefatos inválidos`);
  }

  // Log detalhado por artefato
  for (const artifact of result.artifacts) {
    const sizeKB = (artifact.sizeBytes / 1024).toFixed(1);
    const statusIcon = artifact.status === 'valid' ? '✓'
      : artifact.status === 'partial' ? '~'
      : '✗';

    logger.info(
      `[RenderExport]   ${statusIcon} ${artifact.artifactType} [${artifact.exportFormat}] ` +
        `"${artifact.title}" (${sizeKB}KB, ${artifact.referencedAssetIds.length} assets)`,
    );

    for (const warning of artifact.warnings) {
      logger.info(`[RenderExport]     ⚠ ${warning}`);
    }
  }
}

// Re-exports
export { exportMediaPlans } from './media-exporter.js';
export { exportBlogPlans } from './blog-exporter.js';
export { exportLandingPagePlans } from './lp-exporter.js';
