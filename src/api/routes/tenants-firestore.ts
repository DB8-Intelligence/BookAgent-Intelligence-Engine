/**
 * Tenants (Firestore) — endpoints pro frontend consultar o(s) tenant(s) do user.
 *
 * Convive com a rota legada /tenants (Supabase) até migração completa.
 * Na MVP, cada user tem apenas seu solo tenant (tenantId = uid). Quando
 * implementarmos invites multi-user, GET /me retornará múltiplos tenants
 * e o frontend poderá trocar via header x-tenant-id.
 */

import { Router, type Request, type Response } from 'express';
import {
  getTenant,
  ensureProfile,
} from '../../persistence/google-persistence.js';
import { sendSuccess, sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

const router = Router();

router.get('/me', async (req: Request, res: Response) => {
  if (!req.authUser?.id) {
    sendError(res, 'UNAUTHORIZED', 'Autenticação necessária', 401);
    return;
  }

  const uid = req.authUser.id;

  try {
    // Idempotente — se profile/tenant já existem, só retorna
    const profile = await ensureProfile({
      uid,
      email: req.authUser.email ?? '',
      name: req.authUser.name,
      emailVerified: true,
    });

    const tenant = await getTenant(profile.activeTenantId);

    sendSuccess(res, {
      profile: {
        uid: profile.uid,
        email: profile.email,
        name: profile.name,
        activeTenantId: profile.activeTenantId,
      },
      tenants: tenant
        ? [{
            tenantId: tenant.tenantId,
            name: tenant.name,
            planTier: tenant.planTier,
            role: tenant.ownerUid === uid ? 'owner' : 'member',
            isActive: tenant.tenantId === profile.activeTenantId,
          }]
        : [],
    });
  } catch (err) {
    logger.error(`[Tenants-FS] /me error: ${err}`);
    sendError(res, 'INTERNAL_ERROR', 'Falha ao carregar tenants', 500, err);
  }
});

export default router;
