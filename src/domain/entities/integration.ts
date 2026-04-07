/**
 * Entity: External Integration
 *
 * Modelo unificado para integrações externas do sistema.
 * Padroniza configuração, validação, health e rastreabilidade.
 *
 * Categorias:
 *   - INPUT:       recebem dados para o sistema (webhooks, uploads)
 *   - OUTPUT:      enviam dados para fora (publicação, delivery)
 *   - OPERATIONAL: infraestrutura do sistema (IA, TTS, storage)
 *   - BILLING:     pagamento e cobrança
 *   - AUTOMATION:  orquestração de fluxos (n8n)
 *
 * Separação config/secrets:
 *   - IntegrationConfig: dados públicos (URLs, IDs, feature flags)
 *   - Secrets ficam em env vars no Railway — nunca no config
 *
 * Persistência: bookagent_integrations, bookagent_integration_events
 *
 * Parte 81: External Integrations Expansion
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo/categoria da integração */
export enum IntegrationType {
  INPUT = 'input',
  OUTPUT = 'output',
  OPERATIONAL = 'operational',
  BILLING = 'billing',
  AUTOMATION = 'automation',
}

/** Status da integração */
export enum IntegrationStatus {
  /** Configurada e funcionando */
  ACTIVE = 'active',
  /** Configurada mas não verificada */
  CONFIGURED = 'configured',
  /** Não configurada (env vars ausentes) */
  NOT_CONFIGURED = 'not_configured',
  /** Configurada mas com falha recente */
  DEGRADED = 'degraded',
  /** Desabilitada manualmente */
  DISABLED = 'disabled',
}

/** ID das integrações conhecidas do sistema */
export enum IntegrationId {
  // Operational
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE_AI = 'google_ai',
  GOOGLE_TTS = 'google_tts',
  ELEVENLABS = 'elevenlabs',
  SUPABASE = 'supabase',

  // Output
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  WHATSAPP = 'whatsapp',

  // Automation
  N8N = 'n8n',

  // Billing
  STRIPE = 'stripe',
  ASAAS = 'asaas',
  MANUAL_BILLING = 'manual_billing',
}

// ---------------------------------------------------------------------------
// Integration Config (public — no secrets)
// ---------------------------------------------------------------------------

/**
 * Configuração pública de uma integração.
 * Secrets ficam em env vars — aqui só referências e flags.
 */
export interface IntegrationConfig {
  /** Se está habilitada */
  enabled: boolean;
  /** Env vars necessárias (nomes, não valores) */
  requiredEnvVars: string[];
  /** URL base (se aplicável, sem credentials) */
  baseUrl?: string;
  /** Tenant-specific overrides (null = global) */
  tenantId?: string;
  /** Feature flag que controla acesso (se aplicável) */
  featureFlag?: string;
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Integration Health
// ---------------------------------------------------------------------------

/**
 * Snapshot de saúde de uma integração.
 */
export interface IntegrationHealth {
  /** Status atual */
  status: IntegrationStatus;
  /** Latência da última verificação (ms) */
  latencyMs: number | null;
  /** Última verificação bem-sucedida */
  lastSuccessAt: Date | null;
  /** Última falha */
  lastFailureAt: Date | null;
  /** Último erro */
  lastError: string | null;
  /** Falhas consecutivas */
  consecutiveFailures: number;
  /** Uptime estimado (%) */
  uptimePct: number;
  /** Verificado em */
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Integration Event
// ---------------------------------------------------------------------------

/** Tipo de evento da integração */
export enum IntegrationEventType {
  HEALTH_CHECK = 'health_check',
  CONFIG_CHANGED = 'config_changed',
  CONNECTION_LOST = 'connection_lost',
  CONNECTION_RESTORED = 'connection_restored',
  WEBHOOK_RECEIVED = 'webhook_received',
  WEBHOOK_FAILED = 'webhook_failed',
  ACTION_EXECUTED = 'action_executed',
  ACTION_FAILED = 'action_failed',
  RATE_LIMITED = 'rate_limited',
}

/**
 * Evento registrado para uma integração.
 */
export interface IntegrationEvent {
  /** ID do evento */
  id: string;
  /** ID da integração */
  integrationId: string;
  /** Tipo */
  eventType: IntegrationEventType;
  /** Sucesso */
  success: boolean;
  /** Mensagem */
  message: string;
  /** Latência (ms) */
  latencyMs?: number;
  /** Tenant afetado (null = global) */
  tenantId?: string;
  /** Timestamp */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Integration Action Result
// ---------------------------------------------------------------------------

/**
 * Resultado de uma ação executada numa integração.
 */
export interface IntegrationActionResult {
  integrationId: string;
  action: string;
  success: boolean;
  message: string;
  latencyMs: number;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// External Integration (full model)
// ---------------------------------------------------------------------------

/**
 * Integração externa completa — modelo unificado.
 */
export interface ExternalIntegration {
  /** ID da integração */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Tipo/categoria */
  type: IntegrationType;
  /** Configuração */
  config: IntegrationConfig;
  /** Saúde atual */
  health: IntegrationHealth;
  /** Plano mínimo para acesso (null = todos) */
  minPlanTier: string | null;
}

// ---------------------------------------------------------------------------
// Integration Registry Entry (for catalog)
// ---------------------------------------------------------------------------

/**
 * Definição de uma integração no catálogo — usado pelo registry.
 */
export interface IntegrationDefinition {
  /** ID único */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Categoria */
  type: IntegrationType;
  /** Env vars necessárias */
  requiredEnvVars: string[];
  /** Plano mínimo (null = todos) */
  minPlanTier: string | null;
  /** Feature flag que controla acesso */
  featureFlag?: string;
}

// ---------------------------------------------------------------------------
// Integration Catalog — definições estáticas de todas as integrações
// ---------------------------------------------------------------------------

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  // --- Operational ---
  {
    id: IntegrationId.ANTHROPIC,
    name: 'Anthropic (Claude)',
    description: 'Provider de IA para geração de texto, análise e narrativa',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.OPENAI,
    name: 'OpenAI (GPT)',
    description: 'Provider de IA alternativo para geração de texto',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['OPENAI_API_KEY'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.GOOGLE_AI,
    name: 'Google AI (Gemini)',
    description: 'Provider de IA alternativo com suporte a visão',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['GEMINI_API_KEY'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.GOOGLE_TTS,
    name: 'Google Text-to-Speech',
    description: 'Geração de narração por voz (TTS)',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['GOOGLE_TTS_API_KEY'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.ELEVENLABS,
    name: 'ElevenLabs',
    description: 'TTS premium com vozes realistas',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['ELEVENLABS_API_KEY'],
    minPlanTier: 'pro',
  },
  {
    id: IntegrationId.SUPABASE,
    name: 'Supabase',
    description: 'Persistência, storage e autenticação',
    type: IntegrationType.OPERATIONAL,
    requiredEnvVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    minPlanTier: null,
  },

  // --- Output ---
  {
    id: IntegrationId.INSTAGRAM,
    name: 'Instagram (Graph API)',
    description: 'Publicação de Reels e posts no Instagram',
    type: IntegrationType.OUTPUT,
    requiredEnvVars: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID'],
    minPlanTier: 'pro',
    featureFlag: 'autoPublish',
  },
  {
    id: IntegrationId.FACEBOOK,
    name: 'Facebook (Graph API)',
    description: 'Publicação no Facebook',
    type: IntegrationType.OUTPUT,
    requiredEnvVars: ['FACEBOOK_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'],
    minPlanTier: 'pro',
    featureFlag: 'autoPublish',
  },
  {
    id: IntegrationId.WHATSAPP,
    name: 'WhatsApp Business',
    description: 'Envio de mídia via WhatsApp Business API ou n8n webhook',
    type: IntegrationType.OUTPUT,
    requiredEnvVars: ['WHATSAPP_WEBHOOK_URL'],
    minPlanTier: null,
  },

  // --- Automation ---
  {
    id: IntegrationId.N8N,
    name: 'n8n (Automação)',
    description: 'Orquestração de workflows e webhooks',
    type: IntegrationType.AUTOMATION,
    requiredEnvVars: ['N8N_WEBHOOK_BASE_URL'],
    minPlanTier: null,
  },

  // --- Billing ---
  {
    id: IntegrationId.STRIPE,
    name: 'Stripe',
    description: 'Gateway de pagamento para assinaturas',
    type: IntegrationType.BILLING,
    requiredEnvVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.ASAAS,
    name: 'Asaas',
    description: 'Gateway de pagamento brasileiro',
    type: IntegrationType.BILLING,
    requiredEnvVars: ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_SECRET'],
    minPlanTier: null,
  },
  {
    id: IntegrationId.MANUAL_BILLING,
    name: 'Billing Manual',
    description: 'Gestão manual de assinaturas (sem gateway externo)',
    type: IntegrationType.BILLING,
    requiredEnvVars: [],
    minPlanTier: null,
  },
];
