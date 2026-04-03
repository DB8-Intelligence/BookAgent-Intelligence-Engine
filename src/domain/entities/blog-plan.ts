/**
 * Entity: BlogPlan / BlogSection
 *
 * Plano editorial estruturado para um artigo de blog.
 *
 * Um BlogPlan descreve a composição completa de um artigo:
 * - Título e slug
 * - Introdução
 * - Seções ordenadas com heading, conteúdo-base e assets
 * - Conclusão
 * - CTA
 * - Metadados SEO
 *
 * Consumido por renderizadores futuros (Markdown generator,
 * HTML builder, IAIAdapter para copy refinada) que transformam
 * o plano em artigo final.
 */

import type { ToneOfVoice, NarrativeType } from './narrative.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Papel editorial de uma seção no artigo */
export enum EditorialRole {
  INTRODUCTION = 'introduction',
  OVERVIEW = 'overview',           // Visão geral do empreendimento
  TOUR = 'tour',                   // Tour visual pelos ambientes
  LIFESTYLE = 'lifestyle',         // Lazer e qualidade de vida
  DIFFERENTIALS = 'differentials', // Diferenciais exclusivos
  FLOOR_PLANS = 'floor-plans',     // Plantas e tipologias
  INVESTMENT = 'investment',       // Análise de investimento
  LOCATION = 'location',          // Localização e entorno
  BUILDER = 'builder',            // Sobre a construtora
  CONCLUSION = 'conclusion',
  CTA = 'cta',
}

// ---------------------------------------------------------------------------
// BlogSection
// ---------------------------------------------------------------------------

/**
 * Seção individual dentro de um artigo de blog.
 */
export interface BlogSection {
  /** Identificador único da seção */
  id: string;

  /** Ordem na sequência (0-based) */
  order: number;

  /** Heading (H2) da seção */
  heading: string;

  /** Papel editorial da seção */
  editorialRole: EditorialRole;

  /** IDs das Sources associadas */
  sourceIds: string[];

  /** IDs dos assets visuais sugeridos para esta seção */
  assetIds: string[];

  /** Resumo do conteúdo esperado */
  summary: string;

  /** Pontos-chave a desenvolver (bullets para expansão futura via IA) */
  draftPoints: string[];

  /** Texto-base extraído das sources (para uso como semente de geração) */
  seedText: string;

  /** Estimativa de palavras para esta seção */
  estimatedWordCount: number;
}

// ---------------------------------------------------------------------------
// BlogPlan
// ---------------------------------------------------------------------------

/**
 * BlogPlan — plano editorial completo para um artigo.
 */
export interface BlogPlan {
  /** Identificador único do plano */
  id: string;

  /** Título sugerido para o artigo */
  title: string;

  /** Slug sugerido para URL */
  slug: string;

  /** Meta description sugerida (SEO) */
  metaDescription: string;

  /** Tipo de narrativa de origem */
  narrativeType: NarrativeType;

  /** ID do NarrativePlan de origem */
  narrativePlanId: string;

  /** ID da OutputDecision de origem */
  outputDecisionId: string;

  /** Texto de introdução (primeiro parágrafo) */
  introduction: string;

  /** Seções do artigo (corpo) */
  sections: BlogSection[];

  /** Texto de conclusão */
  conclusion: string;

  /** Texto de CTA final */
  ctaText: string;

  /** Keywords/tags para SEO */
  keywords: string[];

  /** Tom de voz do artigo */
  tone: ToneOfVoice;

  /** ID do asset sugerido para imagem destaque */
  heroAssetId?: string;

  /** Estimativa total de palavras */
  estimatedWordCount: number;

  /** Score de confiança do plano (0-1) */
  confidence: number;
}
