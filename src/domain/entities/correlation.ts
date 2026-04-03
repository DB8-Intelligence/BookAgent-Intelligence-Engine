/**
 * Entity: CorrelationBlock
 *
 * Unidade semântica que conecta texto, assets visuais e metadados
 * de uma mesma região/página do material de origem.
 *
 * Um CorrelationBlock representa um "bloco de conteúdo" coeso —
 * por exemplo: uma headline + render + descrição do diferencial.
 *
 * Esses blocos alimentam os módulos de source-intelligence e narrative,
 * que os transformam em Sources tipadas e narrativas prontas para outputs.
 *
 * Estratégias de correlação (v1 → v2):
 * - v1: proximidade por página + heurísticas de classificação
 * - v2: análise semântica via IAIAdapter (descrição de imagem + matching)
 */

import type { SourceType, NarrativeRole, CommercialRole } from '../value-objects/index.js';

/** Nível de confiança da correlação */
export enum CorrelationConfidence {
  HIGH = 'high',       // Mesmo página + texto adjacente
  MEDIUM = 'medium',   // Mesma página mas sem adjacência clara
  LOW = 'low',         // Inferido por heurística (sem confirmação espacial)
  INFERRED = 'inferred', // Deduzido por padrão (fallback)
}

/** Método usado para estabelecer a correlação */
export enum CorrelationMethod {
  PAGE_PROXIMITY = 'page-proximity',       // Asset e texto na mesma página
  SPATIAL_ADJACENCY = 'spatial-adjacency', // Asset e texto próximos na mesma região
  KEYWORD_MATCH = 'keyword-match',         // Palavras-chave do texto batem com classificação do asset
  SEQUENTIAL = 'sequential',               // Ordem sequencial no documento
  AI_SEMANTIC = 'ai-semantic',             // Matching semântico via IA (futuro)
  MANUAL = 'manual',                       // Correlação definida manualmente
}

/**
 * Bloco de texto semântico extraído de uma página.
 *
 * Representa um trecho coeso de texto (headline, parágrafo,
 * bullet points) que pode ser correlacionado a assets visuais.
 */
export interface TextBlock {
  /** Texto completo do bloco */
  content: string;

  /** Headline detectada (primeira linha proeminente ou título) */
  headline?: string;

  /** Página de origem */
  page: number;

  /** Tipo semântico do bloco */
  blockType: TextBlockType;

  /** Palavras-chave extraídas do texto */
  keywords: string[];
}

export enum TextBlockType {
  HEADLINE = 'headline',
  PARAGRAPH = 'paragraph',
  BULLET_LIST = 'bullet-list',
  CAPTION = 'caption',
  CTA = 'cta',
  MIXED = 'mixed',
}

/**
 * CorrelationBlock — bloco semântico correlacionado.
 *
 * Liga um ou mais TextBlocks a um ou mais Assets,
 * com metadados sobre a relação (confiança, método, papéis).
 */
export interface CorrelationBlock {
  /** Identificador único do bloco */
  id: string;

  /** Página principal de origem no material */
  page: number;

  /** Blocos de texto associados */
  textBlocks: TextBlock[];

  /** IDs dos assets visuais correlacionados */
  assetIds: string[];

  /** Headline principal do bloco (a mais proeminente dos textBlocks) */
  headline?: string;

  /** Resumo do conteúdo textual do bloco */
  summary: string;

  /** Classificação semântica inferida (hero, lifestyle, planta, etc.) */
  inferredType?: SourceType;

  /** Papel narrativo inferido (hook, showcase, closing, etc.) */
  inferredNarrativeRole?: NarrativeRole;

  /** Papel comercial inferido (lead-capture, value-proposition, etc.) */
  inferredCommercialRole?: CommercialRole;

  /** Confiança da correlação */
  confidence: CorrelationConfidence;

  /** Método(s) usado(s) para estabelecer a correlação */
  methods: CorrelationMethod[];

  /** Tags temáticas inferidas do conteúdo */
  tags: string[];

  /** Prioridade estimada (1 = mais alta, 10 = mais baixa) */
  priority: number;
}
