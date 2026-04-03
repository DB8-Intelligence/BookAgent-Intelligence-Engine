/**
 * Blog Section Builder
 *
 * Converte NarrativeBeats em BlogSections — seções editoriais
 * estruturadas com heading, conteúdo-base e assets.
 *
 * Para cada beat do NarrativePlan de blog:
 * 1. Mapeia BeatRole → EditorialRole
 * 2. Localiza a Source associada
 * 3. Gera heading a partir de headline/tipo
 * 4. Extrai draft points do texto da source
 * 5. Seleciona assets visuais para a seção
 * 6. Estima contagem de palavras
 */

import { v4 as uuid } from 'uuid';
import type { NarrativeBeat } from '../../domain/entities/narrative.js';
import { BeatRole } from '../../domain/entities/narrative.js';
import type { Source } from '../../domain/entities/source.js';
import type { BlogSection } from '../../domain/entities/blog-plan.js';
import { EditorialRole } from '../../domain/entities/blog-plan.js';

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

const BEAT_TO_EDITORIAL: Record<BeatRole, EditorialRole> = {
  [BeatRole.HOOK]: EditorialRole.INTRODUCTION,
  [BeatRole.CONTEXT]: EditorialRole.OVERVIEW,
  [BeatRole.SHOWCASE]: EditorialRole.TOUR,
  [BeatRole.LIFESTYLE]: EditorialRole.LIFESTYLE,
  [BeatRole.DIFFERENTIATOR]: EditorialRole.DIFFERENTIALS,
  [BeatRole.SOCIAL_PROOF]: EditorialRole.BUILDER,
  [BeatRole.INVESTMENT]: EditorialRole.INVESTMENT,
  [BeatRole.REINFORCEMENT]: EditorialRole.DIFFERENTIALS,
  [BeatRole.CLOSING]: EditorialRole.CONCLUSION,
  [BeatRole.CTA]: EditorialRole.CTA,
};

/** Headings padrão por EditorialRole */
const DEFAULT_HEADINGS: Record<EditorialRole, string> = {
  [EditorialRole.INTRODUCTION]: 'Introdução',
  [EditorialRole.OVERVIEW]: 'Sobre o Empreendimento',
  [EditorialRole.TOUR]: 'Conheça os Ambientes',
  [EditorialRole.LIFESTYLE]: 'Lazer e Qualidade de Vida',
  [EditorialRole.DIFFERENTIALS]: 'Diferenciais Exclusivos',
  [EditorialRole.FLOOR_PLANS]: 'Plantas e Tipologias',
  [EditorialRole.INVESTMENT]: 'Investimento e Valorização',
  [EditorialRole.LOCATION]: 'Localização Privilegiada',
  [EditorialRole.BUILDER]: 'A Construtora',
  [EditorialRole.CONCLUSION]: 'Conclusão',
  [EditorialRole.CTA]: 'Agende Sua Visita',
};

/** Palavras estimadas por editorial role */
const WORD_ESTIMATES: Record<EditorialRole, number> = {
  [EditorialRole.INTRODUCTION]: 120,
  [EditorialRole.OVERVIEW]: 180,
  [EditorialRole.TOUR]: 200,
  [EditorialRole.LIFESTYLE]: 180,
  [EditorialRole.DIFFERENTIALS]: 200,
  [EditorialRole.FLOOR_PLANS]: 150,
  [EditorialRole.INVESTMENT]: 150,
  [EditorialRole.LOCATION]: 120,
  [EditorialRole.BUILDER]: 120,
  [EditorialRole.CONCLUSION]: 100,
  [EditorialRole.CTA]: 60,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converte NarrativeBeats em BlogSections.
 * Pula beats de HOOK (vira introdução no BlogPlan) e CLOSING (vira conclusão).
 */
export function buildSections(
  beats: NarrativeBeat[],
  sources: Source[],
): BlogSection[] {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Filtrar beats que viram seções do corpo (não intro/conclusão/cta)
  const bodyBeats = beats.filter(
    (b) =>
      b.role !== BeatRole.HOOK &&
      b.role !== BeatRole.CLOSING &&
      b.role !== BeatRole.CTA,
  );

  const sections: BlogSection[] = [];
  const usedRoles = new Set<EditorialRole>();

  for (let i = 0; i < bodyBeats.length; i++) {
    const beat = bodyBeats[i];
    const source = beat.sourceId ? sourceMap.get(beat.sourceId) : undefined;
    const editorialRole = BEAT_TO_EDITORIAL[beat.role] ?? EditorialRole.OVERVIEW;

    // Evitar seções duplicadas do mesmo editorial role
    if (usedRoles.has(editorialRole) && editorialRole !== EditorialRole.TOUR) {
      // TOUR pode aparecer mais de uma vez (diferentes ambientes)
      continue;
    }
    usedRoles.add(editorialRole);

    const heading = generateHeading(editorialRole, source);
    const summary = generateSummary(editorialRole, source);
    const draftPoints = extractDraftPoints(source);
    const seedText = source?.text ?? '';
    const assetIds = source ? source.assetIds.slice(0, 3) : [];

    sections.push({
      id: uuid(),
      order: sections.length,
      heading,
      editorialRole,
      sourceIds: source ? [source.id] : [],
      assetIds,
      summary,
      draftPoints,
      seedText,
      estimatedWordCount: WORD_ESTIMATES[editorialRole] ?? 150,
    });
  }

  return sections;
}

/**
 * Extrai texto de introdução a partir do beat de HOOK.
 */
export function extractIntroduction(
  beats: NarrativeBeat[],
  sources: Source[],
): string {
  const hookBeat = beats.find((b) => b.role === BeatRole.HOOK);
  if (!hookBeat?.sourceId) {
    return 'Conheça este empreendimento que combina localização, lazer e qualidade de vida.';
  }

  const source = sources.find((s) => s.id === hookBeat.sourceId);
  if (!source) return 'Descubra tudo sobre este novo empreendimento.';

  // Usar summary ou primeiras frases do texto
  if (source.summary && source.summary.length > 30) {
    return source.summary;
  }

  const firstSentences = source.text
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 15)
    .slice(0, 3)
    .join('. ')
    .trim();

  return firstSentences || source.text.slice(0, 200);
}

/**
 * Extrai texto de conclusão a partir do beat de CLOSING.
 */
export function extractConclusion(
  beats: NarrativeBeat[],
  sources: Source[],
): string {
  const closingBeat = beats.find((b) => b.role === BeatRole.CLOSING);
  if (!closingBeat?.sourceId) {
    return 'Este empreendimento representa uma oportunidade única para quem busca qualidade de vida, localização privilegiada e valorização garantida.';
  }

  const source = sources.find((s) => s.id === closingBeat.sourceId);
  if (!source) return 'Uma excelente opção para morar ou investir.';

  return source.summary ?? source.text.slice(0, 200);
}

/**
 * Extrai texto de CTA a partir do beat de CTA.
 */
export function extractCTA(
  beats: NarrativeBeat[],
  sources: Source[],
): string {
  const ctaBeat = beats.find((b) => b.role === BeatRole.CTA);
  if (!ctaBeat?.sourceId) {
    return 'Agende sua visita e conheça pessoalmente este empreendimento. Entre em contato com nossa equipe de consultores.';
  }

  const source = sources.find((s) => s.id === ctaBeat.sourceId);
  if (!source) return 'Fale com um consultor e saiba mais sobre condições especiais.';

  return source.text.length > 10 ? source.text.slice(0, 200) : 'Agende sua visita hoje mesmo.';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateHeading(role: EditorialRole, source?: Source): string {
  // Tentar usar título da source como heading se for específico
  if (source?.title && source.title.length > 5 && source.title.length < 80) {
    // Verificar se não é genérico demais
    const generic = ['conteúdo', 'editorial', 'página', 'bloco'];
    const isGeneric = generic.some((g) => source.title.toLowerCase().includes(g));
    if (!isGeneric) return source.title;
  }

  return DEFAULT_HEADINGS[role] ?? 'Conteúdo';
}

function generateSummary(role: EditorialRole, source?: Source): string {
  if (source?.summary && source.summary.length > 20) {
    return source.summary;
  }

  // Summaries padrão por role
  const defaults: Partial<Record<EditorialRole, string>> = {
    [EditorialRole.OVERVIEW]: 'Visão geral do empreendimento, incluindo conceito, localização e público-alvo.',
    [EditorialRole.TOUR]: 'Tour visual pelos principais ambientes e acabamentos do projeto.',
    [EditorialRole.LIFESTYLE]: 'Espaços de lazer, convivência e qualidade de vida oferecidos.',
    [EditorialRole.DIFFERENTIALS]: 'O que torna este empreendimento único no mercado.',
    [EditorialRole.FLOOR_PLANS]: 'Opções de plantas e tipologias disponíveis.',
    [EditorialRole.INVESTMENT]: 'Análise de valorização e condições comerciais.',
    [EditorialRole.LOCATION]: 'Vantagens da localização e infraestrutura do entorno.',
    [EditorialRole.BUILDER]: 'Credenciais e histórico da construtora responsável.',
  };

  return defaults[role] ?? 'Conteúdo relevante sobre o empreendimento.';
}

function extractDraftPoints(source?: Source): string[] {
  if (!source) return [];

  const points: string[] = [];

  // Extrair frases significativas do texto
  const sentences = source.text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 200);

  // Pegar até 5 frases como draft points
  for (const sentence of sentences.slice(0, 5)) {
    points.push(sentence);
  }

  // Adicionar keywords como pontos adicionais se poucas frases
  if (points.length < 3 && source.tags.length > 0) {
    points.push(`Tópicos: ${source.tags.slice(0, 5).join(', ')}`);
  }

  return points;
}
