/**
 * Controller: Process
 *
 * Recebe requisições de processamento, valida o payload,
 * chama o orchestrator e retorna o status do job.
 */

import type { Request, Response } from 'express';
import { InputType } from '../../domain/value-objects/index.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { ProcessRequestSchema } from '../schemas/process.js';

const INPUT_TYPE_MAP: Record<string, InputType> = {
  pdf: InputType.PDF,
  video: InputType.VIDEO,
  audio: InputType.AUDIO,
  pptx: InputType.PPTX,
  document: InputType.DOCUMENT,
};

/** Instância compartilhada do orchestrator — inicializada pelo bootstrap */
let orchestrator: Orchestrator;

export function setOrchestrator(orch: Orchestrator): void {
  orchestrator = orch;
}

/**
 * POST /process — Inicia o processamento de um material.
 */
export async function createProcess(req: Request, res: Response): Promise<void> {
  const parsed = ProcessRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Payload inválido',
      details: parsed.error.issues,
    });
    return;
  }

  const { file_url, type, user_context } = parsed.data;

  const job = await orchestrator.process({
    fileUrl: file_url,
    type: INPUT_TYPE_MAP[type],
    userContext: {
      name: user_context.name,
      whatsapp: user_context.whatsapp,
      instagram: user_context.instagram,
      site: user_context.site,
      region: user_context.region,
      logoUrl: user_context.logo_url,
    },
  });

  res.status(202).json({
    job_id: job.id,
    status: job.status,
    message: 'Processamento iniciado',
  });
}

/**
 * GET /process/:jobId — Consulta o status de um job.
 */
export function getProcessStatus(req: Request, res: Response): void {
  const { jobId } = req.params;
  const job = orchestrator.getJobStatus(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job não encontrado' });
    return;
  }

  res.json({
    job_id: job.id,
    status: job.status,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    result: job.result ?? null,
    error: job.error ?? null,
  });
}
