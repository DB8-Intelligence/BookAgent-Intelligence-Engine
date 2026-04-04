/**
 * Controller: Process
 *
 * POST /process — Inicia processamento de um material.
 *
 * Dois modos de operação:
 *
 * QUEUE MODE (Redis configurado):
 *   → Valida payload
 *   → Adiciona job à fila BullMQ
 *   → Retorna 202 com jobId imediatamente
 *   → Worker processa em background
 *   → Webhook POST ao finalizar (se webhook_url fornecido)
 *
 * SYNC MODE (sem Redis — fallback):
 *   → Valida payload
 *   → Chama orchestrator.process() diretamente (bloqueante)
 *   → Retorna 202 com jobId após conclusão
 *
 * O modo é selecionado automaticamente por getQueue():
 *   null → sync, instância → queue.
 */

import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { InputType } from '../../domain/value-objects/index.js';
import type { IOrchestratorLike } from '../types/orchestrator.js';
import { ProcessRequestSchema } from '../schemas/process.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import type { ProcessResponse } from '../types/responses.js';
import { getQueue, enqueueJob } from '../../queue/queue.js';

const INPUT_TYPE_MAP: Record<string, InputType> = {
  pdf:      InputType.PDF,
  video:    InputType.VIDEO,
  audio:    InputType.AUDIO,
  pptx:     InputType.PPTX,
  document: InputType.DOCUMENT,
};

/** Instância compartilhada do orchestrator — inicializada pelo bootstrap */
let orchestrator: IOrchestratorLike;

export function setOrchestrator(orch: IOrchestratorLike): void {
  orchestrator = orch;
}

// ---------------------------------------------------------------------------
// POST /process
// ---------------------------------------------------------------------------

/**
 * POST /process — Inicia o processamento de um material.
 *
 * Em queue mode: retorna 202 imediatamente com status=pending.
 * Em sync mode:  retorna 202 após processamento completo.
 */
export async function createProcess(req: Request, res: Response): Promise<void> {
  const parsed = ProcessRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Payload inválido', 400, parsed.error.issues);
    return;
  }

  const { file_url, type, user_context, webhook_url } = parsed.data;

  // Queue mode — Redis disponível
  const queue = getQueue();
  if (queue) {
    await handleQueueMode(res, { file_url, type, user_context, webhook_url });
    return;
  }

  // Sync mode — fallback (sem Redis)
  await handleSyncMode(res, { file_url, type, user_context });
}

// ---------------------------------------------------------------------------
// Handlers privados
// ---------------------------------------------------------------------------

async function handleQueueMode(
  res: Response,
  params: {
    file_url: string;
    type: string;
    user_context: Record<string, string | undefined>;
    webhook_url?: string;
  },
): Promise<void> {
  const { file_url, type, user_context, webhook_url } = params;
  const jobId = randomUUID();

  try {
    await enqueueJob({
      jobId,
      fileUrl:    file_url,
      type,
      userContext: {
        name:      user_context.name,
        whatsapp:  user_context.whatsapp,
        instagram: user_context.instagram,
        site:      user_context.site,
        region:    user_context.region,
        logoUrl:   user_context.logo_url,
      },
      webhookUrl: webhook_url,
    });

    const data: ProcessResponse = {
      job_id:  jobId,
      status:  'pending' as ProcessResponse['status'],
      message: webhook_url
        ? `Job adicionado à fila. Você receberá notificação em ${webhook_url}`
        : 'Job adicionado à fila. Acompanhe via GET /jobs/' + jobId,
    };

    sendSuccess(res, data, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enfileirar job';
    sendError(res, 'QUEUE_ERROR', message, 500);
  }
}

async function handleSyncMode(
  res: Response,
  params: {
    file_url: string;
    type: string;
    user_context: Record<string, string | undefined>;
  },
): Promise<void> {
  const { file_url, type, user_context } = params;

  try {
    const job = await orchestrator.process({
      fileUrl: file_url,
      type:    INPUT_TYPE_MAP[type],
      userContext: {
        name:      user_context.name,
        whatsapp:  user_context.whatsapp,
        instagram: user_context.instagram,
        site:      user_context.site,
        region:    user_context.region,
        logoUrl:   user_context.logo_url,
      },
    });

    const data: ProcessResponse = {
      job_id:  job.id,
      status:  job.status,
      message: 'Processamento iniciado',
    };

    sendSuccess(res, data, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao iniciar processamento';
    sendError(res, 'PROCESSING_ERROR', message, 500);
  }
}
