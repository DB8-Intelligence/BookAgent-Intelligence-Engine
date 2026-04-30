/**
 * Visual Fidelity — Domain Types
 *
 * Contratos do sistema de preservação de fidelidade visual do BookAgent/BookReel.
 * Reforçam rastreabilidade, proporção preservada e composição segura.
 *
 * Princípio orientador (ver docs/VISUAL_FIDELITY_PRINCIPLES.md):
 *   "Cada pixel no output deve ser rastreável até um asset extraído do
 *    material original do empreendimento."
 *
 * Este arquivo NÃO duplica tipos existentes — apenas adiciona contratos que
 * faltavam na camada de domínio para tornar o princípio verificável.
 * Os tipos existentes referenciados:
 *   - `Asset`            em `./asset.ts`
 *   - `AssetOrigin`      em `../value-objects/index.ts`
 *   - `Dimensions`       em `../value-objects/index.ts`
 */

import type { Asset } from './asset.js';
import type { AssetOrigin, Dimensions } from '../value-objects/index.js';

// ============================================================================
// Conjuntos canônicos de AssetOrigin permitidos
// ============================================================================

/**
 * Origens de asset aceitas no pipeline visual. Qualquer outro valor é
 * tratado como sintético/inválido pelo validator.
 *
 * Valores derivados de `AssetOrigin` em value-objects (fonte de verdade
 * do enum). Se novos origins forem introduzidos no enum, esta lista deve
 * ser reavaliada manualmente — essa fricção é proposital.
 */
export const ALLOWED_ASSET_ORIGINS: readonly AssetOrigin[] = [
  'pdf-extracted' as AssetOrigin,
  'page-render' as AssetOrigin,
  'video-frame' as AssetOrigin,
  'pptx-slide' as AssetOrigin,
  'uploaded' as AssetOrigin,
] as const;

// ============================================================================
// SourceDocument + DocumentPage
// ============================================================================

/**
 * Representa o documento-fonte (PDF ou folder equivalente) como unidade
 * rastreável. Um job do BookAgent visual processa exatamente um
 * SourceDocument. Serve como root da árvore de rastreabilidade.
 *
 * Não é persistido como tabela dedicada em v1 — é uma projeção em memória
 * construída a partir de `ProcessingContext.assets` + `bookCompatibility`
 * + metadados do job. Materialização futura fica como evolução.
 */
export interface SourceDocument {
  readonly jobId: string;
  readonly documentType: 'pdf' | 'folder' | 'pptx' | 'images';
  /** Número total de páginas conforme detectado na extração. */
  readonly totalPages: number;
  readonly pages: readonly DocumentPage[];
  /** Hash agregado (opcional) para deduplicação de jobs idênticos. */
  readonly contentHash?: string;
}

/**
 * Página do documento, com seus assets e blocos de texto associados.
 *
 * `pageRenderAssetId` aponta para o asset gerado por `extractPageFormats`
 * (o PNG 300dpi da página inteira), quando disponível.
 * `embeddedAssetIds` lista assets extraídos do stream nativo da página.
 * `textBlockIds` lista IDs de blocos textuais (correspondência com
 * TextBlock do correlation module — alias semântico `PageTextBlock`).
 */
export interface DocumentPage {
  readonly pageNumber: number;
  readonly dimensions: Dimensions | null;
  readonly pageRenderAssetId: string | null;
  readonly embeddedAssetIds: readonly string[];
  readonly textBlockIds: readonly string[];
}

// ============================================================================
// Aliases semânticos (não duplicam — apenas nomeiam com a terminologia do
// domínio visual-fidelity)
// ============================================================================

/**
 * Alias semântico de `Asset` quando visto da perspectiva da página.
 * Usado apenas em assinaturas que querem enfatizar o contexto "este
 * asset pertence a esta página do documento".
 */
export type PageAsset = Asset;

/**
 * Alias semântico de um bloco textual de página. Aponta para o shape
 * canônico definido em `src/modules/correlation/text-block-parser.ts`
 * sem importá-lo aqui — evita acoplamento de domain → module.
 */
export interface PageTextBlock {
  readonly id: string;
  readonly page: number;
  readonly text: string;
  readonly role: 'headline' | 'bullet_list' | 'cta' | 'caption' | 'paragraph';
}

/**
 * Correlação asset ↔ texto (alias semântico de `CorrelationBlock` sob a
 * lente do visual fidelity). Mantém apenas o que o validator precisa
 * saber para validar a regra da seção 5 do documento normativo.
 */
export interface AssetTextCorrelation {
  readonly id: string;
  readonly page: number;
  readonly assetIds: readonly string[];
  readonly textBlockIds: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low' | 'inferred';
}

// ============================================================================
// Transformações permitidas / proibidas
// ============================================================================

/**
 * Enum fechado de transformações permitidas. A lista espelha a seção 1
 * do documento normativo. Expandir esta lista é uma decisão arquitetural.
 */
export type AllowedTransform =
  | 'scale_uniform_decrease'
  | 'pad_letterbox'
  | 'centered_crop_small'
  | 'lossless_recompression'
  | 'text_overlay_layer'
  | 'logo_overlay_layer'
  | 'transition_between_clips'
  | 'ken_burns_uniform_zoom'
  | 'conservative_color_grading';

/**
 * Enum fechado de transformações proibidas. Usado em logs de auditoria
 * quando uma violação é detectada.
 */
export type ForbiddenTransform =
  | 'synthetic_image_generation'
  | 'inpainting_outpainting'
  | 'background_replacement'
  | 'super_resolution'
  | 'non_uniform_scale'
  | 'aggressive_crop'
  | 'destructive_overlay'
  | 'double_lossy_reencoding'
  | 'synthetic_placeholder_substitution'
  | 'hq_thumbnail_as_primary';

// ============================================================================
// Render Transform Manifest
// ============================================================================

/**
 * Origem declarada de cada textOverlay. Obriga o exporter/composer a
 * justificar de onde o texto veio, cumprindo a regra da seção 5.
 */
export interface TextOverlayProvenance {
  /** Índice do overlay no array `scene.textOverlays[]`. */
  readonly overlayIndex: number;
  readonly origin: 'extracted' | 'narrative' | 'branding';
  /** Presente quando origin === 'extracted' ou 'narrative'. */
  readonly correlationBlockId?: string;
  /** Presente quando origin === 'narrative'. */
  readonly sourceId?: string;
}

/**
 * Declaração pré-render de como uma cena vai transformar um asset.
 * Puro metadado — não executa nada. É o contrato que o validator lê.
 *
 * Uma cena pode ter múltiplos manifests quando usa múltiplos assets
 * (layouts GRID, SPLIT). Nesse caso, um manifest por assetId.
 */
export interface RenderTransformManifest {
  readonly sceneId: string;
  readonly sceneOrder: number;
  readonly assetId: string;
  /** Estratégia de fit escolhida. Determinística. */
  readonly fit: 'letterbox' | 'centered-crop' | 'pad';
  /** Razão máxima de crop por eixo (0.0 — 0.15). Acima disso, é violação. */
  readonly maxCropRatio: number;
  /**
   * Nesta versão, SEMPRE true. Qualquer manifest com `false` é violação
   * automática. O valor é readonly `true` para catch em tempo de tipo.
   */
  readonly preservesAspectRatio: true;
  readonly allowedTransforms: readonly AllowedTransform[];
  readonly textOverlayOrigin: readonly TextOverlayProvenance[];
  /** SEMPRE true. Catch em tempo de tipo. */
  readonly baseAssetReadOnly: true;
}

// ============================================================================
// Fidelity Report
// ============================================================================

export type FidelityRule =
  | 'missing_asset'
  | 'non_original_asset'
  | 'forbidden_origin'
  | 'empty_asset_ids'
  | 'aspect_mismatch'
  | 'overlay_without_layer'
  | 'broken_traceability'
  | 'manifest_violation';

export interface FidelityViolation {
  readonly rule: FidelityRule;
  readonly severity: 'error' | 'warning';
  readonly sceneOrder?: number;
  readonly assetId?: string;
  readonly message: string;
}

export interface FidelityReport {
  readonly passed: boolean;
  readonly violations: readonly FidelityViolation[];
  readonly warnings: readonly FidelityViolation[];
  readonly checkedScenes: number;
  readonly checkedAssets: number;
}
