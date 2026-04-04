/**
 * Video Renderer — Types
 *
 * Tipos internos para o pipeline de renderização de vídeo.
 */

export interface VideoRenderOptions {
  /** Diretório de saída para o vídeo final */
  outputDir: string;

  /** Diretório temporário para arquivos intermediários */
  tempDir: string;

  /** Mapa de assetId → caminho do arquivo no disco */
  assetMap: Map<string, string>;

  /** Resolução de saída [width, height] */
  resolution: [number, number];

  /** FPS do vídeo (default: 30) */
  fps?: number;

  /** Codec de vídeo (default: libx264) */
  videoCodec?: string;

  /** Preset de encoding (default: medium) */
  preset?: string;

  /** CRF quality (default: 23, lower = better) */
  crf?: number;

  /** Duração de transição fade em segundos (default: 0.5) */
  fadeDuration?: number;
}

export interface SceneClip {
  /** Índice da cena */
  index: number;

  /** Caminho do clip de vídeo gerado */
  clipPath: string;

  /** Duração em segundos */
  duration: number;

  /** Tipo de transição para a próxima cena */
  transition: string;
}

export interface VideoRenderResult {
  /** Caminho do vídeo final */
  outputPath: string;

  /** Nome do arquivo */
  filename: string;

  /** Tamanho em bytes */
  sizeBytes: number;

  /** Duração total em segundos */
  durationSeconds: number;

  /** Número de cenas renderizadas */
  sceneCount: number;

  /** Resolução do vídeo */
  resolution: [number, number];

  /** Cenas que foram puladas (sem assets) */
  skippedScenes: number[];

  /** Warnings durante a renderização */
  warnings: string[];
}
