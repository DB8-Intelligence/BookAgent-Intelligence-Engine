/**
 * Uploads — signed URL endpoint pra upload direto ao GCS do browser.
 *
 * Substitui o fluxo antigo que fazia upload via Supabase Storage SDK.
 * Agora o frontend pede uma signed URL (write, 2h TTL) e PUT direto ao GCS.
 *
 * POST /api/v1/uploads/signed-url
 *   body: { fileName: string, contentType: string }
 *   200 : { uploadUrl, publicUrl, gcsPath, path }
 *
 * Auth: firebaseAuthMiddleware já rodou. Se não houver authUser, 401.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { GCSStorageAdapter } from '../../adapters/storage/gcs.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

const router = Router();

let adapter: GCSStorageAdapter | null = null;

function getAdapter(): GCSStorageAdapter {
  if (adapter) return adapter;
  adapter = new GCSStorageAdapter({});
  return adapter;
}

router.post('/signed-url', async (req: Request, res: Response) => {
  if (!req.authUser?.id) {
    sendError(res, 'UNAUTHORIZED', 'Autenticação necessária', 401);
    return;
  }

  const { fileName, contentType } = req.body ?? {};
  if (typeof fileName !== 'string' || !fileName.trim()) {
    sendError(res, 'BAD_REQUEST', 'fileName obrigatório', 400);
    return;
  }
  if (typeof contentType !== 'string' || !contentType.trim()) {
    sendError(res, 'BAD_REQUEST', 'contentType obrigatório', 400);
    return;
  }

  // Path organizado por uid/YYYY-MM/random-uuid.ext pra garantir isolamento
  // entre usuários e evitar colisões.
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const ext = safeName.includes('.') ? safeName.split('.').pop() : '';
  const datePrefix = new Date().toISOString().slice(0, 7);
  const uploadId = randomUUID();
  const path = `uploads/${req.authUser.id}/${datePrefix}/${uploadId}${ext ? '.' + ext : ''}`;

  try {
    const a = getAdapter();
    const uploadUrl = await a.createUploadUrl(path, contentType, 7200);
    const bucketName = process.env.GCS_BUCKET ?? 'bookagent-uploads';
    const gcsPath = `gs://${bucketName}/${path}`;
    // publicUrl só válido se o bucket for público; caso contrário o pipeline
    // lê via gcsPath (gs://) usando Workload Identity.
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${path}`;

    sendSuccess(res, { uploadUrl, gcsPath, publicUrl, path, contentType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[Uploads] signed-url error: ${msg}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar signed URL', 500, err);
  }
});

export default router;
