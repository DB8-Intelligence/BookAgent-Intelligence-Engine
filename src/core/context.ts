/**
 * ProcessingContext
 *
 * Objeto central que flui por todo o pipeline.
 * Cada módulo recebe o context, enriquece-o com seus resultados e devolve.
 *
 * O context é a "memória de trabalho" do pipeline — acumula
 * todos os dados extraídos e gerados ao longo dos estágios.
 */

import type { Asset } from '../domain/entities/asset.js';
import type { BrandingProfile } from '../domain/entities/branding.js';
import type { CorrelationBlock } from '../domain/entities/correlation.js';
import type { NarrativePlan } from '../domain/entities/narrative.js';
import type { GeneratedOutput } from '../domain/entities/output.js';
import type { OutputDecision } from '../domain/entities/output-decision.js';
import type { MediaPlan } from '../domain/entities/media-plan.js';
import type { BlogPlan } from '../domain/entities/blog-plan.js';
import type { LandingPagePlan } from '../domain/entities/landing-page-plan.js';
import type { PersonalizationResult } from '../domain/entities/personalization.js';
import type { ExportResult } from '../domain/entities/export-artifact.js';
import type { AudioGenerationResult } from '../domain/entities/audio-plan.js';
import type { BookCompatibilityProfile } from '../domain/entities/book-compatibility.js';
import type { BookPrototype } from '../domain/entities/book-prototype.js';
import type { DeliveryResult } from '../domain/entities/delivery.js';
import type { Source } from '../domain/entities/source.js';
import type { JobInput } from '../domain/entities/job.js';
import type { ModuleExecutionLog } from '../domain/entities/module-log.js';
import type { OutputFormat } from '../domain/value-objects/index.js';

export interface ProcessingContext {
  /** ID do job sendo processado */
  readonly jobId: string;

  /** Input original da requisição */
  readonly input: JobInput;

  // --- Populado pelo Ingestion ---
  extractedText?: string;
  pageTexts?: Array<{ pageNumber: number; text: string }>;
  localFilePath?: string;

  // --- Populado pelo Book Compatibility Analysis ---
  bookCompatibility?: BookCompatibilityProfile;

  // --- Populado pelo Book Reverse Engineering ---
  bookPrototype?: BookPrototype;

  // --- Populado pelo Asset Extraction ---
  assets?: Asset[];

  // --- Populado pelo Correlation ---
  correlations?: CorrelationBlock[];

  // --- Populado pelo Branding ---
  branding?: BrandingProfile;

  // --- Populado pelo Source Intelligence ---
  sources?: Source[];

  // --- Populado pelo Narrative ---
  narratives?: NarrativePlan[];

  // --- Populado pelo Output Selection ---
  selectedOutputs?: OutputDecision[];

  // --- Populado pelo Media Generation ---
  mediaPlans?: MediaPlan[];
  outputs?: GeneratedOutput[];

  // --- Populado pelo Blog ---
  blogPlans?: BlogPlan[];

  // --- Populado pelo Landing Page ---
  landingPagePlans?: LandingPagePlan[];

  // --- Populado pelo Personalization ---
  personalization?: PersonalizationResult;

  // --- Populado pelo Audio ---
  audioResult?: AudioGenerationResult;

  // --- Populado pelo Render/Export ---
  exportResult?: ExportResult;

  // --- Populado pelo Delivery ---
  deliveryResult?: DeliveryResult;

  // --- Gerenciado pelo Pipeline ---
  /** Log de execução de cada módulo (preenchido automaticamente pelo Pipeline) */
  executionLogs?: ModuleExecutionLog[];
}

/**
 * Cria um ProcessingContext inicial a partir de um JobInput.
 */
export function createContext(jobId: string, input: JobInput): ProcessingContext {
  return {
    jobId,
    input,
    executionLogs: [],
  };
}
