/**
 * useJobEvents — SSE stream de eventos do pipeline para um job específico.
 *
 * Consome GET /api/v1/jobs/:jobId/events?access_token=<jwt> via EventSource.
 * Retorna o último evento recebido + um estado agregado (stage atual,
 * progresso, status) para o dashboard mostrar "IA processando branding…".
 *
 * Reconexão automática:
 *   - EventSource nativo já faz retry em erros transitórios
 *   - Em erros persistentes (ex: 401), dá close() e expõe `error`
 *
 * Uso:
 *   const { status, stage, progress, lastEvent } = useJobEvents(jobId);
 */

"use client";

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types — espelham os event payloads definidos no backend
// ---------------------------------------------------------------------------

export type PipelineEventTopic =
  | 'pipeline.stage_started'
  | 'pipeline.stage_completed'
  | 'pipeline.completed'
  | 'pipeline.pipeline_failed'
  | 'pipeline.pdf_ingested'
  | 'pipeline.assets_extracted'
  | 'pipeline.narrative_ready'
  | 'pipeline.script_ready'
  | 'pipeline.outputs_selected'
  | 'pipeline.media_plan_ready'
  | 'pipeline.blog_plan_ready'
  | 'pipeline.landing_page_ready'
  | 'pipeline.render_started'
  | 'pipeline.render_completed';

export interface PipelineEvent {
  topic: PipelineEventTopic;
  jobId: string | undefined;
  payload: Record<string, unknown>;
  publishedAt: string;
}

export type JobStatus = 'idle' | 'connecting' | 'processing' | 'completed' | 'failed' | 'error';

export interface UseJobEventsResult {
  status: JobStatus;
  /** Nome do stage atual (ex: "branding", "media_generation") — undefined antes do primeiro evento */
  stage: string | undefined;
  /** Índice 0-based do stage atual, -1 se ainda não começou */
  stageIndex: number;
  /** Total de estágios do pipeline */
  totalStages: number;
  /** 0-100 */
  progress: number;
  /** Último evento recebido — útil pra debug ou lógica custom */
  lastEvent: PipelineEvent | null;
  /** Todos os eventos recebidos nesta sessão (cap em 100 pra não vazar memória) */
  events: PipelineEvent[];
  /** Mensagem de erro se conexão falhou */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Rótulos user-friendly por stage — mapeamento usado no dashboard
// ---------------------------------------------------------------------------

export const STAGE_LABELS: Record<string, string> = {
  ingestion:              'Lendo PDF',
  book_analysis:          'Analisando estrutura do book',
  reverse_engineering:    'Identificando padrões visuais',
  extraction:             'Extraindo fotos e textos',
  branding:               'Capturando identidade visual',
  correlation:            'Cruzando imagens com texto',
  source_intelligence:    'Classificando fontes',
  narrative:              'Escrevendo roteiros',
  output_selection:       'Escolhendo melhores formatos',
  media_generation:       'Montando reels e posts',
  blog:                   'Escrevendo blog posts',
  landing_page:           'Criando landing pages',
  personalization:        'Aplicando sua marca',
  content_scoring:        'Avaliando qualidade',
  render_export:          'Renderizando vídeos',
  delivery:               'Preparando entrega',
  performance_monitoring: 'Finalizando',
};

export function stageLabel(stage: string | undefined): string {
  if (!stage) return 'Iniciando…';
  return STAGE_LABELS[stage] ?? stage;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useJobEvents(jobId: string | undefined): UseJobEventsResult {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [stageIndex, setStageIndex] = useState<number>(-1);
  const [totalStages, setTotalStages] = useState<number>(17);
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus('idle');
      return;
    }

    let cancelled = false;

    const connect = async () => {
      setStatus('connecting');
      setError(null);

      // EventSource não aceita headers — token vai via query param
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Sem sessão ativa. Faça login novamente.');
        setStatus('error');
        return;
      }

      if (cancelled) return;

      const url = `/api/v1/jobs/${encodeURIComponent(jobId)}/events?access_token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('connected', () => {
        if (cancelled) return;
        setStatus('processing');
      });

      es.addEventListener('pipeline', (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse((ev as MessageEvent).data) as PipelineEvent;
          setLastEvent(data);
          setEvents((prev) => {
            const next = [...prev, data];
            return next.length > 100 ? next.slice(-100) : next;
          });
          applyEventToAggregate(data, {
            setStage,
            setStageIndex,
            setTotalStages,
            setStatus,
            setError,
          });
        } catch (err) {
          console.warn('[useJobEvents] malformed event', err);
        }
      });

      es.onerror = () => {
        // EventSource faz retry automaticamente em erros transitórios.
        // Se readyState === CLOSED, é erro permanente (ex: 401 na conexão).
        if (cancelled) return;
        if (es.readyState === EventSource.CLOSED) {
          setError('Conexão fechada. Recarregue a página.');
          setStatus('error');
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [jobId]);

  const progress = stageIndex < 0 || totalStages <= 0
    ? 0
    : Math.min(100, Math.round(((stageIndex + 1) / totalStages) * 100));

  return { status, stage, stageIndex, totalStages, progress, lastEvent, events, error };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AggregateSetters {
  setStage: (v: string | undefined) => void;
  setStageIndex: (v: number) => void;
  setTotalStages: (v: number) => void;
  setStatus: (v: JobStatus) => void;
  setError: (v: string | null) => void;
}

function applyEventToAggregate(ev: PipelineEvent, setters: AggregateSetters): void {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.topic) {
    case 'pipeline.stage_started':
      setters.setStage(String(p.stage));
      setters.setStageIndex(Number(p.stageIndex ?? -1));
      setters.setTotalStages(Number(p.totalStages ?? 17));
      setters.setStatus('processing');
      break;

    case 'pipeline.stage_completed':
      setters.setStageIndex(Number(p.stageIndex ?? -1));
      break;

    case 'pipeline.completed':
      setters.setStatus('completed');
      break;

    case 'pipeline.pipeline_failed':
      setters.setStatus('failed');
      setters.setError(typeof p.error === 'string' ? p.error : 'Pipeline falhou');
      break;

    default:
      break;
  }
}
