/**
 * Módulo: Ingestion
 *
 * Primeiro estágio do pipeline. Responsável por:
 * 1. Receber a URL do material
 * 2. Baixar o arquivo para o storage local (ou usar arquivo local)
 * 3. Extrair texto bruto (para PDFs, via pdf-parse)
 * 4. Popular o context com extractedText, pageTexts e localFilePath
 *
 * Este módulo prepara os dados brutos para os estágios seguintes:
 * - Asset Extraction usa localFilePath para extrair imagens
 * - Correlation usa pageTexts para associar texto a imagens
 * - Source Intelligence usa extractedText para classificação
 */

import { writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { PipelineStage, InputType } from '../../domain/value-objects/index.js';
import type { IModule } from '../../domain/interfaces/module.js';
import type { ProcessingContext } from '../../core/context.js';
import { PDFParseAdapter } from '../../adapters/pdf/index.js';
import { LocalStorageAdapter } from '../../adapters/storage/index.js';
import { logger } from '../../utils/logger.js';

export class IngestionModule implements IModule {
  readonly stage = PipelineStage.INGESTION;
  readonly name = 'Ingestion';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    const { fileUrl, type } = context.input;

    // --- Passo 1: Obter o arquivo ---
    let localFilePath: string;

    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      // Download do arquivo
      logger.info(`Ingestion: baixando ${fileUrl}`);
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Ingestion: falha ao baixar arquivo (${response.status})`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const storage = new LocalStorageAdapter();
      const ext = type === InputType.PDF ? '.pdf' : '';
      localFilePath = join('storage', 'temp', context.jobId, `input${ext}`);
      await storage.createJobDir(context.jobId);

      // Salvar no temp
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join('storage', 'temp', context.jobId), { recursive: true });
      await writeFile(localFilePath, buffer);
    } else {
      // Arquivo local — verificar existência
      try {
        await access(fileUrl);
        localFilePath = fileUrl;
      } catch {
        throw new Error(`Ingestion: arquivo não encontrado: ${fileUrl}`);
      }
    }

    logger.info(`Ingestion: arquivo disponível em ${localFilePath}`);

    // --- Passo 2: Extrair texto (apenas PDF na v1) ---
    let extractedText = '';
    let pageTexts: Array<{ pageNumber: number; text: string }> = [];

    if (type === InputType.PDF) {
      const pdfAdapter = new PDFParseAdapter();
      const textResult = await pdfAdapter.extractText(localFilePath);
      extractedText = textResult.fullText;
      pageTexts = textResult.pages;

      logger.info(
        `Ingestion: texto extraído — ${extractedText.length} chars, ${pageTexts.length} páginas`,
      );
    } else {
      logger.warn(`Ingestion: extração de texto não suportada para tipo "${type}" na v1`);
    }

    return {
      ...context,
      localFilePath,
      extractedText,
      pageTexts,
    };
  }
}
