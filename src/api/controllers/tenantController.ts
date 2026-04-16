/**
 * Tenant Controller — SaaS Multi-Tenant + Onboarding
 *
 * POST /tenants                     → Criar tenant (onboarding)
 * GET  /tenants/:id                 → Detalhe do tenant
 * GET  /tenants                     → Listar tenants (admin)
 * PATCH /tenants/:id/status         → Atualizar status
 * PATCH /tenants/:id/plan           → Atualizar plano
 * POST /tenants/:id/members         → Adicionar membro
 * GET  /tenants/:id/context         → Obter TenantContext
 * GET  /plans                       → Listar planos disponíveis
 *
 * Parte 101: SaaS Multi-Tenant + Billing Real
 */

import type { Request, Response } from 'express';
import { sendSuccess, sendError } from '../helpers/response.js';
import { createDefaultTenantContext } from '../../core/tenant-resolver.js';
import {
  createTenant,
  getTenant,
  listTenants,
  updateTenantStatus,
  updateTenantPlan,
  addTenantMember,
  buildTenantContext,
} from '../../modules/tenant/index.js';
import { TenantStatus, TenantRole } from '../../domain/entities/tenant.js';
import { getPlan } from '../../plans/plan-config.js';
import type { PlanTier } from '../../plans/plan-config.js';

// ============================================================================
// Dependency injection
// ============================================================================

import type { SupabaseClient as SupabaseClientInstance } from '../../persistence/supabase-client.js';

let supabaseClient: SupabaseClientInstance | null = null;

export function setSupabaseClientForTenants(client: SupabaseClientInstance): void {
  supabaseClient = client;
}

// ============================================================================
// Endpoints
// ============================================================================

/**
 * POST /tenants — Criar tenant (onboarding)
 */
export async function createTenantEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { name, slug, ownerId, ownerName, ownerEmail, planTier, trial } = req.body as {
      name?: string;
      slug?: string;
      ownerId?: string;
      ownerName?: string;
      ownerEmail?: string;
      planTier?: PlanTier;
      trial?: boolean;
    };

    if (!name || !ownerId || !ownerName || !ownerEmail) {
      sendError(res, 'INVALID_INPUT', 'name, ownerId, ownerName and ownerEmail are required', 400);
      return;
    }

    const tenant = await createTenant(
      { name, slug, ownerId, ownerName, ownerEmail, planTier, trial },
      supabaseClient,
    );

    sendSuccess(res, {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan.tier,
      isTrial: tenant.plan.isTrial,
      message: 'Tenant created successfully. Welcome to BookAgent!',
    }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to create tenant', 500, err);
  }
}

/**
 * GET /tenants/:id — Detalhe do tenant
 */
export async function getTenantEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenant = await getTenant(id, supabaseClient);

    if (!tenant) {
      sendError(res, 'NOT_FOUND', 'Tenant not found', 404);
      return;
    }

    sendSuccess(res, tenant);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to get tenant', 500, err);
  }
}

/**
 * GET /tenants — Listar tenants (admin)
 */
export async function listTenantsEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query['limit'] ? Number(req.query['limit']) : 100;
    const tenants = await listTenants(supabaseClient, limit);
    sendSuccess(res, { tenants, total: tenants.length });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list tenants', 500, err);
  }
}

/**
 * PATCH /tenants/:id/status — Atualizar status
 */
export async function updateStatusEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    const validStatuses = Object.values(TenantStatus) as string[];
    if (!status || !validStatuses.includes(status)) {
      sendError(res, 'INVALID_INPUT', `Invalid status. Valid: ${validStatuses.join(', ')}`, 400);
      return;
    }

    await updateTenantStatus(id, status as TenantStatus, supabaseClient);
    sendSuccess(res, { tenantId: id, status });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to update status', 500, err);
  }
}

/**
 * PATCH /tenants/:id/plan — Atualizar plano
 */
export async function updatePlanEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { planTier } = req.body as { planTier?: string };

    const validTiers = ['basic', 'pro', 'business'];
    if (!planTier || !validTiers.includes(planTier)) {
      sendError(res, 'INVALID_INPUT', `Invalid planTier. Valid: ${validTiers.join(', ')}`, 400);
      return;
    }

    await updateTenantPlan(id, planTier as PlanTier, supabaseClient);
    const plan = getPlan(planTier as PlanTier);
    sendSuccess(res, { tenantId: id, plan: plan.tier, name: plan.name, limits: plan.limits });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to update plan', 500, err);
  }
}

/**
 * POST /tenants/:id/members — Adicionar membro
 */
export async function addMemberEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { userId, role, name, email } = req.body as {
      userId?: string;
      role?: string;
      name?: string;
      email?: string;
    };

    if (!userId || !name || !email) {
      sendError(res, 'INVALID_INPUT', 'userId, name and email are required', 400);
      return;
    }

    const validRoles = Object.values(TenantRole) as string[];
    const memberRole = role && validRoles.includes(role) ? (role as TenantRole) : TenantRole.MEMBER;

    await addTenantMember(id, {
      userId,
      role: memberRole,
      name,
      email,
      joinedAt: new Date(),
    }, supabaseClient);

    sendSuccess(res, { tenantId: id, userId, role: memberRole }, 201);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to add member', 500, err);
  }
}

/**
 * GET /tenants/:id/context — Obter TenantContext
 */
export async function getContextEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = (req.query['userId'] as string) ?? 'system';
    const ctx = await buildTenantContext(id, userId, supabaseClient);
    sendSuccess(res, ctx);
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to build context', 500, err);
  }
}

/**
 * GET /plans — Listar planos disponíveis
 */
export async function listPlansEndpoint(_req: Request, res: Response): Promise<void> {
  try {
    const plans = (['basic', 'pro', 'business'] as PlanTier[]).map(getPlan);
    sendSuccess(res, { plans });
  } catch (err) {
    sendError(res, 'INTERNAL_ERROR', 'Failed to list plans', 500, err);
  }
}
