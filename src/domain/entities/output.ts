/**
 * Entity: GeneratedOutput
 *
 * Representa um conteúdo final gerado pelo pipeline
 * (reel, post, carrossel, blog, landing page, etc.).
 */

import type { OutputFormat } from '../value-objects/index.js';

export interface GeneratedOutput {
  id: string;
  format: OutputFormat;
  filePath: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
