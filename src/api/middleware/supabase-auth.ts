/**
 * Supabase Auth Middleware
 *
 * Validates Supabase JWT tokens from the Authorization header.
 * Extracts user identity and injects `req.authUser` for downstream use.
 *
 * Supports BOTH:
 *   - Legacy HS256 (shared secret via SUPABASE_JWT_SECRET)
 *   - New ES256 (asymmetric keys via Supabase JWKS endpoint)
 *
 * Supabase migrated to asymmetric JWT signing in 2024. Projects created
 * after the migration sign tokens with ES256, while legacy projects use
 * HS256. Both are supported here to handle any project configuration.
 *
 * This middleware is NON-BLOCKING — if no token is present or validation
 * fails, it simply passes through. The actual access control is handled
 * by downstream middleware / resolvers.
 *
 * JWT verification is done locally via jose (supports HS256, ES256, RS256).
 * JWKS keys are fetched once and cached by the library.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Augment Express Request
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

// ---------------------------------------------------------------------------
// JWKS setup (lazy — only initialized if SUPABASE_URL is available)
// ---------------------------------------------------------------------------

let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksResolver(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwksResolver) return jwksResolver;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const jwksUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
    jwksResolver = createRemoteJWKSet(jwksUrl);
    logger.debug(`[SupabaseAuth] JWKS resolver initialized: ${jwksUrl}`);
    return jwksResolver;
  } catch (err) {
    logger.warn(`[SupabaseAuth] Failed to init JWKS: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function supabaseAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);

  // Detect token algorithm from header to pick validation strategy
  let alg: string | undefined;
  try {
    const decoded = jwt.decode(token, { complete: true });
    alg = decoded?.header?.alg;
  } catch {
    return next();
  }

  // Try asymmetric algorithms first (ES256, RS256) via JWKS
  if (alg && (alg.startsWith('ES') || alg.startsWith('RS') || alg.startsWith('PS'))) {
    const resolver = getJwksResolver();
    if (resolver) {
      try {
        const { payload } = await jwtVerify(token, resolver);
        if (payload.sub) {
          req.authUser = {
            id: payload.sub,
            email: (payload.email as string) ?? '',
            name: (payload.user_metadata as Record<string, unknown>)?.name as string | undefined,
          };
        }
        return next();
      } catch (err) {
        logger.debug(`[SupabaseAuth] JWKS validation failed: ${(err as Error).message}`);
      }
    }
  }

  // Fallback: HS256 with shared secret
  const secret = config.supabase.jwtSecret;
  if (secret) {
    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      if (payload.sub) {
        req.authUser = {
          id: payload.sub,
          email: (payload.email as string) ?? '',
          name: (payload.user_metadata as Record<string, unknown>)?.name as string | undefined,
        };
      }
    } catch (err) {
      logger.debug(`[SupabaseAuth] HS256 validation failed: ${(err as Error).message}`);
    }
  }

  next();
}
