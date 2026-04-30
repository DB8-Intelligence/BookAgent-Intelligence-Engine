/**
 * Cloud Tasks OIDC Auth Middleware
 *
 * Valida o Bearer token OIDC que o Cloud Tasks envia nos webhooks.
 * Rejeita qualquer request sem token válido emitido pelo Google.
 *
 * O token é assinado pelo Google e contém:
 *   - iss: https://accounts.google.com
 *   - aud: URL da task (definido em oidcToken.audience no enqueue)
 *   - email: SA que enfileirou (CLOUD_TASKS_SA_EMAIL)
 *
 * Em dev local, permite bypass via CLOUD_TASKS_SKIP_AUTH=true.
 */

import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { logger } from '../../utils/logger.js';

const oauthClient = new OAuth2Client();

export async function cloudTasksAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Dev bypass
  if (process.env.CLOUD_TASKS_SKIP_AUTH === 'true') {
    logger.debug('[CloudTasksAuth] Skipping auth (CLOUD_TASKS_SKIP_AUTH=true)');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
    return;
  }

  const token = authHeader.slice(7);
  const expectedAudience = req.headers['x-cloud-tasks-target-url'] as string
    ?? buildExpectedAudience(req);
  const expectedSa = process.env.CLOUD_TASKS_SA_EMAIL;

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    });
    const payload = ticket.getPayload();

    // Garante que foi nosso SA que gerou o token
    if (expectedSa && payload?.email !== expectedSa) {
      logger.warn(
        `[CloudTasksAuth] Token email mismatch: got=${payload?.email} expected=${expectedSa}`,
      );
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Token not from expected service account' },
        meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
      });
      return;
    }

    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[CloudTasksAuth] Token validation failed: ${msg}`);
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: `Invalid OIDC token: ${msg}` },
      meta: { timestamp: new Date().toISOString(), version: '1.0.0' },
    });
  }
}

function buildExpectedAudience(req: Request): string {
  const base = process.env.CLOUD_TASKS_TARGET_URL;
  if (base) {
    return `${base.replace(/\/$/, '')}${req.originalUrl}`;
  }
  // Fallback — reconstruir a partir do request
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
  const host = req.headers['x-forwarded-host'] ?? req.hostname;
  return `${proto}://${host}${req.originalUrl}`;
}
