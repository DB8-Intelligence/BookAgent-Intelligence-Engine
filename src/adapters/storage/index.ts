/**
 * Adapter: Local Storage
 *
 * Implementação de IStorageAdapter usando sistema de arquivos local.
 * Evolução futura: S3, GCS, Azure Blob.
 */

import type { IStorageAdapter } from '../../domain/interfaces/storage-adapter.js';

export class LocalStorageAdapter implements IStorageAdapter {
  constructor(private baseDir: string = 'storage') {}

  async save(jobId: string, fileName: string, data: Buffer): Promise<string> {
    // TODO: Implementar fs.writeFile
    throw new Error('Storage save not implemented');
  }

  async read(filePath: string): Promise<Buffer> {
    // TODO: Implementar fs.readFile
    throw new Error('Storage read not implemented');
  }

  async exists(filePath: string): Promise<boolean> {
    // TODO: Implementar fs.access
    throw new Error('Storage exists not implemented');
  }

  async delete(filePath: string): Promise<void> {
    // TODO: Implementar fs.unlink
    throw new Error('Storage delete not implemented');
  }

  async createJobDir(jobId: string): Promise<string> {
    // TODO: Implementar fs.mkdir
    throw new Error('Storage createJobDir not implemented');
  }

  async cleanupTemp(jobId: string): Promise<void> {
    // TODO: Implementar remoção de temp
    throw new Error('Storage cleanup not implemented');
  }
}
