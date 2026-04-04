/**
 * Entity: BookPrototype / PageArchetype / LayoutPattern
 *
 * Modelo estrutural abstrato do design editorial do book.
 * Representa a lógica de composição visual sem modificar os assets.
 *
 * O BookPrototype captura:
 * - Quais tipos de página existem (hero, lifestyle, técnica, CTA)
 * - Quais padrões de layout se repetem
 * - Como os elementos se organizam (zonas de conteúdo)
 * - Qual a hierarquia visual dominante
 *
 * IMPORTANTE: Este modelo é analítico e estrutural.
 * NÃO é uma cópia pixel-perfect do design original.
 * NÃO modifica nem substitui os assets do book.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Arquétipo de página (classificação semântica) */
export enum PageArchetypeType {
  /** Página de impacto visual — hero/capa com imagem full-bleed */
  HERO = 'hero',

  /** Página de lifestyle — lazer, ambientes, experiência de vida */
  LIFESTYLE = 'lifestyle',

  /** Página técnica — plantas, metragens, especificações */
  TECHNICAL = 'technical',

  /** Página de comparação — tabela, diferenciais, benchmarks */
  COMPARISON = 'comparison',

  /** Página de localização — mapa, entorno, acessos */
  LOCATION = 'location',

  /** Página de masterplan — implantação, planta do empreendimento */
  MASTERPLAN = 'masterplan',

  /** Página institucional — construtora, história, credenciais */
  INSTITUTIONAL = 'institutional',

  /** Página de CTA — contato, plantão, formulário */
  CTA = 'cta',

  /** Página de galeria — múltiplas imagens, grid visual */
  GALLERY = 'gallery',

  /** Página de investimento — valores, condições, financiamento */
  INVESTMENT = 'investment',

  /** Página de transição — divisória, separação de seções */
  TRANSITION = 'transition',

  /** Tipo não classificado */
  UNKNOWN = 'unknown',
}

/** Tipo de zona de conteúdo dentro de uma página */
export enum ContentZoneType {
  /** Imagem principal (hero, fundo, destaque) */
  PRIMARY_IMAGE = 'primary-image',

  /** Headline / título principal */
  HEADLINE = 'headline',

  /** Subtítulo ou tagline */
  SUBHEADLINE = 'subheadline',

  /** Bloco de texto corrido (copy principal) */
  BODY_TEXT = 'body-text',

  /** Lista de bullet points / features */
  FEATURE_LIST = 'feature-list',

  /** Imagem secundária / complementar */
  SECONDARY_IMAGE = 'secondary-image',

  /** Logo ou marca */
  LOGO = 'logo',

  /** CTA (botão, texto de ação) */
  CTA_BLOCK = 'cta-block',

  /** Dado numérico / destaque de número */
  NUMERIC_HIGHLIGHT = 'numeric-highlight',

  /** Ícone / ilustração vetorial */
  ICON = 'icon',

  /** Planta / desenho técnico */
  FLOOR_PLAN = 'floor-plan',

  /** Mapa / localização */
  MAP = 'map',

  /** Espaço negativo / margem intencional */
  WHITESPACE = 'whitespace',

  /** Faixa / barra decorativa */
  DECORATIVE_BAND = 'decorative-band',
}

/** Posição relativa na página (grid 3x3) */
export enum ZonePosition {
  TOP_LEFT = 'top-left',
  TOP_CENTER = 'top-center',
  TOP_RIGHT = 'top-right',
  MIDDLE_LEFT = 'middle-left',
  MIDDLE_CENTER = 'middle-center',
  MIDDLE_RIGHT = 'middle-right',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_CENTER = 'bottom-center',
  BOTTOM_RIGHT = 'bottom-right',
  FULL_PAGE = 'full-page',
  TOP_HALF = 'top-half',
  BOTTOM_HALF = 'bottom-half',
  LEFT_HALF = 'left-half',
  RIGHT_HALF = 'right-half',
}

/** Padrão de composição visual */
export enum CompositionPattern {
  /** Imagem full-bleed + texto overlay */
  FULL_BLEED_OVERLAY = 'full-bleed-overlay',

  /** Split horizontal: imagem esquerda + texto direita (ou vice-versa) */
  SPLIT_HORIZONTAL = 'split-horizontal',

  /** Split vertical: imagem topo + texto embaixo (ou vice-versa) */
  SPLIT_VERTICAL = 'split-vertical',

  /** Grid de múltiplas imagens */
  GRID = 'grid',

  /** Texto centralizado com fundo sólido/gradiente */
  TEXT_CENTERED = 'text-centered',

  /** Coluna única de conteúdo (tipo editorial) */
  SINGLE_COLUMN = 'single-column',

  /** Duas colunas lado a lado */
  TWO_COLUMN = 'two-column',

  /** Card / bloco destacado com borda ou fundo */
  CARD_BLOCK = 'card-block',

  /** Fundo com inset (imagem menor dentro de fundo maior) */
  INSET = 'inset',

  /** Página minimalista com pouco conteúdo */
  MINIMAL = 'minimal',
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Zona de conteúdo identificada em uma página */
export interface ContentZone {
  /** Tipo de conteúdo nesta zona */
  type: ContentZoneType;

  /** Posição relativa na página */
  position: ZonePosition;

  /** Proporção da área da página ocupada (0-1) */
  areaRatio: number;

  /** Se contém asset (imagem) referenciado */
  hasAsset: boolean;

  /** Se contém texto */
  hasText: boolean;

  /** Resumo do conteúdo (primeiros ~50 chars) */
  contentPreview?: string;
}

/** Arquétipo de uma página individual */
export interface PageArchetype {
  /** Número da página no PDF */
  pageNumber: number;

  /** Tipo de arquétipo classificado */
  archetypeType: PageArchetypeType;

  /** Score de confiança da classificação (0-1) */
  confidence: number;

  /** Padrão de composição visual detectado */
  compositionPattern: CompositionPattern;

  /** Zonas de conteúdo identificadas */
  contentZones: ContentZone[];

  /** IDs dos assets presentes nesta página */
  assetIds: string[];

  /** Proporção texto/imagem estimada (0=só imagem, 1=só texto) */
  textImageRatio: number;

  /** Se a página usa imagem como fundo */
  hasFullBleedImage: boolean;

  /** Hierarquia visual dominante (quais elementos têm mais peso) */
  visualHierarchy: ContentZoneType[];
}

/** Padrão de layout recorrente entre páginas */
export interface LayoutPattern {
  /** ID do padrão */
  id: string;

  /** Nome descritivo do padrão */
  name: string;

  /** Padrão de composição */
  compositionPattern: CompositionPattern;

  /** Zonas típicas deste padrão */
  typicalZones: ContentZoneType[];

  /** Número de páginas que usam este padrão */
  frequency: number;

  /** Páginas que usam este padrão */
  pageNumbers: number[];

  /** Arquétipos típicos que usam este padrão */
  typicalArchetypes: PageArchetypeType[];
}

/** Hierarquia de design do book */
export interface DesignHierarchy {
  /** Elementos mais proeminentes (ordenados por importância) */
  primaryElements: ContentZoneType[];

  /** Se o book é image-first (imagens dominam) ou text-first */
  dominantMode: 'image-first' | 'text-first' | 'balanced';

  /** Estilo de headline (curto/longo, uppercase/mixed) */
  headlineStyle: 'short-impact' | 'descriptive' | 'mixed';

  /** Se usa espaço negativo como recurso de design */
  usesWhitespace: boolean;

  /** Se as páginas seguem uma progressão narrativa */
  hasNarrativeFlow: boolean;
}

/** Protótipo completo do book */
export interface BookPrototype {
  /** ID único do protótipo */
  id: string;

  /** Total de páginas analisadas */
  pageCount: number;

  /** Arquétipos de cada página */
  pageArchetypes: PageArchetype[];

  /** Padrões de layout recorrentes */
  layoutPatterns: LayoutPattern[];

  /** Hierarquia de design detectada */
  designHierarchy: DesignHierarchy;

  /** Distribuição de tipos de página */
  archetypeDistribution: Record<string, number>;

  /** Score geral de consistência visual (0-1) */
  consistencyScore: number;

  /** Tempo de análise em ms */
  analysisTimeMs: number;
}
