/**
 * Queue Types — Definições de tipos para a fila BullMQ
 *
 * BookAgentJobData é o payload armazenado em cada job da fila.
 * É serializado para Redis e recebido pelo worker.
 */

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
  };

  /** URL para notificação ao finalizar (POST com resultado) */
  webhookUrl?: string;
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
