/**
 * Entity: CompositionSpec / CompositionLayer / OverlayInstruction
 *
 * Modelo formal de composição segura (Safe Composition).
 *
 * PRINCÍPIO CENTRAL:
 * O asset original NUNCA é modificado. Toda composição visual acontece
 * em camadas separadas que REFERENCIAM o asset, sem alterá-lo.
 *
 * Estrutura de composição:
 *
 *   ┌─────────────────────────────┐
 *   │  Layer 3: Branding Overlay  │  ← logo, watermark, assinatura
 *   │  Layer 2: Text Overlay      │  ← headline, body, CTA
 *   │  Layer 1: Visual Effect     │  ← gradiente, vinheta, blur de fundo
 *   │  Layer 0: Base Asset (READ) │  ← asset original INTACTO
 *   └─────────────────────────────┘
 *
 * O renderizador lê o asset original e aplica as camadas POR CIMA,
 * gerando um arquivo DERIVADO separado. O original permanece intacto.
 *
 * @see ASSET_PRESERVATION_POLICY em book-compatibility.ts
 * @see Asset (readonly, isOriginal: true) em asset.ts
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de camada de composição */
export enum LayerType {
  /** Asset original (base, somente leitura) */
  BASE_ASSET = 'base-asset',

  /** Cor sólida ou gradiente como fundo */
  SOLID_BACKGROUND = 'solid-background',

  /** Efeito visual sobre o asset (gradiente overlay, vinheta) */
  VISUAL_EFFECT = 'visual-effect',

  /** Texto (headline, body, caption) */
  TEXT_OVERLAY = 'text-overlay',

  /** Logo ou marca */
  BRANDING_OVERLAY = 'branding-overlay',

  /** Ícone ou elemento decorativo */
  DECORATIVE = 'decorative',

  /** Moldura ou borda */
  FRAME = 'frame',
}

/** Tipo de efeito visual (aplicado em camada separada, NUNCA no original) */
export enum VisualEffectType {
  /** Gradiente escuro para legibilidade de texto sobre imagem */
  GRADIENT_SCRIM = 'gradient-scrim',

  /** Vinheta nas bordas */
  VIGNETTE = 'vignette',

  /** Desfoque de fundo (para destaque de texto) */
  BACKGROUND_BLUR = 'background-blur',

  /** Opacidade reduzida (asset como fundo suave) */
  OPACITY_REDUCE = 'opacity-reduce',

  /** Nenhum efeito — asset exibido como está */
  NONE = 'none',
}

/** Posição de ancoragem para camadas */
export enum AnchorPosition {
  TOP_LEFT = 'top-left',
  TOP_CENTER = 'top-center',
  TOP_RIGHT = 'top-right',
  MIDDLE_LEFT = 'middle-left',
  CENTER = 'center',
  MIDDLE_RIGHT = 'middle-right',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_CENTER = 'bottom-center',
  BOTTOM_RIGHT = 'bottom-right',
}

/** Modo de fit do asset na área de composição */
export enum AssetFitMode {
  /** Preenche toda a área (pode cortar bordas) */
  COVER = 'cover',

  /** Cabe dentro da área (pode ter margens) */
  CONTAIN = 'contain',

  /** Estica para preencher (distorce) — NUNCA USAR com assets originais */
  FILL = 'fill',

  /** Tamanho original, centralizado */
  ORIGINAL = 'original',
}

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------

/** Camada base: referência ao asset original (somente leitura) */
export interface BaseAssetLayer {
  type: LayerType.BASE_ASSET;

  /** ID do asset original referenciado */
  assetId: string;

  /** Como o asset deve ser posicionado na composição */
  fitMode: AssetFitMode;

  /** Opacidade (0-1). 1 = totalmente visível */
  opacity: number;
}

/** Camada de fundo sólido (quando não há asset) */
export interface SolidBackgroundLayer {
  type: LayerType.SOLID_BACKGROUND;

  /** Cor de fundo (hex) */
  color: string;

  /** Gradiente opcional (ex: 'linear-gradient(180deg, #000 0%, #333 100%)') */
  gradient?: string;
}

/** Camada de efeito visual */
export interface VisualEffectLayer {
  type: LayerType.VISUAL_EFFECT;

  /** Tipo de efeito */
  effect: VisualEffectType;

  /** Intensidade do efeito (0-1) */
  intensity: number;

  /** Direção do gradiente (graus, para GRADIENT_SCRIM) */
  direction?: number;

  /** Cor do efeito (para GRADIENT_SCRIM) */
  color?: string;
}

/** Camada de texto */
export interface TextOverlayLayer {
  type: LayerType.TEXT_OVERLAY;

  /** Texto a exibir */
  text: string;

  /** Papel do texto (headline, body, cta, caption) */
  role: 'headline' | 'subheadline' | 'body' | 'cta' | 'caption';

  /** Posição de ancoragem */
  anchor: AnchorPosition;

  /** Tamanho relativo do texto (em relação à composição) */
  fontSize: 'large' | 'medium' | 'small' | 'tiny';

  /** Cor do texto (hex) */
  color: string;

  /** Alinhamento */
  align: 'left' | 'center' | 'right';

  /** Margem em % da largura da composição */
  marginPercent?: number;
}

/** Camada de branding (logo, watermark) */
export interface BrandingOverlayLayer {
  type: LayerType.BRANDING_OVERLAY;

  /** URL ou path do logo */
  logoUrl: string;

  /** Posição do logo */
  anchor: AnchorPosition;

  /** Tamanho relativo do logo (% da largura da composição) */
  sizePercent: number;

  /** Opacidade do logo (0-1) */
  opacity: number;
}

/** Camada decorativa (ícone, separador, moldura) */
export interface DecorativeLayer {
  type: LayerType.DECORATIVE | LayerType.FRAME;

  /** Instrução de renderização (interpretada pelo renderizador) */
  instruction: string;

  /** Cor principal */
  color: string;

  /** Opacidade (0-1) */
  opacity: number;
}

/** Union de todas as camadas possíveis */
export type CompositionLayer =
  | BaseAssetLayer
  | SolidBackgroundLayer
  | VisualEffectLayer
  | TextOverlayLayer
  | BrandingOverlayLayer
  | DecorativeLayer;

// ---------------------------------------------------------------------------
// Composition Spec (a spec completa de uma composição)
// ---------------------------------------------------------------------------

/**
 * CompositionSpec — especificação completa de uma composição visual.
 *
 * Define todas as camadas que compõem um frame/slide/cena,
 * sempre preservando os assets originais intactos.
 *
 * O renderizador recebe esta spec e gera um arquivo DERIVADO.
 * O asset original referenciado em BaseAssetLayer NUNCA é alterado.
 */
export interface CompositionSpec {
  /** ID único da composição */
  id: string;

  /** Dimensões do output (pixels) */
  width: number;
  height: number;

  /** Camadas ordenadas do fundo para a frente (index 0 = fundo) */
  layers: CompositionLayer[];

  /** IDs de todos os assets ORIGINAIS referenciados (para rastreamento) */
  referencedAssetIds: string[];

  /** Metadados opcionais */
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Derived Output (resultado da composição)
// ---------------------------------------------------------------------------

/**
 * DerivedOutput — arquivo gerado a partir de uma CompositionSpec.
 *
 * Este é o resultado da renderização. É um arquivo NOVO, separado
 * do asset original. O original permanece intacto no storage.
 */
export interface DerivedOutput {
  /** ID único do output derivado */
  id: string;

  /** ID da CompositionSpec que gerou este output */
  compositionId: string;

  /** Caminho do arquivo derivado no storage */
  filePath: string;

  /** Formato do output (png, jpg, mp4, webm) */
  format: string;

  /** Dimensões */
  width: number;
  height: number;

  /** Tamanho em bytes */
  sizeBytes: number;

  /** IDs dos assets originais usados (REFERENCIADOS, não modificados) */
  sourceAssetIds: string[];

  /**
   * Flag que indica que este é um output DERIVADO, não original.
   * Sempre false — o oposto de Asset.isOriginal.
   */
  readonly isOriginal: false;
}
