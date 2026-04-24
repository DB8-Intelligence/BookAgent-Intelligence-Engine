/**
 * Pipeline Events — SSE stream de eventos do pipeline para o frontend
 *
 * GET /api/v1/jobs/:jobId/events
 *
 * Streams todos os `pipeline.*` events publicados no Event Bus in-memory pra
 * clients conectados via EventSource. O frontend usa esse stream pra mostrar
 * "IA processando PDF…", barra de progresso 7/17, e notificação "Vídeo
 * pronto" em tempo real.
 *
 * Design:
 *   - Envia snapshot inicial: {type: "connected", jobId, subscribed_topics}
 *   - Subscribe em cada tópico PipelineTopic.* — filtrado por jobId
 *   - Heartbeat ": keepalive" a cada 15s (Cloud Run dropa idle após 60s)
 *   - Cleanup em req.on('close') — unsubscribe todos os listeners
 *   - Auth: via `Authorization: Bearer` OU `?access_token=` (EventSource não
 *     suporta headers custom, então query-param é obrigatório pro browser)
 *
 * Escalabilidade:
 *   - Single-instance Cloud Run: funciona out of the box (in-memory bus).
 *   - Multi-instance: trocar InMemoryEventBus por GcpPubSubBus — cada
 *     instância assina o mesmo tópico Pub/Sub e repassa pros SSE clients
 *     conectados nela. Este endpoint não precisa mudar.
 */

import { Router, type Request, type Response } from 'express';
import { getEventBus, PipelineTopic, type EventMessage } from '../../core/event-bus.js';
import { logger } from '../../utils/logger.js';
import { sendError } from '../helpers/response.js';

const router = Router();

// Todos os tópicos pipeline.* — ordem estável pra logs/debug
const ALL_TOPICS = Object.values(PipelineTopic);

router.get('/:jobId/events', (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobId || jobId.length < 8) {
    sendError(res, 'BAD_REQUEST', 'jobId inválido', 400);
    return;
  }

  // Auth — middleware supabaseAuthMiddleware roda antes e popula req.authUser
  // se Authorization header ou ?access_token está presente. Se user
  // autenticado e tenantContext presente, o tenantScopeValidator (registrado
  // no mount) já validou ownership do jobId.
  if (!req.authUser) {
    sendError(res, 'UNAUTHORIZED', 'Autenticação necessária', 401);
    return;
  }

  // --- SSE headers -----------------------------------------------------------
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // desabilita buffering em proxies
  res.flushHeaders();

  const send = (type: string, payload: unknown): void => {
    if (res.writableEnded) return;
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Snapshot inicial — client sabe que conectou com sucesso
  send('connected', {
    jobId,
    topics: ALL_TOPICS,
    serverTime: new Date().toISOString(),
  });

  // --- Subscribe em todos os tópicos filtrando por jobId --------------------
  const bus = getEventBus();
  const unsubscribers: Array<() => void> = [];

  for (const topic of ALL_TOPICS) {
    const unsub = bus.subscribe(topic, (msg: EventMessage<unknown>) => {
      // Filtra por jobId — clients de jobs diferentes não se cruzam
      if (msg.jobId && msg.jobId !== jobId) return;

      send('pipeline', {
        topic: msg.topic,
        jobId: msg.jobId,
        payload: msg.payload,
        publishedAt: msg.publishedAt,
      });
    });
    unsubscribers.push(unsub);
  }

  // --- Heartbeat keep-alive (Cloud Run dropa idle connection em 60s) --------
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': keepalive\n\n');
  }, 15_000);

  // --- Cleanup em disconnect ------------------------------------------------
  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribers.forEach((u) => u());
    logger.debug(`[SSE] client disconnected from job=${jobId} (${unsubscribers.length} subs released)`);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);

  logger.info(`[SSE] client connected to job=${jobId}`);
});

export default router;
