/**
 * Schema: Process Request
 *
 * Validação do payload de entrada para o endpoint POST /process.
 * Usa Zod para validação em runtime.
 */

import { z } from 'zod';

export const ProcessRequestSchema = z.object({
  file_url: z.string().url('file_url deve ser uma URL válida'),
  type: z.enum(['pdf', 'video', 'audio', 'pptx', 'document']),
  user_context: z.object({
    name: z.string().optional(),
    whatsapp: z.string().optional(),
    instagram: z.string().optional(),
    site: z.string().optional(),
    region: z.string().optional(),
    logo_url: z.string().url().optional(),
  }).optional().default({}),
  authorization_acknowledged: z.boolean().optional(),
  authorization_timestamp: z.string().datetime().optional(),
  /**
   * URL para receber notificação POST quando o job finalizar.
   * Payload: { source, timestamp, jobId, status, artifacts_count?, duration_ms?, error? }
   * Ideal para integração com n8n: configure o Webhook Trigger do n8n aqui.
   */
  webhook_url: z.string().url().optional(),
});

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;
