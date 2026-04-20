/**
 * Auto-Provision Middleware
 *
 * When an authenticated user (via Supabase JWT) makes their first request,
 * automatically creates a tenant + starter plan for them.
 *
 * Runs AFTER supabaseAuthMiddleware and BEFORE tenantGuard.
 * Only triggers when req.authUser is present and no tenant exists yet.
 */

import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '../../persistence/supabase-client.js';
import { createTenant } from '../../modules/tenant/tenant-service.js';
import { logger } from '../../utils/logger.js';

let supabaseClient: SupabaseClient | null = null;

// Cache of provisioned user IDs to avoid DB lookup on every request
const provisionedUsers = new Set<string>();

export function setAutoProvisionClient(client: SupabaseClient): void {
  supabaseClient = client;
}

export async function autoProvisionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser || !supabaseClient) {
    return next();
  }

  const userId = req.authUser.id;

  // Skip if already checked this session
  if (provisionedUsers.has(userId)) {
    return next();
  }

  try {
    // Check if tenant exists for this auth user
    const rows = await supabaseClient.select<{ id: string }>(
      'bookagent_tenants',
      {
        filters: [{ column: 'auth_user_id', operator: 'eq', value: userId }],
        select: 'id',
        limit: 1,
      },
    );

    if (rows.length > 0) {
      // Tenant exists, cache and move on
      provisionedUsers.add(userId);
      return next();
    }

    // No tenant — auto-create one
    logger.info(`[AutoProvision] Creating tenant for new user ${userId} (${req.authUser.email})`);

    await createTenant(
      {
        name: req.authUser.name ?? req.authUser.email.split('@')[0],
        ownerId: userId,
        ownerName: req.authUser.name ?? req.authUser.email.split('@')[0],
        ownerEmail: req.authUser.email,
        planTier: 'starter',
        trial: true,
      },
      supabaseClient,
    );

    provisionedUsers.add(userId);
    logger.info(`[AutoProvision] Tenant created for ${req.authUser.email}`);
  } catch (err) {
    // Don't block the request if provisioning fails
    logger.error(`[AutoProvision] Failed to provision tenant: ${(err as Error).message}`);
  }

  next();
}
