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
});

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;
