/**
 * Text Generation — Types
 *
 * Tipos para a camada de geração de texto final.
 * Transforma planos estruturais em conteúdo editorial pronto.
 */

import type { ToneOfVoice } from '../domain/entities/narrative.js';

// ---------------------------------------------------------------------------
// Generated Content
// ---------------------------------------------------------------------------

/** Artigo de blog com texto final */
export interface GeneratedBlogArticle {
  planId: string;
  title: string;
  slug: string;
  introduction: string;
  sections: GeneratedBlogSection[];
  conclusion: string;
  ctaText: string;
  metaDescription: string;
  keywords: string[];
  tone: ToneOfVoice;
  wordCount: number;
}

export interface GeneratedBlogSection {
  heading: string;
  editorialRole: string;
  paragraphs: string[];
  assetIds: string[];
  wordCount: number;
}

/** Copy de landing page com texto final por seção */
export interface GeneratedLandingPageCopy {
  planId: string;
  title: string;
  slug: string;
  heroHeadline: string;
  heroSubheadline: string;
  sections: GeneratedLPSection[];
  metaDescription: string;
  tone: ToneOfVoice;
}

export interface GeneratedLPSection {
  sectionType: string;
  heading: string;
  body: string;
  bulletPoints: string[];
  ctaText?: string;
}

/** Roteiro de mídia com falas finais por cena */
export interface GeneratedMediaScript {
  planId: string;
  title: string;
  format: string;
  scenes: GeneratedSceneScript[];
  totalDurationSeconds: number | null;
}

export interface GeneratedSceneScript {
  order: number;
  role: string;
  headline: string;
  narration: string;
  visualDescription: string;
  durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Generation Options
// ---------------------------------------------------------------------------

export interface TextGenerationOptions {
  /** Usar IA real ou geração local (default: local) */
  mode: 'local' | 'ai';

  /** Tom de voz override */
  tone?: ToneOfVoice;

  /** Idioma (default: pt-BR) */
  locale?: string;

  /** Nome do empreendimento para contextualização */
  projectName?: string;

  /** Região para contextualização */
  region?: string;
}
