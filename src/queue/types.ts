/**
 * Queue Types — payloads serializados para enfileirar jobs
 *
 * BookAgentJobData é o payload enviado ao Google Cloud Tasks (base64 JSON)
 * e recebido de volta no endpoint /internal/execute-pipeline via OIDC.
 *
 * Parte 74: adicionado tenantContext para isolamento multi-tenant.
 */

/** Tenant context leve para serialização na fila (Parte 74) */
export interface QueueTenantContext {
  tenantId: string;
  userId: string;
  planTier: string;
  learningScope: string;
}

export interface BookAgentJobData {
  /** ID único do job (UUID gerado pela API antes de enfileirar) */
  jobId: string;

  /** URL do arquivo a ser processado */
  fileUrl: string;

  /** Tipo do input: pdf | video | audio | pptx | document */
  type: string;

  /** Contexto do usuário/projeto */
  userContext: {
    name?: string;
    whatsapp?: string;
    instagram?: string;
    site?: string;
    region?: string;
    logoUrl?: string;
    /** CSV de formatos selecionados — repassa para o ProcessingContext.userSelectedFormats */
    selectedFormats?: string;
  };

  /** URL para notificação ao finalizar (POST com resultado) */
  webhookUrl?: string;

  /** Tenant context para isolamento (Parte 74) */
  tenantContext?: QueueTenantContext;
}

/**
 * VideoRenderJobData — payload for async video render jobs.
 * Triggered post-approval, consumes a RenderSpec artifact.
 *
 * Parte 59.1: Video render as async job
 */
export interface VideoRenderJobData {
  /** Original pipeline job ID (for artifact lookup) */
  jobId: string;

  /** RenderSpec artifact ID to render */
  artifactId: string;

  /** The RenderSpec JSON content */
  renderSpecJson: string;

  /** Map of assetId → storage URL (to be downloaded before render) */
  assetUrls: Record<string, string>;

  /** Webhook URL for notification on completion */
  webhookUrl?: string;

  /** Path to narration audio file (Parte 62) */
  narrationAudioPath?: string;

  /** Soundtrack category hint from AudioPlan (Parte 62) */
  soundtrackCategory?: string;

  /** Variant spec IDs to render (Parte 65) — if set, renders multiple variants */
  variantIds?: string[];

  /** Tenant context for isolation (Parte 74) */
  tenantContext?: QueueTenantContext;
}

/** Resultado do webhook POST */
export interface WebhookPayload {
  source: 'bookagent';
  timestamp: string;
  jobId: string;
  status: 'completed' | 'failed';
  artifacts_count?: number;
  duration_ms?: number;
  error?: string;
}
