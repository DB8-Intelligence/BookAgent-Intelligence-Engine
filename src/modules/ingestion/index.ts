/**
 * Módulo: Ingestion
 *
 * Responsável por receber materiais brutos (PDF, vídeo, áudio, PPTX)
 * e convertê-los em dados intermediários para o pipeline.
 *
 * - Download/leitura do arquivo
 * - Detecção do tipo de material
 * - Extração de texto bruto
 * - Despacho para extractors específicos por tipo
 */

import { PipelineStage } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';

export class IngestionModule implements IModule {
  readonly stage = PipelineStage.INGESTION;
  readonly name = 'Ingestion';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    // TODO: Implementar lógica de ingestão
    // 1. Baixar/ler arquivo de context.input.fileUrl
    // 2. Detectar tipo (PDF, vídeo, áudio, PPTX)
    // 3. Extrair texto bruto via adapter
    // 4. Retornar context enriquecido com extractedText

    return {
      ...context,
      extractedText: '',
      pageTexts: [],
    };
  }
}
