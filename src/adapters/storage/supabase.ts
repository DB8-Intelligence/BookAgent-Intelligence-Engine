/**
 * Supabase Storage Uploader
 *
 * Cliente minimalista para upload de arquivos ao Supabase Storage via REST API.
 * Evita dependência do `@supabase/supabase-js` (o repo já usa fetch direto em
 * src/persistence/supabase-client.ts).
 *
 * Não implementa IStorageAdapter — é um helper focado em upload público e
 * bucket auto-provision, usado por módulos que precisam de URLs CDN estáveis
 * (ex.: Asset Extraction para PNG/SVG por página).
 */

import { logger } from '../../utils/logger.js';

export interface SupabaseUploaderOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
  /** Se true, garante o bucket público na inicialização (idempotente). */
  ensurePublic?: boolean;
}

export class SupabaseStorageUploader {
  private bucketEnsured = false;

  constructor(private readonly opts: SupabaseUploaderOptions) {}

  /**
   * Faz upload de um buffer para `{bucket}/{path}`.
   * Retorna a URL pública do objeto.
   */
  async upload(path: string, data: Buffer, contentType: string): Promise<string> {
    if (this.opts.ensurePublic !== false) {
      await this.ensureBucket();
    }

    const url = `${this.base()}/object/${this.opts.bucket}/${encodePath(path)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.serviceRoleKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Supabase Storage upload failed (${res.status}) for ${path}: ${text}`,
      );
    }

    return this.publicUrl(path);
  }

  /**
   * Retorna a URL pública de um objeto no bucket.
   */
  publicUrl(path: string): string {
    return `${this.base()}/object/public/${this.opts.bucket}/${encodePath(path)}`;
  }

  /**
   * Garante que o bucket existe e é público. Idempotente — cacheado em memória.
   */
  async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;

    const res = await fetch(`${this.base()}/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: this.opts.bucket, name: this.opts.bucket, public: true }),
    });

    if (res.ok) {
      logger.info(`Supabase Storage: bucket "${this.opts.bucket}" criado`);
    } else if (res.status === 409 || res.status === 400) {
      // 409 Conflict = bucket já existe. 400 = alguns projetos retornam assim.
      logger.debug(`Supabase Storage: bucket "${this.opts.bucket}" já existe`);
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Supabase Storage: falha ao garantir bucket "${this.opts.bucket}" (${res.status}): ${text}`,
      );
    }

    this.bucketEnsured = true;
  }

  private base(): string {
    return `${this.opts.supabaseUrl.replace(/\/$/, '')}/storage/v1`;
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
