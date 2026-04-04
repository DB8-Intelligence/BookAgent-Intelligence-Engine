/**
 * API Response Helpers
 *
 * Funções utilitárias para padronizar respostas da API.
 * Todas as respostas passam pelo envelope ApiResponse.
 */

import type { Response } from 'express';
import type { ApiResponse, ApiMeta } from '../types/responses.js';

const API_VERSION = '1.0.0';

function buildMeta(): ApiMeta {
  return {
    timestamp: new Date().toISOString(),
    version: API_VERSION,
  };
}

/**
 * Resposta de sucesso com envelope padrão.
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: buildMeta(),
  };
  res.status(statusCode).json(response);
}

/**
 * Resposta de erro com envelope padrão.
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown,
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message, details },
    meta: buildMeta(),
  };
  res.status(statusCode).json(response);
}
