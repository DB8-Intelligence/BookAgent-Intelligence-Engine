/**
 * Entity: NarrativePlan
 *
 * Plano narrativo estruturado para um tipo de output.
 *
 * Um NarrativePlan define a sequência de "beats" (batidas narrativas)
 * que compõem o conteúdo de um output (reel, blog, landing page, etc.).
 *
 * Cada beat referencia uma Source e define seu papel na sequência:
 * abertura, desenvolvimento, reforço, fechamento.
 *
 * O NarrativePlan é consumido pelos módulos de geração (media, blog,
 * landing-page) que o transformam em conteúdo final.
 */

import type { OutputFormat } from '../value-objects/index.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de narrativa (alinhado com propósito do output) */
export enum NarrativeType {
  REEL_SHORT = 'reel-short',
  VIDEO_LONG = 'video-long',
  CAROUSEL = 'carousel',
  STORY = 'story',
  POST = 'post',
  BLOG = 'blog',
  LANDING_PAGE = 'landing-page',
  PRESENTATION = 'presentation',
  AUDIO_MONOLOGUE = 'audio-monologue',
  AUDIO_PODCAST = 'audio-podcast',
}

/** Tom de voz da narrativa */
export enum ToneOfVoice {
  ASPIRACIONAL = 'aspiracional',       // Luxo, exclusividade, sonho
  INFORMATIVO = 'informativo',         // Dados, fatos, autoridade
  EMOCIONAL = 'emocional',            // Conexão, família, momentos
  URGENTE = 'urgente',                // Oportunidade, escassez
  CONVERSACIONAL = 'conversacional',   // Próximo, acessível, friendly
  INSTITUCIONAL = 'institucional',     // Corporativo, tradição
}

/** Papel de um beat na sequência narrativa */
export enum BeatRole {
  HOOK = 'hook',                   // Abertura: captura atenção
  CONTEXT = 'context',             // Contextualização: onde, o quê
  SHOWCASE = 'showcase',           // Demonstração: mostrar o melhor
  DIFFERENTIATOR = 'differentiator', // Diferencial: por que é único
  SOCIAL_PROOF = 'social-proof',   // Prova social: confiança
  LIFESTYLE = 'lifestyle',         // Estilo de vida: aspiração
  INVESTMENT = 'investment',       // Investimento: números, condições
  REINFORCEMENT = 'reinforcement', // Reforço: repetir benefício chave
  CLOSING = 'closing',             // Fechamento: resumo, mensagem final
  CTA = 'cta',                    // Call to action: próximo passo
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Beat narrativo — unidade atômica de uma sequência.
 *
 * Cada beat corresponde a um "momento" do conteúdo:
 * pode ser um slide, uma cena, uma seção, um parágrafo.
 */
export interface NarrativeBeat {
  /** Ordem na sequência (0-based) */
  order: number;

  /** Papel deste beat na narrativa */
  role: BeatRole;

  /** ID da Source associada (se houver) */
  sourceId?: string;

  /** Headline sugerida para este beat */
  suggestedHeadline?: string;

  /** Texto guia / briefing para geração de conteúdo */
  briefing: string;

  /** Duração estimada em segundos (para vídeo/áudio) */
  estimatedDurationSeconds?: number;

  /** Se este beat deve exibir assets visuais */
  showVisuals: boolean;

  /** IDs dos assets sugeridos para este beat */
  suggestedAssetIds: string[];
}

/**
 * NarrativePlan — plano narrativo completo para um output.
 *
 * Define a sequência de beats, tom de voz, título e metadados
 * necessários para que um módulo de geração produza o output final.
 */
export interface NarrativePlan {
  /** Identificador único do plano */
  id: string;

  /** Tipo de narrativa (reel, blog, landing, etc.) */
  narrativeType: NarrativeType;

  /** Formato de output alvo */
  targetFormat: OutputFormat;

  /** Título sugerido para o output */
  title: string;

  /** Sequência ordenada de beats */
  beats: NarrativeBeat[];

  /** Tom de voz predominante */
  tone: ToneOfVoice;

  /** IDs de todas as sources utilizadas (para rastreabilidade) */
  sourceIds: string[];

  /** Duração total estimada em segundos (para vídeo/áudio, null para estáticos) */
  estimatedDurationSeconds: number | null;

  /** Número estimado de slides/cards (para carousel/presentation) */
  estimatedSlides: number | null;

  /** Número estimado de palavras (para blog/landing) */
  estimatedWordCount: number | null;

  /** Score de confiança do plano (0-1) */
  confidence: number;
}
