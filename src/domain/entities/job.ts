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
import type { NarrativePlan } from './narrative.js';
import type { MediaPlan } from './media-plan.js';
import type { BlogPlan } from './blog-plan.js';
import type { LandingPagePlan } from './landing-page-plan.js';
import type { OutputDecision } from './output-decision.js';
import type { ExportResult } from './export-artifact.js';
import type { DeliveryResult } from './delivery.js';
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

  /** Decisões de viabilidade por formato */
  selectedOutputs?: OutputDecision[];

  /** Narrativas geradas */
  narratives?: NarrativePlan[];

  /** Planos de mídia gerados */
  mediaPlans?: MediaPlan[];

  /** Planos de blog gerados */
  blogPlans?: BlogPlan[];

  /** Planos de landing page gerados */
  landingPagePlans?: LandingPagePlan[];

  /** Resultado da exportação (artifacts) */
  exportResult?: ExportResult;

  /** Resultado da entrega */
  deliveryResult?: DeliveryResult;
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
