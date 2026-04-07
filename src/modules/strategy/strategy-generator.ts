/**
 * Strategy Generator — Automated Strategy Layer
 *
 * Transforma insights, analytics, learning e contexto do tenant
 * em uma estratégia de conteúdo coerente e acionável.
 *
 * Inputs:
 *   - TenantContext (plano, features, limites)
 *   - CustomerInsight[] (do insight generator)
 *   - JobAnalytics (throughput, success rate)
 *   - PublicationAnalytics (canais, taxas)
 *   - UsageSummary (quotas restantes)
 *   - LearningRecommendation[] (regras aprendidas)
 *
 * Output:
 *   - StrategyProfile (objetivo, mix, recomendações, rationale)
 *
 * Parte 84: Automated Strategy Layer
 */

import { v4 as uuid } from 'uuid';

import type {
  StrategyProfile,
  StrategyMix,
  StrategyRecommendation,
  StrategyRationale,
  StrategyConstraint,
  TenantStrategySnapshot,
} from '../../domain/entities/strategy.js';
import {
  StrategyObjective,
  StrategyPriority,
  StrategyIntensity,
  OBJECTIVE_LABELS,
  INTENSITY_LABELS,
} from '../../domain/entities/strategy.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { generateInsights } from '../insights/insight-generator.js';
import { defaultTimeFilter, getJobAnalytics, getPublicationAnalytics } from '../analytics/analytics-service.js';
import { getUsageSummary } from '../billing/limit-checker.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Generate Strategy
// ---------------------------------------------------------------------------

/**
 * Gera estratégia completa para o tenant.
 */
export async function generateStrategy(
  tenantCtx: TenantContext,
  supabase: SupabaseClient | null,
): Promise<TenantStrategySnapshot> {
  const tid = tenantCtx.tenantId;
  const filter = defaultTimeFilter(tid);

  // Collect data in parallel
  const [insights, jobs, pubs, usage] = await Promise.all([
    generateInsights(tenantCtx, supabase),
    getJobAnalytics(filter, supabase),
    getPublicationAnalytics(filter, supabase),
    getUsageSummary(tenantCtx, supabase),
  ]);

  // Detect constraints
  const constraints = detectConstraints(tenantCtx, usage, jobs);

  // Determine objectives
  const { primary, secondary } = determineObjectives(tenantCtx, jobs, pubs, insights);

  // Determine intensity
  const intensity = determineIntensity(tenantCtx, usage, constraints);

  // Build content mix
  const mix = buildContentMix(tenantCtx, pubs, primary, intensity);

  // Generate tactical recommendations
  const recommendations = generateRecommendations(primary, secondary, mix, tenantCtx, jobs, pubs);

  // Build rationale
  const rationale = buildRationale(primary, mix, intensity, jobs, pubs, tenantCtx);

  const strategy: StrategyProfile = {
    primaryObjective: primary,
    secondaryObjective: secondary,
    intensity,
    mix,
    recommendations,
    rationale,
    constraints,
  };

  // Executive summary
  const executiveSummary = buildExecutiveSummary(primary, secondary, intensity, mix, constraints);

  // Immediate actions (top 3 recommendations)
  const immediateActions = recommendations.slice(0, 3).map((r) => r.title);

  const now = new Date();

  logger.info(
    `[StrategyGenerator] Generated strategy for tenant=${tid}: ` +
    `objective=${primary} intensity=${intensity} ` +
    `recommendations=${recommendations.length} constraints=${constraints.length}`,
  );

  return {
    tenantId: tid,
    planTier: tenantCtx.planTier,
    strategy,
    executiveSummary,
    immediateActions,
    generatedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + 7 * 86400000).toISOString(), // 7 days
  };
}

// ---------------------------------------------------------------------------
// Determine Objectives
// ---------------------------------------------------------------------------

function determineObjectives(
  tenantCtx: TenantContext,
  jobs: { totalJobs: number; successRate: number },
  pubs: { totalAttempted: number; successRate: number },
  insights: Array<{ type: string; severity: string }>,
): { primary: StrategyObjective; secondary: StrategyObjective | null } {
  // New tenant (few jobs) → awareness
  if (jobs.totalJobs < 5) {
    return { primary: StrategyObjective.AWARENESS, secondary: StrategyObjective.ENGAGEMENT };
  }

  // Has publications with good success → conversion
  if (pubs.totalAttempted > 10 && pubs.successRate > 70) {
    return { primary: StrategyObjective.CONVERSION, secondary: StrategyObjective.SOCIAL_PROOF };
  }

  // Has publications but low success → engagement (fix first)
  if (pubs.totalAttempted > 5 && pubs.successRate < 50) {
    return { primary: StrategyObjective.ENGAGEMENT, secondary: StrategyObjective.AWARENESS };
  }

  // Good job volume, moderate publishing → nurture
  if (jobs.totalJobs > 20 && pubs.totalAttempted < 10) {
    return { primary: StrategyObjective.NURTURE, secondary: StrategyObjective.CONVERSION };
  }

  // High rejection insights → social proof needed
  const hasRejectionIssue = insights.some((i) =>
    i.type === 'high_rejection_rate' && (i.severity === 'risk' || i.severity === 'urgent'),
  );
  if (hasRejectionIssue) {
    return { primary: StrategyObjective.SOCIAL_PROOF, secondary: StrategyObjective.ENGAGEMENT };
  }

  // Default: awareness → engagement
  return { primary: StrategyObjective.AWARENESS, secondary: StrategyObjective.ENGAGEMENT };
}

// ---------------------------------------------------------------------------
// Determine Intensity
// ---------------------------------------------------------------------------

function determineIntensity(
  tenantCtx: TenantContext,
  usage: { features: Array<{ label: string; usedPercent: number; limit: number }> },
  constraints: StrategyConstraint[],
): StrategyIntensity {
  // Plan-based baseline
  const planIntensity: Record<string, StrategyIntensity> = {
    basic: StrategyIntensity.LOW,
    pro: StrategyIntensity.MEDIUM,
    business: StrategyIntensity.HIGH,
  };

  let intensity = planIntensity[tenantCtx.planTier] ?? StrategyIntensity.LOW;

  // Reduce if near limits
  const jobsUsage = usage.features.find((f) => f.label === 'Jobs criados');
  if (jobsUsage && jobsUsage.usedPercent > 70) {
    if (intensity === StrategyIntensity.HIGH) intensity = StrategyIntensity.MEDIUM;
    else if (intensity === StrategyIntensity.MEDIUM) intensity = StrategyIntensity.LOW;
  }

  // Reduce if cost constraint
  if (constraints.some((c) => c.type === 'cost_limit')) {
    if (intensity === StrategyIntensity.HIGH) intensity = StrategyIntensity.MEDIUM;
  }

  return intensity;
}

// ---------------------------------------------------------------------------
// Build Content Mix
// ---------------------------------------------------------------------------

function buildContentMix(
  tenantCtx: TenantContext,
  pubs: { byPlatform: Array<{ platform: string; rate: number; total: number }> },
  objective: StrategyObjective,
  intensity: StrategyIntensity,
): StrategyMix {
  // Format distribution based on objective
  const formatDist = getFormatDistribution(objective, tenantCtx);

  // Channel priority based on available channels + performance
  const channels = getChannelPriority(tenantCtx, pubs);

  // Template suggestions
  const templateSuggestions = getTemplateSuggestions(objective);

  // Preset based on objective mood
  const presetMap: Record<StrategyObjective, string> = {
    [StrategyObjective.AWARENESS]: 'fast-sales',
    [StrategyObjective.ENGAGEMENT]: 'corporate',
    [StrategyObjective.CONVERSION]: 'fast-sales',
    [StrategyObjective.NURTURE]: 'luxury',
    [StrategyObjective.SOCIAL_PROOF]: 'corporate',
    [StrategyObjective.LAUNCH]: 'fast-sales',
  };

  return {
    formatDistribution: formatDist,
    channelPriority: channels,
    suggestedTemplates: templateSuggestions,
    recommendedPreset: presetMap[objective],
  };
}

function getFormatDistribution(
  objective: StrategyObjective,
  tenantCtx: TenantContext,
): StrategyMix['formatDistribution'] {
  const hasAutoPublish = tenantCtx.features.autoPublish;

  switch (objective) {
    case StrategyObjective.AWARENESS:
      return [
        { format: 'reel', percentage: 50, reason: 'Reels têm maior alcance orgânico' },
        { format: 'story', percentage: 30, reason: 'Stories mantêm visibilidade no topo' },
        { format: 'post', percentage: 20, reason: 'Posts consolidam o feed' },
      ];
    case StrategyObjective.ENGAGEMENT:
      return [
        { format: 'carousel', percentage: 40, reason: 'Carrosséis geram mais comentários e salvamentos' },
        { format: 'reel', percentage: 35, reason: 'Reels geram compartilhamentos' },
        { format: 'story', percentage: 25, reason: 'Stories com enquete/CTA geram interação' },
      ];
    case StrategyObjective.CONVERSION:
      return [
        { format: 'reel', percentage: 40, reason: 'Reels com CTA direto convertem mais' },
        { format: 'carousel', percentage: 30, reason: 'Carrosséis educam e convencem' },
        { format: 'video_long', percentage: 15, reason: 'Vídeos longos para leads qualificados' },
        { format: 'post', percentage: 15, reason: 'Posts com CTA e link' },
      ];
    case StrategyObjective.NURTURE:
      return [
        { format: 'carousel', percentage: 35, reason: 'Conteúdo educativo em carrossel' },
        { format: 'video_long', percentage: 25, reason: 'Vídeos de tour e lifestyle' },
        { format: 'reel', percentage: 25, reason: 'Reels de bastidores e lifestyle' },
        { format: 'blog', percentage: 15, reason: 'Blog posts para SEO e autoridade' },
      ];
    case StrategyObjective.SOCIAL_PROOF:
      return [
        { format: 'reel', percentage: 45, reason: 'Reels de depoimentos e resultados' },
        { format: 'carousel', percentage: 35, reason: 'Antes/depois e números' },
        { format: 'post', percentage: 20, reason: 'Posts de conquistas' },
      ];
    case StrategyObjective.LAUNCH:
      return [
        { format: 'reel', percentage: 40, reason: 'Teaser e countdown em Reels' },
        { format: 'story', percentage: 35, reason: 'Stories com urgência e countdown' },
        { format: 'carousel', percentage: 25, reason: 'Detalhes do lançamento em carrossel' },
      ];
    default:
      return [
        { format: 'reel', percentage: 50, reason: 'Formato com maior alcance' },
        { format: 'carousel', percentage: 30, reason: 'Formato versátil' },
        { format: 'post', percentage: 20, reason: 'Complementa o feed' },
      ];
  }
}

function getChannelPriority(
  tenantCtx: TenantContext,
  pubs: { byPlatform: Array<{ platform: string; rate: number; total: number }> },
): StrategyMix['channelPriority'] {
  const channels: StrategyMix['channelPriority'] = [];

  // Instagram always primary for real estate
  channels.push({
    channel: 'instagram',
    priority: StrategyPriority.PRIMARY,
    reason: 'Instagram é o canal principal para imobiliário visual',
  });

  // WhatsApp as secondary (direct contact)
  channels.push({
    channel: 'whatsapp',
    priority: StrategyPriority.SECONDARY,
    reason: 'WhatsApp para contato direto e envio personalizado',
  });

  // Facebook if auto publish available
  if (tenantCtx.features.autoPublish) {
    channels.push({
      channel: 'facebook',
      priority: StrategyPriority.TERTIARY,
      reason: 'Facebook amplia alcance com publicação automática',
    });
  }

  // Boost channel with best performance
  if (pubs.byPlatform.length > 0) {
    const best = pubs.byPlatform.sort((a, b) => b.rate - a.rate)[0];
    if (best && best.total >= 5) {
      const existing = channels.find((c) => c.channel === best.platform);
      if (existing && existing.priority !== StrategyPriority.PRIMARY) {
        existing.priority = StrategyPriority.PRIMARY;
        existing.reason = `Melhor performance: ${best.rate}% de sucesso em ${best.total} publicações`;
      }
    }
  }

  return channels;
}

function getTemplateSuggestions(
  objective: StrategyObjective,
): StrategyMix['suggestedTemplates'] {
  const suggestions: Record<StrategyObjective, StrategyMix['suggestedTemplates']> = {
    [StrategyObjective.AWARENESS]: [
      { format: 'reel', templateId: 'hero-showcase-cta', styleId: 'bold-red' },
      { format: 'story', templateId: 'story-highlights', styleId: 'clean-white' },
    ],
    [StrategyObjective.ENGAGEMENT]: [
      { format: 'carousel', templateId: 'walkthrough-5', styleId: 'clean-white' },
      { format: 'reel', templateId: 'hero-showcase-cta', styleId: 'dark-gold' },
    ],
    [StrategyObjective.CONVERSION]: [
      { format: 'reel', templateId: 'hero-showcase-cta', styleId: 'bold-red' },
      { format: 'carousel', templateId: 'investment-pitch', styleId: 'clean-white' },
    ],
    [StrategyObjective.NURTURE]: [
      { format: 'video_long', templateId: 'walkthrough-5', styleId: 'dark-gold' },
      { format: 'carousel', templateId: 'investment-pitch', styleId: 'warm-earth' },
    ],
    [StrategyObjective.SOCIAL_PROOF]: [
      { format: 'reel', templateId: 'before-after', styleId: 'clean-white' },
      { format: 'carousel', templateId: 'walkthrough-5', styleId: 'ocean-teal' },
    ],
    [StrategyObjective.LAUNCH]: [
      { format: 'reel', templateId: 'hero-showcase-cta', styleId: 'bold-red' },
      { format: 'story', templateId: 'story-highlights', styleId: 'dark-gold' },
    ],
  };

  return suggestions[objective] ?? suggestions[StrategyObjective.AWARENESS];
}

// ---------------------------------------------------------------------------
// Generate Recommendations
// ---------------------------------------------------------------------------

function generateRecommendations(
  primary: StrategyObjective,
  secondary: StrategyObjective | null,
  mix: StrategyMix,
  tenantCtx: TenantContext,
  jobs: { totalJobs: number; successRate: number },
  pubs: { totalAttempted: number; successRate: number },
): StrategyRecommendation[] {
  const recs: StrategyRecommendation[] = [];
  const topFormat = mix.formatDistribution[0];
  const topChannel = mix.channelPriority[0];

  // Primary objective recommendation
  if (topFormat && topChannel) {
    recs.push({
      id: uuid(),
      objective: primary,
      priority: StrategyPriority.PRIMARY,
      title: `Priorize ${topFormat.format} no ${topChannel.channel}`,
      description: `${topFormat.reason}. Publique com frequência consistente para ${OBJECTIVE_LABELS[primary].toLowerCase()}.`,
      suggestedFormat: topFormat.format,
      suggestedChannel: topChannel.channel,
      weeklyFrequency: mix.formatDistribution.length >= 3 ? 3 : 2,
      estimatedImpact: 'Alto — canal e formato com melhor performance combinada',
    });
  }

  // Auto publish suggestion
  if (!tenantCtx.features.autoPublish && pubs.totalAttempted === 0) {
    recs.push({
      id: uuid(),
      objective: StrategyObjective.AWARENESS,
      priority: StrategyPriority.SECONDARY,
      title: 'Ative publicação automática',
      description: 'Com auto publish, seus conteúdos são publicados automaticamente após aprovação, sem intervenção manual.',
      suggestedFormat: 'reel',
      suggestedChannel: 'instagram',
      weeklyFrequency: 0,
      estimatedImpact: 'Médio — elimina atrito na publicação',
    });
  }

  // Secondary objective
  if (secondary && mix.formatDistribution.length > 1) {
    const secondFormat = mix.formatDistribution[1]!;
    recs.push({
      id: uuid(),
      objective: secondary,
      priority: StrategyPriority.SECONDARY,
      title: `Complemente com ${secondFormat.format}`,
      description: `${secondFormat.reason}. Use como complemento ao formato principal.`,
      suggestedFormat: secondFormat.format,
      suggestedChannel: topChannel?.channel ?? 'instagram',
      weeklyFrequency: 1,
      estimatedImpact: 'Médio — diversifica e complementa',
    });
  }

  // Quality recommendation if low success rate
  if (jobs.successRate < 70 && jobs.totalJobs > 5) {
    recs.push({
      id: uuid(),
      objective: primary,
      priority: StrategyPriority.SECONDARY,
      title: 'Melhore a qualidade dos inputs',
      description: `Sua taxa de sucesso é ${jobs.successRate}%. Revise a qualidade dos PDFs e materiais enviados para melhorar resultados.`,
      suggestedFormat: 'reel',
      suggestedChannel: 'instagram',
      weeklyFrequency: 0,
      estimatedImpact: 'Alto — melhora todos os outputs',
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Detect Constraints
// ---------------------------------------------------------------------------

function detectConstraints(
  tenantCtx: TenantContext,
  usage: { features: Array<{ label: string; usedPercent: number; status: string; limit: number }> },
  jobs: { totalJobs: number },
): StrategyConstraint[] {
  const constraints: StrategyConstraint[] = [];

  // Plan limits near
  for (const feat of usage.features) {
    if (feat.status === 'blocked') {
      constraints.push({
        type: 'plan_limit',
        description: `${feat.label}: limite atingido`,
        impact: 'Não pode criar mais deste tipo até o próximo ciclo',
        mitigation: 'Faça upgrade do plano',
      });
    }
  }

  // Feature disabled
  if (!tenantCtx.features.autoPublish) {
    constraints.push({
      type: 'feature_disabled',
      description: 'Publicação automática não disponível no plano atual',
      impact: 'Publicação requer ação manual',
      mitigation: 'Upgrade para plano Pro',
    });
  }

  if (!tenantCtx.features.autoVariants) {
    constraints.push({
      type: 'feature_disabled',
      description: 'Variantes automáticas não disponíveis',
      impact: 'Apenas formatos básicos gerados',
      mitigation: 'Upgrade para plano Pro',
    });
  }

  // No history
  if (jobs.totalJobs < 3) {
    constraints.push({
      type: 'no_history',
      description: 'Histórico insuficiente para recomendações precisas',
      impact: 'Estratégia baseada em defaults do segmento',
    });
  }

  return constraints;
}

// ---------------------------------------------------------------------------
// Build Rationale
// ---------------------------------------------------------------------------

function buildRationale(
  primary: StrategyObjective,
  mix: StrategyMix,
  intensity: StrategyIntensity,
  jobs: { totalJobs: number; successRate: number },
  pubs: { totalAttempted: number; successRate: number },
  tenantCtx: TenantContext,
): StrategyRationale {
  const topFormat = mix.formatDistribution[0];
  const topChannel = mix.channelPriority[0];

  return {
    objectiveReason: jobs.totalJobs < 5
      ? 'Tenant com poucos jobs — foco em visibilidade inicial'
      : `Baseado em ${jobs.totalJobs} jobs com ${jobs.successRate}% de sucesso`,
    channelReason: topChannel
      ? topChannel.reason
      : 'Instagram é o canal padrão para imobiliário',
    formatReason: topFormat
      ? topFormat.reason
      : 'Reels são o formato com maior alcance orgânico',
    intensityReason: `Plano ${tenantCtx.planTier} com ${INTENSITY_LABELS[intensity]}`,
    supportingData: [
      { metric: 'Jobs processados', value: String(jobs.totalJobs) },
      { metric: 'Taxa de sucesso', value: `${jobs.successRate}%` },
      { metric: 'Publicações', value: String(pubs.totalAttempted) },
      { metric: 'Sucesso publicação', value: `${pubs.successRate}%` },
      { metric: 'Plano', value: tenantCtx.planTier },
    ],
  };
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

function buildExecutiveSummary(
  primary: StrategyObjective,
  secondary: StrategyObjective | null,
  intensity: StrategyIntensity,
  mix: StrategyMix,
  constraints: StrategyConstraint[],
): string {
  const topFormat = mix.formatDistribution[0]?.format ?? 'reel';
  const topChannel = mix.channelPriority[0]?.channel ?? 'instagram';

  let summary = `Foco em ${OBJECTIVE_LABELS[primary].toLowerCase()} com ${topFormat} no ${topChannel}, ${INTENSITY_LABELS[intensity]}.`;

  if (secondary) {
    summary += ` Complementar com ${OBJECTIVE_LABELS[secondary].toLowerCase()}.`;
  }

  if (constraints.length > 0) {
    summary += ` ${constraints.length} restrição(ões) ativa(s).`;
  }

  return summary;
}
