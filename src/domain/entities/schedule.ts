/**
 * Entity: Scheduling & Calendar Orchestration
 *
 * Conceitos:
 *
 *   CAMPAIGN SCHEDULE:
 *     Plano temporal concreto de uma campanha. Transforma os
 *     campaign items + schedule hints em datas reais, janelas
 *     de publicação e dependências temporais.
 *
 *   SCHEDULE ITEM:
 *     Projeção temporal de um CampaignItem — contém datas
 *     planejadas, confirmadas e executadas. Cada schedule item
 *     tem um ScheduleItemStatus próprio, independente do
 *     CampaignItemStatus (que é operacional).
 *
 *   SCHEDULE WINDOW:
 *     Janela de tempo aceitável para execução de um item.
 *     Define earliest/latest para evitar publicação fora de contexto.
 *
 *   SCHEDULE DEPENDENCY:
 *     Relação temporal entre itens — "B só pode executar depois
 *     que A for publicado/aprovado". Inclui delay mínimo.
 *
 *   SCHEDULE CADENCE:
 *     Ritmo da campanha — intervalo entre publicações, máximo
 *     por dia, dias preferidos da semana.
 *
 *   SCHEDULE ADJUSTMENT:
 *     Registro de replanejamento — quando e por que um item
 *     foi adiado, antecipado ou pulado.
 *
 *   CALENDAR EVENT HINT:
 *     Projeção leve para visualização em calendário/agenda.
 *     Formato otimizado para calendar views (dia/semana).
 *
 * Separação importante:
 *   - PLANNED:    gerado pelo sistema (sugestão)
 *   - CONFIRMED:  aceito pelo usuário (compromisso)
 *   - EXECUTED:   efetivamente publicado (fato)
 *
 * Relações:
 *   Campaign → CampaignSchedule → ScheduleItems → CalendarEventHints
 *   ScheduleItem ←→ CampaignItem (1:1, por campaignItemId)
 *
 * Persistência: bookagent_campaign_schedules
 *
 * Parte 86: Scheduling & Calendar Orchestration
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status temporal do schedule item */
export enum ScheduleItemStatus {
  /** Planejado mas não confirmado */
  DRAFT = 'draft',
  /** Data planejada pelo sistema */
  PLANNED = 'planned',
  /** Aguardando dependência ser concluída */
  WAITING_DEPENDENCY = 'waiting_dependency',
  /** Aguardando aprovação do conteúdo */
  WAITING_APPROVAL = 'waiting_approval',
  /** Pronto para executar na data */
  READY_TO_EXECUTE = 'ready_to_execute',
  /** Confirmado pelo usuário */
  CONFIRMED = 'confirmed',
  /** Executado (publicado) */
  EXECUTED = 'executed',
  /** Atrasado — passou da janela sem execução */
  DELAYED = 'delayed',
  /** Pulado intencionalmente */
  SKIPPED = 'skipped',
  /** Falhou na execução */
  FAILED = 'failed',
}

/** Status geral do schedule da campanha */
export enum CampaignScheduleStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/** Motivo de um ajuste no schedule */
export enum AdjustmentReason {
  DEPENDENCY_DELAYED = 'dependency_delayed',
  APPROVAL_PENDING = 'approval_pending',
  APPROVAL_REJECTED = 'approval_rejected',
  PUBLICATION_FAILED = 'publication_failed',
  MANUAL_RESCHEDULE = 'manual_reschedule',
  CONTENT_NOT_READY = 'content_not_ready',
  CHANNEL_UNAVAILABLE = 'channel_unavailable',
  WEEKEND_SKIP = 'weekend_skip',
}

// ---------------------------------------------------------------------------
// Schedule Window
// ---------------------------------------------------------------------------

/**
 * Janela de tempo aceitável para execução de um item.
 */
export interface ScheduleWindow {
  /** Momento mais cedo aceitável */
  earliestAt: string;
  /** Momento ideal / planejado */
  plannedAt: string;
  /** Momento mais tarde aceitável */
  latestAt: string;
  /** Horário preferido (ex: "10:00") */
  preferredTime: string;
}

// ---------------------------------------------------------------------------
// Schedule Dependency
// ---------------------------------------------------------------------------

/**
 * Dependência temporal entre schedule items.
 */
export interface ScheduleDependency {
  /** ID do schedule item que deve completar primeiro */
  dependsOnItemId: string;
  /** Status mínimo requerido (ex: 'executed', 'confirmed') */
  requiredStatus: ScheduleItemStatus;
  /** Delay mínimo após a dependência (em horas) */
  minDelayHours: number;
}

// ---------------------------------------------------------------------------
// Schedule Cadence
// ---------------------------------------------------------------------------

/**
 * Cadência da campanha — ritmo de publicações.
 */
export interface ScheduleCadence {
  /** Máximo de publicações por dia */
  maxPerDay: number;
  /** Intervalo mínimo entre publicações (em horas) */
  minIntervalHours: number;
  /** Dias da semana preferidos (0=dom, 1=seg, ..., 6=sab) */
  preferredWeekdays: number[];
  /** Evitar fins de semana */
  skipWeekends: boolean;
  /** Horários preferidos por slot do dia */
  preferredSlots: Array<{ time: string; label: string }>;
}

/** Cadência padrão para campanhas */
export const DEFAULT_CADENCE: ScheduleCadence = {
  maxPerDay: 2,
  minIntervalHours: 4,
  preferredWeekdays: [1, 2, 3, 4, 5],
  skipWeekends: false,
  preferredSlots: [
    { time: '10:00', label: 'Manhã' },
    { time: '15:00', label: 'Tarde' },
    { time: '19:00', label: 'Noite' },
  ],
};

// ---------------------------------------------------------------------------
// Schedule Adjustment
// ---------------------------------------------------------------------------

/**
 * Registro de replanejamento — auditoria temporal.
 */
export interface ScheduleAdjustment {
  /** ID do schedule item afetado */
  scheduleItemId: string;
  /** Motivo */
  reason: AdjustmentReason;
  /** Data original */
  previousPlannedAt: string;
  /** Nova data */
  newPlannedAt: string;
  /** Descrição */
  description: string;
  /** Quando o ajuste foi feito */
  adjustedAt: string;
}

// ---------------------------------------------------------------------------
// Schedule Item
// ---------------------------------------------------------------------------

/**
 * Projeção temporal de um CampaignItem.
 * Cada schedule item referencia um campaign item (1:1).
 */
export interface ScheduleItem {
  /** ID do schedule item */
  id: string;
  /** ID do campaign item referenciado */
  campaignItemId: string;
  /** Ordem na sequência temporal */
  sequenceOrder: number;
  /** Status temporal */
  status: ScheduleItemStatus;
  /** Janela de execução */
  window: ScheduleWindow;
  /** Data confirmada pelo usuário (null se não confirmado) */
  confirmedAt: string | null;
  /** Data de execução real (null se não executado) */
  executedAt: string | null;
  /** Dependências temporais */
  dependencies: ScheduleDependency[];
  /** Requer aprovação antes de executar */
  requiresApproval: boolean;
  /** Requer auto publish ou publicação manual */
  autoPublish: boolean;
  /** Canal alvo */
  channel: string;
  /** Formato */
  format: string;
  /** Título (espelho do campaign item) */
  title: string;
}

// ---------------------------------------------------------------------------
// Campaign Schedule
// ---------------------------------------------------------------------------

/**
 * Schedule completo de uma campanha — plano temporal concreto.
 */
export interface CampaignSchedule {
  /** ID */
  id: string;
  /** ID da campanha */
  campaignId: string;
  /** ID do tenant */
  tenantId: string;
  /** Status geral */
  status: CampaignScheduleStatus;
  /** Cadência configurada */
  cadence: ScheduleCadence;
  /** Itens do schedule (ordenados por sequenceOrder) */
  items: ScheduleItem[];
  /** Ajustes realizados (log de replanejamentos) */
  adjustments: ScheduleAdjustment[];
  /** Data de início da campanha */
  startsAt: string;
  /** Data estimada de término */
  estimatedEndAt: string;
  /** Contadores */
  counts: {
    total: number;
    executed: number;
    confirmed: number;
    planned: number;
    delayed: number;
    failed: number;
  };
  /** Progresso temporal (0-100) */
  progressPercent: number;
  /** Criado em */
  createdAt: string;
  /** Última atualização */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Calendar Event Hint
// ---------------------------------------------------------------------------

/**
 * Projeção leve para visualização em calendário.
 * Otimizado para calendar views (dia/semana).
 */
export interface CalendarEventHint {
  /** ID do schedule item */
  scheduleItemId: string;
  /** ID da campanha */
  campaignId: string;
  /** Nome da campanha */
  campaignName: string;
  /** Título do item */
  title: string;
  /** Data/hora planejada */
  dateTime: string;
  /** Canal */
  channel: string;
  /** Formato */
  format: string;
  /** Status */
  status: ScheduleItemStatus;
  /** É confirmado? */
  confirmed: boolean;
  /** Cor sugerida (para UI) */
  color: string;
}

// ---------------------------------------------------------------------------
// Calendar Overview
// ---------------------------------------------------------------------------

/**
 * Visão geral do calendário de um tenant — agrupa por dia/semana.
 */
export interface CalendarOverview {
  tenantId: string;
  /** Período coberto */
  periodStart: string;
  periodEnd: string;
  /** Eventos por dia */
  days: Array<{
    date: string;
    dayOfWeek: number;
    events: CalendarEventHint[];
    totalEvents: number;
  }>;
  /** Totais do período */
  totals: {
    events: number;
    campaigns: number;
    executed: number;
    pending: number;
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const SCHEDULE_ITEM_STATUS_LABELS: Record<ScheduleItemStatus, string> = {
  [ScheduleItemStatus.DRAFT]: 'Rascunho',
  [ScheduleItemStatus.PLANNED]: 'Planejado',
  [ScheduleItemStatus.WAITING_DEPENDENCY]: 'Aguardando dependência',
  [ScheduleItemStatus.WAITING_APPROVAL]: 'Aguardando aprovação',
  [ScheduleItemStatus.READY_TO_EXECUTE]: 'Pronto para executar',
  [ScheduleItemStatus.CONFIRMED]: 'Confirmado',
  [ScheduleItemStatus.EXECUTED]: 'Executado',
  [ScheduleItemStatus.DELAYED]: 'Atrasado',
  [ScheduleItemStatus.SKIPPED]: 'Pulado',
  [ScheduleItemStatus.FAILED]: 'Falhou',
};

export const SCHEDULE_STATUS_LABELS: Record<CampaignScheduleStatus, string> = {
  [CampaignScheduleStatus.DRAFT]: 'Rascunho',
  [CampaignScheduleStatus.ACTIVE]: 'Ativo',
  [CampaignScheduleStatus.PAUSED]: 'Pausado',
  [CampaignScheduleStatus.COMPLETED]: 'Concluído',
  [CampaignScheduleStatus.CANCELLED]: 'Cancelado',
};

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  [AdjustmentReason.DEPENDENCY_DELAYED]: 'Dependência atrasada',
  [AdjustmentReason.APPROVAL_PENDING]: 'Aprovação pendente',
  [AdjustmentReason.APPROVAL_REJECTED]: 'Aprovação rejeitada',
  [AdjustmentReason.PUBLICATION_FAILED]: 'Publicação falhou',
  [AdjustmentReason.MANUAL_RESCHEDULE]: 'Replanejamento manual',
  [AdjustmentReason.CONTENT_NOT_READY]: 'Conteúdo não pronto',
  [AdjustmentReason.CHANNEL_UNAVAILABLE]: 'Canal indisponível',
  [AdjustmentReason.WEEKEND_SKIP]: 'Fim de semana pulado',
};
