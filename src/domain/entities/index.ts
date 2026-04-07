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
export type { DeliveryResult, DeliveryManifestEntry, PublishSummary } from './delivery.js';
export { DeliveryStatus, DeliveryChannel } from './delivery.js';
export type { MusicTrack, MusicProfile, AudioMixConfig } from './music.js';
export { MusicMood, MusicTempo, MusicIntensity, DEFAULT_MIX_CONFIG } from './music.js';
export type { VideoPreset, MotionProfile, TransitionProfile } from './video-preset.js';
export { MotionIntensity, TextStyle } from './video-preset.js';
export type { SubtitleTrack, SubtitleCue, CaptionStyle } from './subtitle.js';
export {
  CaptionPosition,
  CaptionBackground,
  SubtitleFormat,
  DEFAULT_CAPTION_STYLE,
  REEL_CAPTION_STYLE,
  MINIMAL_CAPTION_STYLE,
} from './subtitle.js';
export type {
  OutputVariant,
  VariantSpec,
  ChannelProfile,
  VariantGenerationResult,
} from './variant.js';
export { VariantStatus, DistributionChannel, TextDensity } from './variant.js';
export type { Thumbnail, ThumbnailSpec, CoverStyle } from './thumbnail.js';
export {
  CoverLayout,
  ThumbnailFormat,
  ThumbnailStatus,
  DEFAULT_COVER_STYLE,
  THUMBNAIL_SIZES,
} from './thumbnail.js';
export type {
  Publication,
  PublishPayload,
  PublishResult,
  ISocialAdapter,
} from './publication.js';
export {
  SocialPlatform,
  PublishStatus,
  PublishContentType,
  MAX_PUBLISH_ATTEMPTS,
  RETRY_DELAY_MS,
} from './publication.js';
export type {
  ReviewItem,
  ReviewComment,
  CreateReviewPayload,
  ReviewFilter,
  ReviewSummary,
} from './review.js';
export {
  ReviewDecision,
  ReviewChannel,
  ReviewTargetType,
  ReviewStatus,
} from './review.js';
export type {
  RevisionRequest,
  RevisionResult,
  RevisionTarget,
  CreateRevisionPayload,
} from './revision.js';
export {
  RevisionTargetType,
  RevisionStatus,
  RevisionStrategy,
  TARGET_STRATEGY_MAP,
} from './revision.js';
export type {
  ContentScore,
  DimensionScore,
  CriterionResult,
  ScoreBreakdown,
} from './content-score.js';
export {
  QualityDimension,
  QualityLevel,
  QualityDecision,
  QUALITY_THRESHOLD_LOW,
  QUALITY_THRESHOLD_HIGH,
  DEFAULT_DIMENSION_WEIGHTS,
  scoreToLevel,
  scoreToDecision,
} from './content-score.js';
export type {
  JobCost,
  CostBreakdown,
  CostLineItem,
  UsageMetrics,
  PlanCostLimits,
} from './job-cost.js';
export {
  CostCategory,
  CostAlert,
  PLAN_LIMITS,
  AI_TOKEN_RATES,
  OPERATION_RATES,
  estimateAiCost,
  determineCostAlert,
} from './job-cost.js';
export type {
  Experiment,
  ExperimentVariant,
  ExperimentResult,
  VariantPerformance,
  ExperimentConfig,
  ExperimentWeights,
  CreateExperimentPayload,
  TrackEventPayload,
  ExperimentGroup,
} from './experiment.js';
export {
  ExperimentStatus,
  WinnerSelectionMethod,
  EMPTY_PERFORMANCE,
  DEFAULT_EXPERIMENT_CONFIG,
} from './experiment.js';
export type {
  LearningSignal,
  FeedbackAggregate,
  OptimizationRule,
  RuleCondition,
  RuleAdjustment,
  LearningProfile,
  LearningRecommendation,
} from './learning.js';
export {
  SignalSource,
  SignalType,
  OptimizationCategory,
  RuleStatus,
  AdjustmentDirection,
  MIN_SIGNALS_FOR_AGGREGATE,
  MIN_CONFIDENCE_FOR_RULE,
  RULE_EXPIRY_DAYS,
  POSITIVE_SIGNAL_THRESHOLD,
  NEGATIVE_SIGNAL_THRESHOLD,
} from './learning.js';
export type {
  Tenant,
  TenantPlan,
  TenantFeatureFlags,
  TenantLimits,
  TenantContext,
  TenantMember,
} from './tenant.js';
export {
  TenantStatus,
  TenantRole,
  LearningScope,
  PLAN_FEATURES,
  PLAN_TENANT_LIMITS,
} from './tenant.js';
export type {
  UsageRecord,
  UsageCounter,
  BillingEvent,
  FeatureUsage,
  UsageSummary,
  BillingPlanLimits,
} from './billing.js';
export {
  UsageEventType,
  UsagePeriod,
  BillingEventType,
  LimitCheckResult,
  BILLING_PLAN_LIMITS,
  EVENT_TO_LIMIT_FIELD,
  EVENT_LABELS,
} from './billing.js';
export type {
  Subscription,
  PaymentWebhookEvent,
  InvoiceEvent,
  PlanChangeRequest,
} from './subscription.js';
export {
  SubscriptionStatus,
  BillingProvider,
  WebhookEventType,
  WebhookProcessingStatus,
  VALID_SUBSCRIPTION_TRANSITIONS,
  DEFAULT_TRIAL_DAYS,
  PAST_DUE_GRACE_DAYS,
} from './subscription.js';
export type {
  AdminTenantView,
  AdminJobView,
  AdminBillingView,
  AdminPublicationView,
  AdminSystemHealthSnapshot,
  AdminActionResult,
  AdminAuditEntry,
  AdminListParams,
} from './admin.js';
export { AdminActionType } from './admin.js';
export type {
  CustomerDashboardOverview,
  CustomerJobListItem,
  CustomerJobDetail,
  CustomerArtifactView,
  CustomerReviewView,
  CustomerPublicationView,
  CustomerUsageView,
  CustomerBillingView,
  CustomerInsightsView,
  CustomerAlert,
  LockedFeature,
  CustomerFeatureUsage,
  UpgradeOption,
} from './customer-dashboard.js';
export {
  CustomerJobStatus,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_BADGE,
} from './customer-dashboard.js';
export type {
  SystemMetric,
  ProviderHealth,
  AlertRule,
  AlertEvent,
  TenantOperationalHealth,
  ObservabilitySnapshot,
} from './observability.js';
export {
  MetricType,
  MetricCategory,
  AlertSeverity,
  AlertStatus,
  DEFAULT_ALERT_RULES,
} from './observability.js';
export type {
  AnalyticsTimeSeriesPoint,
  AnalyticsTimeSeries,
  AnalyticsTimeFilter,
  AnalyticsGranularity,
  JobAnalyticsSummary,
  ContentAnalyticsSummary,
  PublicationAnalyticsSummary,
  TenantAnalyticsSummary,
  BillingAnalyticsSummary,
  LearningAnalyticsSummary,
  AnalyticsDashboardSnapshot,
} from './analytics.js';
export type {
  ExternalIntegration,
  IntegrationConfig,
  IntegrationHealth,
  IntegrationEvent,
  IntegrationActionResult,
  IntegrationDefinition,
} from './integration.js';
export {
  IntegrationType,
  IntegrationStatus,
  IntegrationId,
  IntegrationEventType,
  INTEGRATION_CATALOG,
} from './integration.js';
export type {
  CustomerInsight,
  InsightEvidence,
  Recommendation,
  RecommendationAction,
  TenantInsightSnapshot,
} from './insight.js';
export {
  InsightCategory,
  InsightSeverity,
  InsightType,
  SEVERITY_BADGES,
  SEVERITY_PRIORITY,
  INSIGHT_TTL_HOURS,
} from './insight.js';
export type {
  TemplateCatalogItem,
  StyleProfile,
  TemplateCollection,
  TemplateAvailability,
  TenantStylePreference,
  CatalogEntry,
  ResolvedVisualConfig,
} from './template-marketplace.js';
export {
  VisualLayerType,
  CatalogItemStatus,
  CatalogTier,
  OutputCategory,
} from './template-marketplace.js';
export type {
  StrategyProfile,
  StrategyMix,
  StrategyRecommendation,
  StrategyRationale,
  StrategyConstraint,
  TenantStrategySnapshot,
} from './strategy.js';
export {
  StrategyObjective,
  StrategyPriority,
  StrategyIntensity,
  OBJECTIVE_LABELS,
  INTENSITY_LABELS,
} from './strategy.js';
export type {
  ContentCampaign,
  CampaignBlueprint,
  CampaignItem,
  CampaignScheduleHint,
  CampaignOutputLink,
} from './campaign.js';
export {
  CampaignStatus,
  CampaignItemRole,
  CampaignItemStatus,
  CampaignObjective,
  CAMPAIGN_STATUS_LABELS,
  ITEM_ROLE_LABELS,
} from './campaign.js';
export type {
  CampaignSchedule,
  ScheduleItem,
  ScheduleWindow,
  ScheduleDependency,
  ScheduleCadence,
  ScheduleAdjustment,
  CalendarEventHint,
  CalendarOverview,
} from './schedule.js';
export {
  ScheduleItemStatus,
  CampaignScheduleStatus,
  AdjustmentReason,
  DEFAULT_CADENCE,
  SCHEDULE_ITEM_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  ADJUSTMENT_REASON_LABELS,
} from './schedule.js';
export type {
  CampaignExecution,
  CampaignExecutionItem,
  CampaignExecutionLog,
  ExecutionDecision,
  ExecutionReadinessCheck,
  ExecutionBlockReason,
  AutonomousAction,
} from './campaign-execution.js';
export {
  ExecutionStatus,
  ExecutionDecisionType,
  BlockReasonType,
  AutonomousActionType,
  ActionResult,
  EXECUTION_STATUS_LABELS,
  DECISION_LABELS,
  BLOCK_REASON_LABELS,
  ACTION_TYPE_LABELS,
} from './campaign-execution.js';
export type {
  GovernancePolicy,
  GovernanceRule,
  HumanCheckpoint,
  GovernanceDecision,
  ManualOverride,
  EscalationRequest,
  GovernanceAuditEntry,
  GovernanceEvaluation,
} from './governance.js';
export {
  AutonomyLevel,
  GovernanceGateType,
  GovernanceDecisionResult,
  EscalationStatus,
  EscalationSeverity,
  DEFAULT_AUTONOMY_BY_PLAN,
  AUTONOMY_LEVEL_LABELS,
  GATE_LABELS,
  DECISION_RESULT_LABELS,
} from './governance.js';
export type {
  CampaignGoal,
  GoalMetricSnapshot,
  OptimizationSignal,
  OptimizationRecommendation,
  OptimizationCycle,
} from './campaign-optimization.js';
export {
  GoalMetricType,
  CampaignHealth,
  OptimizationActionType,
  OptimizationImpact,
  CAMPAIGN_HEALTH_LABELS,
  HEALTH_COLORS,
  OPTIMIZATION_ACTION_LABELS,
} from './campaign-optimization.js';
export type {
  OptimizationProfile,
  GoalPriorities,
  OptimizationTradeOff,
  OptimizationConstraint,
  GoalDrivenRecommendation,
  GoalEvaluationResult,
  GoalDerivedParams,
  TenantGoalPreference,
} from './goal-optimization.js';
export {
  OptimizationObjective,
  TradeOffDimension,
  OptimizationAggressiveness,
  PRESET_PROFILES,
  DEFAULT_OBJECTIVE_BY_PLAN,
  OBJECTIVE_OPT_LABELS,
  AGGRESSIVENESS_LABELS,
} from './goal-optimization.js';
export type {
  TenantMemory,
  MemorySignal,
  MemoryPattern,
  LongitudinalTenantProfile,
  EditorialProfile,
  OperationalProfile,
  PublicationProfile,
  ApprovalProfile,
  GrowthProfile,
  CostProfile,
  MemorySnapshot,
} from './tenant-memory.js';
export {
  MemoryCategory,
  MemoryStrength,
  PatternStatus,
  MemorySignalSource,
  DECAY_START_DAYS,
  CONFIRM_THRESHOLD,
  STABLE_THRESHOLD,
  MEMORY_CATEGORY_LABELS,
  STRENGTH_LABELS,
  PATTERN_STATUS_LABELS,
} from './tenant-memory.js';
export type {
  RecoveryPolicy,
  RecoveryAttempt,
  RecoveryDecision,
  ReconciliationTask,
  StuckStateSignal,
  RecoveryAuditEntry,
} from './recovery.js';
export {
  FailureClass,
  RecoveryActionType,
  RecoveryResult,
  ReconcileStatus,
  StuckSeverity,
  DEFAULT_RECOVERY_POLICIES,
  STUCK_THRESHOLD_MINUTES,
  FAILURE_CLASS_LABELS,
  RECOVERY_ACTION_LABELS,
  RECOVERY_RESULT_LABELS,
} from './recovery.js';
export type {
  KnowledgeNode,
  KnowledgeEdge,
  RelationalPattern,
  GraphSnapshot,
  GraphQueryResult,
  RelationalInsight,
} from './knowledge-graph.js';
export {
  KnowledgeNodeType,
  RelationType,
  RelationalInsightCategory,
  RelationalInsightSeverity,
  STRONG_EDGE_THRESHOLD,
  WEAK_EDGE_THRESHOLD,
  MIN_CONFIDENCE_TO_PERSIST,
  DEFAULT_QUERY_LIMIT,
  NODE_TYPE_LABELS,
  RELATION_TYPE_LABELS,
  INSIGHT_CATEGORY_LABELS,
  INSIGHT_SEVERITY_LABELS,
} from './knowledge-graph.js';
export type {
  SimulationScenario,
  ScenarioVariable,
  WhatIfChange,
  ImpactEstimate,
  ScenarioComparison,
  WhatIfRecommendation,
  SimulationResult,
} from './simulation.js';
export {
  SimulationStatus,
  SimulationAxis,
  ConfidenceLevel,
  ImpactDirection,
  ImpactDimension,
  RecommendationCategory,
  SIMULATION_AXIS_LABELS,
  CONFIDENCE_LABELS,
  IMPACT_DIRECTION_LABELS,
  IMPACT_DIMENSION_LABELS,
  RECOMMENDATION_CATEGORY_LABELS,
  MIN_DATA_POINTS_HIGH_CONFIDENCE,
  MIN_DATA_POINTS_MEDIUM_CONFIDENCE,
  DEFAULT_CAVEATS,
} from './simulation.js';
export type {
  DecisionRecord,
  DecisionContext,
  DecisionCandidate,
  DecisionOutcome,
  DecisionRationale,
  DecisionConstraint,
  DecisionConflict,
  DecisionInput,
} from './decision.js';
export {
  DecisionCategory,
  DecisionType,
  DecisionStatus,
  DecisionConfidence,
  DecisionInputSource,
  ConflictSeverity,
  DECISION_CATEGORY_LABELS,
  DECISION_TYPE_LABELS,
  DECISION_STATUS_LABELS,
  DECISION_CONFIDENCE_LABELS,
  INPUT_SOURCE_LABELS,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  MIN_CANDIDATE_SCORE,
  BLOCKING_CONFLICT_FORCES_ESCALATION,
} from './decision.js';
export type {
  Advisory,
  AdvisoryBundle,
  NextBestAction,
  AdvisoryRationale,
  ExecutiveSummary,
  OperationalSummary,
  HealthIndicator,
} from './copilot.js';
export {
  AdvisoryCategory,
  AdvisoryUrgency,
  AdvisoryAudience,
  AdvisoryStatus,
  AdvisorySource,
  ADVISORY_CATEGORY_LABELS,
  ADVISORY_URGENCY_LABELS,
  ADVISORY_AUDIENCE_LABELS,
  ADVISORY_STATUS_LABELS,
  URGENCY_WEIGHT,
  MAX_ADVISORIES_PER_BUNDLE,
  MAX_NEXT_BEST_ACTIONS,
} from './copilot.js';
export type {
  ExplanationRecord,
  ExplanationBlock,
  TrustSignal,
  ConfidenceIndicator,
  RiskIndicator,
  ActionTrace,
  TraceStep,
  AuditSurface,
  AuditNarrative,
  AuditTimelineEntry,
} from './explainability.js';
export {
  ExplanationSubject,
  ExplanationAudience,
  TrustLevel,
  RiskLevel,
  TraceStatus,
  EXPLANATION_SUBJECT_LABELS,
  TRUST_LEVEL_LABELS,
  RISK_LEVEL_LABELS,
  TRACE_STATUS_LABELS,
  TRUST_HIGH_THRESHOLD,
  TRUST_MODERATE_THRESHOLD,
  TRUST_LOW_THRESHOLD,
} from './explainability.js';
export type {
  SystemPerformanceMetric,
  MetaInsight,
  OptimizationAction,
  SystemHealthIndicator,
  ImprovementCycle,
} from './meta-optimization.js';
export {
  PerformanceDimension,
  MetaActionType,
  OptimizationActionStatus,
  CycleStatus,
  MetaInsightSeverity,
  HealthStatus,
  PERFORMANCE_DIMENSION_LABELS,
  META_ACTION_TYPE_LABELS,
  CYCLE_STATUS_LABELS,
  DEFAULT_TARGETS,
} from './meta-optimization.js';
export type {
  Partner,
  CommissionConfig,
  ApiKeyRecord,
  Referral,
  IntegrationWebhook,
} from './partner.js';
export {
  PartnerType,
  PartnerStatus,
  CommissionType,
  ReferralStatus,
  PARTNER_TYPE_LABELS,
  DEFAULT_COMMISSIONS,
  WEBHOOK_EVENTS,
} from './partner.js';
export type { WebhookEvent } from './partner.js';
export type {
  AcquisitionCampaign,
  AcquisitionMetrics,
  ContentSchedule,
  NurturingSequence,
  NurturingStep,
  ConversionEvent,
} from './acquisition.js';
export {
  AcquisitionChannel,
  CampaignGoalType,
  ContentScheduleStatus,
  NurturingStepType,
  SequenceStatus,
  ConversionType,
  CHANNEL_LABELS,
  GOAL_LABELS,
  DEFAULT_NURTURING_SEQUENCE,
  EMPTY_METRICS,
} from './acquisition.js';
export type {
  ExternalConnection,
  ConnectorConfig,
  SyncLog,
  IntegrationDefinition as HubIntegrationDefinition,
} from './integration-hub.js';
export {
  ExternalSystemType,
  ConnectionStatus,
  SyncDirection,
  SyncEventType,
  SyncLogStatus,
  INTEGRATION_CATALOG as HUB_INTEGRATION_CATALOG,
  SYSTEM_LABELS,
} from './integration-hub.js';
export type {
  DistributionChannel as DistChannel,
  AffiliatePayout,
  WhiteLabelConfig,
  WhiteLabelBranding,
  ApiInvoice,
  ApiUsageBreakdown,
  ApiPricingTier,
} from './distribution.js';
export {
  DistributionChannelType,
  MonetizationModel,
  PayoutStatus,
  WhiteLabelStatus,
  ApiUsageTier,
  API_PRICING,
  CHANNEL_TYPE_LABELS,
  MONETIZATION_LABELS,
} from './distribution.js';
