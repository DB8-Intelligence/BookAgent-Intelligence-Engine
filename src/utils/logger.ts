/**
 * Logger utilitário.
 *
 * Wrapper simples sobre console para padronizar logs.
 * Evolução futura: integração com winston/pino, log levels, structured logging.
 */

export const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[INFO] ${new Date().toISOString()} ${message}`, data ?? '');
  },

  warn: (message: string, data?: unknown) => {
    console.warn(`[WARN] ${new Date().toISOString()} ${message}`, data ?? '');
  },

  error: (message: string, data?: unknown) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}`, data ?? '');
  },

  debug: (message: string, data?: unknown) => {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${new Date().toISOString()} ${message}`, data ?? '');
    }
  },
};
