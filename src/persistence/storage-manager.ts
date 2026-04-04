/**
 * Storage Manager
 *
 * Responsável por salvar os artefatos gerados pelo pipeline em disco.
 * Preenche a lacuna onde artifacts têm `content` (string) + `filePath`,
 * mas nunca eram escritos em disco.
 *
 * Estrutura de diretórios:
 *   storage/
 *     assets/{jobId}/       → assets extraídos do PDF
 *       raw/                → PDF original
 *       pages/              → imagens de páginas
 *       thumbnails/         → miniaturas
 *       branding/           → assets de branding
 *     outputs/
 *       blog/{slug}.html    → artigos de blog (HTML)
 *       blog/{slug}.md      → artigos de blog (Markdown)
 *       landing-page/{slug}.html → landing pages
 *       audio/{planId}/     → arquivos MP3 de narração
 *     temp/{jobId}/         → arquivos temporários
 *
 * Uso:
 *   const mgr = new StorageManager();
 *   const saved = await mgr.saveArtifactFiles(result.exportResult.artifacts);
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExportArtifact } from '../domain/entities/export-artifact.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedFile {
  artifactId: string;
  filePath: string;
  sizeBytes: number;
}

export interface StorageSaveResult {
  saved: SavedFile[];
  skipped: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export class StorageManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.env.OUTPUTS_DIR ?? 'storage/outputs';
  }

  /**
   * Salva em disco os arquivos de todos os artifacts que possuem `content`.
   * Artifacts sem content (ex: RENDER_SPEC com assetIds apenas) são ignorados.
   *
   * @param artifacts - Lista de ExportArtifact do resultado do pipeline
   * @returns Resumo do que foi salvo, ignorado ou falhou
   */
  async saveArtifactFiles(artifacts: ExportArtifact[]): Promise<StorageSaveResult> {
    const saved: SavedFile[] = [];
    let skipped = 0;
    let failed = 0;

    for (const artifact of artifacts) {
      // Pular artifacts sem content ou sem filePath
      if (!artifact.content || !artifact.filePath) {
        skipped++;
        continue;
      }

      const resolvedPath = this.resolveFilePath(artifact.filePath);

      try {
        await mkdir(dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, artifact.content, 'utf-8');

        saved.push({
          artifactId: artifact.id,
          filePath: resolvedPath,
          sizeBytes: Buffer.byteLength(artifact.content, 'utf-8'),
        });

        logger.info(
          `[StorageManager] Saved: ${resolvedPath} ` +
          `(${(artifact.sizeBytes / 1024).toFixed(1)}KB)`,
        );
      } catch (err) {
        failed++;
        logger.warn(`[StorageManager] Failed to save ${resolvedPath}: ${err}`);
      }
    }

    logger.info(
      `[StorageManager] ${saved.length} files saved, ` +
      `${skipped} skipped, ${failed} failed`,
    );

    return { saved, skipped, failed };
  }

  /**
   * Garante que os diretórios de output existam.
   * Deve ser chamado na inicialização.
   */
  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.baseDir,
      join(this.baseDir, 'blog'),
      join(this.baseDir, 'landing-page'),
      join(this.baseDir, 'audio'),
    ];

    const assetBase = process.env.ASSETS_DIR ?? 'storage/assets';
    dirs.push(assetBase);

    const tempBase = process.env.TEMP_DIR ?? 'storage/temp';
    dirs.push(tempBase);

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }

    logger.info(`[StorageManager] Storage directories ensured`);
  }

  /**
   * Cria a estrutura de diretórios de um job específico.
   * Deve ser chamado quando um job é criado.
   */
  async createJobDirectories(jobId: string): Promise<void> {
    const assetBase = process.env.ASSETS_DIR ?? 'storage/assets';
    const tempBase = process.env.TEMP_DIR ?? 'storage/temp';

    const dirs = [
      join(assetBase, jobId),
      join(assetBase, jobId, 'raw'),
      join(assetBase, jobId, 'pages'),
      join(assetBase, jobId, 'thumbnails'),
      join(assetBase, jobId, 'branding'),
      join(tempBase, jobId),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve o caminho do artifact.
   * Se já começa com o baseDir, usa como está.
   * Se começa com 'storage/', usa como caminho relativo.
   */
  private resolveFilePath(filePath: string): string {
    // Se é caminho absoluto, usa como está
    if (filePath.startsWith('/') || /^[A-Za-z]:\\/.test(filePath)) {
      return filePath;
    }

    // Normalizar separadores de caminho
    const normalized = filePath.replace(/\\/g, '/');

    // Se começa com 'storage/', usa relativo à raiz do projeto
    if (normalized.startsWith('storage/')) {
      return join(process.cwd(), normalized);
    }

    // Usar baseDir como prefixo
    return join(this.baseDir, normalized);
  }
}
