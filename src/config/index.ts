/**
 * Configuração central do BookAgent Intelligence Engine.
 *
 * Carrega variáveis de ambiente e define defaults.
 * Evolução futura: suporte a .env, config por ambiente (dev/staging/prod).
 */

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),

  storage: {
    assetsDir: process.env.ASSETS_DIR ?? 'storage/assets',
    outputsDir: process.env.OUTPUTS_DIR ?? 'storage/outputs',
    tempDir: process.env.TEMP_DIR ?? 'storage/temp',
  },

  processing: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB ?? '100', 10),
    thumbnailWidth: 300,
    thumbnailHeight: 300,
  },

  api: {
    prefix: '/api/v1',
  },
};
