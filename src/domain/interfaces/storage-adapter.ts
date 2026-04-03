/**
 * Interface: IStorageAdapter
 *
 * Contrato para adapters de armazenamento de arquivos.
 * Permite trocar storage local por S3/GCS sem modificar módulos.
 */

export interface IStorageAdapter {
  /** Salva um arquivo e retorna o path no storage */
  save(jobId: string, fileName: string, data: Buffer): Promise<string>;

  /** Lê um arquivo do storage */
  read(filePath: string): Promise<Buffer>;

  /** Verifica se um arquivo existe */
  exists(filePath: string): Promise<boolean>;

  /** Remove um arquivo */
  delete(filePath: string): Promise<void>;

  /** Cria o diretório de um job */
  createJobDir(jobId: string): Promise<string>;

  /** Remove todos os arquivos temporários de um job */
  cleanupTemp(jobId: string): Promise<void>;
}
