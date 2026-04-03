/**
 * Entity: Job
 *
 * Representa uma unidade de trabalho no sistema.
 * Cada request de processamento cria um Job que acompanha
 * o ciclo de vida completo: pending → processing → completed/failed.
 */

import type { Source } from './source.js';
import type { GeneratedOutput } from './output.js';
import type { BrandingProfile } from './branding.js';
import type { UserContext } from './user-context.js';
import type { InputType, JobStatus } from '../value-objects/index.js';

export interface JobInput {
  fileUrl: string;
  type: InputType;
  userContext: UserContext;
}

export interface JobResult {
  jobId: string;
  sources: Source[];
  outputs: GeneratedOutput[];
  branding: BrandingProfile;
}

export interface Job {
  id: string;
  status: JobStatus;
  input: JobInput;
  createdAt: Date;
  updatedAt: Date;
  result?: JobResult;
  error?: string;
}
