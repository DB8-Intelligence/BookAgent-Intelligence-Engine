/**
 * Template Marketplace Controller
 *
 * GET /templates/catalog       → Catálogo completo
 * GET /templates/collections   → Coleções
 * GET /templates/styles        → Styles disponíveis
 * GET /templates/availability  → Disponibilidade por plano
 * GET /templates/preferences   → Preferências do tenant
 * PUT /templates/preferences   → Salvar preferências
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../helpers/response.js';
import {
  TEMPLATES,
  STYLES,
  COLLECTIONS,
  getAllCatalogEntries,
  checkAvailability,
  getAvailableTemplates,
  getAvailableStyles,
  loadPreferences,
  savePreferences,
} from '../../modules/template-marketplace/index.js';
import { OutputCategory } from '../../domain/entities/template-marketplace.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForTemplates(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// GET /templates/catalog
// ============================================================================

export async function getCatalog(req: Request, res: Response): Promise<void> {
  const category = req.query.category as string | undefined;
  const layer = req.query.layer as string | undefined;

  let entries = getAllCatalogEntries();

  if (category) {
    entries = entries.filter((e) => e.outputCategories.includes(category as OutputCategory));
  }
  if (layer) {
    entries = entries.filter((e) => e.layer === layer);
  }

  sendSuccess(res, {
    entries,
    total: entries.length,
    templates: TEMPLATES.length,
    styles: STYLES.length,
  });
}

// ============================================================================
// GET /templates/collections
// ============================================================================

export async function getCollections(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, {
    collections: COLLECTIONS,
    total: COLLECTIONS.length,
  });
}

// ============================================================================
// GET /templates/styles
// ============================================================================

export async function getStyles(req: Request, res: Response): Promise<void> {
  const category = req.query.category as OutputCategory | undefined;
  const tenantCtx = req.tenantContext ?? createDefaultTenantContext();

  const styles = category
    ? getAvailableStyles(category, tenantCtx.planTier)
    : STYLES.filter((s) => s.status === 'active');

  sendSuccess(res, { styles, total: styles.length });
}

// ============================================================================
// GET /templates/availability
// ============================================================================

export async function getAvailabilityEndpoint(req: Request, res: Response): Promise<void> {
  const tenantCtx = req.tenantContext ?? createDefaultTenantContext();
  const availability = checkAvailability(tenantCtx.planTier);

  const available = availability.filter((a) => a.available).length;
  const locked = availability.filter((a) => !a.available).length;

  sendSuccess(res, {
    availability,
    summary: { total: availability.length, available, locked },
    planTier: tenantCtx.planTier,
  });
}

// ============================================================================
// GET /templates/preferences
// ============================================================================

export async function getPreferences(req: Request, res: Response): Promise<void> {
  const tenantCtx = req.tenantContext ?? createDefaultTenantContext();
  const prefs = await loadPreferences(tenantCtx.tenantId, supabaseClient);

  sendSuccess(res, prefs ?? {
    tenantId: tenantCtx.tenantId,
    preferredTemplates: {},
    preferredPreset: null,
    preferredStyle: null,
    disabledTemplates: [],
    favorites: [],
  });
}

// ============================================================================
// PUT /templates/preferences
// ============================================================================

const PreferencesSchema = z.object({
  preferredTemplates: z.record(z.string()).optional(),
  preferredPreset: z.string().nullable().optional(),
  preferredStyle: z.string().nullable().optional(),
  disabledTemplates: z.array(z.string()).optional(),
  favorites: z.array(z.string()).optional(),
});

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  const tenantCtx = req.tenantContext ?? createDefaultTenantContext();

  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 'VALIDATION_ERROR', 'Dados inválidos', 400, parsed.error.flatten());
    return;
  }

  const existing = await loadPreferences(tenantCtx.tenantId, supabaseClient);

  const prefs = {
    tenantId: tenantCtx.tenantId,
    preferredTemplates: parsed.data.preferredTemplates ?? existing?.preferredTemplates ?? {},
    preferredPreset: parsed.data.preferredPreset ?? existing?.preferredPreset ?? null,
    preferredStyle: parsed.data.preferredStyle ?? existing?.preferredStyle ?? null,
    disabledTemplates: parsed.data.disabledTemplates ?? existing?.disabledTemplates ?? [],
    favorites: parsed.data.favorites ?? existing?.favorites ?? [],
    updatedAt: new Date(),
  };

  await savePreferences(prefs, supabaseClient);
  sendSuccess(res, prefs);
}
