/**
 * Acquisition & Growth Automation — Domain Entities
 *
 * Modela campanhas de aquisição automatizada, scheduling de conteúdo,
 * funil contínuo e nurturing de leads.
 *
 * Persistência:
 *   - bookagent_acquisition_campaigns
 *   - bookagent_content_schedules
 *   - bookagent_nurturing_sequences
 *   - bookagent_conversion_events
 *
 * Parte 103: Escala — Aquisição Automatizada
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum AcquisitionChannel {
  WHATSAPP       = 'whatsapp',
  INSTAGRAM      = 'instagram',
  FACEBOOK       = 'facebook',
  LANDING_PAGE   = 'landing_page',
  API            = 'api',
  REFERRAL       = 'referral',
  ORGANIC        = 'organic',
  PAID_ADS       = 'paid_ads',
}

export enum CampaignGoalType {
  LEAD_GENERATION  = 'lead_generation',
  TRIAL_ACTIVATION = 'trial_activation',
  CONVERSION       = 'conversion',
  UPSELL           = 'upsell',
  REACTIVATION     = 'reactivation',
  RETENTION        = 'retention',
}

export enum ContentScheduleStatus {
  DRAFT      = 'draft',
  SCHEDULED  = 'scheduled',
  PUBLISHING = 'publishing',
  PUBLISHED  = 'published',
  FAILED     = 'failed',
  PAUSED     = 'paused',
}

export enum NurturingStepType {
  WHATSAPP_MESSAGE = 'whatsapp_message',
  EMAIL            = 'email',
  WAIT             = 'wait',
  CONDITION        = 'condition',
  TAG_LEAD         = 'tag_lead',
  UPGRADE_OFFER    = 'upgrade_offer',
  DEMO_TRIGGER     = 'demo_trigger',
}

export enum SequenceStatus {
  ACTIVE   = 'active',
  PAUSED   = 'paused',
  ARCHIVED = 'archived',
}

export enum ConversionType {
  TRIAL_START   = 'trial_start',
  TRIAL_TO_PAID = 'trial_to_paid',
  PLAN_UPGRADE  = 'plan_upgrade',
  REFERRAL_CONV = 'referral_conversion',
  REACTIVATION  = 'reactivation',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Campanha de aquisição automatizada. */
export interface AcquisitionCampaign {
  id: string;
  tenantId: string;
  name: string;
  goal: CampaignGoalType;
  channels: AcquisitionChannel[];
  /** Configuração por canal */
  channelConfig: Record<string, unknown>;
  /** Métricas acumuladas */
  metrics: AcquisitionMetrics;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcquisitionMetrics {
  impressions: number;
  clicks: number;
  leads: number;
  trials: number;
  conversions: number;
  revenueBrl: number;
  costBrl: number;
  cpl: number;       // custo por lead
  cac: number;       // custo de aquisição
  conversionRate: number;
}

/** Agendamento de publicação de conteúdo em escala. */
export interface ContentSchedule {
  id: string;
  tenantId: string;
  campaignId: string | null;
  /** Job que gerou o conteúdo */
  jobId: string;
  /** Artifact específico a publicar */
  artifactId: string;
  platform: AcquisitionChannel;
  status: ContentScheduleStatus;
  scheduledAt: string;
  publishedAt: string | null;
  /** Resultado da publicação */
  platformPostId: string | null;
  platformUrl: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Sequência de nurturing para leads. */
export interface NurturingSequence {
  id: string;
  tenantId: string;
  name: string;
  /** Trigger: qual evento inicia a sequência */
  triggerEvent: string;
  steps: NurturingStep[];
  status: SequenceStatus;
  totalEnrolled: number;
  totalCompleted: number;
  totalConverted: number;
  createdAt: string;
  updatedAt: string;
}

export interface NurturingStep {
  order: number;
  type: NurturingStepType;
  /** Delay em minutos antes de executar */
  delayMinutes: number;
  /** Template da mensagem ou configuração */
  config: Record<string, unknown>;
  /** Condição para prosseguir (se type=condition) */
  condition: string | null;
}

/** Evento de conversão rastreado. */
export interface ConversionEvent {
  id: string;
  tenantId: string;
  leadPhone: string | null;
  type: ConversionType;
  channel: AcquisitionChannel;
  /** Campanha que originou */
  campaignId: string | null;
  /** Referral que originou */
  referralCode: string | null;
  planTier: string;
  revenueBrl: number;
  metadata: Record<string, unknown>;
  convertedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHANNEL_LABELS: Record<AcquisitionChannel, string> = {
  [AcquisitionChannel.WHATSAPP]:     'WhatsApp',
  [AcquisitionChannel.INSTAGRAM]:    'Instagram',
  [AcquisitionChannel.FACEBOOK]:     'Facebook',
  [AcquisitionChannel.LANDING_PAGE]: 'Landing Page',
  [AcquisitionChannel.API]:          'API',
  [AcquisitionChannel.REFERRAL]:     'Referral',
  [AcquisitionChannel.ORGANIC]:      'Orgânico',
  [AcquisitionChannel.PAID_ADS]:     'Paid Ads',
};

export const GOAL_LABELS: Record<CampaignGoalType, string> = {
  [CampaignGoalType.LEAD_GENERATION]:  'Geração de Leads',
  [CampaignGoalType.TRIAL_ACTIVATION]: 'Ativação de Trial',
  [CampaignGoalType.CONVERSION]:       'Conversão',
  [CampaignGoalType.UPSELL]:          'Upsell',
  [CampaignGoalType.REACTIVATION]:    'Reativação',
  [CampaignGoalType.RETENTION]:       'Retenção',
};

export const DEFAULT_NURTURING_SEQUENCE: NurturingStep[] = [
  { order: 1, type: NurturingStepType.WHATSAPP_MESSAGE, delayMinutes: 0,     config: { template: 'welcome' },       condition: null },
  { order: 2, type: NurturingStepType.DEMO_TRIGGER,     delayMinutes: 5,     config: { autoPdf: true },             condition: null },
  { order: 3, type: NurturingStepType.WAIT,              delayMinutes: 1440,  config: {},                            condition: null },
  { order: 4, type: NurturingStepType.WHATSAPP_MESSAGE, delayMinutes: 0,     config: { template: 'results_ready' }, condition: null },
  { order: 5, type: NurturingStepType.CONDITION,        delayMinutes: 4320,  config: {},                            condition: 'lead.stage !== "converted"' },
  { order: 6, type: NurturingStepType.UPGRADE_OFFER,    delayMinutes: 0,     config: { plan: 'pro', discount: 20 }, condition: null },
  { order: 7, type: NurturingStepType.WAIT,              delayMinutes: 10080, config: {},                            condition: null },
  { order: 8, type: NurturingStepType.WHATSAPP_MESSAGE, delayMinutes: 0,     config: { template: 'last_chance' },   condition: null },
];

export const EMPTY_METRICS: AcquisitionMetrics = {
  impressions: 0, clicks: 0, leads: 0, trials: 0, conversions: 0,
  revenueBrl: 0, costBrl: 0, cpl: 0, cac: 0, conversionRate: 0,
};
