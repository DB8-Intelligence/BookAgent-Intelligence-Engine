/**
 * POLÍTICA FORMAL DE ASSET IMMUTABILITY — BookAgent Intelligence Engine
 *
 * Este arquivo é a fonte única de verdade (single source of truth) para
 * as regras de preservação de assets no sistema.
 *
 * TODOS os módulos que lidam com assets devem respeitar esta política.
 * Violações devem ser tratadas como erros de arquitetura.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  REGRA FUNDAMENTAL: Assets originais são IMUTÁVEIS.
 *  A IA analisa, classifica, correlaciona, prototipar e recompõe,
 *  mas NUNCA altera, retoca, reconstrói ou substitui o original.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Hierarquia de responsabilidades:
 *
 *   EXTRAIR    → asset-extraction (cria Asset com isOriginal: true)
 *   CLASSIFICAR → correlation, source-intelligence
 *   REFERENCIAR → media, blog, landing-page (usam assetId, não file)
 *   COMPOR      → render-export (CompositionSpec com layers separadas)
 *   DERIVAR     → render-export (gera DerivedOutput, novo arquivo)
 *
 * Em nenhum ponto desta cadeia o arquivo original é modificado.
 */

import type { Asset } from '../entities/asset.js';
import type { CompositionLayer } from '../entities/composition.js';
import { LayerType, AssetFitMode } from '../entities/composition.js';

// ---------------------------------------------------------------------------
// Policy definition
// ---------------------------------------------------------------------------

export const ASSET_IMMUTABILITY_POLICY = {
  version: '2.0.0',

  // --- O que é PROIBIDO fazer com assets originais ---
  prohibited: {
    /** Modificar os bytes do arquivo original */
    modifyOriginalFile: true,
    /** Sobrescrever o arquivo no storage */
    overwriteInStorage: true,
    /** Aplicar filtros, upscaling ou "melhorias" com IA generativa */
    applyAIEnhancement: true,
    /** Substituir o asset por uma versão gerada */
    replaceWithGenerated: true,
    /** Recortar destrutivamente (alterar dimensions do original) */
    destructiveCrop: true,
    /** Alterar cores, brilho, contraste do original */
    alterColorProfile: true,
    /** Remover elementos da imagem original */
    removeElements: true,
    /** Redimensionar o arquivo original */
    resizeOriginal: true,
  },

  // --- O que é PERMITIDO fazer ---
  allowed: {
    /** Extrair do PDF preservando qualidade original */
    extractFromSource: true,
    /** Renderizar página como novo asset (origin: PAGE_RENDER) */
    renderPageAsNewAsset: true,
    /** Classificar semanticamente (hero, lifestyle, planta...) */
    classifySemantically: true,
    /** Correlacionar com blocos de texto */
    correlateWithText: true,
    /** Referenciar por ID em planos e composições */
    referenceById: true,
    /** Compor em camada separada (overlay sobre, não dentro) */
    composeInSeparateLayer: true,
    /** Gerar thumbnail como arquivo separado */
    generateThumbnailCopy: true,
    /** Calcular hash para deduplicação */
    calculateHash: true,
    /** Ler metadados (dimensões, formato) */
    readMetadata: true,
    /** Posicionar em layout (fit: cover/contain, sem alterar) */
    positionInLayout: true,
  },

  // --- Regras de composição segura ---
  safeComposition: {
    /** Overlays de texto devem ser camadas TextOverlayLayer separadas */
    textMustBeSeparateLayer: true,
    /** Logo/branding devem ser BrandingOverlayLayer separadas */
    brandingMustBeSeparateLayer: true,
    /** Efeitos visuais (gradiente, vinheta) devem ser VisualEffectLayer */
    effectsMustBeSeparateLayer: true,
    /** O renderizador gera um DerivedOutput (novo arquivo) */
    outputMustBeDerived: true,
    /** O DerivedOutput deve listar sourceAssetIds para rastreamento */
    derivedMustTrackSources: true,
    /** Fit mode FILL (que distorce) é proibido com assets originais */
    fillModeProhibitedForOriginals: true,
  },

  principle:
    'O BookAgent é um sistema de INTELIGÊNCIA sobre o material, ' +
    'não de EDIÇÃO do material. As imagens são ativos do empreendimento ' +
    'e devem ser tratadas como referências imutáveis. ' +
    'Toda composição visual acontece em camadas separadas, ' +
    'gerando outputs derivados que referenciam — mas nunca alteram — os originais.',
} as const;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Valida que um asset está marcado como imutável.
 * Deve ser chamado antes de qualquer operação sobre assets.
 */
export function assertAssetImmutable(asset: Asset): void {
  if (!asset.isOriginal) {
    throw new Error(
      `[AssetImmutabilityViolation] Asset ${asset.id} não está marcado como original. ` +
      'Todos os assets extraídos devem ter isOriginal: true.',
    );
  }
}

/**
 * Valida que uma lista de camadas de composição respeita a política.
 * Retorna warnings para possíveis violações.
 */
export function validateCompositionLayers(layers: CompositionLayer[]): string[] {
  const warnings: string[] = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];

    // BaseAssetLayer não deve ter fit mode FILL
    if (
      layer.type === LayerType.BASE_ASSET &&
      layer.fitMode === AssetFitMode.FILL
    ) {
      warnings.push(
        `Layer ${i}: AssetFitMode.FILL é proibido para assets originais. ` +
        'Use COVER ou CONTAIN para preservar proporções.',
      );
    }

    // BaseAssetLayer deve ser a primeira camada (fundo)
    if (layer.type === LayerType.BASE_ASSET && i > 0) {
      // Permitido ter SolidBackground antes, mas não outros overlays
      const layersBefore = layers.slice(0, i);
      const hasNonBackground = layersBefore.some(
        l => l.type !== LayerType.SOLID_BACKGROUND,
      );
      if (hasNonBackground) {
        warnings.push(
          `Layer ${i}: BaseAssetLayer deve estar nas primeiras posições. ` +
          'Overlays devem ficar acima do asset.',
        );
      }
    }
  }

  return warnings;
}

/**
 * Verifica se uma operação proposta viola a política de imutabilidade.
 * Retorna true se a operação é SEGURA.
 */
export function isOperationSafe(operation: AssetOperation): boolean {
  const safe = SAFE_OPERATIONS;
  return safe.has(operation);
}

/** Operações que podem ser feitas sobre um asset */
export type AssetOperation =
  | 'read'
  | 'classify'
  | 'correlate'
  | 'reference'
  | 'compose-layer'
  | 'thumbnail'
  | 'hash'
  | 'metadata'
  | 'position'
  // --- Proibidas ---
  | 'modify'
  | 'overwrite'
  | 'enhance'
  | 'replace'
  | 'crop'
  | 'resize'
  | 'recolor'
  | 'remove-elements';

const SAFE_OPERATIONS = new Set<AssetOperation>([
  'read',
  'classify',
  'correlate',
  'reference',
  'compose-layer',
  'thumbnail',
  'hash',
  'metadata',
  'position',
]);

const PROHIBITED_OPERATIONS = new Set<AssetOperation>([
  'modify',
  'overwrite',
  'enhance',
  'replace',
  'crop',
  'resize',
  'recolor',
  'remove-elements',
]);

/**
 * Valida uma operação e lança erro se for proibida.
 */
export function assertOperationAllowed(operation: AssetOperation, assetId: string): void {
  if (PROHIBITED_OPERATIONS.has(operation)) {
    throw new Error(
      `[AssetImmutabilityViolation] Operação "${operation}" é PROIBIDA para asset ${assetId}. ` +
      'Assets originais são imutáveis. Use composição em camada separada.',
    );
  }
}

/**
 * Extrai todos os asset IDs referenciados em uma lista de layers.
 * Útil para rastreamento de dependências em DerivedOutput.
 */
export function extractReferencedAssetIds(layers: CompositionLayer[]): string[] {
  const ids: string[] = [];
  for (const layer of layers) {
    if (layer.type === LayerType.BASE_ASSET) {
      ids.push(layer.assetId);
    }
  }
  return ids;
}
