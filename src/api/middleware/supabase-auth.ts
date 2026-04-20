/**
 * Supabase Auth Middleware
 *
 * Validates Supabase JWT tokens from the Authorization header.
 * Extracts user identity and injects `req.authUser` for downstream use.
 *
 * This middleware is NON-BLOCKING — if no token is present, it simply
 * passes through. The actual access control is handled by `authMiddleware`
 * which accepts either a valid JWT or a valid API key.
 *
 * JWT verification is done locally using the Supabase JWT secret,
 * avoiding a network call on every request.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
// Middleware
// ---------------------------------------------------------------------------

export function supabaseAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  const secret = config.supabase.jwtSecret;

  if (!secret) {
    // JWT secret not configured — skip JWT validation
    return next();
  }

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
    // Invalid or expired token — don't block, let authMiddleware handle access control
    logger.debug(`[SupabaseAuth] JWT validation failed: ${(err as Error).message}`);
  }

  next();
}
