/**
 * Entity: BookCompatibilityProfile
 *
 * Resultado da análise de compatibilidade de um book (PDF).
 * Determina a estrutura interna do arquivo e recomenda a melhor
 * estratégia de extração de assets.
 *
 * Este módulo opera ANTES da extração de assets, permitindo que
 * o pipeline adapte sua estratégia por arquivo.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo estrutural do PDF */
export enum BookStructureType {
  /** PDF com imagens embutidas separáveis (JPEG/PNG streams) */
  EMBEDDED_ASSETS = 'embedded-assets',

  /** PDF vetorial tipo Illustrator/InDesign com layers compostos */
  ILLUSTRATOR_LIKE = 'illustrator-like',

  /** PDF com páginas inteiras rasterizadas (cada página é uma imagem) */
  RASTERIZED = 'rasterized',

  /** PDF híbrido com texto vetorial e imagens compostas */
  HYBRID = 'hybrid',

  /** PDF com pouca estrutura explorável */
  LOW_STRUCTURE = 'low-structure',
}

/** Estratégia de extração recomendada */
export enum ExtractionStrategy {
  /** Extrair imagens embutidas diretamente dos streams do PDF */
  EMBEDDED_EXTRACTION = 'embedded-extraction',

  /** Renderizar cada página como imagem de alta resolução */
  PAGE_RENDER = 'page-render',

  /** Combinar: extrair embutidos + renderizar páginas sem assets */
  HYBRID = 'hybrid',

  /** Requer revisão manual — estrutura muito ambígua */
  MANUAL_REVIEW = 'manual-review',
}

/** Nível de confiança na extração por estratégia */
export enum ExtractionConfidence {
  HIGH = 'high',       // >80% dos assets extraíveis com qualidade
  MEDIUM = 'medium',   // 50-80% extração confiável
  LOW = 'low',         // <50% — melhor usar page-render
}

// ---------------------------------------------------------------------------
// Signals (sinais detectados na análise)
// ---------------------------------------------------------------------------

/** Sinais estruturais detectados no PDF */
export interface BookStructureSignals {
  /** Número total de páginas */
  pageCount: number;

  /** Número de imagens embutidas detectadas */
  embeddedImageCount: number;

  /** Tamanho médio das imagens embutidas (bytes) */
  avgEmbeddedImageSize: number;

  /** Proporção de páginas com imagens embutidas (0-1) */
  pagesWithEmbeddedImages: number;

  /** Se o PDF tem texto vetorial extraível */
  hasVectorText: boolean;

  /** Proporção de texto por página (caracteres médios) */
  avgTextPerPage: number;

  /** Se as imagens embutidas são de alta resolução (>1000px) */
  hasHighResImages: boolean;

  /** Se as páginas parecem rasterizadas (pouco texto + imagem grande) */
  hasRasterizedPages: boolean;

  /** Proporção de páginas que parecem rasterizadas (0-1) */
  rasterizedPageRatio: number;

  /** Se o PDF tem metadados de ferramenta de criação (Illustrator, InDesign) */
  creatorTool: string | null;

  /** Se há indicação de layers/camadas (via metadata) */
  hasLayerIndicators: boolean;

  /** Tamanho total do arquivo em bytes */
  fileSizeBytes: number;

  /** Razão entre tamanho de imagens e tamanho total do arquivo */
  imageToFileSizeRatio: number;
}

// ---------------------------------------------------------------------------
// Compatibility Profile
// ---------------------------------------------------------------------------

/** Score de compatibilidade para uma estratégia específica */
export interface StrategyScore {
  strategy: ExtractionStrategy;
  score: number;           // 0-1
  confidence: ExtractionConfidence;
  rationale: string;
}

/** Perfil completo de compatibilidade do book */
export interface BookCompatibilityProfile {
  /** Tipo estrutural classificado */
  structureType: BookStructureType;

  /** Sinais detectados durante a análise */
  signals: BookStructureSignals;

  /** Estratégia de extração recomendada */
  recommendedStrategy: ExtractionStrategy;

  /** Score da estratégia recomendada */
  confidence: ExtractionConfidence;

  /** Scores de todas as estratégias avaliadas */
  strategyScores: StrategyScore[];

  /** Razão legível da recomendação */
  rationale: string;

  /** Avisos e observações */
  warnings: string[];

  /** Tempo de análise em ms */
  analysisTimeMs: number;
}

// ---------------------------------------------------------------------------
// Asset Preservation Policy
// ---------------------------------------------------------------------------

/**
 * POLÍTICA DE PRESERVAÇÃO DE ASSETS — BookAgent Intelligence Engine
 *
 * REGRAS INVIOLÁVEIS:
 *
 * 1. NUNCA modificar as imagens originais do book.
 * 2. NUNCA aplicar filtros, retoques, upscaling ou "melhorias" visuais com IA.
 * 3. NUNCA substituir assets originais por variantes geradas.
 * 4. NUNCA recortar, redimensionar destrutivamente ou alterar aspect ratio do original.
 *
 * OPERAÇÕES PERMITIDAS:
 *
 * 1. EXTRAIR: retirar imagens embutidas preservando qualidade original.
 * 2. RENDERIZAR: gerar snapshot de página inteira como asset derivado.
 * 3. CLASSIFICAR: atribuir tipo semântico (hero, lifestyle, planta, etc.).
 * 4. CORRELACIONAR: associar assets a blocos de texto e fontes de conteúdo.
 * 5. REFERENCIAR: usar asset ID em planos e composições (sem copiar dados).
 * 6. COMPOR EM CAMADA SEPARADA: overlays, textos e branding sobre asset,
 *    mas SEMPRE em camada separada — o asset original permanece intacto.
 * 7. GERAR THUMBNAIL: cópia reduzida para preview, sem substituir o original.
 * 8. CALCULAR HASH: para deduplicação, sem alterar o conteúdo.
 *
 * PRINCÍPIO CENTRAL:
 * O BookAgent é um sistema de INTELIGÊNCIA sobre o material,
 * não de EDIÇÃO do material. As imagens são ativos do empreendimento
 * e devem ser tratadas como referências imutáveis.
 */
export const ASSET_PRESERVATION_POLICY = {
  version: '1.0.0',
  rules: {
    neverModifyOriginal: true,
    neverApplyAIEnhancement: true,
    neverReplaceWithGenerated: true,
    neverDestructiveCrop: true,
    allowExtraction: true,
    allowPageRender: true,
    allowClassification: true,
    allowCorrelation: true,
    allowReference: true,
    allowLayeredComposition: true,
    allowThumbnailGeneration: true,
    allowHashCalculation: true,
  },
  principle: 'Intelligence over material, not editing of material. Assets are immutable references.',
} as const;
