/**
 * Entity: Template Marketplace / Configurable Styles
 *
 * Três camadas visuais distintas no BookAgent:
 *
 *   TEMPLATE (estrutural):
 *     Define a ESTRUTURA do output — layout de cenas, posicionamento de
 *     elementos, sequência visual. Ex: "hero-showcase-cta" (3 cenas),
 *     "story-walkthrough" (5 cenas com tour). Análogo a um "wireframe".
 *
 *   PRESET (comportamental):
 *     Define o RITMO e MOVIMENTO — duração de cenas, transições, Ken Burns,
 *     velocidade. Já implementado (luxury, corporate, fast-sales).
 *     Análogo ao "timing" de uma animação.
 *
 *   STYLE PROFILE (visual/branding):
 *     Define a APARÊNCIA — paleta de cores, tipografia, tratamento de imagem,
 *     estilo de overlays, mood visual. Análogo ao "skin" ou "theme".
 *
 * Combinação: Template + Preset + Style = Output visual final
 *   Ex: "hero-showcase-cta" + "luxury" + "dark-gold" = reel luxury de 3 cenas
 *
 * Catálogo: organizado em Collections para curadoria e descoberta.
 * Disponibilidade: controlada por plano e tenant.
 *
 * Persistência: bookagent_template_preferences (per-tenant overrides)
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

import type { PlanTier } from '../../plans/plan-config.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Camada visual do item */
export enum VisualLayerType {
  TEMPLATE = 'template',
  PRESET = 'preset',
  STYLE = 'style',
}

/** Status do item no catálogo */
export enum CatalogItemStatus {
  ACTIVE = 'active',
  BETA = 'beta',
  DEPRECATED = 'deprecated',
  DISABLED = 'disabled',
}

/** Tier de acesso */
export enum CatalogTier {
  FREE = 'free',
  PRO = 'pro',
  BUSINESS = 'agency',
  PREMIUM = 'premium',
}

/** Categoria de output para matching */
export enum OutputCategory {
  REEL = 'reel',
  VIDEO_SHORT = 'video_short',
  VIDEO_LONG = 'video_long',
  STORY = 'story',
  CAROUSEL = 'carousel',
  POST = 'post',
  THUMBNAIL = 'thumbnail',
  BLOG = 'blog',
}

// ---------------------------------------------------------------------------
// Template (structural)
// ---------------------------------------------------------------------------

/**
 * Template estrutural — define layout e sequência de cenas.
 */
export interface TemplateCatalogItem {
  /** ID único */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Camada visual */
  layer: VisualLayerType.TEMPLATE;
  /** Status */
  status: CatalogItemStatus;
  /** Tier mínimo para acesso */
  tier: CatalogTier;
  /** Categorias de output compatíveis */
  outputCategories: OutputCategory[];
  /** Número de cenas/slides */
  sceneCount: number;
  /** Roles das cenas (hook, showcase, cta, etc.) */
  sceneRoles: string[];
  /** Presets compatíveis (IDs) */
  compatiblePresets: string[];
  /** Styles recomendados (IDs) */
  recommendedStyles: string[];
  /** Tags para busca */
  tags: string[];
  /** Preview URL (se disponível) */
  previewUrl?: string;
  /** Collection ID */
  collectionId?: string;
}

// ---------------------------------------------------------------------------
// Style Profile (visual/branding)
// ---------------------------------------------------------------------------

/**
 * Style profile — define aparência e branding visual.
 */
export interface StyleProfile {
  /** ID único */
  id: string;
  /** Nome legível */
  name: string;
  /** Descrição */
  description: string;
  /** Status */
  status: CatalogItemStatus;
  /** Tier mínimo */
  tier: CatalogTier;
  /** Paleta de cores */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  /** Estilo de texto (mapeia para TextStyle do preset engine) */
  textStyle: string;
  /** Estilo de overlay (gradient, solid, transparent) */
  overlayStyle: 'gradient' | 'solid' | 'transparent' | 'blur';
  /** Opacidade do overlay (0-1) */
  overlayOpacity: number;
  /** Mood visual (conecta com MusicMood para consistência) */
  mood: string;
  /** Cantos arredondados (para thumbnails e elements) */
  borderRadius: number;
  /** Tags */
  tags: string[];
  /** Categorias de output compatíveis */
  outputCategories: OutputCategory[];
  /** Preview URL */
  previewUrl?: string;
  /** Collection ID */
  collectionId?: string;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Coleção — agrupa templates, presets e styles por tema.
 */
export interface TemplateCollection {
  /** ID */
  id: string;
  /** Nome */
  name: string;
  /** Descrição */
  description: string;
  /** Tier mínimo */
  tier: CatalogTier;
  /** IDs dos itens (templates + styles) */
  itemIds: string[];
  /** Imagem de capa */
  coverUrl?: string;
  /** Tags */
  tags: string[];
  /** Status */
  status: CatalogItemStatus;
  /** Ordem de exibição */
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * Disponibilidade de um item para um tenant/plano.
 */
export interface TemplateAvailability {
  itemId: string;
  layer: VisualLayerType;
  available: boolean;
  reason?: string;
  requiredTier: CatalogTier;
  currentTier: string;
}

// ---------------------------------------------------------------------------
// Tenant Style Preference
// ---------------------------------------------------------------------------

/**
 * Preferência de estilo do tenant — override do default.
 * Persistido em bookagent_template_preferences.
 */
export interface TenantStylePreference {
  tenantId: string;
  /** Template preferido por categoria de output */
  preferredTemplates: Record<string, string>;
  /** Preset preferido */
  preferredPreset: string | null;
  /** Style profile preferido */
  preferredStyle: string | null;
  /** Templates desabilitados pelo tenant */
  disabledTemplates: string[];
  /** Favoritos */
  favorites: string[];
  /** Última atualização */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Catalog Entry (unified view)
// ---------------------------------------------------------------------------

/**
 * Entrada unificada do catálogo — para listagem e busca.
 */
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  layer: VisualLayerType;
  status: CatalogItemStatus;
  tier: CatalogTier;
  outputCategories: OutputCategory[];
  tags: string[];
  previewUrl?: string;
  collectionId?: string;
  /** Compatibilidades */
  compatibleWith?: string[];
}

// ---------------------------------------------------------------------------
// Template Config (pipeline input)
// ---------------------------------------------------------------------------

/**
 * Configuração visual selecionada para o pipeline.
 * Resultado da resolução template + preset + style.
 */
export interface ResolvedVisualConfig {
  templateId: string;
  presetId: string;
  styleId: string;
  /** Cena count do template */
  sceneCount: number;
  /** Cores resolvidas (style override de branding) */
  colors: StyleProfile['colors'];
  /** Overlay style */
  overlayStyle: StyleProfile['overlayStyle'];
  /** Overlay opacity */
  overlayOpacity: number;
  /** Text style */
  textStyle: string;
  /** Mood */
  mood: string;
}
