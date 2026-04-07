/**
 * Entity: JobCost / CostBreakdown / UsageMetrics
 *
 * Monitoramento de custo e performance por job.
 * Rastreia chamadas de IA, renders, TTS, storage e tempo.
 *
 * Estimadores de custo:
 *   - OpenAI (GPT-4o, GPT-4-turbo)
 *   - Anthropic (Claude Sonnet/Opus)
 *   - Google (Gemini)
 *   - TTS (Google/ElevenLabs)
 *   - Render (FFmpeg CPU-time)
 *
 * Limites por plano:
 *   - Basic:  ~$0.50/job, 3 AI calls, 1 render
 *   - Pro:    ~$2.00/job, 10 AI calls, 5 renders
 *   - Business: ~$5.00/job, 25 AI calls, 10 renders
 *
 * Parte 71: Performance & Cost Control Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de recurso consumido */
export enum CostCategory {
  AI_TEXT = 'ai_text',
  AI_VISION = 'ai_vision',
  TTS = 'tts',
  VIDEO_RENDER = 'video_render',
  IMAGE_RENDER = 'image_render',
  STORAGE = 'storage',
  API_CALL = 'api_call',
}

/** Nível de alerta de custo */
export enum CostAlert {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Detalhe de custo por categoria */
export interface CostLineItem {
  /** Categoria do custo */
  category: CostCategory;

  /** Provider usado (ex: "openai", "anthropic", "google", "elevenlabs") */
  provider: string;

  /** Número de chamadas/operações */
  count: number;

  /** Custo estimado em USD */
  estimatedCostUsd: number;

  /** Tokens consumidos (para IA) */
  tokensInput?: number;
  tokensOutput?: number;

  /** Duração de processamento (ms) */
  durationMs?: number;

  /** Bytes processados (para storage/render) */
  bytesProcessed?: number;
}

/** Breakdown de custos por categoria */
export interface CostBreakdown {
  /** Itens individuais de custo */
  items: CostLineItem[];

  /** Custo total estimado (USD) */
  totalCostUsd: number;

  /** Categoria com maior custo */
  topCategory: CostCategory;

  /** Provider com maior custo */
  topProvider: string;
}

/** Métricas de uso do job */
export interface UsageMetrics {
  /** Número total de chamadas de IA */
  aiCallCount: number;

  /** Total de tokens (input + output) */
  totalTokens: number;

  /** Número de renders de vídeo */
  videoRenderCount: number;

  /** Número de renders de imagem */
  imageRenderCount: number;

  /** Número de chamadas TTS */
  ttsCallCount: number;

  /** Tamanho total de arquivos gerados (bytes) */
  totalFileSizeBytes: number;

  /** Tempo total de execução (ms) */
  totalExecutionMs: number;

  /** Tempo de execução por estágio */
  stageTimings: Record<string, number>;
}

/**
 * JobCost — custo e performance consolidado de um job.
 */
export interface JobCost {
  /** ID do job */
  jobId: string;

  /** Custo total estimado (USD) */
  totalCostUsd: number;

  /** Breakdown detalhado */
  breakdown: CostBreakdown;

  /** Métricas de uso */
  usage: UsageMetrics;

  /** Limite de custo do plano (USD) */
  planLimitUsd: number;

  /** Percentual do limite consumido */
  limitUsagePercent: number;

  /** Nível de alerta */
  alert: CostAlert;

  /** Alertas específicos gerados */
  alerts: string[];

  /** Timestamp */
  evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Plan Limits
// ---------------------------------------------------------------------------

export interface PlanCostLimits {
  maxCostUsd: number;
  maxAiCalls: number;
  maxRenders: number;
  maxTtsCalls: number;
  maxFileSizeMb: number;
}

export const PLAN_LIMITS: Record<string, PlanCostLimits> = {
  basic: {
    maxCostUsd: 0.50,
    maxAiCalls: 3,
    maxRenders: 1,
    maxTtsCalls: 1,
    maxFileSizeMb: 50,
  },
  pro: {
    maxCostUsd: 2.00,
    maxAiCalls: 10,
    maxRenders: 5,
    maxTtsCalls: 5,
    maxFileSizeMb: 500,
  },
  business: {
    maxCostUsd: 5.00,
    maxAiCalls: 25,
    maxRenders: 10,
    maxTtsCalls: 10,
    maxFileSizeMb: 2000,
  },
};

// ---------------------------------------------------------------------------
// Cost Estimation Rates (USD)
// ---------------------------------------------------------------------------

/** Custo estimado por 1K tokens (input/output) */
export const AI_TOKEN_RATES: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'openai:gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
  'openai:gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'openai:gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'anthropic:claude-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'anthropic:claude-opus': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'anthropic:claude-haiku': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'google:gemini-pro': { inputPer1k: 0.00125, outputPer1k: 0.005 },
  'google:gemini-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
};

/** Custo estimado por operação (flat rate) */
export const OPERATION_RATES: Record<string, number> = {
  'tts:google': 0.004,       // per 1K chars ~$4/1M chars
  'tts:elevenlabs': 0.018,   // per 1K chars
  'render:video_short': 0.02,
  'render:video_long': 0.05,
  'render:image': 0.005,
  'render:thumbnail': 0.002,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estima custo de tokens IA */
export function estimateAiCost(
  provider: string,
  model: string,
  tokensInput: number,
  tokensOutput: number,
): number {
  const key = `${provider}:${model}`;
  const rates = AI_TOKEN_RATES[key];
  if (!rates) return 0;

  return (tokensInput / 1000) * rates.inputPer1k
    + (tokensOutput / 1000) * rates.outputPer1k;
}

/** Determina o nível de alerta */
export function determineCostAlert(
  currentCostUsd: number,
  limitUsd: number,
): CostAlert {
  const ratio = limitUsd > 0 ? currentCostUsd / limitUsd : 0;
  if (ratio >= 0.9) return CostAlert.CRITICAL;
  if (ratio >= 0.7) return CostAlert.WARNING;
  return CostAlert.NORMAL;
}
