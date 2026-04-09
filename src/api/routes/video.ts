/**
 * Video Generation Routes — v2
 *
 * POST /generate-video/v2          → Start video generation (background)
 * GET  /generate-video/v2/status/:job_id → Poll job status
 */
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Helper: Supabase REST call
async function supabaseQuery(table: string, method: string, body?: unknown, filter?: string): Promise<unknown> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter ? `?${filter}` : ''}`;
  const headers: Record<string, string> = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  return contentType.includes('json') ? res.json() : null;
}

// Helper: Upload to Supabase Storage
async function supabaseUpload(bucket: string, storagePath: string, fileBuffer: Buffer): Promise<string> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'video/mp4',
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage upload failed: ${res.status} ${text}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

interface VideoRequest {
  photos: string[];
  template: string;
  briefing: { street?: string; price?: string; details?: string };
  music_mood: string;
  user_id: string;
  property_id?: string;
}

// POST /v2
router.post('/v2', async (req: Request, res: Response) => {
  const { photos, template, briefing, music_mood, user_id, property_id }: VideoRequest = req.body;

  if (!photos?.length || photos.length < 2) {
    return res.status(400).json({ error: 'Mínimo de 2 fotos necessário' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const job_id = uuidv4();

  // Create job record
  await supabaseQuery('video_jobs', 'POST', {
    id: job_id,
    user_id,
    property_id: property_id || null,
    status: 'processing',
    template,
    tier: 'tier1',
  });

  res.json({ job_id, status: 'processing', estimated_seconds: 60 });

  // Process in background
  const scriptPath = path.resolve('video', 'run_generator.py');
  const payload = JSON.stringify({
    photos,
    template: template || 'slideshow_classico',
    briefing: briefing || {},
    music_mood: music_mood || 'urbano',
    job_id,
    output_dir: '/tmp/videos',
  });

  const escapedPayload = payload.replace(/'/g, "'\\''");
  const pyCmd = `python3 ${scriptPath} '${escapedPayload}'`;

  logger.info(`[Video] Starting generation job ${job_id}, ${photos.length} photos, template=${template}`);

  exec(pyCmd, { timeout: 300_000 }, async (error, stdout, stderr) => {
    if (error) {
      logger.error(`[Video] Job ${job_id} failed:`, stderr.slice(0, 500));
      await supabaseQuery('video_jobs', 'PATCH',
        { status: 'error', error_msg: stderr.slice(0, 500) },
        `id=eq.${job_id}`
      );
      return;
    }

    const outputPath = stdout.trim();
    if (!fs.existsSync(outputPath)) {
      logger.error(`[Video] Job ${job_id}: output file not found at ${outputPath}`);
      await supabaseQuery('video_jobs', 'PATCH',
        { status: 'error', error_msg: 'Output file not found' },
        `id=eq.${job_id}`
      );
      return;
    }

    try {
      const fileBuffer = fs.readFileSync(outputPath);
      const storagePath = `${user_id}/${job_id}.mp4`;
      const publicUrl = await supabaseUpload('videos', storagePath, fileBuffer);

      await supabaseQuery('video_jobs', 'PATCH',
        { status: 'done', video_url: publicUrl },
        `id=eq.${job_id}`
      );

      logger.info(`[Video] Job ${job_id} complete: ${publicUrl}`);
      try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    } catch (uploadErr) {
      logger.error(`[Video] Job ${job_id} upload failed:`, uploadErr);
      await supabaseQuery('video_jobs', 'PATCH',
        { status: 'error', error_msg: String(uploadErr) },
        `id=eq.${job_id}`
      );
    }
  });
});

// GET /v2/status/:job_id
router.get('/v2/status/:job_id', async (req: Request, res: Response) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { job_id } = req.params;
  try {
    const data = await supabaseQuery('video_jobs', 'GET', undefined,
      `id=eq.${job_id}&select=id,status,video_url,error_msg,created_at,updated_at`
    );
    const rows = data as unknown[];
    if (!rows || (Array.isArray(rows) && rows.length === 0)) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(Array.isArray(rows) ? rows[0] : rows);
  } catch {
    res.status(404).json({ error: 'Job not found' });
  }
});

export default router;
