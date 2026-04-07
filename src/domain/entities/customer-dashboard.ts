/**
 * Entity: Customer Dashboard DTOs
 *
 * Views consolidadas para o dashboard do cliente (tenant).
 * Cada DTO agrega dados de múltiplos subsistemas para
 * oferecer uma experiência coerente de acompanhamento.
 *
 * Áreas do dashboard:
 *   1. Overview        — visão geral da conta
 *   2. Jobs            — listagem e detalhe de jobs
 *   3. Artifacts       — outputs disponíveis
 *   4. Reviews         — histórico de revisões
 *   5. Publications    — publicações e status
 *   6. Usage           — uso atual e limites
 *   7. Billing         — plano e assinatura
 *   8. Insights        — performance e recomendações
 *
 * Parte 78: Customer Dashboard Backend
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Customer Job Status (unified for dashboard display)
// ---------------------------------------------------------------------------

/**
 * Status unificado do job para exibição no dashboard.
 * Consolida processing_status + approval_status + billing em um único valor.
 */
export enum CustomerJobStatus {
  /** Na fila para processamento */
  QUEUED = 'queued',
  /** Sendo processado */
  PROCESSING = 'processing',
  /** Aguardando revisão do cliente */
  AWAITING_REVIEW = 'awaiting_review',
  /** Revisão solicitada — ajuste em andamento */
  REVISION_IN_PROGRESS = 'revision_in_progress',
  /** Aprovado — pronto para publicação */
  APPROVED = 'approved',
  /** Publicado com sucesso */
  PUBLISHED = 'published',
  /** Falha no processamento */
  FAILED = 'failed',
  /** Bloqueado por limite do plano */
  BLOCKED_BY_LIMIT = 'blocked_by_limit',
  /** Bloqueado por problema de billing */
  BILLING_ISSUE = 'billing_issue',
  /** Falha na publicação */
  PUBLISH_FAILED = 'publish_failed',
}

/** Labels para exibição */
export const CUSTOMER_STATUS_LABELS: Record<CustomerJobStatus, string> = {
  [CustomerJobStatus.QUEUED]: 'Na fila',
  [CustomerJobStatus.PROCESSING]: 'Processando...',
  [CustomerJobStatus.AWAITING_REVIEW]: 'Aguardando sua revisão',
  [CustomerJobStatus.REVISION_IN_PROGRESS]: 'Ajuste em andamento',
  [CustomerJobStatus.APPROVED]: 'Aprovado',
  [CustomerJobStatus.PUBLISHED]: 'Publicado',
  [CustomerJobStatus.FAILED]: 'Falha no processamento',
  [CustomerJobStatus.BLOCKED_BY_LIMIT]: 'Limite do plano atingido',
  [CustomerJobStatus.BILLING_ISSUE]: 'Problema de pagamento',
  [CustomerJobStatus.PUBLISH_FAILED]: 'Falha na publicação',
};

/** Badges visuais */
export const CUSTOMER_STATUS_BADGE: Record<CustomerJobStatus, 'gray' | 'blue' | 'yellow' | 'green' | 'red' | 'orange' | 'purple'> = {
  [CustomerJobStatus.QUEUED]: 'gray',
  [CustomerJobStatus.PROCESSING]: 'blue',
  [CustomerJobStatus.AWAITING_REVIEW]: 'yellow',
  [CustomerJobStatus.REVISION_IN_PROGRESS]: 'orange',
  [CustomerJobStatus.APPROVED]: 'green',
  [CustomerJobStatus.PUBLISHED]: 'purple',
  [CustomerJobStatus.FAILED]: 'red',
  [CustomerJobStatus.BLOCKED_BY_LIMIT]: 'red',
  [CustomerJobStatus.BILLING_ISSUE]: 'red',
  [CustomerJobStatus.PUBLISH_FAILED]: 'orange',
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * Visão geral da conta do cliente.
 */
export interface CustomerDashboardOverview {
  /** Nome do tenant */
  tenantName: string;
  /** Plano ativo */
  planTier: PlanTier;
  /** Status da assinatura */
  subscriptionStatus: string;

  /** Contadores rápidos */
  stats: {
    jobsThisMonth: number;
    jobsTotal: number;
    artifactsGenerated: number;
    publicationsSucceeded: number;
    pendingReviews: number;
    activeRevisions: number;
  };

  /** Uso resumido */
  usage: {
    jobsUsed: number;
    jobsLimit: number;
    jobsPercent: number;
    rendersUsed: number;
    rendersLimit: number;
    rendersPercent: number;
  };

  /** Alertas ativos para o cliente */
  alerts: CustomerAlert[];

  /** Features indisponíveis no plano atual (CTAs de upgrade) */
  lockedFeatures: LockedFeature[];

  /** Últimos 5 jobs */
  recentJobs: CustomerJobListItem[];

  /** Gerado em */
  generatedAt: string;
}

/** Alerta para o cliente */
export interface CustomerAlert {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
}

/** Feature bloqueada no plano atual */
export interface LockedFeature {
  feature: string;
  label: string;
  description: string;
  availableFrom: PlanTier;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Item de lista de jobs para o dashboard.
 */
export interface CustomerJobListItem {
  jobId: string;
  /** Status unificado */
  status: CustomerJobStatus;
  statusLabel: string;
  statusBadge: string;
  /** Tipo de input */
  inputType: string;
  /** Número de artifacts gerados */
  artifactsCount: number;
  /** Número de publicações */
  publicationsCount: number;
  /** Se tem reviews pendentes */
  hasPendingReview: boolean;
  /** Score de qualidade (0-100, se disponível) */
  qualityScore: number | null;
  /** Data de criação */
  createdAt: string;
  /** Data de conclusão */
  completedAt: string | null;
}

/**
 * Detalhe completo de um job para o dashboard.
 */
export interface CustomerJobDetail {
  jobId: string;
  status: CustomerJobStatus;
  statusLabel: string;
  statusBadge: string;
  inputType: string;

  /** Pipeline progress */
  pipeline: {
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    currentStage: string | null;
  };

  /** Artifacts */
  artifacts: CustomerArtifactView[];

  /** Reviews */
  reviews: CustomerReviewView[];

  /** Publications */
  publications: CustomerPublicationView[];

  /** Quality score */
  qualityScore: number | null;
  qualityLevel: string | null;

  /** Approval info */
  approval: {
    status: string | null;
    round: number;
    latestComment: string | null;
    latestDecisionAt: string | null;
  };

  createdAt: string;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/**
 * Artifact/output para exibição no dashboard.
 */
export interface CustomerArtifactView {
  id: string;
  jobId: string;
  type: string;
  format: string;
  title: string;
  /** Tamanho em bytes */
  sizeBytes: number | null;
  /** URL de download (se disponível) */
  downloadUrl: string | null;
  /** URL de preview (se disponível) */
  previewUrl: string | null;
  /** Status */
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * Review/revisão para exibição no dashboard.
 */
export interface CustomerReviewView {
  id: string;
  jobId: string;
  /** Tipo do target */
  targetType: string;
  /** Decisão */
  decision: string;
  /** Comentário */
  comment: string;
  /** Canal de origem */
  channel: string;
  /** Status (open/resolved/superseded) */
  status: string;
  /** Se gerou revisão */
  hasRevision: boolean;
  /** ID da revisão (se houver) */
  revisionId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

/**
 * Publicação para exibição no dashboard.
 */
export interface CustomerPublicationView {
  id: string;
  jobId: string;
  platform: string;
  status: string;
  /** URL do post (se publicado) */
  postUrl: string | null;
  /** Erro (se falhou) */
  error: string | null;
  /** Tentativas */
  attempts: number;
  publishedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/**
 * Uso detalhado do tenant para o dashboard.
 */
export interface CustomerUsageView {
  planTier: PlanTier;
  period: string;
  /** Features com uso e limites */
  features: CustomerFeatureUsage[];
  /** Custo estimado no período (se visível) */
  estimatedCostUsd: number | null;
  /** Alertas de uso */
  alerts: string[];
  generatedAt: string;
}

export interface CustomerFeatureUsage {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  status: 'ok' | 'warning' | 'blocked' | 'disabled';
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

/**
 * Visão de billing do tenant para o dashboard.
 */
export interface CustomerBillingView {
  planTier: PlanTier;
  planName: string;
  subscriptionStatus: string;
  priceMonthlyBRL: number;
  /** Data do próximo billing */
  nextBillingAt: string | null;
  /** Data do último pagamento */
  lastPaymentAt: string | null;
  /** Trial info */
  trial: {
    active: boolean;
    endsAt: string | null;
    daysRemaining: number | null;
  };
  /** Planos disponíveis para upgrade */
  upgradeOptions: UpgradeOption[];
}

export interface UpgradeOption {
  planTier: PlanTier;
  planName: string;
  priceMonthlyBRL: number;
  highlights: string[];
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Insights de performance para o dashboard (quando Learning Engine ativo).
 */
export interface CustomerInsightsView {
  /** Se insights estão disponíveis no plano */
  available: boolean;
  /** Score médio de qualidade dos outputs */
  averageQualityScore: number | null;
  /** Trend de qualidade */
  qualityTrend: 'improving' | 'stable' | 'declining' | null;
  /** Top recomendações do Learning Engine */
  recommendations: string[];
  /** Melhor formato performando */
  bestPerformingFormat: string | null;
  /** Jobs processados no período */
  jobsProcessed: number;
  generatedAt: string;
}
