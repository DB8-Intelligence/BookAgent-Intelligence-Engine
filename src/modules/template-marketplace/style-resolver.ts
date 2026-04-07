/**
 * Style Resolver — Template Marketplace
 *
 * Resolve a combinação template + preset + style para o pipeline.
 * Considera tenant preferences, plano, output category e compatibilidade.
 *
 * Fluxo:
 *   1. Recebe output category + tenant context
 *   2. Filtra templates disponíveis (status + tier + category)
 *   3. Aplica tenant preferences (se houver)
 *   4. Resolve preset compatível
 *   5. Resolve style compatível
 *   6. Retorna ResolvedVisualConfig para o pipeline
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

import type {
  TemplateCatalogItem,
  StyleProfile,
  TemplateAvailability,
  TenantStylePreference,
  ResolvedVisualConfig,
} from '../../domain/entities/template-marketplace.js';
import {
  VisualLayerType,
  CatalogItemStatus,
  CatalogTier,
  OutputCategory,
} from '../../domain/entities/template-marketplace.js';
import type { TenantContext } from '../../domain/entities/tenant.js';
import type { PlanTier } from '../../plans/plan-config.js';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { TEMPLATES, STYLES, COLLECTIONS } from './catalog.js';
import { PRESET_REGISTRY } from '../presets/preset-catalog.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Preferences Table
// ---------------------------------------------------------------------------

const PREFERENCES_TABLE = 'bookagent_template_preferences';

// ---------------------------------------------------------------------------
// Resolve Visual Config
// ---------------------------------------------------------------------------

/**
 * Resolve a configuração visual completa para o pipeline.
 */
export async function resolveVisualConfig(
  outputCategory: OutputCategory,
  tenantCtx: TenantContext | null,
  supabase: SupabaseClient | null,
  hints?: { tone?: string; presetId?: string; styleId?: string; templateId?: string },
): Promise<ResolvedVisualConfig> {
  const planTier = tenantCtx?.planTier ?? 'basic';

  // Load tenant preferences
  const prefs = tenantCtx
    ? await loadPreferences(tenantCtx.tenantId, supabase)
    : null;

  // Resolve template
  const templateId = hints?.templateId
    ?? prefs?.preferredTemplates[outputCategory]
    ?? selectBestTemplate(outputCategory, planTier);

  const template = TEMPLATES.find((t) => t.id === templateId)
    ?? TEMPLATES.find((t) => t.outputCategories.includes(outputCategory) && t.status === CatalogItemStatus.ACTIVE)
    ?? TEMPLATES[0]!;

  // Resolve preset
  const presetId = hints?.presetId
    ?? prefs?.preferredPreset
    ?? selectBestPreset(template, hints?.tone);

  // Resolve style
  const styleId = hints?.styleId
    ?? prefs?.preferredStyle
    ?? selectBestStyle(template, outputCategory, planTier);

  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0]!;

  logger.debug(
    `[StyleResolver] Resolved: template=${template.id} preset=${presetId} style=${style.id} ` +
    `for category=${outputCategory}`,
  );

  return {
    templateId: template.id,
    presetId,
    styleId: style.id,
    sceneCount: template.sceneCount,
    colors: style.colors,
    overlayStyle: style.overlayStyle,
    overlayOpacity: style.overlayOpacity,
    textStyle: style.textStyle,
    mood: style.mood,
  };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Verifica disponibilidade de todos os itens para o tenant.
 */
export function checkAvailability(
  planTier: PlanTier,
): TemplateAvailability[] {
  const results: TemplateAvailability[] = [];
  const tierOrder: Record<string, number> = { free: 0, basic: 0, pro: 1, business: 2, premium: 3 };
  const currentLevel = tierOrder[planTier] ?? 0;

  for (const t of TEMPLATES) {
    const requiredLevel = tierOrder[t.tier] ?? 0;
    results.push({
      itemId: t.id,
      layer: VisualLayerType.TEMPLATE,
      available: t.status === CatalogItemStatus.ACTIVE && currentLevel >= requiredLevel,
      reason: currentLevel < requiredLevel ? `Requer plano ${t.tier}` : undefined,
      requiredTier: t.tier,
      currentTier: planTier,
    });
  }

  for (const s of STYLES) {
    const requiredLevel = tierOrder[s.tier] ?? 0;
    results.push({
      itemId: s.id,
      layer: VisualLayerType.STYLE,
      available: s.status === CatalogItemStatus.ACTIVE && currentLevel >= requiredLevel,
      reason: currentLevel < requiredLevel ? `Requer plano ${s.tier}` : undefined,
      requiredTier: s.tier,
      currentTier: planTier,
    });
  }

  return results;
}

/**
 * Retorna templates filtrados por output category e plano.
 */
export function getAvailableTemplates(
  outputCategory: OutputCategory,
  planTier: PlanTier,
): TemplateCatalogItem[] {
  const tierOrder: Record<string, number> = { free: 0, basic: 0, pro: 1, business: 2, premium: 3 };
  const currentLevel = tierOrder[planTier] ?? 0;

  return TEMPLATES.filter((t) =>
    t.status === CatalogItemStatus.ACTIVE &&
    t.outputCategories.includes(outputCategory) &&
    (tierOrder[t.tier] ?? 0) <= currentLevel,
  );
}

/**
 * Retorna styles filtrados por output category e plano.
 */
export function getAvailableStyles(
  outputCategory: OutputCategory,
  planTier: PlanTier,
): StyleProfile[] {
  const tierOrder: Record<string, number> = { free: 0, basic: 0, pro: 1, business: 2, premium: 3 };
  const currentLevel = tierOrder[planTier] ?? 0;

  return STYLES.filter((s) =>
    s.status === CatalogItemStatus.ACTIVE &&
    s.outputCategories.includes(outputCategory) &&
    (tierOrder[s.tier] ?? 0) <= currentLevel,
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * Carrega preferências de estilo do tenant.
 */
export async function loadPreferences(
  tenantId: string,
  supabase: SupabaseClient | null,
): Promise<TenantStylePreference | null> {
  if (!supabase) return null;

  try {
    const rows = await supabase.select<{
      tenant_id: string;
      preferred_templates: string;
      preferred_preset: string | null;
      preferred_style: string | null;
      disabled_templates: string;
      favorites: string;
      updated_at: string;
    }>(PREFERENCES_TABLE, {
      filters: [{ column: 'tenant_id', operator: 'eq', value: tenantId }],
      limit: 1,
    });

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      tenantId: row.tenant_id,
      preferredTemplates: JSON.parse(row.preferred_templates) as Record<string, string>,
      preferredPreset: row.preferred_preset,
      preferredStyle: row.preferred_style,
      disabledTemplates: JSON.parse(row.disabled_templates) as string[],
      favorites: JSON.parse(row.favorites) as string[],
      updatedAt: new Date(row.updated_at),
    };
  } catch {
    return null;
  }
}

/**
 * Salva preferências de estilo do tenant.
 */
export async function savePreferences(
  prefs: TenantStylePreference,
  supabase: SupabaseClient | null,
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.upsert(PREFERENCES_TABLE, {
      tenant_id: prefs.tenantId,
      preferred_templates: JSON.stringify(prefs.preferredTemplates),
      preferred_preset: prefs.preferredPreset,
      preferred_style: prefs.preferredStyle,
      disabled_templates: JSON.stringify(prefs.disabledTemplates),
      favorites: JSON.stringify(prefs.favorites),
      updated_at: new Date().toISOString(),
    }, 'tenant_id');
  } catch (err) {
    logger.warn(`[StyleResolver] Failed to save preferences for ${prefs.tenantId}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Selection Logic
// ---------------------------------------------------------------------------

function selectBestTemplate(
  outputCategory: OutputCategory,
  planTier: PlanTier,
): string {
  const available = getAvailableTemplates(outputCategory, planTier);
  // Prefer first active template for the category
  return available[0]?.id ?? 'hero-showcase-cta';
}

function selectBestPreset(
  template: TemplateCatalogItem,
  tone?: string,
): string {
  // Tone-based selection
  if (tone) {
    const toneMap: Record<string, string> = {
      aspiracional: 'luxury',
      urgente: 'fast-sales',
      institucional: 'corporate',
      emocional: 'luxury',
      conversacional: 'corporate',
      informativo: 'corporate',
    };
    const mapped = toneMap[tone];
    if (mapped && template.compatiblePresets.includes(mapped)) return mapped;
  }

  // First compatible preset
  return template.compatiblePresets[0] ?? 'corporate';
}

function selectBestStyle(
  template: TemplateCatalogItem,
  outputCategory: OutputCategory,
  planTier: PlanTier,
): string {
  // Recommended styles from template
  const recommended = template.recommendedStyles;
  const available = getAvailableStyles(outputCategory, planTier);
  const availableIds = new Set(available.map((s) => s.id));

  // First recommended that's available
  for (const styleId of recommended) {
    if (availableIds.has(styleId)) return styleId;
  }

  // Fallback to first available
  return available[0]?.id ?? 'clean-white';
}
