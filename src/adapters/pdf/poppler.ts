/**
 * Adapter: Poppler PDF Renderer
 *
 * Renderiza páginas de PDF como PNG (pdftoppm) e SVG (pdftocairo).
 * Requer `poppler-utils` instalado no sistema (ver Dockerfile).
 *
 * Composto com PDFParseAdapter para reuso da extração de texto e imagens embutidas.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFParseAdapter } from './index.js';
import type {
  IPDFAdapter,
  PDFTextResult,
  PDFImageResult,
} from '../../domain/interfaces/pdf-adapter.js';

export class PopplerPDFAdapter implements IPDFAdapter {
  private readonly base = new PDFParseAdapter();

  extractText(filePath: string): Promise<PDFTextResult> {
    return this.base.extractText(filePath);
  }

  extractImages(filePath: string): Promise<PDFImageResult[]> {
    return this.base.extractImages(filePath);
  }

  getPageCount(filePath: string): Promise<number> {
    return this.base.getPageCount(filePath);
  }

  /**
   * Renderiza uma página como PNG usando pdftoppm.
   * Default 300 DPI.
   */
  async renderPage(filePath: string, pageNumber: number, dpi = 300): Promise<Buffer> {
    const tmp = await mkdtemp(join(tmpdir(), 'poppler-png-'));
    try {
      const prefix = join(tmp, 'page');
      await runProcess('pdftoppm', [
        '-png',
        '-r', String(dpi),
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        filePath,
        prefix,
      ]);

      const files = await readdir(tmp);
      const out = files.find((f) => f.endsWith('.png'));
      if (!out) throw new Error(`pdftoppm produced no output for page ${pageNumber}`);
      return await readFile(join(tmp, out));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  /**
   * Renderiza uma página como SVG usando pdftocairo.
   */
  async renderPageSvg(filePath: string, pageNumber: number): Promise<Buffer> {
    const tmp = await mkdtemp(join(tmpdir(), 'poppler-svg-'));
    try {
      const out = join(tmp, `page-${pageNumber}.svg`);
      await runProcess('pdftocairo', [
        '-svg',
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        filePath,
        out,
      ]);
      return await readFile(out);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}

function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
