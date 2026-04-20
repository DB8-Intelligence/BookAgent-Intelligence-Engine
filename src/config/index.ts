/**
 * Configuração central do BookAgent Intelligence Engine.
 *
 * Carrega variáveis de ambiente e define defaults.
 * Evolução futura: suporte a .env, config por ambiente (dev/staging/prod).
 */

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),

  storage: {
    assetsDir:  process.env.ASSETS_DIR  ?? 'storage/assets',
    outputsDir: process.env.OUTPUTS_DIR ?? 'storage/outputs',
    tempDir:    process.env.TEMP_DIR    ?? 'storage/temp',
  },

  processing: {
    maxFileSizeMB:   parseInt(process.env.MAX_FILE_SIZE_MB ?? '100', 10),
    thumbnailWidth:  300,
    thumbnailHeight: 300,
  },

  api: {
    prefix: '/api/v1',
    apiKey: process.env.BOOKAGENT_API_KEY ?? null, // Chave para proteção de endpoints (n8n, internos)
  },

  supabase: {
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? process.env.NEXOIMOB_SUPABASE_JWT_SECRET ?? null,
  },

  queue: {
    /** Redis configurado → modo assíncrono; não configurado → modo síncrono */
    redisUrl:      process.env.REDIS_URL      ?? null,
    redisHost:     process.env.REDIS_HOST     ?? null,
    redisPort:     parseInt(process.env.REDIS_PORT     ?? '6379', 10),
    redisPassword: process.env.REDIS_PASSWORD ?? null,
    concurrency:   parseInt(process.env.QUEUE_CONCURRENCY ?? '2', 10),
    queueName:     'bookagent-processing',
  },
};
