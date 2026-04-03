/**
 * Narrative Templates
 *
 * Define a estrutura de beats (batidas narrativas) padrão
 * para cada tipo de output. Cada template descreve:
 *
 * - Quais papéis (BeatRole) compõem a narrativa
 * - Ordem dos beats
 * - Duração estimada por beat (para vídeo/áudio)
 * - Se o beat precisa de visual
 * - Tom de voz padrão
 *
 * Os templates são "receitas" que o narrative-planner preenche
 * com Sources concretas para produzir NarrativePlans.
 *
 * Evolução futura: templates customizáveis por projeto/cliente.
 */

import { NarrativeType, ToneOfVoice, BeatRole } from '../../domain/entities/narrative.js';

/** Definição de um beat no template (antes de preencher com Sources) */
export interface BeatTemplate {
  role: BeatRole;
  required: boolean;
  showVisuals: boolean;
  estimatedDurationSeconds?: number;
  briefingTemplate: string;
}

/** Template completo para um tipo de narrativa */
export interface NarrativeTemplate {
  narrativeType: NarrativeType;
  defaultTone: ToneOfVoice;
  beats: BeatTemplate[];
  estimatedTotalDuration: number | null;
  estimatedSlides: number | null;
  estimatedWordCount: number | null;
}

// ---------------------------------------------------------------------------
// Templates por tipo de output
// ---------------------------------------------------------------------------

export const NARRATIVE_TEMPLATES: Record<NarrativeType, NarrativeTemplate> = {

  // -------------------------------------------------------------------------
  // REEL SHORT (15-60s, 4-8 beats rápidos)
  // -------------------------------------------------------------------------
  [NarrativeType.REEL_SHORT]: {
    narrativeType: NarrativeType.REEL_SHORT,
    defaultTone: ToneOfVoice.ASPIRACIONAL,
    estimatedTotalDuration: 30,
    estimatedSlides: null,
    estimatedWordCount: null,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, estimatedDurationSeconds: 3, briefingTemplate: 'Abrir com impacto visual — render ou hero image com headline chamativa' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, estimatedDurationSeconds: 5, briefingTemplate: 'Mostrar o melhor do empreendimento — fachada, áreas comuns ou vista' },
      { role: BeatRole.LIFESTYLE, required: false, showVisuals: true, estimatedDurationSeconds: 5, briefingTemplate: 'Apresentar estilo de vida — lazer, piscina, espaço gourmet' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, estimatedDurationSeconds: 5, briefingTemplate: 'Destacar principal diferencial — o que torna único' },
      { role: BeatRole.REINFORCEMENT, required: false, showVisuals: true, estimatedDurationSeconds: 4, briefingTemplate: 'Reforçar benefício chave com segundo visual' },
      { role: BeatRole.CTA, required: true, showVisuals: true, estimatedDurationSeconds: 3, briefingTemplate: 'Fechar com call-to-action claro — agende visita, fale conosco' },
    ],
  },

  // -------------------------------------------------------------------------
  // VIDEO LONG (2-5min, arco completo)
  // -------------------------------------------------------------------------
  [NarrativeType.VIDEO_LONG]: {
    narrativeType: NarrativeType.VIDEO_LONG,
    defaultTone: ToneOfVoice.INFORMATIVO,
    estimatedTotalDuration: 180,
    estimatedSlides: null,
    estimatedWordCount: null,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, estimatedDurationSeconds: 5, briefingTemplate: 'Abertura com hero image e nome do empreendimento' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: true, estimatedDurationSeconds: 20, briefingTemplate: 'Contextualizar: localização, região, conceito do projeto' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, estimatedDurationSeconds: 30, briefingTemplate: 'Tour visual pelas áreas principais — fachada, hall, áreas comuns' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: true, estimatedDurationSeconds: 25, briefingTemplate: 'Apresentar espaços de lazer e convivência' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, estimatedDurationSeconds: 20, briefingTemplate: 'Explorar diferenciais e acabamentos premium' },
      { role: BeatRole.SHOWCASE, required: false, showVisuals: true, estimatedDurationSeconds: 25, briefingTemplate: 'Mostrar plantas e tipologias disponíveis' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: true, estimatedDurationSeconds: 15, briefingTemplate: 'Apresentar condições comerciais e valorização' },
      { role: BeatRole.SOCIAL_PROOF, required: false, showVisuals: true, estimatedDurationSeconds: 15, briefingTemplate: 'Construtora, tradição e credenciais' },
      { role: BeatRole.CLOSING, required: true, showVisuals: true, estimatedDurationSeconds: 10, briefingTemplate: 'Resumir proposta de valor final' },
      { role: BeatRole.CTA, required: true, showVisuals: true, estimatedDurationSeconds: 8, briefingTemplate: 'Call-to-action completo com contato e próximos passos' },
    ],
  },

  // -------------------------------------------------------------------------
  // CAROUSEL (4-10 cards estáticos)
  // -------------------------------------------------------------------------
  [NarrativeType.CAROUSEL]: {
    narrativeType: NarrativeType.CAROUSEL,
    defaultTone: ToneOfVoice.ASPIRACIONAL,
    estimatedTotalDuration: null,
    estimatedSlides: 8,
    estimatedWordCount: null,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, briefingTemplate: 'Card 1: hero image com headline impactante' },
      { role: BeatRole.CONTEXT, required: false, showVisuals: true, briefingTemplate: 'Card 2: localização e conceito do empreendimento' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, briefingTemplate: 'Card 3-4: melhores visuais — fachada, áreas comuns' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: true, briefingTemplate: 'Card 5: lazer e estilo de vida' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, briefingTemplate: 'Card 6: principal diferencial com visual' },
      { role: BeatRole.SHOWCASE, required: false, showVisuals: true, briefingTemplate: 'Card 7: planta ou tipologia' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: false, briefingTemplate: 'Card 8: condições comerciais ou valorização' },
      { role: BeatRole.CTA, required: true, showVisuals: true, briefingTemplate: 'Card final: CTA com contato e logo' },
    ],
  },

  // -------------------------------------------------------------------------
  // STORY (5-15s, 1-3 beats rápidos)
  // -------------------------------------------------------------------------
  [NarrativeType.STORY]: {
    narrativeType: NarrativeType.STORY,
    defaultTone: ToneOfVoice.URGENTE,
    estimatedTotalDuration: 10,
    estimatedSlides: null,
    estimatedWordCount: null,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, estimatedDurationSeconds: 4, briefingTemplate: 'Visual impactante com headline curta' },
      { role: BeatRole.DIFFERENTIATOR, required: false, showVisuals: true, estimatedDurationSeconds: 3, briefingTemplate: 'Destaque rápido do principal diferencial' },
      { role: BeatRole.CTA, required: true, showVisuals: true, estimatedDurationSeconds: 3, briefingTemplate: 'Swipe up / arraste para cima com CTA' },
    ],
  },

  // -------------------------------------------------------------------------
  // POST (1 card com texto)
  // -------------------------------------------------------------------------
  [NarrativeType.POST]: {
    narrativeType: NarrativeType.POST,
    defaultTone: ToneOfVoice.CONVERSACIONAL,
    estimatedTotalDuration: null,
    estimatedSlides: 1,
    estimatedWordCount: 150,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, briefingTemplate: 'Imagem principal com headline' },
      { role: BeatRole.CTA, required: true, showVisuals: false, briefingTemplate: 'Caption com descrição e CTA na legenda' },
    ],
  },

  // -------------------------------------------------------------------------
  // BLOG (artigo longo com seções)
  // -------------------------------------------------------------------------
  [NarrativeType.BLOG]: {
    narrativeType: NarrativeType.BLOG,
    defaultTone: ToneOfVoice.INFORMATIVO,
    estimatedTotalDuration: null,
    estimatedSlides: null,
    estimatedWordCount: 1200,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, briefingTemplate: 'Título SEO + imagem destaque + introdução envolvente' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: true, briefingTemplate: 'Seção: sobre o empreendimento — localização, conceito, público-alvo' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, briefingTemplate: 'Seção: tour visual — ambientes, acabamentos, áreas comuns' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: true, briefingTemplate: 'Seção: lazer e qualidade de vida — estrutura de lazer completa' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, briefingTemplate: 'Seção: diferenciais — o que destaca este empreendimento' },
      { role: BeatRole.SHOWCASE, required: false, showVisuals: true, briefingTemplate: 'Seção: plantas e tipologias — opções de apartamentos' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: false, briefingTemplate: 'Seção: investimento e valorização — potencial de retorno' },
      { role: BeatRole.SOCIAL_PROOF, required: false, showVisuals: false, briefingTemplate: 'Seção: a construtora — credenciais e histórico' },
      { role: BeatRole.CLOSING, required: true, showVisuals: false, briefingTemplate: 'Conclusão: resumo de valor e por que considerar' },
      { role: BeatRole.CTA, required: true, showVisuals: false, briefingTemplate: 'CTA: agende visita, fale com consultor, link para contato' },
    ],
  },

  // -------------------------------------------------------------------------
  // LANDING PAGE (seções de conversão progressiva)
  // -------------------------------------------------------------------------
  [NarrativeType.LANDING_PAGE]: {
    narrativeType: NarrativeType.LANDING_PAGE,
    defaultTone: ToneOfVoice.ASPIRACIONAL,
    estimatedTotalDuration: null,
    estimatedSlides: null,
    estimatedWordCount: 800,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, briefingTemplate: 'Hero section: imagem full-bleed + headline + sub-headline + CTA primário' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: true, briefingTemplate: 'Seção: sobre o empreendimento — conceito e localização com mapa' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, briefingTemplate: 'Seção: galeria visual — carrossel ou grid de imagens' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, briefingTemplate: 'Seção: diferenciais — ícones ou cards com os destaques' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: true, briefingTemplate: 'Seção: lazer — imagens de áreas de lazer com descrição' },
      { role: BeatRole.SHOWCASE, required: false, showVisuals: true, briefingTemplate: 'Seção: plantas — seletor de tipologias com imagens' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: false, briefingTemplate: 'Seção: investimento — tabela de condições ou destaque de preço' },
      { role: BeatRole.SOCIAL_PROOF, required: false, showVisuals: true, briefingTemplate: 'Seção: construtora — logo, certificações, empreendimentos entregues' },
      { role: BeatRole.CTA, required: true, showVisuals: false, briefingTemplate: 'Seção final: formulário de contato + WhatsApp + mapa de localização' },
    ],
  },

  // -------------------------------------------------------------------------
  // PRESENTATION (slides)
  // -------------------------------------------------------------------------
  [NarrativeType.PRESENTATION]: {
    narrativeType: NarrativeType.PRESENTATION,
    defaultTone: ToneOfVoice.INSTITUCIONAL,
    estimatedTotalDuration: null,
    estimatedSlides: 12,
    estimatedWordCount: null,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: true, briefingTemplate: 'Slide 1: capa com hero image, nome e logo' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: true, briefingTemplate: 'Slide 2-3: visão geral — conceito, localização, público' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: true, briefingTemplate: 'Slide 4-5: tour visual — fachada, ambientes, acabamentos' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: true, briefingTemplate: 'Slide 6: lazer e convivência' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: true, briefingTemplate: 'Slide 7: diferenciais exclusivos' },
      { role: BeatRole.SHOWCASE, required: false, showVisuals: true, briefingTemplate: 'Slide 8-9: plantas e tipologias' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: false, briefingTemplate: 'Slide 10: condições comerciais' },
      { role: BeatRole.SOCIAL_PROOF, required: false, showVisuals: true, briefingTemplate: 'Slide 11: a construtora' },
      { role: BeatRole.CTA, required: true, showVisuals: true, briefingTemplate: 'Slide 12: contato e próximos passos' },
    ],
  },

  // -------------------------------------------------------------------------
  // AUDIO MONOLOGUE (roteiro falado ~3min)
  // -------------------------------------------------------------------------
  [NarrativeType.AUDIO_MONOLOGUE]: {
    narrativeType: NarrativeType.AUDIO_MONOLOGUE,
    defaultTone: ToneOfVoice.CONVERSACIONAL,
    estimatedTotalDuration: 180,
    estimatedSlides: null,
    estimatedWordCount: 450,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: false, estimatedDurationSeconds: 15, briefingTemplate: 'Abertura: saudação e gancho — "já imaginou morar em..."' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: false, estimatedDurationSeconds: 25, briefingTemplate: 'Contextualizar: onde fica, conceito, por que é especial' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: false, estimatedDurationSeconds: 30, briefingTemplate: 'Descrever os ambientes e experiências que o morador terá' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: false, estimatedDurationSeconds: 25, briefingTemplate: 'Destacar o que diferencia de outros empreendimentos' },
      { role: BeatRole.LIFESTYLE, required: false, showVisuals: false, estimatedDurationSeconds: 20, briefingTemplate: 'Pintar o estilo de vida — rotina, lazer, convivência' },
      { role: BeatRole.CLOSING, required: true, showVisuals: false, estimatedDurationSeconds: 15, briefingTemplate: 'Resumir proposta de valor' },
      { role: BeatRole.CTA, required: true, showVisuals: false, estimatedDurationSeconds: 10, briefingTemplate: 'Convite: agende visita, fale com corretor, link na bio' },
    ],
  },

  // -------------------------------------------------------------------------
  // AUDIO PODCAST (conversa ~10min)
  // -------------------------------------------------------------------------
  [NarrativeType.AUDIO_PODCAST]: {
    narrativeType: NarrativeType.AUDIO_PODCAST,
    defaultTone: ToneOfVoice.CONVERSACIONAL,
    estimatedTotalDuration: 600,
    estimatedSlides: null,
    estimatedWordCount: 1500,
    beats: [
      { role: BeatRole.HOOK, required: true, showVisuals: false, estimatedDurationSeconds: 30, briefingTemplate: 'Abertura: apresentação do tema e do empreendimento' },
      { role: BeatRole.CONTEXT, required: true, showVisuals: false, estimatedDurationSeconds: 60, briefingTemplate: 'Contexto: região, mercado, público-alvo, momento do mercado' },
      { role: BeatRole.SHOWCASE, required: true, showVisuals: false, estimatedDurationSeconds: 90, briefingTemplate: 'Detalhamento: ambientes, arquitetura, conceito de design' },
      { role: BeatRole.LIFESTYLE, required: true, showVisuals: false, estimatedDurationSeconds: 60, briefingTemplate: 'Estilo de vida: lazer, comodidades, vizinhança' },
      { role: BeatRole.DIFFERENTIATOR, required: true, showVisuals: false, estimatedDurationSeconds: 60, briefingTemplate: 'Diferenciais: o que faz valer o investimento' },
      { role: BeatRole.INVESTMENT, required: false, showVisuals: false, estimatedDurationSeconds: 45, briefingTemplate: 'Análise de investimento: valorização, condições, comparativo' },
      { role: BeatRole.SOCIAL_PROOF, required: false, showVisuals: false, estimatedDurationSeconds: 45, briefingTemplate: 'A construtora: história, entregas, reputação' },
      { role: BeatRole.CLOSING, required: true, showVisuals: false, estimatedDurationSeconds: 30, briefingTemplate: 'Encerramento: resumo e opinião final' },
      { role: BeatRole.CTA, required: true, showVisuals: false, estimatedDurationSeconds: 20, briefingTemplate: 'CTA: onde encontrar mais informações, contato' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Mapping: OutputFormat → NarrativeType
// ---------------------------------------------------------------------------

/** Mapeia cada OutputFormat para o NarrativeType correspondente */
export const FORMAT_TO_NARRATIVE: Record<string, NarrativeType> = {
  reel: NarrativeType.REEL_SHORT,
  video_short: NarrativeType.REEL_SHORT,
  video_long: NarrativeType.VIDEO_LONG,
  story: NarrativeType.STORY,
  carousel: NarrativeType.CAROUSEL,
  post: NarrativeType.POST,
  blog: NarrativeType.BLOG,
  landing_page: NarrativeType.LANDING_PAGE,
  presentation: NarrativeType.PRESENTATION,
  audio_monologue: NarrativeType.AUDIO_MONOLOGUE,
  audio_podcast: NarrativeType.AUDIO_PODCAST,
};
