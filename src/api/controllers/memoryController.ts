/**
 * Memory Controller — Memory & Longitudinal Tenant Intelligence
 *
 * GET  /memory                    → Memória do tenant
 * GET  /memory/profile            → Perfil longitudinal
 * POST /memory/consolidate        → Forçar consolidação
 * GET  /memory/patterns           → Patterns ativos
 * GET  /memory/snapshot           → Snapshot atual
 *
 * Todos tenant-scoped via tenantGuard.
 *
 * Parte 90: Memory & Longitudinal Tenant Intelligence
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  consolidateMemory,
  loadTenantMemory,
  generateAndSaveProfile,
  createSnapshot,
} from '../../modules/memory/index.js';
import { PatternStatus } from '../../domain/entities/tenant-memory.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForMemory(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantCtx(req: Request) {
  return req.tenantContext ?? createDefaultTenantContext();
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * GET /memory — Memória completa do tenant
 */
export async function getTenantMemoryEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const memory = await loadTenantMemory(tenantCtx.tenantId, supabaseClient);

    if (!memory) {
      sendSuccess(res, {
        memory: null,
        message: 'Nenhuma memória consolidada. Execute /memory/consolidate para iniciar.',
      });
      return;
    }

    sendSuccess(res, {
      tenantId: memory.tenantId,
      totalPatterns: memory.patterns.length,
      totalSignalsProcessed: memory.totalSignalsProcessed,
      lastConsolidatedAt: memory.lastConsolidatedAt,
      hasProfile: memory.latestProfile !== null,
      patternSummary: {
        stable: memory.patterns.filter((p) => p.status === PatternStatus.STABLE).length,
        confirmed: memory.patterns.filter((p) => p.status === PatternStatus.CONFIRMED).length,
        emerging: memory.patterns.filter((p) => p.status === PatternStatus.EMERGING).length,
        declining: memory.patterns.filter((p) => p.status === PatternStatus.DECLINING).length,
      },
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar memória', 500, err);
  }
}

/**
 * GET /memory/profile — Perfil longitudinal do tenant
 */
export async function getTenantProfile(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const memory = await loadTenantMemory(tenantCtx.tenantId, supabaseClient);

    if (!memory) {
      sendError(res, 'NOT_FOUND', 'Nenhuma memória encontrada. Execute consolidação primeiro.', 404);
      return;
    }

    // Generate fresh profile
    const profile = await generateAndSaveProfile(memory, tenantCtx, supabaseClient);
    sendSuccess(res, profile);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar perfil', 500, err);
  }
}

/**
 * POST /memory/consolidate — Forçar ciclo de consolidação
 */
export async function consolidateEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);

    // Consolidate
    const memory = await consolidateMemory(tenantCtx, supabaseClient);

    // Generate profile
    const profile = await generateAndSaveProfile(memory, tenantCtx, supabaseClient);

    // Create snapshot
    const snapshot = createSnapshot(memory, profile);

    sendSuccess(res, {
      memory: {
        tenantId: memory.tenantId,
        totalPatterns: memory.patterns.length,
        totalSignalsProcessed: memory.totalSignalsProcessed,
      },
      profile: {
        growthPhase: profile.growth.growthPhase,
        maturityScore: profile.operational.maturityScore,
        totalPatterns: profile.totalPatterns,
      },
      snapshot: {
        id: snapshot.id,
        summary: snapshot.summary,
      },
    }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao consolidar memória', 500, err);
  }
}

/**
 * GET /memory/patterns — Patterns ativos do tenant
 */
export async function getPatterns(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const memory = await loadTenantMemory(tenantCtx.tenantId, supabaseClient);

    if (!memory) {
      sendSuccess(res, { patterns: [], total: 0 });
      return;
    }

    const category = req.query['category'] as string | undefined;
    let patterns = memory.patterns.filter((p) => p.status !== PatternStatus.OBSOLETE);

    if (category) {
      patterns = patterns.filter((p) => p.category === category);
    }

    // Sort by confidence desc
    patterns.sort((a, b) => b.confidence - a.confidence);

    sendSuccess(res, {
      patterns: patterns.map((p) => ({
        id: p.id,
        category: p.category,
        key: p.key,
        value: p.value,
        description: p.description,
        strength: p.strength,
        confidence: p.confidence,
        status: p.status,
        confirmationCount: p.confirmationCount,
        firstSeenAt: p.firstSeenAt,
        lastConfirmedAt: p.lastConfirmedAt,
      })),
      total: patterns.length,
    });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao buscar patterns', 500, err);
  }
}

/**
 * GET /memory/snapshot — Snapshot atual da memória
 */
export async function getSnapshotEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const tenantCtx = getTenantCtx(req);
    const memory = await loadTenantMemory(tenantCtx.tenantId, supabaseClient);

    if (!memory || !memory.latestProfile) {
      sendError(res, 'NOT_FOUND', 'Nenhum snapshot disponível. Execute consolidação primeiro.', 404);
      return;
    }

    const snapshot = createSnapshot(memory, memory.latestProfile);
    sendSuccess(res, snapshot);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Falha ao gerar snapshot', 500, err);
  }
}
