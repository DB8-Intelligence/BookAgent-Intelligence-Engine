/**
 * Integration Hub — Domain Entities
 *
 * Conectores para sistemas externos: ImobCreator, NexoOmnix,
 * CRMs imobiliários e plataformas parceiras.
 *
 * Persistência:
 *   - bookagent_external_connections
 *   - bookagent_sync_logs
 *
 * Parte 103: Escala — Integrações
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ExternalSystemType {
  IMOB_CREATOR   = 'imob_creator',
  NEXO_OMNIX     = 'nexo_omnix',
  CRM_GENERIC    = 'crm_generic',
  CRM_HUBSPOT    = 'crm_hubspot',
  CRM_PIPEDRIVE  = 'crm_pipedrive',
  CRM_RD_STATION = 'crm_rd_station',
  ZAPIER         = 'zapier',
  N8N            = 'n8n',
  CUSTOM_WEBHOOK = 'custom_webhook',
}

export enum ConnectionStatus {
  ACTIVE       = 'active',
  INACTIVE     = 'inactive',
  ERROR        = 'error',
  PENDING_AUTH = 'pending_auth',
}

export enum SyncDirection {
  INBOUND  = 'inbound',
  OUTBOUND = 'outbound',
  BOTH     = 'both',
}

export enum SyncEventType {
  JOB_CREATED      = 'job_created',
  JOB_COMPLETED    = 'job_completed',
  ARTIFACT_READY   = 'artifact_ready',
  LEAD_CREATED     = 'lead_created',
  LEAD_CONVERTED   = 'lead_converted',
  PUBLICATION_DONE = 'publication_done',
  CONTENT_APPROVED = 'content_approved',
}

export enum SyncLogStatus {
  SUCCESS = 'success',
  FAILED  = 'failed',
  SKIPPED = 'skipped',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Conexão com sistema externo. */
export interface ExternalConnection {
  id: string;
  tenantId: string;
  system: ExternalSystemType;
  name: string;
  status: ConnectionStatus;
  direction: SyncDirection;
  /** Configuração específica do conector */
  config: ConnectorConfig;
  /** Eventos que disparam sync */
  syncEvents: SyncEventType[];
  /** Health check */
  lastPingAt: string | null;
  lastPingOk: boolean;
  errorMessage: string | null;
  totalSyncs: number;
  totalErrors: number;
  createdAt: string;
  updatedAt: string;
}

/** Configuração específica por tipo de conector. */
export interface ConnectorConfig {
  /** URL da API ou webhook do sistema externo */
  apiUrl?: string;
  /** Chave de autenticação */
  apiKey?: string;
  /** Webhook URL para receber eventos */
  webhookUrl?: string;
  /** Secret para HMAC de webhook */
  webhookSecret?: string;
  /** Campos custom para mapear */
  fieldMapping?: Record<string, string>;
  /** Headers extras */
  headers?: Record<string, string>;
  /** Metadata livre */
  extra?: Record<string, unknown>;
}

/** Log de sincronização. */
export interface SyncLog {
  id: string;
  connectionId: string;
  tenantId: string;
  event: SyncEventType;
  direction: SyncDirection;
  status: SyncLogStatus;
  /** Payload enviado/recebido */
  payload: Record<string, unknown>;
  /** Resposta do sistema externo */
  response: Record<string, unknown> | null;
  /** HTTP status code da resposta */
  httpStatus: number | null;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Integration Definitions
// ---------------------------------------------------------------------------

export interface IntegrationDefinition {
  system: ExternalSystemType;
  label: string;
  description: string;
  supportedEvents: SyncEventType[];
  supportedDirections: SyncDirection[];
  requiredConfigFields: string[];
  docsUrl: string | null;
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    system: ExternalSystemType.IMOB_CREATOR,
    label: 'ImobCreator Studio',
    description: 'Plataforma de criação de conteúdo imobiliário. Sincroniza jobs, artifacts e publicações.',
    supportedEvents: [SyncEventType.JOB_COMPLETED, SyncEventType.ARTIFACT_READY, SyncEventType.PUBLICATION_DONE],
    supportedDirections: [SyncDirection.OUTBOUND, SyncDirection.BOTH],
    requiredConfigFields: ['apiUrl', 'apiKey'],
    docsUrl: null,
  },
  {
    system: ExternalSystemType.NEXO_OMNIX,
    label: 'NexoOmnix Platform',
    description: 'Suite de marketing imobiliário. Integra reels, social media e campanhas.',
    supportedEvents: [SyncEventType.JOB_COMPLETED, SyncEventType.ARTIFACT_READY, SyncEventType.CONTENT_APPROVED],
    supportedDirections: [SyncDirection.OUTBOUND, SyncDirection.BOTH],
    requiredConfigFields: ['apiUrl', 'apiKey'],
    docsUrl: null,
  },
  {
    system: ExternalSystemType.CRM_HUBSPOT,
    label: 'HubSpot CRM',
    description: 'Sincroniza leads e conversões com HubSpot.',
    supportedEvents: [SyncEventType.LEAD_CREATED, SyncEventType.LEAD_CONVERTED],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['apiKey'],
    docsUrl: 'https://developers.hubspot.com/docs/api/overview',
  },
  {
    system: ExternalSystemType.CRM_PIPEDRIVE,
    label: 'Pipedrive CRM',
    description: 'Sincroniza leads e deals com Pipedrive.',
    supportedEvents: [SyncEventType.LEAD_CREATED, SyncEventType.LEAD_CONVERTED],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['apiKey'],
    docsUrl: 'https://developers.pipedrive.com/docs/api/v1',
  },
  {
    system: ExternalSystemType.CRM_RD_STATION,
    label: 'RD Station CRM',
    description: 'Sincroniza leads e oportunidades com RD Station.',
    supportedEvents: [SyncEventType.LEAD_CREATED, SyncEventType.LEAD_CONVERTED],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['apiKey'],
    docsUrl: 'https://developers.rdstation.com/',
  },
  {
    system: ExternalSystemType.CRM_GENERIC,
    label: 'CRM Genérico (Webhook)',
    description: 'Qualquer CRM que aceite webhooks HTTP.',
    supportedEvents: [SyncEventType.LEAD_CREATED, SyncEventType.LEAD_CONVERTED, SyncEventType.JOB_COMPLETED],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['webhookUrl'],
    docsUrl: null,
  },
  {
    system: ExternalSystemType.ZAPIER,
    label: 'Zapier',
    description: 'Conecta BookAgent com 5000+ apps via Zapier webhooks.',
    supportedEvents: [SyncEventType.JOB_COMPLETED, SyncEventType.LEAD_CREATED, SyncEventType.PUBLICATION_DONE],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['webhookUrl'],
    docsUrl: null,
  },
  {
    system: ExternalSystemType.N8N,
    label: 'n8n Automation',
    description: 'Orquestração avançada de workflows via n8n.',
    supportedEvents: [SyncEventType.JOB_CREATED, SyncEventType.JOB_COMPLETED, SyncEventType.LEAD_CREATED, SyncEventType.LEAD_CONVERTED, SyncEventType.CONTENT_APPROVED],
    supportedDirections: [SyncDirection.BOTH],
    requiredConfigFields: ['webhookUrl'],
    docsUrl: null,
  },
  {
    system: ExternalSystemType.CUSTOM_WEBHOOK,
    label: 'Webhook Customizado',
    description: 'Envia eventos para qualquer URL HTTP.',
    supportedEvents: Object.values(SyncEventType) as SyncEventType[],
    supportedDirections: [SyncDirection.OUTBOUND],
    requiredConfigFields: ['webhookUrl'],
    docsUrl: null,
  },
];

export const SYSTEM_LABELS: Record<ExternalSystemType, string> = Object.fromEntries(
  INTEGRATION_CATALOG.map((d) => [d.system, d.label]),
) as Record<ExternalSystemType, string>;
