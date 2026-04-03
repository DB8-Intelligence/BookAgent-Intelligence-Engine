/**
 * Módulo: Correlation (antigo text-image-correlation)
 *
 * Correlaciona imagens extraídas com blocos de texto correspondentes.
 *
 * Estratégias:
 * - Proximidade espacial (imagem e texto na mesma página/região)
 * - Co-localização de página (imagem e texto na mesma página)
 * - Matching semântico via LLM (descrever imagem e comparar com texto)
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';

export class CorrelationModule implements IModule {
  readonly stage = PipelineStage.CORRELATION;
  readonly name = 'Correlation';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    // TODO: Implementar correlação texto ↔ imagem
    // 1. Para cada asset, identificar texto da mesma página
    // 2. Usar proximidade espacial quando posição disponível
    // 3. Usar IAIAdapter para matching semântico como fallback

    return {
      ...context,
      correlations: new Map(),
    };
  }
}
