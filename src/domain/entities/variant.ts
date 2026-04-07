/**
 * Entity: OutputVariant / VariantSpec / ChannelProfile
 *
 * Suporta geração de múltiplas variantes do mesmo conteúdo
 * para diferentes formatos, durações e canais de distribuição.
 *
 * Variantes reutilizam o RenderSpec base com overrides leves:
 * - Aspect ratio
 * - Duração alvo (seleção de cenas)
 * - Densidade de texto
 * - Preset padrão
 *
 * Parte 65: Variant Generation Engine
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status de uma variante individual */
export enum VariantStatus {
  PENDING = 'pending',
  RENDERING = 'rendering',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** Canal de distribuição */
export enum DistributionChannel {
  INSTAGRAM_REELS = 'instagram-reels',
  INSTAGRAM_STORIES = 'instagram-stories',
  INSTAGRAM_FEED = 'instagram-feed',
  WHATSAPP = 'whatsapp',
  YOUTUBE_SHORTS = 'youtube-shorts',
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  LINKEDIN = 'linkedin',
  WEBSITE = 'website',
  GENERIC = 'generic',
}

/** Densidade de texto na variante */
export enum TextDensity {
  MINIMAL = 'minimal',     // Apenas headlines
  NORMAL = 'normal',       // Headlines + body
  DENSE = 'dense',         // Headlines + body + captions
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Especificação de uma variante — define os overrides sobre o RenderSpec base.
 * Cada VariantSpec produz um artifact separado.
 */
export interface VariantSpec {
  /** ID único da variante (ex: 'reel_15s_9x16') */
  id: string;

  /** Nome legível */
  name: string;

  /** Canal de distribuição alvo */
  channel: DistributionChannel;

  /** Aspect ratio alvo */
  aspectRatio: string;

  /** Resolução alvo [width, height] */
  resolution: [number, number];

  /** Duração alvo em segundos (null = todas as cenas) */
  targetDurationSeconds: number | null;

  /** Número máximo de cenas a incluir */
  maxScenes: number | null;

  /** Densidade de texto */
  textDensity: TextDensity;

  /** ID do preset padrão para esta variante */
  defaultPresetId: string | null;

  /** Se deve incluir legendas hardcoded */
  hardcodedSubtitles: boolean;

  /** Prioridade de renderização (menor = primeiro) */
  priority: number;
}

/**
 * Perfil de um canal de distribuição — limites e requisitos técnicos.
 */
export interface ChannelProfile {
  /** Canal */
  channel: DistributionChannel;

  /** Duração máxima suportada (segundos) */
  maxDurationSeconds: number;

  /** Tamanho máximo do arquivo (bytes) */
  maxFileSizeBytes: number;

  /** Aspect ratios suportados */
  supportedAspectRatios: string[];

  /** Resolução máxima suportada */
  maxResolution: [number, number];

  /** Se suporta legendas como sidecar (SRT/VTT) */
  supportsSidecarSubtitles: boolean;

  /** Codec recomendado */
  recommendedCodec: string;
}

/**
 * Resultado de uma variante após renderização.
 */
export interface OutputVariant {
  /** ID da variante spec que originou */
  variantSpecId: string;

  /** Nome da variante */
  name: string;

  /** Canal de distribuição */
  channel: DistributionChannel;

  /** Status da renderização */
  status: VariantStatus;

  /** Caminho do arquivo de saída */
  outputPath?: string;

  /** Nome do arquivo */
  filename?: string;

  /** Tamanho em bytes */
  sizeBytes?: number;

  /** Duração real em segundos */
  durationSeconds?: number;

  /** Resolução final */
  resolution?: [number, number];

  /** Número de cenas incluídas */
  sceneCount?: number;

  /** Warnings */
  warnings: string[];

  /** Erro (se failed) */
  error?: string;
}

/**
 * Resultado consolidado da geração de variantes para um job.
 */
export interface VariantGenerationResult {
  /** ID do RenderSpec base usado */
  baseSpecId: string;

  /** Variantes geradas */
  variants: OutputVariant[];

  /** Total de variantes completadas */
  completedCount: number;

  /** Total de variantes falhadas */
  failedCount: number;
}
