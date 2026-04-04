/**
 * Blog Text Generator
 *
 * Transforma BlogPlan em artigo com texto corrido final.
 * V1: geração local inteligente usando os dados do plano.
 * V2: IAIAdapter para refinamento e expansão com LLM.
 *
 * Estratégia:
 * - Expande draft points em parágrafos fluidos
 * - Aplica conectores e transições entre seções
 * - Gera introdução envolvente a partir do contexto
 * - Gera conclusão sintetizando os pontos-chave
 * - Ajusta tom de voz conforme branding
 */

import type { BlogPlan, BlogSection } from '../domain/entities/blog-plan.js';
import { EditorialRole } from '../domain/entities/blog-plan.js';
import type { ToneOfVoice } from '../domain/entities/narrative.js';
import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type {
  GeneratedBlogArticle,
  GeneratedBlogSection,
  TextGenerationOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateBlogText(
  plan: BlogPlan,
  options: TextGenerationOptions,
  aiAdapter?: IAIAdapter,
): Promise<GeneratedBlogArticle> {
  const projectName = options.projectName ?? extractProjectName(plan.title);

  // V2: Use AI for text generation if available and mode is 'ai'
  if (options.mode === 'ai' && aiAdapter) {
    return generateWithAI(plan, options, aiAdapter, projectName);
  }

  // V1: Smart local generation
  return generateLocally(plan, options, projectName);
}

// ---------------------------------------------------------------------------
// Local generation (V1)
// ---------------------------------------------------------------------------

function generateLocally(
  plan: BlogPlan,
  options: TextGenerationOptions,
  projectName: string,
): GeneratedBlogArticle {
  const tone = options.tone ?? plan.tone;

  const introduction = expandIntroduction(plan.introduction, projectName, tone);
  const sections = plan.sections.map((s) => expandSection(s, projectName, tone));
  const conclusion = expandConclusion(plan.conclusion, projectName, tone, plan.sections);
  const ctaText = expandCTA(plan.ctaText, projectName);

  const wordCount = countWords(introduction)
    + sections.reduce((sum, s) => sum + s.wordCount, 0)
    + countWords(conclusion)
    + countWords(ctaText);

  return {
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    introduction,
    sections,
    conclusion,
    ctaText,
    metaDescription: plan.metaDescription,
    keywords: plan.keywords,
    tone,
    wordCount,
  };
}

function expandIntroduction(raw: string, projectName: string, tone: ToneOfVoice): string {
  if (!raw || raw.length < 20) {
    return buildDefaultIntro(projectName, tone);
  }

  // Enrich the existing introduction
  const sentences = splitSentences(raw);
  if (sentences.length >= 3) return raw;

  // Add a contextual opening if too short
  const opener = TONE_OPENERS[tone] ?? '';
  const enriched = opener
    ? `${opener} ${raw} ${buildIntroCloser(projectName, tone)}`
    : `${raw} ${buildIntroCloser(projectName, tone)}`;

  return enriched.trim();
}

function expandSection(section: BlogSection, projectName: string, tone: ToneOfVoice): GeneratedBlogSection {
  const paragraphs: string[] = [];

  // Generate opening sentence for the section
  const opener = SECTION_OPENERS[section.editorialRole];
  if (opener) {
    paragraphs.push(opener.replace('{project}', projectName));
  }

  // Expand draft points into flowing paragraphs
  if (section.draftPoints.length > 0) {
    const grouped = groupDraftPoints(section.draftPoints);
    for (const group of grouped) {
      paragraphs.push(expandPointGroup(group, section.editorialRole, tone));
    }
  } else if (section.seedText) {
    // Use seed text, broken into manageable paragraphs
    const chunks = breakIntoChunks(section.seedText, 200);
    paragraphs.push(...chunks);
  }

  // Add a role-specific closing sentence
  const closer = buildSectionCloser(section.editorialRole, projectName);
  if (closer && paragraphs.length > 0) {
    paragraphs.push(closer);
  }

  const wordCount = paragraphs.reduce((sum, p) => sum + countWords(p), 0);

  return {
    heading: section.heading,
    editorialRole: section.editorialRole,
    paragraphs,
    assetIds: section.assetIds,
    wordCount,
  };
}

function expandConclusion(raw: string, projectName: string, tone: ToneOfVoice, sections: BlogSection[]): string {
  if (raw && raw.length > 50) return raw;

  // Build conclusion from key section points
  const highlights = sections
    .slice(0, 3)
    .map((s) => s.heading.toLowerCase())
    .join(', ');

  const conclusions: Record<string, string> = {
    aspiracional: `O ${projectName} é mais do que um empreendimento — é a materialização de um estilo de vida que combina ${highlights}. Para quem busca exclusividade e sofisticação, esta é uma oportunidade que merece atenção especial.`,
    informativo: `Com base na análise detalhada de ${highlights}, o ${projectName} apresenta fundamentos sólidos tanto para moradia quanto para investimento. Os indicadores de valorização da região reforçam o potencial deste empreendimento.`,
    emocional: `Imaginar-se vivendo no ${projectName}, desfrutando de ${highlights}, é o primeiro passo para transformar esse sonho em realidade. Cada detalhe foi pensado para proporcionar momentos inesquecíveis para você e sua família.`,
    urgente: `Com unidades limitadas e condições especiais de lançamento, o ${projectName} oferece ${highlights} em uma oportunidade que não deve ser adiada. O momento de agir é agora.`,
    conversacional: `E aí, gostou do que viu sobre o ${projectName}? Com tudo isso de ${highlights}, fica difícil não se interessar, né? Se quiser saber mais, é só entrar em contato.`,
    institucional: `O ${projectName} reúne os melhores atributos em ${highlights}, refletindo o compromisso com excelência que define este empreendimento. Um projeto que se destaca pela qualidade e pela visão de futuro.`,
  };

  return conclusions[tone] ?? conclusions['informativo'] ?? raw;
}

function expandCTA(raw: string, projectName: string): string {
  if (raw && raw.length > 30) return raw;
  return `Não perca a oportunidade de conhecer o ${projectName} pessoalmente. Agende sua visita com nossa equipe de consultores especializados e descubra as condições especiais disponíveis para esta fase de lançamento.`;
}

// ---------------------------------------------------------------------------
// AI generation (V2)
// ---------------------------------------------------------------------------

async function generateWithAI(
  plan: BlogPlan,
  options: TextGenerationOptions,
  ai: IAIAdapter,
  projectName: string,
): Promise<GeneratedBlogArticle> {
  const systemPrompt = `Você é um redator imobiliário especializado em conteúdo de alto padrão para o mercado brasileiro. Escreva em português brasileiro, tom ${options.tone ?? plan.tone}. O empreendimento é "${projectName}"${options.region ? ` na região de ${options.region}` : ''}.`;

  // Generate introduction
  const introPrompt = `Escreva uma introdução envolvente (2-3 parágrafos, ~120 palavras) para um artigo sobre o empreendimento. Contexto: ${plan.introduction}. Keywords: ${plan.keywords.join(', ')}.`;
  const introduction = await ai.generateText(introPrompt, {
    systemPrompt,
    maxTokens: 300,
    temperature: 0.7,
  });

  // Generate each section
  const sections: GeneratedBlogSection[] = [];
  for (const section of plan.sections) {
    const sectionPrompt = `Escreva a seção "${section.heading}" (${section.editorialRole}) do artigo. Contexto: ${section.summary}. Pontos a cobrir: ${section.draftPoints.join('; ')}. Gere 2-3 parágrafos (~${section.estimatedWordCount} palavras).`;
    const sectionText = await ai.generateText(sectionPrompt, {
      systemPrompt,
      maxTokens: 500,
      temperature: 0.7,
    });

    const paragraphs = sectionText.split('\n\n').filter((p) => p.trim().length > 20);
    sections.push({
      heading: section.heading,
      editorialRole: section.editorialRole,
      paragraphs,
      assetIds: section.assetIds,
      wordCount: countWords(sectionText),
    });
  }

  // Generate conclusion
  const conclusionPrompt = `Escreva a conclusão do artigo (~100 palavras). Sintetize os pontos principais e motive o leitor a agir. Contexto: ${plan.conclusion}`;
  const conclusion = await ai.generateText(conclusionPrompt, {
    systemPrompt,
    maxTokens: 200,
    temperature: 0.7,
  });

  // Generate CTA
  const ctaPrompt = `Escreva um CTA final persuasivo (~50 palavras) para agendar visita ao ${projectName}. Contexto: ${plan.ctaText}`;
  const ctaText = await ai.generateText(ctaPrompt, {
    systemPrompt,
    maxTokens: 100,
    temperature: 0.8,
  });

  const wordCount = countWords(introduction)
    + sections.reduce((sum, s) => sum + s.wordCount, 0)
    + countWords(conclusion)
    + countWords(ctaText);

  return {
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    introduction,
    sections,
    conclusion,
    ctaText,
    metaDescription: plan.metaDescription,
    keywords: plan.keywords,
    tone: options.tone ?? plan.tone,
    wordCount,
  };
}

// ---------------------------------------------------------------------------
// Text expansion helpers
// ---------------------------------------------------------------------------

function groupDraftPoints(points: string[]): string[][] {
  // Group 2-3 related points for paragraph generation
  const groups: string[][] = [];
  let current: string[] = [];

  for (const point of points) {
    current.push(point);
    if (current.length >= 2) {
      groups.push([...current]);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function expandPointGroup(points: string[], role: EditorialRole, tone: ToneOfVoice): string {
  // Expand draft points into a flowing paragraph
  const expanded = points.map((p) => {
    const trimmed = p.trim();
    // Already a full sentence
    if (trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')) {
      return trimmed;
    }
    // Short fragment — add context
    if (trimmed.length < 40) {
      return addContextToFragment(trimmed, role);
    }
    // Medium text — just ensure period
    return `${trimmed}.`;
  });

  return expanded.join(' ');
}

function addContextToFragment(fragment: string, role: EditorialRole): string {
  const prefixes: Partial<Record<EditorialRole, string[]>> = {
    [EditorialRole.OVERVIEW]: ['O empreendimento conta com', 'Destaque para', 'Um dos principais atributos é'],
    [EditorialRole.TOUR]: ['Entre os ambientes, destaca-se', 'Os moradores poderão desfrutar de', 'O projeto inclui'],
    [EditorialRole.LIFESTYLE]: ['Para quem valoriza qualidade de vida,', 'O lazer é completo, com', 'Os espaços de convivência incluem'],
    [EditorialRole.DIFFERENTIALS]: ['Um diferencial marcante é', 'O que torna este projeto único é', 'Entre os diferenciais,'],
    [EditorialRole.INVESTMENT]: ['Do ponto de vista financeiro,', 'A valorização esperada contempla', 'As condições incluem'],
    [EditorialRole.LOCATION]: ['A localização oferece acesso a', 'No entorno, encontram-se', 'A região se destaca por'],
  };

  const options = prefixes[role] ?? ['Destaque para'];
  const prefix = options[Math.floor(Math.random() * options.length)];
  return `${prefix} ${fragment.charAt(0).toLowerCase()}${fragment.slice(1)}.`;
}

function breakIntoChunks(text: string, maxChunkLen: number): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).length > maxChunkLen && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function buildDefaultIntro(projectName: string, tone: ToneOfVoice): string {
  const intros: Record<string, string> = {
    aspiracional: `O ${projectName} chega ao mercado para redefinir o conceito de viver bem. Com uma proposta que une design contemporâneo, localização estratégica e infraestrutura completa, este empreendimento foi concebido para quem não abre mão de exclusividade e sofisticação em cada detalhe do seu dia a dia.`,
    informativo: `Neste artigo, apresentamos uma análise completa do ${projectName} — um empreendimento que se destaca no cenário imobiliário por sua localização, infraestrutura e proposta de valor. Conheça os detalhes que fazem deste projeto uma referência no segmento.`,
    emocional: `Existe um lugar onde cada amanhecer é especial, onde os espaços foram pensados para criar memórias que duram uma vida inteira. O ${projectName} foi projetado para famílias que acreditam que o lar é muito mais do que um endereço — é onde a vida acontece de verdade.`,
    urgente: `O ${projectName} está em fase de lançamento e as condições especiais são por tempo limitado. Se você está buscando uma oportunidade real no mercado imobiliário, este é o momento de conhecer o que este empreendimento tem a oferecer.`,
    conversacional: `Já ouviu falar do ${projectName}? Se você está pesquisando opções no mercado imobiliário, vale muito a pena conhecer este empreendimento de perto. Neste artigo, vamos te mostrar tudo que ele tem de interessante.`,
    institucional: `O ${projectName} representa a mais recente realização de um grupo comprometido com excelência construtiva e inovação. Com padrões que atendem às mais exigentes expectativas do mercado, este empreendimento se posiciona como referência em sua categoria.`,
  };
  return intros[tone] ?? intros['informativo']!;
}

function buildIntroCloser(projectName: string, tone: ToneOfVoice): string {
  const closers: Record<string, string> = {
    aspiracional: `Descubra a seguir o que faz do ${projectName} uma escolha excepcional.`,
    informativo: `A seguir, detalhamos cada aspecto deste empreendimento.`,
    emocional: `Venha conhecer cada detalhe que torna o ${projectName} tão especial.`,
    urgente: `Confira agora os detalhes e não perca esta oportunidade.`,
    conversacional: `Vamos lá? Tem muita coisa boa para mostrar.`,
    institucional: `Apresentamos a seguir os atributos que distinguem este empreendimento.`,
  };
  return closers[tone] ?? '';
}

function buildSectionCloser(role: EditorialRole, projectName: string): string | null {
  const closers: Partial<Record<EditorialRole, string>> = {
    [EditorialRole.LIFESTYLE]: `Esses são apenas alguns dos espaços que tornam o ${projectName} um lugar verdadeiramente especial para viver.`,
    [EditorialRole.DIFFERENTIALS]: `Esses diferenciais posicionam o ${projectName} em um patamar elevado no mercado imobiliário da região.`,
    [EditorialRole.INVESTMENT]: `Os números reforçam: o ${projectName} é uma escolha inteligente tanto para moradia quanto para investimento.`,
    [EditorialRole.LOCATION]: `A localização é, sem dúvida, um dos maiores trunfos do ${projectName}.`,
  };
  return closers[role] ?? null;
}

// ---------------------------------------------------------------------------
// Tone-aware content
// ---------------------------------------------------------------------------

const TONE_OPENERS: Record<string, string> = {
  aspiracional: 'Para quem busca o melhor em cada detalhe,',
  informativo: 'Com base em uma análise criteriosa,',
  emocional: 'Há momentos que transformam vidas, e este é um deles.',
  urgente: 'O mercado não espera —',
  conversacional: 'Se você está procurando algo especial,',
  institucional: 'Em consonância com os mais elevados padrões,',
};

const SECTION_OPENERS: Record<string, string> = {
  [EditorialRole.OVERVIEW]: 'O {project} foi projetado pensando em cada detalhe, desde a concepção arquitetônica até os acabamentos finais.',
  [EditorialRole.TOUR]: 'Ao percorrer os ambientes do {project}, é possível perceber o cuidado com cada espaço.',
  [EditorialRole.LIFESTYLE]: 'A qualidade de vida no {project} vai muito além das paredes do apartamento.',
  [EditorialRole.DIFFERENTIALS]: 'O que realmente distingue o {project} dos demais empreendimentos da região?',
  [EditorialRole.FLOOR_PLANS]: 'As opções de plantas do {project} foram pensadas para atender diferentes perfis de moradores.',
  [EditorialRole.INVESTMENT]: 'Analisando o {project} sob a ótica do investimento, os números são bastante atrativos.',
  [EditorialRole.LOCATION]: 'A localização é um dos grandes trunfos do {project}.',
  [EditorialRole.BUILDER]: 'Por trás do {project} está uma construtora com histórico comprovado de entregas.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractProjectName(title: string): string {
  // Try to extract the building/project name from title
  const cleaned = title
    .replace(/:.*/g, '')
    .replace(/\s*[-—]\s*Tudo\s+Sobre.*/i, '')
    .replace(/\s*[-—]\s*Conheça.*/i, '')
    .trim();
  return cleaned || title;
}
