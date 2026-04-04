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
}

export interface DeliveryManifestEntry {
  artifactId: string;
  type: string;
  format: string;
  sizeBytes?: number;
  localPath?: string;
  publicUrl?: string;
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
}
