/**
 * Approval Controller — BookAgent Intelligence Engine
 *
 * Endpoints de aprovação, comentário e publicação do dashboard.
 * Atua como gateway: valida o request, persiste comentários no Supabase
 * e dispara o Fluxo 4 do n8n para orquestrar notificações e publicação.
 *
 * Parte 50: Integração Dashboard com Estados, Comentários e Publicação
 * Parte 51: Publicação Social Real (Instagram + Facebook)
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import type {
  N8nApprovalPayload,
  DashboardJobStatus,
  DashboardJobView,
  JobComment,
  JobPublication,
} from '../../types/dashboard.js';
import type { SocialPlatform, MediaMetadataContent } from '../../types/social.js';
import { socialPublisher } from '../../services/social-publisher.js';
import { logger } from '../../utils/logger.js';
import { VALID_TRANSITIONS } from '../../types/dashboard.js';
import {
  enqueuePublicationTask,
  isCloudTasksConfigured,
  buildTaskId,
  type PublicationTaskPayload,
} from '../../queue/cloud-tasks.js';

// ============================================================================
// Dependency injection — Supabase client (opcional)
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForApproval(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Publication dispatch — async via Cloud Tasks (sync inline fallback em dev)
// ============================================================================
//
// Em prod: enfileira uma task /tasks/publication. O handler chama o webhook
// n8n e atualiza o store de tasks. A response volta rápido (taskId), liberando
// o request HTTP enquanto a publicação roda em background.
//
// Em dev (sem Cloud Tasks configurado): chama o webhook n8n inline pra
// preservar feedback rápido — mesmo comportamento do triggerN8nApproval
// anterior, agora sob a mesma assinatura de retorno.

function payloadToPublicationTask(payload: N8nApprovalPayload): PublicationTaskPayload {
  return {
    jobId: payload.jobId,
    userId: payload.userId,
    decision: payload.decision,
    comment: payload.comment ?? '',
    sourceChannel: payload.sourceChannel,
    approvalRound: payload.approvalRound ?? 1,
    approvalType: payload.approvalType,
    forcePublish: payload.forcePublish,
    platforms: payload.platforms,
  };
}

async function callN8nWebhookInline(payload: N8nApprovalPayload): Promise<void> {
  const base = process.env.N8N_WEBHOOK_BASE_URL ?? 'https://automacao.db8intelligence.com.br';
  const url = `${base}/webhook/bookagent/aprovacao`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn(`[approvalController] n8n retornou ${res.status} para job ${payload.jobId} (inline)`);
    }
  } catch (err) {
    logger.error(
      `[approvalController] Falha ao acionar n8n inline para job ${payload.jobId}: ` +
      `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function dispatchPublication(
  payload: N8nApprovalPayload,
): Promise<{ taskId: string; enqueued: boolean }> {
  const task = payloadToPublicationTask(payload);
  const stepId = `${task.approvalRound}-${task.decision}`;
  const taskId = buildTaskId('publication', task.jobId, stepId);

  if (isCloudTasksConfigured()) {
    try {
      await enqueuePublicationTask(task);
      return { taskId, enqueued: true };
    } catch (err) {
      logger.error(
        `[approvalController] enqueue falhou pro job ${task.jobId}, caindo pra inline: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
      // Fall-through pro inline — não derruba a request por falha de fila.
    }
  }

  await callN8nWebhookInline(payload);
  return { taskId, enqueued: false };
}

// ============================================================================
// Helper: buscar approval_round e approval_status atual do job
// ============================================================================

interface JobMetaSnapshot {
  approval_round: number;
  approval_status: DashboardJobStatus | null;
}

async function getJobMetaSnapshot(jobId: string): Promise<JobMetaSnapshot> {
  const fallback: JobMetaSnapshot = { approval_round: 1, approval_status: null };
  if (!supabaseClient) return fallback;
  try {
    const rows = await supabaseClient.select<{
      approval_round: number | null;
      approval_status: DashboardJobStatus | null;
    }>('bookagent_job_meta', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      select: 'approval_round,approval_status',
      limit: 1,
    });
    return {
      approval_round: rows[0]?.approval_round ?? 1,
      approval_status: rows[0]?.approval_status ?? null,
    };
  } catch {
    return fallback;
  }
}

async function getCurrentApprovalRound(jobId: string): Promise<number> {
  return (await getJobMetaSnapshot(jobId)).approval_round;
}

/**
 * Valida se a transição de estado é permitida.
 * Retorna true se o status atual for null (job sem meta ainda) ou se a transição for válida.
 */
function isValidTransition(
  current: DashboardJobStatus | null,
  next: DashboardJobStatus,
): boolean {
  if (current === null) return true; // Job sem registro de meta — qualquer estado inicial é ok
  const allowed = VALID_TRANSITIONS[current];
  return allowed.includes(next);
}

// ============================================================================
// Helper: status → próximo estado
// ============================================================================

function nextStatusAfterDecision(
  decision: 'approved' | 'rejected' | 'comment',
  approvalType: 'intermediate' | 'final',
): DashboardJobStatus {
  if (decision === 'approved') {
    return approvalType === 'intermediate' ? 'intermediate_approved' : 'final_approved';
  }
  if (decision === 'rejected') {
    return approvalType === 'intermediate' ? 'intermediate_rejected' : 'final_rejected';
  }
  // comment: mantém estado atual — retorna awaiting_*_review
  return approvalType === 'intermediate'
    ? 'awaiting_intermediate_review'
    : 'awaiting_final_review';
}

// ============================================================================
// Schemas de validação (Zod)
// ============================================================================

const ApproveSchema = z.object({
  userId: z.string().min(1),
  comment: z.string().optional().default(''),
  approvalType: z.enum(['intermediate', 'final']).optional().default('final'),
  approvalRound: z.number().int().positive().optional(),
  forcePublish: z.boolean().optional().default(false),
});

const RejectSchema = z.object({
  userId: z.string().min(1),
  comment: z.string().min(1, 'Comentário obrigatório ao reprovar'),
  approvalType: z.enum(['intermediate', 'final']).optional().default('final'),
  approvalRound: z.number().int().positive().optional(),
});

const CommentSchema = z.object({
  userId: z.string().min(1),
  comment: z.string().min(1),
  commentType: z.enum(['general', 'intermediate', 'final']).optional().default('general'),
  approvalRound: z.number().int().positive().optional(),
});

const PublishSchema = z.object({
  userId: z.string().min(1),
  platforms: z.array(z.string()).optional().default(['instagram', 'facebook']),
});

// ============================================================================
// POST /api/v1/jobs/:jobId/approve
// ============================================================================

export async function approveJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = ApproveSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const { userId, comment, approvalType, forcePublish } = parsed.data;
  const meta = await getJobMetaSnapshot(jobId);
  const approvalRound = parsed.data.approvalRound ?? meta.approval_round;
  const nextStatus = nextStatusAfterDecision('approved', approvalType!);

  if (!isValidTransition(meta.approval_status, nextStatus)) {
    sendError(
      res,
      'INVALID_TRANSITION',
      `Transição inválida: ${meta.approval_status} → ${nextStatus}`,
      409,
    );
    return;
  }

  const payload: N8nApprovalPayload = {
    jobId,
    userId,
    decision: 'approved',
    comment: comment ?? '',
    sourceChannel: 'dashboard',
    approvalRound,
    approvalType,
    forcePublish,
  };

  const dispatch = await dispatchPublication(payload);

  sendSuccess(res, {
    jobId,
    decision: 'approved',
    status: nextStatus,
    message: approvalType === 'final'
      ? 'Aprovação final registrada.'
      : 'Prévia aprovada. O processo continua.',
    taskId: dispatch.taskId,
    enqueued: dispatch.enqueued,
  }, 202);
}

// ============================================================================
// POST /api/v1/jobs/:jobId/reject
// ============================================================================

export async function rejectJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = RejectSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const { userId, comment, approvalType } = parsed.data;
  const meta = await getJobMetaSnapshot(jobId);
  const approvalRound = parsed.data.approvalRound ?? meta.approval_round;
  const nextStatus = nextStatusAfterDecision('rejected', approvalType!);

  if (!isValidTransition(meta.approval_status, nextStatus)) {
    sendError(
      res,
      'INVALID_TRANSITION',
      `Transição inválida: ${meta.approval_status} → ${nextStatus}`,
      409,
    );
    return;
  }

  const payload: N8nApprovalPayload = {
    jobId,
    userId,
    decision: 'rejected',
    comment,
    sourceChannel: 'dashboard',
    approvalRound,
    approvalType,
  };

  const dispatch = await dispatchPublication(payload);

  sendSuccess(res, {
    jobId,
    decision: 'rejected',
    status: nextStatus,
    message: 'Rejeição registrada. Aguardando instrução para revisão.',
    taskId: dispatch.taskId,
    enqueued: dispatch.enqueued,
  }, 202);
}

// ============================================================================
// POST /api/v1/jobs/:jobId/comment
// ============================================================================

export async function commentJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = CommentSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const { userId, comment, commentType } = parsed.data;
  const approvalRound = parsed.data.approvalRound
    ?? await getCurrentApprovalRound(jobId);

  // Persiste comentário diretamente no Supabase
  if (supabaseClient) {
    try {
      await supabaseClient.insert('bookagent_comments', {
        job_id: jobId,
        user_id: userId,
        comment,
        comment_type: commentType,
        source_channel: 'dashboard',
        approval_round: approvalRound,
      });
    } catch (err) {
      logger.warn(
        `[approvalController] Falha ao persistir comentário para job ${jobId}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Notifica n8n para registrar no histórico de aprovações
  const payload: N8nApprovalPayload = {
    jobId,
    userId,
    decision: 'comment',
    comment,
    sourceChannel: 'dashboard',
    approvalRound,
  };

  const dispatch = await dispatchPublication(payload);

  sendSuccess(res, {
    jobId,
    decision: 'comment',
    status: commentType === 'intermediate'
      ? 'awaiting_intermediate_review'
      : 'awaiting_final_review' as DashboardJobStatus,
    message: 'Comentário registrado com sucesso.',
    taskId: dispatch.taskId,
    enqueued: dispatch.enqueued,
  }, 201);
}

// ============================================================================
// GET /api/v1/jobs/:jobId/comments
// ============================================================================

export async function getJobComments(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  if (!supabaseClient) {
    sendSuccess(res, { jobId, comments: [], total: 0 });
    return;
  }

  try {
    const comments = await supabaseClient.select<JobComment>('bookagent_comments', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
    });

    sendSuccess(res, {
      jobId,
      comments,
      total: comments.length,
    });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar comentários', 500, err);
  }
}

// ============================================================================
// POST /api/v1/jobs/:jobId/publish
// Acionado manualmente pelo usuário Pro quando auto_publish=false
// ============================================================================

export async function publishJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const { userId, platforms } = parsed.data;
  const approvalRound = await getCurrentApprovalRound(jobId);

  const payload: N8nApprovalPayload = {
    jobId,
    userId,
    decision: 'approved',
    comment: 'Publicação manual solicitada pelo dashboard',
    sourceChannel: 'dashboard',
    approvalRound,
    forcePublish: true,
    platforms,
  };

  const dispatch = await dispatchPublication(payload);

  sendSuccess(res, {
    jobId,
    decision: 'approved',
    status: 'final_approved' as DashboardJobStatus,
    message: `Publicação iniciada para: ${platforms?.join(', ')}`,
    taskId: dispatch.taskId,
    enqueued: dispatch.enqueued,
  }, 202);
}

// ============================================================================
// GET /api/v1/jobs/:jobId/publications
// ============================================================================

export async function getJobPublications(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  if (!supabaseClient) {
    sendSuccess(res, { jobId, publications: [], published_count: 0, failed_count: 0 });
    return;
  }

  try {
    const publications = await supabaseClient.select<JobPublication>('bookagent_publications', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      orderBy: 'created_at',
      orderDesc: true,
    });

    sendSuccess(res, {
      jobId,
      publications,
      published_count: publications.filter((p) => p.status === 'published').length,
      failed_count: publications.filter((p) => p.status === 'failed').length,
    });
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar publicações', 500, err);
  }
}

// ============================================================================
// GET /api/v1/jobs/:jobId/dashboard
// Visão completa do job para o dashboard (via view bookagent_jobs_dashboard)
// ============================================================================

export async function getJobDashboardView(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  if (!supabaseClient) {
    sendError(res, 'NOT_CONFIGURED', 'Persistência não configurada', 503);
    return;
  }

  try {
    const rows = await supabaseClient.select<DashboardJobView>('bookagent_jobs_dashboard', {
      filters: [{ column: 'job_id', operator: 'eq', value: jobId }],
      limit: 1,
    });

    if (rows.length === 0) {
      sendError(res, 'NOT_FOUND', 'Job não encontrado', 404);
      return;
    }

    sendSuccess(res, rows[0]);
  } catch (err) {
    sendError(res, 'DB_ERROR', 'Erro ao buscar job', 500, err);
  }
}

// ============================================================================
// POST /api/v1/jobs/:jobId/social-publish  (Parte 51)
//
// Publica os artifacts do job nas redes sociais via Meta Graph API.
// Chamado pelo n8n Fluxo 4 (auto_publish=true) ou Fluxo 6 (retry/manual).
//
// Fluxo:
//   1. Valida request (userId, platforms, credenciais)
//   2. Se caption não fornecida, carrega do artifact media-metadata
//   3. Chama SocialPublisherService para cada plataforma
//   4. Persiste resultado em bookagent_publications
//   5. Atualiza approval_status em bookagent_job_meta
// ============================================================================

const SocialPublishSchema = z.object({
  userId: z.string().min(1),
  platforms: z.array(z.string()).optional().default(['instagram', 'facebook']),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  linkUrl: z.string().url().optional(),
  // Credenciais: fallback para env vars se não fornecidas
  accessToken: z.string().optional(),
  instagramAccountId: z.string().optional(),
  facebookPageId: z.string().optional(),
});

/** Tenta carregar caption/hashtags do artifact media-metadata do job */
async function loadSocialContentFromArtifacts(
  jobId: string,
): Promise<{ caption?: string; hashtags?: string[] } | null> {
  if (!supabaseClient) return null;
  try {
    const artifacts = await supabaseClient.select<{
      artifact_type: string;
      file_path: string | null;
      content: MediaMetadataContent | null;
    }>('bookagent_job_artifacts', {
      filters: [
        { column: 'job_id', operator: 'eq', value: jobId },
        { column: 'artifact_type', operator: 'eq', value: 'media-metadata' },
      ],
      limit: 1,
    });

    if (!artifacts.length) return null;

    const artifact = artifacts[0];

    // Prefer DB content column (migration 003 adds this)
    if (artifact.content?.caption) {
      return { caption: artifact.content.caption, hashtags: artifact.content.hashtags };
    }

    // Fallback: read from local file_path
    if (artifact.file_path) {
      const raw = await readFile(join(process.cwd(), artifact.file_path), 'utf-8');
      const parsed = JSON.parse(raw) as MediaMetadataContent;
      return { caption: parsed.caption, hashtags: parsed.hashtags };
    }

    return null;
  } catch {
    return null;
  }
}

export async function socialPublishJob(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  const parsed = SocialPublishSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const {
    userId,
    platforms,
    imageUrl,
    linkUrl,
  } = parsed.data;

  // Resolve caption: from request OR artifacts
  let caption = parsed.data.caption;
  let hashtags = parsed.data.hashtags;

  if (!caption) {
    const fromArtifacts = await loadSocialContentFromArtifacts(jobId);
    if (fromArtifacts?.caption) {
      caption = fromArtifacts.caption;
      hashtags = hashtags ?? fromArtifacts.hashtags;
    } else {
      sendError(res, 'NO_CONTENT', 'Caption não encontrada. Forneça "caption" ou verifique os artifacts do job.', 422);
      return;
    }
  }

  // Resolve credentials: request → env vars
  const accessToken =
    parsed.data.accessToken ?? process.env.META_ACCESS_TOKEN ?? '';
  const instagramAccountId =
    parsed.data.instagramAccountId ?? process.env.META_INSTAGRAM_ACCOUNT_ID;
  const facebookPageId =
    parsed.data.facebookPageId ?? process.env.META_FACEBOOK_PAGE_ID;

  if (!accessToken) {
    sendError(res, 'NO_CREDENTIALS', 'Access token não fornecido. Configure META_ACCESS_TOKEN.', 422);
    return;
  }

  // Execute publishing
  const publishResult = await socialPublisher.publishToPlatforms({
    jobId,
    userId,
    platforms: platforms as SocialPlatform[],
    content: { caption, hashtags, imageUrl, linkUrl },
    credentials: { accessToken, instagramAccountId, facebookPageId },
  });

  // Persist each platform result in bookagent_publications
  if (supabaseClient) {
    for (const result of publishResult.results) {
      try {
        // Check if a previous attempt exists for this job+platform (retry scenario)
        const existing = await supabaseClient.select<{ id: string; attempt_count: number }>(
          'bookagent_publications',
          {
            filters: [
              { column: 'job_id', operator: 'eq', value: jobId },
              { column: 'platform', operator: 'eq', value: result.platform },
            ],
            select: 'id,attempt_count',
            limit: 1,
          },
        );

        const newStatus = result.success ? 'published' : (result.skipped ? 'pending' : 'failed');
        const now = new Date().toISOString();

        if (existing.length > 0) {
          // Retry — incrementar attempt_count e atualizar resultado
          await supabaseClient.update(
            'bookagent_publications',
            { column: 'id', operator: 'eq', value: existing[0].id },
            {
              status: newStatus,
              platform_post_id: result.postId ?? null,
              platform_url: result.postUrl ?? null,
              error: result.error ?? null,
              published_at: result.success ? now : null,
              payload: result.payload ?? null,
              response_metadata: result.responseData ?? null,
              attempt_count: (existing[0].attempt_count ?? 0) + 1,
            },
          );
        } else {
          // Primeira tentativa — inserir
          await supabaseClient.insert('bookagent_publications', {
            job_id: jobId,
            user_id: userId,
            platform: result.platform,
            status: newStatus,
            platform_post_id: result.postId ?? null,
            platform_url: result.postUrl ?? null,
            error: result.error ?? null,
            published_at: result.success ? now : null,
            payload: result.payload ?? null,
            response_metadata: result.responseData ?? null,
            attempt_count: 1,
          });
        }
      } catch (err) {
        logger.warn(
          `[approvalController] Falha ao persistir publicação ${result.platform} para job ${jobId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Update approval_status based on aggregate result
    const newStatus: DashboardJobStatus =
      publishResult.finalStatus === 'published' ? 'published'
      : publishResult.finalStatus === 'partial' ? 'published'
      : 'publish_failed';

    try {
      await supabaseClient.update(
        'bookagent_job_meta',
        { column: 'job_id', operator: 'eq', value: jobId },
        { approval_status: newStatus },
      );
    } catch {
      // falha silenciosa
    }
  }

  const httpStatus = publishResult.successCount > 0 ? 200 : 422;
  sendSuccess(res, publishResult, httpStatus);
}
