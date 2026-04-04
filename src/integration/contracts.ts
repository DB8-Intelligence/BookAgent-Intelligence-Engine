/**
 * BookAgent Integration Contracts
 *
 * Tipos canônicos de entrada e saída para integradores externos.
 * Estes contratos definem a superfície pública do BookAgent Intelligence Engine.
 *
 * Consumidores (ImobCreator, dashboards, apps mobile) devem usar
 * apenas estes tipos — nunca os tipos internos do domínio.
 *
 * Versionamento: os contratos usam sufixo de versão (_v1) nos tipos
 * raiz para permitir evolução sem breaking changes.
 */

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Payload para submissão de material ao BookAgent.
 * Endpoint: POST /api/v1/process
 */
export interface ProcessInput_v1 {
  /** URL do arquivo fonte (PDF, vídeo, áudio, PPTX) */
  file_url: string;

  /** Tipo do arquivo */
  type: 'pdf' | 'video' | 'audio' | 'pptx' | 'document';

  /** Contexto do usuário/corretor para personalização */
  user_context?: UserContextInput;

  /** Webhook URL para notificação de conclusão (opcional) */
  webhook_url?: string;

  /** Formatos de output desejados (omitir = automático) */
  preferred_outputs?: OutputFormatPreference[];

  /** Idioma preferido (padrão: pt-BR) */
  locale?: string;
}

export interface UserContextInput {
  /** Nome do corretor/profissional */
  name?: string;

  /** WhatsApp com código do país (ex: 5511999887766) */
  whatsapp?: string;

  /** Handle do Instagram (com ou sem @) */
  instagram?: string;

  /** URL do site pessoal */
  site?: string;

  /** Região de atuação */
  region?: string;

  /** URL do logo/marca pessoal */
  logo_url?: string;

  /** Posição preferida do logo nos outputs */
  logo_placement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export type OutputFormatPreference =
  | 'reel'
  | 'story'
  | 'carousel'
  | 'post'
  | 'video_long'
  | 'presentation'
  | 'audio'
  | 'blog'
  | 'landing_page';

// ═══════════════════════════════════════════════════════════════════════════
// STATUS CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status do job retornado pela API.
 * Endpoint: GET /api/v1/jobs/:jobId
 */
export interface JobStatus_v1 {
  /** ID único do job */
  job_id: string;

  /** Status atual do processamento */
  status: 'pending' | 'processing' | 'completed' | 'failed';

  /** Informações do input original */
  input: {
    file_url: string;
    type: string;
  };

  /** Resumo dos outputs gerados (somente quando completed) */
  output_summary?: OutputSummary_v1;

  /** Mensagem de erro (somente quando failed) */
  error?: string;

  /** Timestamps ISO 8601 */
  created_at: string;
  updated_at: string;
}

export interface OutputSummary_v1 {
  /** Total de fontes de conteúdo identificadas */
  source_count: number;

  /** Formatos de output selecionados */
  selected_outputs: number;

  /** Planos de mídia gerados (reels, stories, carousels, etc.) */
  media_plans: number;

  /** Artigos de blog gerados */
  blog_plans: number;

  /** Landing pages geradas */
  landing_page_plans: number;

  /** Total de artefatos exportados */
  artifacts: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resultado completo do processamento.
 * Endpoint: GET /api/v1/jobs/:jobId/result
 */
export interface ProcessResult_v1 {
  job_id: string;
  status: 'completed';

  /** Fontes de conteúdo identificadas no material */
  sources: SourceItem_v1[];

  /** Artefatos exportados prontos para consumo */
  artifacts: ArtifactItem_v1[];

  /** Dados de personalização aplicados */
  personalization?: PersonalizationSummary_v1;

  /** Metadados de branding extraídos */
  branding: BrandingSummary_v1;
}

export interface SourceItem_v1 {
  id: string;
  type: string;
  title: string;
  summary?: string;
  confidence: number;
  priority: number;
  asset_count: number;
}

export interface ArtifactItem_v1 {
  /** ID único do artefato */
  id: string;

  /** Tipo do artefato */
  artifact_type: 'media-render-spec' | 'blog-article' | 'landing-page' | 'media-metadata';

  /** Formato de exportação */
  export_format: 'json' | 'html' | 'markdown' | 'render-spec';

  /** Formato de output de origem */
  output_format: string;

  /** Título legível */
  title: string;

  /** Tamanho em bytes */
  size_bytes: number;

  /** Status de validação */
  status: 'valid' | 'partial' | 'invalid';

  /** Warnings de exportação */
  warnings: string[];

  /** IDs dos assets referenciados no conteúdo */
  referenced_asset_ids: string[];

  /** URL para download do conteúdo */
  download_url: string;

  /** Content-type do artefato */
  content_type: string;
}

export interface PersonalizationSummary_v1 {
  applied: boolean;
  contact_name: string;
  contact_region?: string;
  channels: Array<{
    type: string;
    value: string;
  }>;
  cta_text: string;
  media_personalized: number;
  blog_personalized: number;
  landing_page_personalized: number;
}

export interface BrandingSummary_v1 {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  style: string;
  sophistication: string;
  consistency_score: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Payload enviado ao webhook_url quando o job é concluído.
 */
export interface WebhookPayload_v1 {
  event: 'job.completed' | 'job.failed';
  job_id: string;
  status: 'completed' | 'failed';
  /** Presente somente em job.completed */
  output_summary?: OutputSummary_v1;
  /** Presente somente em job.failed */
  error?: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envelope padrão de todas as respostas da API.
 * Integradores devem sempre verificar `success` antes de acessar `data`.
 */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    version: string;
    request_id?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT MAP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapa de endpoints para documentação do integrador.
 *
 * POST   /api/v1/process                    → ApiEnvelope<{ job_id, status }>
 * GET    /api/v1/jobs                       → ApiEnvelope<JobStatus_v1[]>
 * GET    /api/v1/jobs/:jobId                → ApiEnvelope<JobStatus_v1>
 * GET    /api/v1/jobs/:jobId/result         → ApiEnvelope<ProcessResult_v1>
 * GET    /api/v1/jobs/:jobId/sources        → ApiEnvelope<SourceItem_v1[]>
 * GET    /api/v1/jobs/:jobId/artifacts      → ApiEnvelope<ArtifactItem_v1[]>
 * GET    /api/v1/jobs/:jobId/artifacts/:id  → ApiEnvelope<ArtifactItem_v1>
 * GET    /api/v1/jobs/:jobId/artifacts/:id/download → raw content
 */
export type EndpointMap = {
  'POST /api/v1/process': { input: ProcessInput_v1; output: ApiEnvelope<{ job_id: string; status: string }> };
  'GET /api/v1/jobs': { output: ApiEnvelope<JobStatus_v1[]> };
  'GET /api/v1/jobs/:jobId': { output: ApiEnvelope<JobStatus_v1> };
  'GET /api/v1/jobs/:jobId/result': { output: ApiEnvelope<ProcessResult_v1> };
  'GET /api/v1/jobs/:jobId/sources': { output: ApiEnvelope<SourceItem_v1[]> };
  'GET /api/v1/jobs/:jobId/artifacts': { output: ApiEnvelope<ArtifactItem_v1[]> };
  'GET /api/v1/jobs/:jobId/artifacts/:id': { output: ApiEnvelope<ArtifactItem_v1> };
};
