/**
 * Entity: Admin / Ops Console DTOs
 *
 * Views consolidadas para o painel administrativo.
 * Cada view agrega dados de múltiplos subsistemas para
 * oferecer visibilidade centralizada e ações operacionais.
 *
 * Parte 77: Admin / Ops Console Backend
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Admin Tenant View
// ---------------------------------------------------------------------------

export interface AdminTenantView {
  tenantId: string;
  name: string;
  status: string;
  planTier: PlanTier;
  subscriptionStatus: string;
  ownerId: string;
  memberCount: number;
  jobsThisMonth: number;
  jobsTotal: number;
  failedJobsThisMonth: number;
  estimatedCostUsd: number;
  lastActivityAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Admin Job View
// ---------------------------------------------------------------------------

export interface AdminJobView {
  jobId: string;
  tenantId: string;
  userId: string;
  status: string;
  approvalStatus: string | null;
  inputType: string;
  artifactsCount: number;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Admin Billing View
// ---------------------------------------------------------------------------

export interface AdminBillingView {
  tenantId: string;
  tenantName: string;
  planTier: PlanTier;
  subscriptionStatus: string;
  provider: string;
  priceMonthlyBRL: number;
  lastPaymentAt: string | null;
  nextBillingAt: string | null;
  usagePercent: number;
  alerts: string[];
}

// ---------------------------------------------------------------------------
// Admin Publication View
// ---------------------------------------------------------------------------

export interface AdminPublicationView {
  id: string;
  jobId: string;
  tenantId: string;
  platform: string;
  status: string;
  postUrl: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
}

// ---------------------------------------------------------------------------
// System Health Snapshot
// ---------------------------------------------------------------------------

export interface AdminSystemHealthSnapshot {
  /** Overall system status */
  status: 'healthy' | 'degraded' | 'critical';

  /** Uptime in seconds */
  uptimeSeconds: number;

  /** AI providers */
  providers: {
    ai: { provider: string; available: boolean };
    tts: { provider: string; available: boolean };
    billing: { provider: string; configured: boolean };
  };

  /** Queue health */
  queue: {
    available: boolean;
    waiting: number;
    active: number;
    failed: number;
    congested: boolean;
  };

  /** Persistence */
  persistence: {
    mode: string;
    connected: boolean;
  };

  /** Job stats (last 24h) */
  jobs24h: {
    total: number;
    completed: number;
    failed: number;
    failureRate: number;
  };

  /** Publication stats (last 24h) */
  publications24h: {
    total: number;
    succeeded: number;
    failed: number;
    failureRate: number;
  };

  /** Webhook stats (last 24h) */
  webhooks24h: {
    received: number;
    processed: number;
    failed: number;
  };

  /** Cost estimate (current month) */
  costThisMonth: {
    estimatedUsd: number;
    tenantCount: number;
  };

  /** Timestamp */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Admin Action
// ---------------------------------------------------------------------------

/** Tipos de ação administrativa */
export enum AdminActionType {
  REQUEUE_JOB = 'requeue_job',
  REQUEUE_VIDEO_RENDER = 'requeue_video_render',
  RESEND_WEBHOOK = 'resend_webhook',
  RESEND_PUBLICATION = 'resend_publication',
  REFRESH_USAGE = 'refresh_usage',
  SUSPEND_TENANT = 'suspend_tenant',
  REACTIVATE_TENANT = 'reactivate_tenant',
  SYNC_SUBSCRIPTION = 'sync_subscription',
  FORCE_PLAN_CHANGE = 'force_plan_change',
}

/** Resultado de uma ação administrativa */
export interface AdminActionResult {
  /** Ação executada */
  action: AdminActionType;
  /** Se foi bem-sucedida */
  success: boolean;
  /** Mensagem de resultado */
  message: string;
  /** ID do recurso afetado */
  targetId: string;
  /** Detalhes adicionais */
  details?: Record<string, unknown>;
  /** Quem executou */
  executedBy: string;
  /** Quando */
  executedAt: Date;
}

/** Registro de audit de ação admin */
export interface AdminAuditEntry {
  id: string;
  action: AdminActionType;
  targetType: string;
  targetId: string;
  executedBy: string;
  result: 'success' | 'failure';
  details: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Query Params
// ---------------------------------------------------------------------------

export interface AdminListParams {
  page?: number;
  limit?: number;
  status?: string;
  planTier?: string;
  tenantId?: string;
  since?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
