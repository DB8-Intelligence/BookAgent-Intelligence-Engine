/**
 * Entity: Content Campaign Orchestration
 *
 * Conceitos:
 *
 *   CAMPAIGN:
 *     Entidade operacional que agrupa outputs com intenção,
 *     sequência e estado. Nasce de uma estratégia (Parte 84)
 *     e é composta por itens com papéis distintos.
 *
 *   CAMPAIGN BLUEPRINT:
 *     Plano abstrato da campanha antes de vincular outputs reais.
 *     Define roles, formatos, canais e ordem — gerado pela strategy.
 *
 *   CAMPAIGN ITEM:
 *     Uma peça da campanha — vincula um output real (variant, vídeo,
 *     blog, landing page) a um papel na sequência (teaser, hero, etc.).
 *
 *   CAMPAIGN SCHEDULE HINT:
 *     Sugestão temporal (dia relativo, ordem) para execução futura.
 *     Não é um scheduler — é um hint para orquestração.
 *
 * Relações:
 *   Strategy → Blueprint → Campaign → Items → Outputs + Publications
 *
 * Persistência: bookagent_campaigns
 *
 * Parte 85: Content Campaign Orchestration
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status da campanha */
export enum CampaignStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  AWAITING_APPROVAL = 'awaiting_approval',
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  PARTIALLY_PUBLISHED = 'partially_published',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

/** Papel do item na campanha */
export enum CampaignItemRole {
  /** Teaser / anticipação */
  TEASER = 'teaser',
  /** Conteúdo principal / hero */
  HERO = 'hero',
  /** Conteúdo de suporte / complementar */
  SUPPORTING = 'supporting',
  /** Follow-up / reforço */
  FOLLOW_UP = 'follow_up',
  /** Landing page destino */
  LANDING = 'landing',
  /** Remarketing / reativação */
  REMARKETING = 'remarketing',
  /** Prova social / depoimento */
  SOCIAL_PROOF = 'social_proof',
}

/** Status do item de campanha */
export enum CampaignItemStatus {
  DRAFT = 'draft',
  PENDING_OUTPUT = 'pending_output',
  AWAITING_APPROVAL = 'awaiting_approval',
  APPROVED = 'approved',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** Objetivo da campanha (herda da estratégia) */
export enum CampaignObjective {
  AWARENESS = 'awareness',
  ENGAGEMENT = 'engagement',
  CONVERSION = 'conversion',
  NURTURE = 'nurture',
  SOCIAL_PROOF = 'social_proof',
  LAUNCH = 'launch',
}

// ---------------------------------------------------------------------------
// Campaign Schedule Hint
// ---------------------------------------------------------------------------

/**
 * Sugestão temporal para um item da campanha.
 * Não é scheduler — é hint para orquestração futura.
 */
export interface CampaignScheduleHint {
  /** Dia relativo ao início da campanha (0 = dia 1) */
  dayOffset: number;
  /** Ordem dentro do mesmo dia (menor = primeiro) */
  orderInDay: number;
  /** Horário sugerido (ex: "10:00", "18:00") */
  suggestedTime?: string;
  /** Dia da semana preferido (0=dom, 1=seg, ..., 6=sab) */
  preferredWeekday?: number;
}

// ---------------------------------------------------------------------------
// Campaign Output Link
// ---------------------------------------------------------------------------

/**
 * Vínculo entre item de campanha e output real do sistema.
 */
export interface CampaignOutputLink {
  /** Tipo do output */
  outputType: 'variant' | 'video' | 'thumbnail' | 'blog' | 'landing_page' | 'carousel' | 'post';
  /** ID do output (artifactId, variantId, etc.) */
  outputId: string;
  /** ID do job de origem */
  jobId?: string;
  /** URL do output (se disponível) */
  outputUrl?: string;
  /** ID da publicação vinculada (se publicado) */
  publicationId?: string;
}

// ---------------------------------------------------------------------------
// Campaign Item
// ---------------------------------------------------------------------------

/**
 * Item individual da campanha — uma peça com papel e estado.
 */
export interface CampaignItem {
  /** ID */
  id: string;
  /** Papel na campanha */
  role: CampaignItemRole;
  /** Status */
  status: CampaignItemStatus;
  /** Ordem na sequência */
  order: number;
  /** Título */
  title: string;
  /** Descrição / briefing */
  description: string;
  /** Formato do output */
  format: string;
  /** Canal alvo */
  channel: string;
  /** Template sugerido */
  templateId?: string;
  /** Style sugerido */
  styleId?: string;
  /** Hint de schedule */
  scheduleHint: CampaignScheduleHint;
  /** Link com output real (preenchido quando vinculado) */
  outputLink?: CampaignOutputLink;
  /** Dependências (IDs de itens que devem ser publicados antes) */
  dependsOn: string[];
}

// ---------------------------------------------------------------------------
// Campaign Blueprint
// ---------------------------------------------------------------------------

/**
 * Blueprint — plano abstrato antes de vincular outputs.
 * Gerado pela strategy, define a estrutura da campanha.
 */
export interface CampaignBlueprint {
  /** Objetivo */
  objective: CampaignObjective;
  /** Descrição da estratégia */
  strategyDescription: string;
  /** Itens planejados (roles + formatos + ordem) */
  plannedItems: Array<{
    role: CampaignItemRole;
    format: string;
    channel: string;
    description: string;
    dayOffset: number;
    templateId?: string;
    styleId?: string;
  }>;
  /** Duração total sugerida (dias) */
  durationDays: number;
  /** Preset recomendado */
  recommendedPreset: string;
}

// ---------------------------------------------------------------------------
// Content Campaign
// ---------------------------------------------------------------------------

/**
 * Campanha de conteúdo — entidade operacional com estado e objetivo.
 */
export interface ContentCampaign {
  /** ID */
  id: string;
  /** ID do tenant */
  tenantId: string;
  /** Nome da campanha */
  name: string;
  /** Objetivo */
  objective: CampaignObjective;
  /** Status */
  status: CampaignStatus;
  /** Blueprint original */
  blueprint: CampaignBlueprint;
  /** Itens da campanha */
  items: CampaignItem[];
  /** Job IDs associados */
  jobIds: string[];
  /** ID da estratégia de origem */
  strategySnapshotId?: string;
  /** Duração planejada (dias) */
  plannedDurationDays: number;
  /** Progresso (0-100) */
  progressPercent: number;
  /** Contadores */
  counts: {
    total: number;
    published: number;
    approved: number;
    pending: number;
    failed: number;
  };
  /** Criado em */
  createdAt: Date;
  /** Última atualização */
  updatedAt: Date;
  /** Início planejado */
  plannedStartAt?: Date;
  /** Concluído em */
  completedAt?: Date;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  [CampaignStatus.DRAFT]: 'Rascunho',
  [CampaignStatus.PLANNED]: 'Planejada',
  [CampaignStatus.AWAITING_APPROVAL]: 'Aguardando aprovação',
  [CampaignStatus.READY]: 'Pronta',
  [CampaignStatus.IN_PROGRESS]: 'Em andamento',
  [CampaignStatus.PARTIALLY_PUBLISHED]: 'Parcialmente publicada',
  [CampaignStatus.COMPLETED]: 'Concluída',
  [CampaignStatus.FAILED]: 'Falhou',
  [CampaignStatus.ARCHIVED]: 'Arquivada',
};

export const ITEM_ROLE_LABELS: Record<CampaignItemRole, string> = {
  [CampaignItemRole.TEASER]: 'Teaser',
  [CampaignItemRole.HERO]: 'Conteúdo Principal',
  [CampaignItemRole.SUPPORTING]: 'Suporte',
  [CampaignItemRole.FOLLOW_UP]: 'Follow-up',
  [CampaignItemRole.LANDING]: 'Landing Page',
  [CampaignItemRole.REMARKETING]: 'Remarketing',
  [CampaignItemRole.SOCIAL_PROOF]: 'Prova Social',
};
