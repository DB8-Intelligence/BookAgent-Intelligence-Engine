/**
 * Middleware: Error Handler
 *
 * Captura erros não tratados em qualquer rota/controller
 * e devolve uma resposta padronizada.
 */

import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../helpers/response.js';
import { logger } from '../../utils/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(`[API] Unhandled error: ${err.message}`);

  sendError(
    res,
    'INTERNAL_ERROR',
    'Erro interno do servidor',
    500,
    process.env.NODE_ENV === 'development' ? err.message : undefined,
  );
}
