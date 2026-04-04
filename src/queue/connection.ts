/**
 * Redis Connection — Fábrica de conexão IORedis para BullMQ
 *
 * Suporta duas formas de configuração:
 *   1. REDIS_URL  (Railway, Render, Upstash — recomendado)
 *   2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD  (Docker local)
 *
 * Retorna null se nenhuma variável de Redis estiver configurada.
 * Isso ativa o modo de degradação gracioso (processamento síncrono).
 *
 * IMPORTANTE: maxRetriesPerRequest: null é obrigatório para BullMQ
 * (BullMQ usa comandos bloqueantes que não têm limite de retries).
 */

import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

let sharedConnection: Redis | null = null;

/**
 * Retorna se Redis está configurado no ambiente atual.
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
}

/**
 * Cria uma conexão IORedis dedicada (não reutiliza instância).
 * BullMQ precisa de conexões separadas para Queue e Worker.
 */
export function createRedisConnection(): Redis | null {
  const url  = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;

  if (!url && !host) return null;

  try {
    const redis = url
      ? new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false })
      : new Redis({
          host:     process.env.REDIS_HOST ?? 'localhost',
          port:     parseInt(process.env.REDIS_PORT ?? '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

    redis.on('error', (err) => {
      logger.warn(`[Redis] Connection error: ${err.message}`);
    });

    return redis;
  } catch (err) {
    logger.error(`[Redis] Failed to create connection: ${err}`);
    return null;
  }
}

/**
 * Retorna a conexão compartilhada para uso da Queue (leitura/escrita).
 * Cria na primeira chamada, reutiliza nas seguintes.
 */
export function getSharedConnection(): Redis | null {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}
