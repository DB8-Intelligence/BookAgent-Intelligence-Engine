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
