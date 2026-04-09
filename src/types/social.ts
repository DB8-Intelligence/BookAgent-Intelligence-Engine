/**
 * Social Publishing Types — BookAgent Intelligence Engine
 *
 * Tipos para a camada de publicação social (Parte 51).
 * Suporta Instagram Graph API e Facebook Graph API na V1.
 *
 * Plataformas V1: instagram, facebook
 * Plataformas futuras: linkedin, twitter/x, youtube
 */

// ============================================================================
// Platforms
// ============================================================================

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter';

export const SUPPORTED_PLATFORMS_V1: SocialPlatform[] = ['instagram', 'facebook'];

// ============================================================================
// Content types
// ============================================================================

/**
 * Tipo de post por plataforma.
 * V1 suporta apenas IMAGE_POST e TEXT_POST.
 */
export type SocialPostType =
  | 'image_post'    // Imagem única + legenda (Instagram + Facebook)
  | 'text_post'     // Apenas texto (Facebook)
  | 'carousel'      // Múltiplas imagens (futuro)
  | 'reel'          // Vídeo curto (futuro)
  | 'video_post';   // Vídeo longo (futuro)

// ============================================================================
// Credentials
// ============================================================================

/**
 * Credenciais Meta (Instagram + Facebook).
 * O accessToken deve ter os escopos:
 *   - instagram_basic
 *   - instagram_content_publish
 *   - pages_manage_posts
 *   - pages_read_engagement
 */
export interface MetaCredentials {
  /** Meta User Access Token ou Page Access Token */
  accessToken: string;
  /** Instagram Business Account ID (ex: "17841234567890") */
  instagramAccountId?: string;
  /** Facebook Page ID (ex: "123456789012345") */
  facebookPageId?: string;
}

// ============================================================================
// Social Content
// ============================================================================

/** Conteúdo extraído dos artifacts para publicação */
export interface SocialContent {
  /** Texto principal do post (caption/legenda) */
  caption: string;
  /** Hashtags sem '#' (o formatador adiciona o '#') */
  hashtags?: string[];
  /**
   * URL pública acessível da imagem.
   * Obrigatório para Instagram.
   * Opcional para Facebook (usado no endpoint /photos se disponível).
   */
  imageUrl?: string;
  /**
   * URL pública acessível do vídeo.
   * Usado para Reels no Instagram e vídeos no Facebook.
   */
  videoUrl?: string;
  /**
   * URL do thumbnail/cover para vídeos.
   */
  coverUrl?: string;
  /**
   * Link opcional para incluir no post do Facebook.
   * Geralmente o link do dashboard ou landing page do job.
   */
  linkUrl?: string;
}

// ============================================================================
// Publish Options
// ============================================================================

export interface SocialPublishOptions {
  jobId: string;
  userId: string;
  platforms: SocialPlatform[];
  content: SocialContent;
  credentials: MetaCredentials;
}

// ============================================================================
// Results
// ============================================================================

/** Resultado de publicação para uma plataforma específica */
export interface PlatformPublishResult {
  platform: SocialPlatform;
  success: boolean;
  /** ID do post retornado pela plataforma */
  postId?: string;
  /** URL pública do post (quando disponível) */
  postUrl?: string;
  /** Mensagem de erro (quando success=false e skipped=false) */
  error?: string;
  /** true quando a plataforma foi ignorada intencionalmente */
  skipped?: boolean;
  /** Razão para ter sido ignorado */
  skipReason?: string;
  /** Payload enviado à API (para diagnóstico) */
  payload?: Record<string, unknown>;
  /** Resposta bruta da API (para diagnóstico) */
  responseData?: Record<string, unknown>;
}

/** Resultado agregado de uma tentativa de publicação para múltiplas plataformas */
export interface SocialPublishResult {
  jobId: string;
  results: PlatformPublishResult[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
  /** Status consolidado do job após publicação */
  finalStatus: 'published' | 'publish_failed' | 'partial';
}

// ============================================================================
// API Request/Response
// ============================================================================

/** POST /api/v1/jobs/:jobId/social-publish */
export interface SocialPublishRequest {
  userId: string;
  platforms?: SocialPlatform[];
  /** Caption do post. Se omitido, carregado dos artifacts do job. */
  caption?: string;
  hashtags?: string[];
  /** URL pública da imagem. Necessário para Instagram. */
  imageUrl?: string;
  /** Link externo para o post do Facebook. */
  linkUrl?: string;
  /**
   * Meta access token.
   * Se omitido, usa process.env.META_ACCESS_TOKEN.
   */
  accessToken?: string;
  /**
   * Instagram Business Account ID.
   * Se omitido, usa process.env.META_INSTAGRAM_ACCOUNT_ID.
   */
  instagramAccountId?: string;
  /**
   * Facebook Page ID.
   * Se omitido, usa process.env.META_FACEBOOK_PAGE_ID.
   */
  facebookPageId?: string;
}

// ============================================================================
// Artifact social metadata shape (from media-metadata artifact)
// ============================================================================

/** Estrutura do conteúdo de um artifact do tipo 'media-metadata' */
export interface MediaMetadataContent {
  title?: string;
  caption?: string;
  hashtags?: string[];
  format?: string;
  aspectRatio?: string;
  platforms?: SocialPlatform[];
}
