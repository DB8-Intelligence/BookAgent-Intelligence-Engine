/**
 * BookAgent Intelligence Engine — Tipos globais
 *
 * Re-exporta todos os tipos do domain layer.
 * Este arquivo existe para manter compatibilidade com imports existentes.
 * Preferir importar diretamente de '../domain/index.js'.
 */

export * from '../domain/index.js';
export type { ProcessingContext } from '../core/context.js';
