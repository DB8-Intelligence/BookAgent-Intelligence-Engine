/**
 * Auth Middleware — BookAgent Intelligence Engine
 *
 * Protege endpoints sensíveis validando autenticação.
 *
 * Aceita DOIS modos de autenticação:
 *   1. Supabase JWT (via Authorization: Bearer <token>) — para frontend
 *   2. API Key (via x-api-key header ou ?api_key query) — para acesso programático
 *
 * Se nenhum dos dois estiver presente/válido, retorna 401.
 * Se BOOKAGENT_API_KEY não estiver configurado E não houver JWT secret,
 * o endpoint permanece aberto (modo desenvolvimento).
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { sendError } from '../helpers/response.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Already authenticated via Supabase JWT (set by supabaseAuthMiddleware)
  if (req.authUser) {
    return next();
  }

  // 2. Try API key authentication
  const serverKey = config.api.apiKey;
  const clientKey = req.headers['x-api-key'] || req.query['api_key'];

  if (serverKey && clientKey && clientKey === serverKey) {
    return next();
  }

  // 3. If neither JWT secret nor API key is configured, allow (dev mode)
  if (!serverKey && !config.supabase.jwtSecret) {
    return next();
  }

  // 4. Unauthorized
  logger.warn(`[AuthMiddleware] Unauthorized access attempt from ${req.ip} to ${req.path}`);
  sendError(res, 'UNAUTHORIZED', 'Invalid or missing API Key', 401);
}
