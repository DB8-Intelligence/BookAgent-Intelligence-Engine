/**
 * Entity: Publication / PublishPayload / PublishResult
 *
 * Estruturas para o Publishing Adapter Layer.
 *
 * - SocialPlatform: plataformas de publicação suportadas
 * - PublishPayload: dados enviados ao adapter
 * - PublishResult: resposta da plataforma
 * - Publication: registro persistido de cada publicação
 *
 * Parte 67: Publishing Adapter Layer
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Plataformas sociais suportadas */
export enum SocialPlatform {
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  WHATSAPP = 'whatsapp',
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  LINKEDIN = 'linkedin',
}

/** Status de uma publicação */
export enum PublishStatus {
  PENDING = 'pending',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  RETRYING = 'retrying',
  SKIPPED = 'skipped',
}

/** Tipo de conteúdo publicado */
export enum PublishContentType {
  VIDEO = 'video',
  IMAGE = 'image',
  CAROUSEL = 'carousel',
  STORY = 'story',
  REEL = 'reel',
  TEXT = 'text',
}

// ---------------------------------------------------------------------------
// Payloads & Results
// ---------------------------------------------------------------------------

/**
 * Payload enviado ao adapter de publicação.
 * Contém tudo que a plataforma precisa para publicar.
 */
export interface PublishPayload {
  /** Plataforma alvo */
  platform: SocialPlatform;

  /** Tipo de conteúdo */
  contentType: PublishContentType;

  /** Caminho do vídeo no disco */
  videoPath?: string;

  /** URL pública do vídeo (Supabase Storage) */
  videoUrl?: string;

  /** Caminho do thumbnail */
  thumbnailPath?: string;

  /** URL pública do thumbnail */
  thumbnailUrl?: string;

  /** Caption / texto da publicação */
  caption: string;

  /** Hashtags (já incluídas no caption ou separadas) */
  hashtags?: string[];

  /** Título (para YouTube/LinkedIn) */
  title?: string;

  /** ID do job de origem */
  jobId: string;

  /** ID do artefato de origem */
  artifactId?: string;

  /** ID da variante (se publicando variante específica) */
  variantId?: string;

  /** Metadados adicionais específicos da plataforma */
  platformMeta?: Record<string, unknown>;
}

/**
 * Resultado retornado pelo adapter após tentativa de publicação.
 */
export interface PublishResult {
  /** Se a publicação foi bem-sucedida */
  success: boolean;

  /** ID do post na plataforma (ex: Instagram media_id) */
  platformPostId?: string;

  /** URL pública do post */
  postUrl?: string;

  /** HTTP status code da resposta */
  statusCode?: number;

  /** Mensagem de erro (se falhou) */
  error?: string;

  /** Resposta raw da API (para debugging) */
  rawResponse?: Record<string, unknown>;

  /** Timestamp da publicação */
  publishedAt?: Date;
}

// ---------------------------------------------------------------------------
// Publication (persisted)
// ---------------------------------------------------------------------------

/**
 * Registro de publicação — persistido em bookagent_publications.
 */
export interface Publication {
  /** ID único da publicação */
  id: string;

  /** ID do job de origem */
  jobId: string;

  /** Plataforma */
  platform: SocialPlatform;

  /** Tipo de conteúdo */
  contentType: PublishContentType;

  /** Status atual */
  status: PublishStatus;

  /** Payload enviado (JSON serializado) */
  payload: PublishPayload;

  /** Resultado da publicação */
  result?: PublishResult;

  /** Número de tentativas */
  attempts: number;

  /** Máximo de tentativas */
  maxAttempts: number;

  /** Último erro */
  lastError?: string;

  /** Criado em */
  createdAt: Date;

  /** Última atualização */
  updatedAt: Date;

  /** Publicado em (se sucesso) */
  publishedAt?: Date;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

/**
 * Interface que todo adapter de plataforma deve implementar.
 * Cada adapter encapsula a lógica específica de uma API.
 */
export interface ISocialAdapter {
  /** Plataforma que este adapter suporta */
  readonly platform: SocialPlatform;

  /** Nome legível do adapter */
  readonly name: string;

  /** Verifica se o adapter está configurado (API keys presentes) */
  isConfigured(): boolean;

  /** Publica conteúdo na plataforma */
  publish(payload: PublishPayload): Promise<PublishResult>;

  /** Verifica status de uma publicação anterior (polling) */
  checkStatus?(platformPostId: string): Promise<PublishResult>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Número máximo de tentativas de publicação */
export const MAX_PUBLISH_ATTEMPTS = 3;

/** Intervalo entre retries (ms) — backoff linear */
export const RETRY_DELAY_MS = 5_000;
