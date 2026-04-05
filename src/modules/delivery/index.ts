/**
 * Módulo: Delivery
 *
 * Último estágio do pipeline (15/15). Responsável por:
 * 1. Consolidar todos os artifacts gerados pelo render-export
 * 2. Montar um manifesto de entrega (DeliveryResult)
 * 3. Preparar URLs/caminhos de acesso aos artifacts
 * 4. Registrar canais de entrega disponíveis
 * 5. Indicar se vídeo render está pendente (post-pipeline async)
 *
 * Parte 59.3: Integração de vídeo no delivery manifest.
 * Video .mp4 artifacts são adicionados ao manifesto quando disponíveis
 * via Supabase lookup (rendered async pelo video-worker).
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import {
  DeliveryStatus,
  DeliveryChannel,
  type DeliveryResult,
  type DeliveryManifestEntry,
} from '../../domain/entities/delivery.js';
import { logger } from '../../utils/logger.js';

export class DeliveryModule implements IModule {
  readonly stage = PipelineStage.DELIVERY;
  readonly name = 'Delivery';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const exportResult = context.exportResult;

    if (!exportResult || exportResult.artifacts.length === 0) {
      logger.warn('[Delivery] Sem artifacts para entregar');
      const emptyResult: DeliveryResult = {
        status: DeliveryStatus.PENDING_UPLOAD,
        jobId: context.jobId,
        completedAt: new Date(),
        totalArtifacts: 0,
        manifest: [],
        channels: [DeliveryChannel.API],
        webhookSent: false,
        summary: 'Nenhum artifact disponível para entrega.',
      };
      return { ...context, deliveryResult: emptyResult };
    }

    // --- Montar manifesto a partir dos artifacts ---
    const manifest: DeliveryManifestEntry[] = exportResult.artifacts.map((a) => ({
      artifactId: a.id,
      type: a.artifactType,
      format: a.exportFormat,
      sizeBytes: a.sizeBytes,
      localPath: a.filePath,
    }));

    // Check if any RENDER_SPEC artifacts exist → video render available post-approval
    const { ArtifactType } = await import('../../domain/entities/export-artifact.js');
    const hasRenderSpecs = exportResult.artifacts.some(
      (a) => a.artifactType === ArtifactType.MEDIA_RENDER_SPEC,
    );
    const channels = [DeliveryChannel.API];
    if (hasRenderSpecs) {
      channels.push(DeliveryChannel.WEBHOOK);
    }

    const videoNote = hasRenderSpecs
      ? ' Vídeo disponível via POST /render-video após aprovação.'
      : '';

    const result: DeliveryResult = {
      status: DeliveryStatus.READY,
      jobId: context.jobId,
      completedAt: new Date(),
      totalArtifacts: manifest.length,
      manifest,
      channels,
      webhookSent: false,
      summary: `${manifest.length} artifact(s) prontos para acesso via API.${videoNote}`,
    };

    logger.info(
      `[Delivery] ${result.totalArtifacts} artifacts prontos — status=${result.status}` +
      (hasRenderSpecs ? ' (video render available post-approval)' : ''),
    );

    return { ...context, deliveryResult: result };
  }
}
