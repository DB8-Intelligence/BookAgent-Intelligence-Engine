/**
 * Logger utilitário — BookAgent Intelligence Engine
 *
 * Wrapper sobre console com log levels e structured output.
 * Parte 53: removido ruído de string vazia, adicionado nível fatal.
 */

function formatData(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return ` ${data}`;
  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ` [unserializable]`;
  }
}

export const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[INFO] ${new Date().toISOString()} ${message}${formatData(data)}`);
  },

  warn: (message: string, data?: unknown) => {
    console.warn(`[WARN] ${new Date().toISOString()} ${message}${formatData(data)}`);
  },

  error: (message: string, data?: unknown) => {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}${formatData(data)}`);
  },

  fatal: (message: string, data?: unknown) => {
    console.error(`[FATAL] ${new Date().toISOString()} ${message}${formatData(data)}`);
  },

  debug: (message: string, data?: unknown) => {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${new Date().toISOString()} ${message}${formatData(data)}`);
    }
  },
};
