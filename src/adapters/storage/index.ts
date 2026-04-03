/**
 * Adapter: Local Storage
 *
 * Implementação de IStorageAdapter usando sistema de arquivos local.
 * Gerencia diretórios por job e operações CRUD de arquivos.
 *
 * Evolução futura: S3, GCS, Azure Blob.
 */

import { mkdir, readFile, writeFile, access, unlink, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { IStorageAdapter } from '../../domain/interfaces/storage-adapter.js';

export class LocalStorageAdapter implements IStorageAdapter {
  constructor(private baseDir: string = 'storage') {}

  async save(jobId: string, fileName: string, data: Buffer): Promise<string> {
    const filePath = join(this.baseDir, 'assets', jobId, fileName);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    await unlink(filePath);
  }

  async createJobDir(jobId: string): Promise<string> {
    const dirs = ['raw', 'pages', 'thumbnails', 'branding'];
    const base = join(this.baseDir, 'assets', jobId);

    for (const dir of dirs) {
      await mkdir(join(base, dir), { recursive: true });
    }

    return base;
  }

  async cleanupTemp(jobId: string): Promise<void> {
    const tempDir = join(this.baseDir, 'temp', jobId);
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore if temp dir doesn't exist
    }
  }
}
