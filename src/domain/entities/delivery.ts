/**
 * Entity: Delivery
 *
 * Representa o resultado da camada de entrega.
 * Encapsula o status final do processamento e os endpoints
 * onde os artifacts podem ser acessados.
 *
 * Na fase atual (pré-integração), esta entidade é estrutural:
 * prepara o contrato para quando o sistema estiver conectado
 * a serviços de storage, notificação e webhook.
 */

export enum DeliveryStatus {
  READY = 'ready',
  PARTIAL = 'partial',
  PENDING_UPLOAD = 'pending_upload',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export enum DeliveryChannel {
  API = 'api',
  WEBHOOK = 'webhook',
  STORAGE = 'storage',
  EMAIL = 'email',
  SOCIAL_PUBLISH = 'social_publish',
}

export interface DeliveryManifestEntry {
  artifactId: string;
  type: string;
  format: string;
  sizeBytes?: number;
  localPath?: string;
  publicUrl?: string;
  /** Variant ID (Parte 65) — identifies which variant this artifact belongs to */
  variantId?: string;
  /** Distribution channel (Parte 65) */
  channel?: string;
  /** Subtitle sidecar paths (Parte 64) */
  subtitlePaths?: { srt?: string; vtt?: string };
  /** Thumbnail paths by aspect ratio (Parte 66) */
  thumbnailPaths?: Record<string, string>;
  /** Primary thumbnail URL for social sharing (Parte 66) */
  thumbnailUrl?: string;
}

export interface DeliveryResult {
  status: DeliveryStatus;
  jobId: string;
  completedAt: Date;
  totalArtifacts: number;
  manifest: DeliveryManifestEntry[];
  channels: DeliveryChannel[];
  webhookSent: boolean;
  summary: string;
  /** Publishing results (Parte 67) */
  publishResults?: PublishSummary[];
  /** Whether auto-publish was attempted (Parte 67) */
  autoPublishAttempted?: boolean;
}

/** Summary of a social publish attempt (Parte 67) */
export interface PublishSummary {
  platform: string;
  status: string;
  postUrl?: string;
  error?: string;
}
