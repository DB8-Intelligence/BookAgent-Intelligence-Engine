/**
 * Controller: Process
 *
 * Recebe requisições de processamento, valida o payload,
 * chama o orchestrator e retorna o status do job.
 *
 * Endpoints:
 *   POST /process — Inicia processamento
 */

import type { Request, Response } from 'express';
import { InputType } from '../../domain/value-objects/index.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { ProcessRequestSchema } from '../schemas/process.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type { ProcessResponse } from '../types/responses.js';

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
 *
 * Retorna 202 Accepted com o job_id para acompanhamento.
 */
export async function createProcess(req: Request, res: Response): Promise<void> {
  const parsed = ProcessRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Payload inválido', 400, parsed.error.issues);
    return;
  }

  const { file_url, type, user_context } = parsed.data;

  try {
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

    const data: ProcessResponse = {
      job_id: job.id,
      status: job.status,
      message: 'Processamento iniciado',
    };

    sendSuccess(res, data, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao iniciar processamento';
    sendError(res, 'PROCESSING_ERROR', message, 500);
  }
}
