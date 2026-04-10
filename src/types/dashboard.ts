/**
 * Dashboard Types — BookAgent Intelligence Engine
 *
 * Tipos TypeScript para a camada de dashboard:
 * estados de aprovação, contratos de API, modelo de comentários.
 *
 * Parte 50: Integração Dashboard com Estados, Comentários e Publicação
 */

// ============================================================================
// Estados do Dashboard
// ============================================================================

/**
 * Estado de aprovação de um job, do ponto de vista do dashboard.
 * Persiste em bookagent_job_meta.approval_status.
 *
 * Transições válidas:
 *   pending → processing
 *   processing → awaiting_intermediate_review | awaiting_final_review | failed
 *   awaiting_intermediate_review → intermediate_approved | intermediate_rejected
 *   intermediate_approved → awaiting_final_review
 *   intermediate_rejected → awaiting_intermediate_review (nova rodada)
 *   awaiting_final_review → final_approved | final_rejected
 *   final_approved → published | publish_failed (plano Pro) | final_approved (básico)
 *   final_rejected → awaiting_final_review (nova rodada)
 *   publish_failed → published (retry)
 */
export type DashboardJobStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_intermediate_review'
  | 'intermediate_approved'
  | 'intermediate_rejected'
  | 'awaiting_final_review'
  | 'final_approved'
  | 'final_rejected'
  | 'published'
  | 'publish_failed'
  | 'failed';

/** Transições válidas por estado atual */
export const VALID_TRANSITIONS: Record<DashboardJobStatus, DashboardJobStatus[]> = {
  pending:                       ['processing'],
  processing:                    ['awaiting_intermediate_review', 'awaiting_final_review', 'failed'],
  awaiting_intermediate_review:  ['intermediate_approved', 'intermediate_rejected'],
  intermediate_approved:         ['awaiting_final_review'],
  intermediate_rejected:         ['awaiting_intermediate_review'],
  awaiting_final_review:         ['final_approved', 'final_rejected'],
  final_approved:                ['published', 'publish_failed', 'final_approved'],
  final_rejected:                ['awaiting_final_review'],
  published:                     [],
  publish_failed:                ['published'],
  failed:                        [],
};

/** Estados que aguardam ação do usuário */
export const AWAITING_USER_ACTION: DashboardJobStatus[] = [
  'awaiting_intermediate_review',
  'awaiting_final_review',
  'intermediate_rejected',
  'final_rejected',
  'publish_failed',
];

/** Labels legíveis para exibição */
export const STATUS_LABELS: Record<DashboardJobStatus, string> = {
  pending:                       'Na fila',
  processing:                    'Processando...',
  awaiting_intermediate_review:  'Aguardando revisão intermediária',
  intermediate_approved:         'Prévia aprovada',
  intermediate_rejected:         'Prévia reprovada',
  awaiting_final_review:         'Aguardando aprovação final',
  final_approved:                'Aprovado',
  final_rejected:                'Reprovado',
  published:                     'Publicado',
  publish_failed:                'Falha na publicação',
  failed:                        'Falha no processamento',
};

/** Cores/badges para UI */
export const STATUS_BADGE: Record<DashboardJobStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'purple'> = {
  pending:                       'gray',
  processing:                    'blue',
  awaiting_intermediate_review:  'yellow',
  intermediate_approved:         'green',
  intermediate_rejected:         'red',
  awaiting_final_review:         'yellow',
  final_approved:                'green',
  final_rejected:                'red',
  published:                     'purple',
  publish_failed:                'red',
  failed:                        'red',
};

// ============================================================================
// Planos
// ============================================================================

export type PlanType = 'starter' | 'pro';
export type SourceChannel = 'whatsapp' | 'dashboard' | 'api';
export type ApprovalType = 'intermediate' | 'final';
export type ApprovalDecision = 'approved' | 'rejected' | 'comment';
export type CommentType = 'general' | 'intermediate' | 'final';
export type PublicationStatus = 'pending' | 'scheduled' | 'published' | 'failed';

// ============================================================================
// Visão consolidada do Dashboard (da view bookagent_jobs_dashboard)
// ============================================================================

export interface DashboardJobView {
  job_id: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  input_type: string;
  user_context: Record<string, string> | null;
  sources_count: number;
  narratives_count: number;
  artifacts_count: number;
  pipeline_duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
  processing_error: string | null;

  // meta operacional
  user_id: string | null;
  plan_type: PlanType | null;
  source_channel: SourceChannel | null;
  auto_publish: boolean | null;
  webhook_phone: string | null;
  approval_status: DashboardJobStatus | null;
  approval_round: number | null;

  // última decisão
  latest_decision: ApprovalDecision | 'pending_review' | null;
  latest_approval_type: ApprovalType | null;
  latest_comment: string | null;
  latest_decision_channel: SourceChannel | null;
  last_decision_at: string | null;

  // publicações
  published_count: number;
  publish_failed_count: number;

  // comentários
  total_comments: number;
}

// ============================================================================
// Comentários
// ============================================================================

export interface JobComment {
  id: string;
  job_id: string;
  user_id: string;
  comment: string;
  comment_type: CommentType;
  source_channel: SourceChannel;
  approval_round: number;
  created_at: string;
}

// ============================================================================
// Publicações
// ============================================================================

export interface JobPublication {
  id: string;
  job_id: string;
  user_id: string;
  platform: string;
  artifact_id: string | null;
  status: PublicationStatus;
  platform_post_id: string | null;
  platform_url: string | null;
  error: string | null;
  published_at: string | null;
  created_at: string;
}

// ============================================================================
// Requisições da API do Dashboard → BookAgent
// ============================================================================

/** POST /api/v1/jobs/:jobId/approve */
export interface ApproveJobRequest {
  userId: string;
  comment?: string;
  approvalType?: ApprovalType;         // default: 'final'
  approvalRound?: number;
  forcePublish?: boolean;              // Plano Pro: forçar publicação imediata
}

/** POST /api/v1/jobs/:jobId/reject */
export interface RejectJobRequest {
  userId: string;
  comment: string;                     // obrigatório ao reprovar
  approvalType?: ApprovalType;
  approvalRound?: number;
}

/** POST /api/v1/jobs/:jobId/comment */
export interface CommentJobRequest {
  userId: string;
  comment: string;
  commentType?: CommentType;
  approvalRound?: number;
}

/** POST /api/v1/jobs/:jobId/publish */
export interface PublishJobRequest {
  userId: string;
  platforms?: string[];                // ex: ['instagram', 'facebook']
}

// ============================================================================
// Payload normalizado enviado ao Fluxo 4 do n8n
// ============================================================================

export interface N8nApprovalPayload {
  jobId: string;
  userId: string;
  decision: ApprovalDecision;
  comment: string;
  sourceChannel: SourceChannel;
  approvalRound: number;
  approvalType?: ApprovalType;
  forcePublish?: boolean;
  platforms?: string[];
}

// ============================================================================
// Respostas da API
// ============================================================================

export interface ApprovalActionResponse {
  jobId: string;
  decision: ApprovalDecision;
  status: DashboardJobStatus;
  message: string;
  n8nTriggered: boolean;
}

export interface CommentsListResponse {
  jobId: string;
  comments: JobComment[];
  total: number;
}

export interface PublicationsListResponse {
  jobId: string;
  publications: JobPublication[];
  published_count: number;
  failed_count: number;
}
