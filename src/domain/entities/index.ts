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
export type { CorrelationBlock, TextBlock } from './correlation.js';
export { CorrelationConfidence, CorrelationMethod, TextBlockType } from './correlation.js';
export type { NarrativePlan, NarrativeBeat } from './narrative.js';
export { NarrativeType, ToneOfVoice, BeatRole } from './narrative.js';
export type { OutputDecision, FeasibilityGap } from './output-decision.js';
export { ApprovalStatus, OutputComplexity } from './output-decision.js';
export type { MediaPlan, MediaScene, TextOverlay, BrandingInstruction } from './media-plan.js';
export { RenderStatus, LayoutHint, TransitionType } from './media-plan.js';
export type { BlogPlan, BlogSection } from './blog-plan.js';
export { EditorialRole } from './blog-plan.js';
export type { LandingPagePlan, LandingPageSection } from './landing-page-plan.js';
export { LPSectionType, ConversionRole, LeadCaptureIntent } from './landing-page-plan.js';
export type {
  PersonalizationResult,
  PersonalizationProfile,
  CTAProfile,
  ContactBlock,
  ContactChannel,
  UserBrandingOverlay,
} from './personalization.js';
export { LogoPlacement } from './personalization.js';
export type { ExportArtifact, ExportResult } from './export-artifact.js';
export { ExportFormat, ArtifactType, ArtifactStatus } from './export-artifact.js';
export type { DeliveryResult, DeliveryManifestEntry } from './delivery.js';
export { DeliveryStatus, DeliveryChannel } from './delivery.js';
