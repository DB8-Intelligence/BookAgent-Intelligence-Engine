/**
 * Domain Entities — Re-exports
 */

export type { Asset } from './asset.js';
export type { BrandingProfile } from './branding.js';
export { EMPTY_BRANDING } from './branding.js';
export type { BrandingContext, Source } from './source.js';
export type { GeneratedOutput } from './output.js';
export type { OutputSpec } from './output-spec.js';
export { OUTPUT_SPECS } from './output-spec.js';
export type { UserContext } from './user-context.js';
export type { Job, JobInput, JobResult } from './job.js';
export type { ModuleExecutionLog, ModuleMetrics } from './module-log.js';
export { createEmptyMetrics } from './module-log.js';
