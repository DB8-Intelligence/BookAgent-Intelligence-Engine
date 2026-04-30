/**
 * Módulo: Render/Export Engine
 *
 * Estágio final do pipeline — transforma planos (MediaPlan, BlogPlan,
 * LandingPagePlan) em artefatos exportáveis prontos para consumo.
 *
 * Pipeline interno:
 * 1. Exportar MediaPlans → RENDER_SPEC (com narração) + MEDIA_METADATA
 * 2. Exportar BlogPlans → HTML (texto expandido) + Markdown + JSON
 * 3. Exportar LandingPagePlans → HTML (copy gerada) + JSON
 * 4. Validar artefatos e consolidar resultado
 *
 * Quando AI_PROVIDER + API key estão configurados e AI_GENERATION_MODE
 * não é 'local', os artefatos HTML/MD contêm texto final gerado por IA.
 * Fallback automático para geração local se IA não estiver disponível.
 *
 * Cada artefato é auto-contido e rastreável ao plano de origem.
 * Assets são referenciados por ID ({{asset:<id>}}) nos templates.
 *
 * Este módulo NÃO renderiza vídeo/imagem — ele gera especificações
 * técnicas (render specs) e texto editorializado pronto para publicação.
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { ExportResult, ExportArtifact } from '../../domain/entities/export-artifact.js';
import { ArtifactType, ArtifactStatus } from '../../domain/entities/export-artifact.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { logger } from '../../utils/logger.js';
import { createProviderRouter } from '../../adapters/provider-router.js';
import { AITextService } from '../../services/ai-text-service.js';

import { exportMediaPlans } from './media-exporter.js';
import { exportBlogPlans } from './blog-exporter.js';
import { exportLandingPagePlans } from './lp-exporter.js';

export class RenderExportModule implements IModule {
  readonly stage = PipelineStage.RENDER_EXPORT;
  readonly name = 'Render/Export Engine';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const mediaPlans = context.mediaPlans ?? [];
    const blogPlans = context.blogPlans ?? [];
    const lpPlans = context.landingPagePlans ?? [];

    logger.info(
      `[RenderExport] Exportando: ` +
        `${mediaPlans.length} media, ${blogPlans.length} blog, ${lpPlans.length} LP`,
    );

    // ProviderRouter resolve o melhor adapter por tipo de conteúdo
    // Graceful degradation: sem chaves → geração local para todas as tarefas
    const router = createProviderRouter();
    const aiService = router.hasAnyProvider()
      ? new AITextService(router)
      : null;

    if (aiService) {
      const table = router.getRoutingTable();
      const mode = process.env.AI_GENERATION_MODE ?? 'auto';
      logger.info(
        `[RenderExport] AI text generation active (mode=${mode}, ` +
        `blog=${table.blog ?? 'local'}, landing=${table.landing_page ?? 'local'}, ` +
        `media=${table.media_script ?? 'local'})`,
      );
    } else {
      logger.info('[RenderExport] No AI keys — using local text generation for all tasks');
    }

    // --- Etapa 1: Exportar MediaPlans (async — com narração) ---
    const mediaArtifacts = mediaPlans.length > 0
      ? await exportMediaPlans(mediaPlans, aiService)
      : [];

    // --- Etapa 2: Exportar BlogPlans (async — com texto expandido) ---
    const blogArtifacts = blogPlans.length > 0
      ? await exportBlogPlans(blogPlans, aiService)
      : [];

    // --- Etapa 3: Exportar LandingPagePlans (async — com copy gerada) ---
    const lpArtifacts = lpPlans.length > 0
      ? await exportLandingPagePlans(lpPlans, aiService)
      : [];

    // --- Resolver placeholders {{asset:uuid}} → URLs reais ---
    const rawArtifacts = [...mediaArtifacts, ...blogArtifacts, ...lpArtifacts];
    const allArtifacts = resolveAssetPlaceholders(rawArtifacts, context.assetUrlMap);

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

/**
 * Substitui placeholders {{asset:uuid}} por URLs públicas reais
 * nos artefatos HTML, Markdown e JSON.
 */
function resolveAssetPlaceholders(
  artifacts: ExportArtifact[],
  assetUrlMap?: Record<string, string>,
): ExportArtifact[] {
  if (!assetUrlMap || Object.keys(assetUrlMap).length === 0) {
    return artifacts;
  }

  let resolved = 0;

  const result = artifacts.map((artifact) => {
    if (typeof artifact.content !== 'string') return artifact;

    let content = artifact.content;
    const regex = /\{\{asset:([0-9a-f-]{36})\}\}/g;

    content = content.replace(regex, (_match, assetId: string) => {
      const url = assetUrlMap[assetId];
      if (url) {
        resolved++;
        return url;
      }
      return _match; // Keep placeholder if no URL found
    });

    if (content === artifact.content) return artifact;

    return { ...artifact, content };
  });

  if (resolved > 0) {
    logger.info(`[RenderExport] Resolved ${resolved} asset placeholders to public URLs`);
  }

  return result;
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
