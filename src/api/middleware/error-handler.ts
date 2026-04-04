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
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isDev = process.env.NODE_ENV === 'development';
  logger.error(
    `[API] Unhandled error on ${req.method} ${req.path}: ${err.message}`,
    isDev ? err.stack : undefined,
  );

  sendError(
    res,
    'INTERNAL_ERROR',
    'Erro interno do servidor',
    500,
    isDev ? { message: err.message, stack: err.stack } : undefined,
  );
}
