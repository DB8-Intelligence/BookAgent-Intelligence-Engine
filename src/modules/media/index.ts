/**
 * Módulo: Media Generation
 *
 * Gera os outputs finais de mídia:
 * - Reels (MP4 9:16)
 * - Vídeos curtos e longos (MP4)
 * - Stories (MP4/PNG 9:16)
 * - Carrosséis (PNG)
 * - Posts (PNG/JPG)
 * - Apresentações (PPTX/PDF)
 * - Áudio monólogo e podcast (MP3)
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';

export class MediaGenerationModule implements IModule {
  readonly stage = PipelineStage.MEDIA_GENERATION;
  readonly name = 'Media Generation';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    // TODO: Implementar geração de mídia
    // 1. Para cada output selecionado em context.selectedOutputs
    // 2. Chamar sub-gerador específico (reel, carousel, post, etc.)
    // 3. Salvar arquivo via IStorageAdapter
    // 4. Retornar lista de GeneratedOutput[]

    return {
      ...context,
      outputs: [],
    };
  }
}
