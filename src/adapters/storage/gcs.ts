/**
 * Adapter: Google Cloud Storage
 *
 * Storage nativo GCP usando @google-cloud/storage com Service Account.
 * Coexiste com LocalStorageAdapter e SupabaseStorageUploader — ativado
 * via env var GCS_ENABLED=true. Quando ligado, a pipeline lê PDFs direto
 * do bucket (gs://) sem round-trip por storage externo.
 *
 * Vantagem quando processando no Cloud Run:
 *   - Arquivo e compute no mesmo datacenter → latência ~5ms
 *   - Permissões via IAM (Service Account), sem chaves espalhadas
 *   - Signed URLs nativos para frontend fazer upload direto
 *
 * Auth (mesma ordem do Vertex adapter):
 *   1. GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json (dev)
 *   2. Workload Identity (Cloud Run, GKE) — automático
 *   3. gcloud auth application-default login (dev local)
 *
 * Env vars:
 *   GCS_ENABLED=true                       — liga este adapter
 *   GCS_BUCKET=bookagent-uploads           — bucket principal (uploads + artifacts)
 *   GCS_PUBLIC_BUCKET=bookagent-public     — bucket público (LPs, vídeos renderizados)
 *   GOOGLE_CLOUD_PROJECT=bookagent-enterprise
 */

import { Storage, type Bucket } from '@google-cloud/storage';
import type { IStorageAdapter } from '../../domain/interfaces/storage-adapter.js';
import { logger } from '../../utils/logger.js';

export interface GCSStorageOptions {
  project?: string;
  bucket?: string;
  publicBucket?: string;
  /** Path to service account JSON. Optional — SDK auto-discovers. */
  keyFilename?: string;
}

export class GCSStorageAdapter implements IStorageAdapter {
  readonly provider = 'gcs';
  private readonly storage: Storage;
  private readonly bucket: Bucket;
  private readonly publicBucket: Bucket;

  constructor(opts: GCSStorageOptions = {}) {
    const project = opts.project ?? process.env.GOOGLE_CLOUD_PROJECT;
    const bucketName = opts.bucket ?? process.env.GCS_BUCKET ?? 'bookagent-uploads';
    const publicBucketName = opts.publicBucket ?? process.env.GCS_PUBLIC_BUCKET ?? bucketName;

    if (!project) {
      throw new Error('[GCSStorage] GOOGLE_CLOUD_PROJECT not set');
    }

    this.storage = new Storage({
      projectId: project,
      ...(opts.keyFilename && { keyFilename: opts.keyFilename }),
    });

    this.bucket = this.storage.bucket(bucketName);
    this.publicBucket = this.storage.bucket(publicBucketName);

    logger.info(
      `[GCSStorage] Initialized: project=${project}, bucket=${bucketName}, public=${publicBucketName}`,
    );
  }

  // -------------------------------------------------------------------------
  // IStorageAdapter contract
  // -------------------------------------------------------------------------

  /** Salva um buffer no bucket principal. Retorna gs:// URI. */
  async save(jobId: string, fileName: string, data: Buffer): Promise<string> {
    const path = `jobs/${jobId}/${fileName}`;
    const file = this.bucket.file(path);

    await file.save(data, {
      resumable: false, // small files: single-shot upload is faster
      contentType: this.inferContentType(fileName),
    });

    return `gs://${this.bucket.name}/${path}`;
  }

  /** Lê um arquivo. Aceita gs:// URI ou path relativo no bucket. */
  async read(fileUri: string): Promise<Buffer> {
    const { bucket, path } = this.parseUri(fileUri);
    const [data] = await bucket.file(path).download();
    return data;
  }

  async exists(fileUri: string): Promise<boolean> {
    try {
      const { bucket, path } = this.parseUri(fileUri);
      const [exists] = await bucket.file(path).exists();
      return exists;
    } catch {
      return false;
    }
  }

  async delete(fileUri: string): Promise<void> {
    const { bucket, path } = this.parseUri(fileUri);
    await bucket.file(path).delete({ ignoreNotFound: true });
  }

  async createJobDir(jobId: string): Promise<string> {
    // GCS has no dirs — prefixes are virtual. Just return the prefix.
    // createJobDir is a noop; files are created under jobs/{jobId}/... on save.
    return `gs://${this.bucket.name}/jobs/${jobId}`;
  }

  async cleanupTemp(jobId: string): Promise<void> {
    // Delete all objects under jobs/{jobId}/temp/
    const prefix = `jobs/${jobId}/temp/`;
    const [files] = await this.bucket.getFiles({ prefix });
    await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  }

  // -------------------------------------------------------------------------
  // Extensions beyond IStorageAdapter
  // -------------------------------------------------------------------------

  /**
   * Upload para o bucket PÚBLICO e retorna URL pública permanente.
   * Para landing pages, reels renderizados, thumbnails — tudo que o
   * frontend ou Meta/Instagram precisa consumir.
   */
  async uploadPublic(path: string, data: Buffer, contentType: string): Promise<string> {
    const file = this.publicBucket.file(path);
    await file.save(data, {
      resumable: false,
      contentType,
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
    // Uniform bucket-level access should be ON — public URL pattern:
    return `https://storage.googleapis.com/${this.publicBucket.name}/${path}`;
  }

  /**
   * Gera signed URL temporária (download). Útil quando o bucket é privado
   * e o frontend precisa baixar um artifact específico.
   */
  async createSignedUrl(path: string, ttlSeconds: number = 3600): Promise<string> {
    const [url] = await this.bucket.file(path).getSignedUrl({
      action: 'read',
      expires: Date.now() + ttlSeconds * 1000,
    });
    return url;
  }

  /**
   * Gera signed URL para UPLOAD do frontend direto ao GCS (bypass do backend).
   * Equivalente ao createSignedUrl do Supabase que o UploadWizard usa hoje.
   */
  async createUploadUrl(path: string, contentType: string, ttlSeconds: number = 7200): Promise<string> {
    const [url] = await this.bucket.file(path).getSignedUrl({
      action: 'write',
      expires: Date.now() + ttlSeconds * 1000,
      contentType,
    });
    return url;
  }

  /**
   * Baixa um objeto de um gs:// URI para um buffer.
   * Conveniente para o pipeline: ingestion lê PDF direto do bucket.
   */
  async downloadToBuffer(gcsUri: string): Promise<Buffer> {
    return this.read(gcsUri);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private parseUri(fileUri: string): { bucket: Bucket; path: string } {
    if (fileUri.startsWith('gs://')) {
      const withoutScheme = fileUri.slice(5);
      const slashIdx = withoutScheme.indexOf('/');
      if (slashIdx < 0) throw new Error(`[GCSStorage] Malformed gs:// URI: ${fileUri}`);
      const bucketName = withoutScheme.slice(0, slashIdx);
      const path = withoutScheme.slice(slashIdx + 1);
      return { bucket: this.storage.bucket(bucketName), path };
    }
    // Relative path → use primary bucket
    return { bucket: this.bucket, path: fileUri };
  }

  private inferContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'webp': return 'image/webp';
      case 'mp4': return 'video/mp4';
      case 'json': return 'application/json';
      case 'html': return 'text/html';
      case 'md': return 'text/markdown';
      default: return 'application/octet-stream';
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Cria um GCS adapter se GCS_ENABLED=true E GOOGLE_CLOUD_PROJECT setado. */
export function tryCreateGCSAdapter(): GCSStorageAdapter | null {
  if (process.env.GCS_ENABLED !== 'true') return null;
  if (!process.env.GOOGLE_CLOUD_PROJECT) return null;
  try {
    return new GCSStorageAdapter();
  } catch (err) {
    logger.warn(`[GCSStorage] Failed to initialize: ${(err as Error).message}`);
    return null;
  }
}
