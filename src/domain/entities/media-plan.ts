/**
 * Entity: MediaPlan / MediaScene
 *
 * Plano de mídia concreto e executável para um output aprovado.
 *
 * Um MediaPlan descreve a composição visual/audiovisual completa:
 * - Sequência de cenas/slides
 * - Assets posicionados
 * - Textos overlay
 * - Instruções de branding
 * - Duração e layout
 *
 * Consumido por renderizadores futuros (sharp compositor, ffmpeg,
 * pptx-gen, html-to-image, etc.) que transformam o plano em arquivo final.
 */

import type { OutputFormat, AspectRatio } from '../value-objects/index.js';
import type { NarrativeType } from './narrative.js';
import { BeatRole } from './narrative.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status de prontidão para renderização */
export enum RenderStatus {
  READY = 'ready',             // Todas as cenas preenchidas, pode renderizar
  PARTIAL = 'partial',         // Algumas cenas com gaps, renderização parcial
  NEEDS_ASSETS = 'needs-assets',   // Faltam assets visuais para cenas obrigatórias
  NEEDS_TEXT = 'needs-text',       // Faltam textos/headlines para cenas obrigatórias
  NOT_READY = 'not-ready',     // Não está pronto para renderização
}

/** Dica de layout para composição visual */
export enum LayoutHint {
  FULL_BLEED = 'full-bleed',       // Imagem ocupa toda a área, texto sobre
  SPLIT_HORIZONTAL = 'split-h',   // Imagem à esquerda, texto à direita (ou vice-versa)
  SPLIT_VERTICAL = 'split-v',     // Imagem acima, texto abaixo (ou vice-versa)
  TEXT_CENTERED = 'text-centered', // Texto centralizado sobre fundo sólido/gradiente
  GRID = 'grid',                   // Múltiplas imagens em grid
  OVERLAY = 'overlay',             // Texto overlay sobre imagem com gradiente
  MINIMAL = 'minimal',             // Fundo clean com elemento mínimo
}

/** Tipo de transição entre cenas (para vídeo) */
export enum TransitionType {
  CUT = 'cut',
  FADE = 'fade',
  SLIDE_LEFT = 'slide-left',
  SLIDE_UP = 'slide-up',
  ZOOM_IN = 'zoom-in',
  DISSOLVE = 'dissolve',
}

// ---------------------------------------------------------------------------
// MediaScene
// ---------------------------------------------------------------------------

/** Instrução de texto overlay para uma cena */
export interface TextOverlay {
  /** Texto a exibir */
  text: string;

  /** Papel do texto: headline, body, caption, cta */
  role: 'headline' | 'body' | 'caption' | 'cta';

  /** Posição sugerida: top, center, bottom */
  position: 'top' | 'center' | 'bottom';

  /** Tamanho relativo: large, medium, small */
  size: 'large' | 'medium' | 'small';
}

/** Instrução de branding para uma cena */
export interface BrandingInstruction {
  /** Cor de fundo (hex) */
  backgroundColor: string;

  /** Cor do texto principal (hex) */
  textColor: string;

  /** Cor de acento para destaques (hex) */
  accentColor: string;

  /** Se deve exibir logo do usuário */
  showLogo: boolean;

  /** Estilo visual a aplicar */
  visualStyle: string;
}

/**
 * MediaScene — uma cena ou slide individual dentro de um MediaPlan.
 *
 * Pode representar:
 * - Uma cena de vídeo (com duração)
 * - Um slide de carrossel (estático)
 * - Uma seção de apresentação
 * - Um frame de story
 */
export interface MediaScene {
  /** Identificador único da cena */
  id: string;

  /** Ordem na sequência (0-based) */
  order: number;

  /** Papel narrativo da cena */
  role: BeatRole;

  /** ID(s) da(s) Source(s) associada(s) */
  sourceIds: string[];

  /** IDs dos assets visuais a usar nesta cena */
  assetIds: string[];

  /** Textos overlay a exibir */
  textOverlays: TextOverlay[];

  /** Instrução visual (briefing para composição) */
  visualInstruction: string;

  /** Dica de layout */
  layoutHint: LayoutHint;

  /** Instrução de branding para esta cena */
  branding: BrandingInstruction;

  /** Duração estimada em segundos (null para estáticos) */
  durationSeconds: number | null;

  /** Transição para a próxima cena (para vídeo) */
  transition: TransitionType;
}

// ---------------------------------------------------------------------------
// MediaPlan
// ---------------------------------------------------------------------------

/**
 * MediaPlan — plano de mídia completo e executável.
 */
export interface MediaPlan {
  /** Identificador único do plano */
  id: string;

  /** Formato do output alvo */
  format: OutputFormat;

  /** Tipo de narrativa de origem */
  narrativeType: NarrativeType;

  /** ID do NarrativePlan de origem */
  narrativePlanId: string;

  /** ID da OutputDecision de origem */
  outputDecisionId: string;

  /** Título do media plan */
  title: string;

  /** Sequência ordenada de cenas */
  scenes: MediaScene[];

  /** Aspect ratio do output */
  aspectRatio: AspectRatio;

  /** Resolução alvo [width, height] */
  resolution: [number, number];

  /** Duração total estimada em segundos (null para estáticos) */
  totalDurationSeconds: number | null;

  /** Total de slides/cards (para estáticos) */
  totalSlides: number | null;

  /** Status de prontidão para renderização */
  renderStatus: RenderStatus;

  /** Se precisa de personalização do usuário (logo, contato) */
  requiresPersonalization: boolean;

  /** Metadados adicionais para o renderizador */
  renderMetadata: Record<string, unknown>;
}
