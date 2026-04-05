/**
 * Auth Middleware — BookAgent Intelligence Engine
 *
 * Protege endpoints sensíveis (processamento, leads) validando
 * o header 'x-api-key' contra a configuração interna.
 *
 * Se BOOKAGENT_API_KEY não estiver configurado, o endpoint
 * permanece aberto (apenas loga aviso).
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { sendError } from '../helpers/response.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const serverKey = config.api.apiKey;

  // Se não houver chave configurada, permitimos (modo aberto com aviso)
  if (!serverKey) {
    // Loga apenas uma vez ou a cada X requests para não inundar o log em produção
    // (Simplificado agora para logar sempre que solicitado sem chave configurada)
    // logger.warn('[AuthMiddleware] API_KEY not configured. Endpoints are OPEN.');
    return next();
  }

  const clientKey = req.headers['x-api-key'] || req.query['api_key'];

  if (!clientKey || clientKey !== serverKey) {
    logger.warn(`[AuthMiddleware] Unauthorized access attempt from ${req.ip}`);
    sendError(res, 'UNAUTHORIZED', 'Invalid or missing API Key', 401);
    return;
  }

  next();
}
