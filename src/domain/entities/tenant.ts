/**
 * Entity: Tenant / TenantPlan / TenantFeatureFlags / TenantLimits / TenantContext
 *
 * Modelo multi-tenant formalizado para isolamento lógico de dados,
 * governança por plano e preparação para billing.
 *
 * Hierarquia:
 *   Tenant (organização) → Owner (admin) → Members (seats)
 *   Um tenant pode ter N users (seats). Jobs pertencem ao tenant.
 *
 * Diferenças conceituais:
 *   - tenant:  organização/conta — unidade de isolamento e billing
 *   - owner:   usuário admin do tenant — gerencia plano, seats, config
 *   - member:  usuário com acesso ao tenant — cria jobs, faz reviews
 *   - user:    identidade individual (userId) — pode pertencer a múltiplos tenants
 *
 * Escopo de dados:
 *   - Todos os recursos (jobs, artifacts, reviews, etc.) pertencem a um tenant
 *   - Queries são sempre tenant-scoped (exceto admin global)
 *   - Learning pode ser global (cross-tenant) ou tenant-scoped
 *
 * Persistência: bookagent_tenants (futuro)
 *
 * Parte 74: Multi-Tenant Governance
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status do tenant */
export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  CANCELLED = 'cancelled',
}

/** Papel do usuário no tenant */
export enum TenantRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/** Escopo de aprendizado */
export enum LearningScope {
  /** Dados do tenant apenas */
  TENANT = 'tenant',
  /** Dados globais (cross-tenant, anonimizados) */
  GLOBAL = 'global',
  /** Híbrido: tenant-first com fallback global */
  HYBRID = 'hybrid',
}

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

/**
 * Feature flags por tenant — controla quais funcionalidades estão habilitadas.
 */
export interface TenantFeatureFlags {
  /** Publicação automática nas redes sociais */
  autoPublish: boolean;
  /** Aprovação intermediária (prévia antes do pacote final) */
  intermediateApproval: boolean;
  /** Acesso à API programática */
  apiAccess: boolean;
  /** Webhook customizado ao finalizar job */
  webhookOnCompletion: boolean;
  /** A/B Testing Engine */
  abTesting: boolean;
  /** Learning Engine */
  learningEngine: boolean;
  /** Geração de variantes automática */
  autoVariants: boolean;
  /** Revisão incremental (Parte 69) */
  revisionLoop: boolean;
  /** Content Scoring automático */
  contentScoring: boolean;
  /** Render de vídeo */
  videoRender: boolean;
  /** Geração de thumbnails */
  thumbnailGeneration: boolean;
  /** Blog generation */
  blogGeneration: boolean;
  /** Landing page generation */
  landingPageGeneration: boolean;
}

// ---------------------------------------------------------------------------
// Tenant Limits
// ---------------------------------------------------------------------------

/**
 * Limites operacionais do tenant (derivados do plano + overrides).
 */
export interface TenantLimits {
  /** Máximo de jobs/mês */
  jobsPerMonth: number;
  /** Jobs simultâneos */
  concurrentJobs: number;
  /** Prioridade na fila (menor = maior) */
  queuePriority: number;
  /** Máximo de plataformas de publicação */
  maxPublishPlatforms: number;
  /** Tamanho máximo de arquivo (MB) */
  maxFileSizeMB: number;
  /** Máximo de variantes por job */
  maxVariantsPerJob: number;
  /** Máximo de renders de vídeo por job */
  maxVideoRendersPerJob: number;
  /** Máximo de seats (membros) */
  maxSeats: number;
  /** Rate limit: requests/min */
  requestsPerMinute: number;
  /** Rate limit: jobs/hora */
  jobsPerHour: number;
  /** Custo máximo por job (USD) */
  maxCostPerJobUsd: number;
  /** Escopo de learning */
  learningScope: LearningScope;
}

// ---------------------------------------------------------------------------
// Tenant Plan
// ---------------------------------------------------------------------------

/**
 * Plano ativo do tenant com período de vigência.
 */
export interface TenantPlan {
  /** Tier do plano */
  tier: PlanTier;
  /** Feature flags ativas */
  features: TenantFeatureFlags;
  /** Limites operacionais */
  limits: TenantLimits;
  /** Data de início do plano */
  startedAt: Date;
  /** Data de expiração (null = sem expiração) */
  expiresAt: Date | null;
  /** Se está em período trial */
  isTrial: boolean;
  /** Dias restantes do trial (null se não trial) */
  trialDaysRemaining: number | null;
}

// ---------------------------------------------------------------------------
// Tenant Member
// ---------------------------------------------------------------------------

/**
 * Membro de um tenant.
 */
export interface TenantMember {
  /** ID do usuário */
  userId: string;
  /** Papel no tenant */
  role: TenantRole;
  /** Nome do membro */
  name?: string;
  /** Email */
  email?: string;
  /** Data de ingresso */
  joinedAt: Date;
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

/**
 * Tenant — unidade de isolamento e billing.
 * Todos os recursos do sistema pertencem a um tenant.
 */
export interface Tenant {
  /** ID único do tenant */
  id: string;
  /** Nome do tenant (organização/empresa) */
  name: string;
  /** Slug para URLs */
  slug: string;
  /** Status */
  status: TenantStatus;
  /** Plano ativo */
  plan: TenantPlan;
  /** Owner (admin principal) */
  ownerId: string;
  /** Membros */
  members: TenantMember[];
  /** Metadados */
  metadata?: Record<string, unknown>;
  /** Criado em */
  createdAt: Date;
  /** Última atualização */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// TenantContext — Lightweight context for pipeline/queue
// ---------------------------------------------------------------------------

/**
 * Contexto de tenant leve — carregado no pipeline e na fila.
 * Contém apenas o necessário para isolamento e governança inline.
 *
 * Este é o objeto que flui pelo ProcessingContext e payloads de fila.
 * Não contém dados sensíveis (credentials, billing).
 */
export interface TenantContext {
  /** ID do tenant */
  tenantId: string;
  /** ID do usuário que iniciou a ação */
  userId: string;
  /** Papel do usuário no tenant */
  userRole: TenantRole;
  /** Tier do plano ativo */
  planTier: PlanTier;
  /** Feature flags (snapshot no momento do request) */
  features: TenantFeatureFlags;
  /** Limites operacionais (snapshot) */
  limits: TenantLimits;
  /** Escopo de learning para este tenant */
  learningScope: LearningScope;
}

// ---------------------------------------------------------------------------
// Defaults por Plano
// ---------------------------------------------------------------------------

export const PLAN_FEATURES: Record<PlanTier, TenantFeatureFlags> = {
  basic: {
    autoPublish: false,
    intermediateApproval: false,
    apiAccess: false,
    webhookOnCompletion: false,
    abTesting: false,
    learningEngine: false,
    autoVariants: false,
    revisionLoop: false,
    contentScoring: true,
    videoRender: true,
    thumbnailGeneration: true,
    blogGeneration: true,
    landingPageGeneration: false,
  },
  pro: {
    autoPublish: true,
    intermediateApproval: true,
    apiAccess: false,
    webhookOnCompletion: true,
    abTesting: true,
    learningEngine: true,
    autoVariants: true,
    revisionLoop: true,
    contentScoring: true,
    videoRender: true,
    thumbnailGeneration: true,
    blogGeneration: true,
    landingPageGeneration: true,
  },
  business: {
    autoPublish: true,
    intermediateApproval: true,
    apiAccess: true,
    webhookOnCompletion: true,
    abTesting: true,
    learningEngine: true,
    autoVariants: true,
    revisionLoop: true,
    contentScoring: true,
    videoRender: true,
    thumbnailGeneration: true,
    blogGeneration: true,
    landingPageGeneration: true,
  },
};

export const PLAN_TENANT_LIMITS: Record<PlanTier, TenantLimits> = {
  basic: {
    jobsPerMonth: 10,
    concurrentJobs: 1,
    queuePriority: 10,
    maxPublishPlatforms: 0,
    maxFileSizeMB: 50,
    maxVariantsPerJob: 2,
    maxVideoRendersPerJob: 1,
    maxSeats: 1,
    requestsPerMinute: 20,
    jobsPerHour: 3,
    maxCostPerJobUsd: 0.50,
    learningScope: LearningScope.GLOBAL,
  },
  pro: {
    jobsPerMonth: 50,
    concurrentJobs: 3,
    queuePriority: 5,
    maxPublishPlatforms: 2,
    maxFileSizeMB: 100,
    maxVariantsPerJob: 6,
    maxVideoRendersPerJob: 5,
    maxSeats: 5,
    requestsPerMinute: 60,
    jobsPerHour: 10,
    maxCostPerJobUsd: 2.00,
    learningScope: LearningScope.HYBRID,
  },
  business: {
    jobsPerMonth: 500,
    concurrentJobs: 10,
    queuePriority: 1,
    maxPublishPlatforms: 4,
    maxFileSizeMB: 200,
    maxVariantsPerJob: 10,
    maxVideoRendersPerJob: 10,
    maxSeats: 50,
    requestsPerMinute: 200,
    jobsPerHour: 50,
    maxCostPerJobUsd: 5.00,
    learningScope: LearningScope.TENANT,
  },
};
