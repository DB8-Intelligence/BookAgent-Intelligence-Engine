/**
 * Media Script Generator
 *
 * Transforma MediaPlan em roteiro com falas/narração por cena.
 * V1: geração local a partir dos overlays e briefings.
 * V2: IAIAdapter para roteiro refinado com LLM.
 *
 * Estratégia:
 * - Gera headline por cena a partir dos text overlays existentes
 * - Cria narração falada para cada cena (voiceover script)
 * - Adiciona descrição visual para orientar produção
 * - Mantém timing e duração coerentes
 */

import type { MediaPlan, MediaScene, TextOverlay } from '../domain/entities/media-plan.js';
import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type {
  GeneratedMediaScript,
  GeneratedSceneScript,
  TextGenerationOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateMediaScript(
  plan: MediaPlan,
  options: TextGenerationOptions,
  aiAdapter?: IAIAdapter,
): Promise<GeneratedMediaScript> {
  const projectName = options.projectName ?? plan.title;

  if (options.mode === 'ai' && aiAdapter) {
    return generateWithAI(plan, options, aiAdapter, projectName);
  }

  return generateLocally(plan, options, projectName);
}

// ---------------------------------------------------------------------------
// Local generation (V1)
// ---------------------------------------------------------------------------

function generateLocally(
  plan: MediaPlan,
  options: TextGenerationOptions,
  projectName: string,
): GeneratedMediaScript {
  const scenes = plan.scenes.map((scene) => generateSceneScript(scene, projectName, plan.format));

  return {
    planId: plan.id,
    title: plan.title,
    format: plan.format,
    scenes,
    totalDurationSeconds: plan.totalDurationSeconds,
  };
}

function generateSceneScript(scene: MediaScene, projectName: string, format: string): GeneratedSceneScript {
  const headline = extractHeadline(scene);
  const narration = generateNarration(scene, projectName, format);
  const visualDescription = generateVisualDescription(scene);

  return {
    order: scene.order,
    role: scene.role,
    headline,
    narration,
    visualDescription,
    durationSeconds: scene.durationSeconds,
  };
}

function extractHeadline(scene: MediaScene): string {
  const headlineOverlay = scene.textOverlays.find((o) => o.role === 'headline');
  if (headlineOverlay) return headlineOverlay.text;

  const bodyOverlay = scene.textOverlays.find((o) => o.role === 'body');
  if (bodyOverlay) return bodyOverlay.text;

  return ROLE_HEADLINES[scene.role] ?? '';
}

function generateNarration(scene: MediaScene, projectName: string, format: string): string {
  // Collect all text content from the scene
  const texts = scene.textOverlays.map((o) => o.text).filter(Boolean);
  const ctaOverlay = scene.textOverlays.find((o) => o.role === 'cta');

  // Short formats (reel, story) get brief narration
  const isShort = ['reel', 'story', 'post'].includes(format);
  const maxLength = isShort ? 80 : 200;

  // Role-based narration
  const roleNarration = generateRoleNarration(scene.role, projectName, texts, isShort);

  // For CTA scenes, prioritize the CTA text
  if (ctaOverlay) {
    return isShort
      ? ctaOverlay.text
      : `${roleNarration} ${ctaOverlay.text}`;
  }

  // Ensure narration fits timing (rough: 2.5 words/second for speech)
  if (scene.durationSeconds != null) {
    const maxWords = Math.floor(scene.durationSeconds * 2.5);
    const words = roleNarration.split(/\s+/);
    if (words.length > maxWords) {
      return words.slice(0, maxWords).join(' ') + '.';
    }
  }

  return roleNarration.length > maxLength
    ? roleNarration.slice(0, maxLength).replace(/\s\S*$/, '') + '.'
    : roleNarration;
}

function generateRoleNarration(role: string, projectName: string, texts: string[], isShort: boolean): string {
  // Use existing text content if available and substantial
  const combined = texts.join('. ').trim();
  if (combined.length > 30) {
    return isShort ? combined.split('.')[0] + '.' : combined;
  }

  // Generate narration by role
  if (isShort) {
    return SHORT_NARRATIONS[role]?.replace('{project}', projectName)
      ?? `Conheça o ${projectName}.`;
  }

  return LONG_NARRATIONS[role]?.replace('{project}', projectName)
    ?? `Descubra o que o ${projectName} tem a oferecer. Cada detalhe foi planejado para proporcionar a melhor experiência de moradia.`;
}

function generateVisualDescription(scene: MediaScene): string {
  const parts: string[] = [];

  // Layout hint
  parts.push(`Layout: ${scene.layoutHint}`);

  // Asset info
  if (scene.assetIds.length > 0) {
    parts.push(`Asset: ${scene.assetIds[0]}`);
  } else {
    parts.push(`Fundo: ${scene.branding.backgroundColor}`);
  }

  // Overlay positions
  for (const overlay of scene.textOverlays) {
    parts.push(`${overlay.role}@${overlay.position}: "${overlay.text.slice(0, 50)}${overlay.text.length > 50 ? '...' : ''}"`);
  }

  // Transition
  parts.push(`Transição: ${scene.transition}`);

  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// AI generation (V2)
// ---------------------------------------------------------------------------

async function generateWithAI(
  plan: MediaPlan,
  options: TextGenerationOptions,
  ai: IAIAdapter,
  projectName: string,
): Promise<GeneratedMediaScript> {
  const isShort = ['reel', 'story', 'post'].includes(plan.format);
  const systemPrompt = `Você é um roteirista de vídeos imobiliários para redes sociais. Escreva em português brasileiro, tom ${options.tone ?? 'aspiracional'}. Empreendimento: "${projectName}". Formato: ${plan.format}${isShort ? ' (máximo 2 frases por cena)' : ''}.`;

  const scenes: GeneratedSceneScript[] = [];

  for (const scene of plan.scenes) {
    const overlayTexts = scene.textOverlays.map((o) => `[${o.role}] ${o.text}`).join('\n');
    const prompt = `Cena ${scene.order + 1} (${scene.role}, ${scene.durationSeconds ?? 4}s):
Textos existentes: ${overlayTexts || 'nenhum'}
Layout: ${scene.layoutHint}

Gere:
1. HEADLINE: frase curta de impacto (máx 8 palavras)
2. NARRAÇÃO: texto para voiceover (máx ${Math.ceil((scene.durationSeconds ?? 4) * 2.5)} palavras)
3. VISUAL: descrição visual da cena em 1 frase`;

    const result = await ai.generateText(prompt, { systemPrompt, maxTokens: 200, temperature: 0.7 });
    const lines = result.split('\n').filter((l) => l.trim());

    const headline = lines.find((l) => l.includes('HEADLINE'))?.replace(/.*HEADLINE[:\s]*/i, '') ?? extractHeadline(scene);
    const narration = lines.find((l) => l.includes('NARRAÇÃO') || l.includes('NARRACAO'))?.replace(/.*NARRA[ÇC][AÃ]O[:\s]*/i, '') ?? '';
    const visual = lines.find((l) => l.includes('VISUAL'))?.replace(/.*VISUAL[:\s]*/i, '') ?? generateVisualDescription(scene);

    scenes.push({
      order: scene.order,
      role: scene.role,
      headline,
      narration: narration || generateNarration(scene, projectName, plan.format),
      visualDescription: visual,
      durationSeconds: scene.durationSeconds,
    });
  }

  return {
    planId: plan.id,
    title: plan.title,
    format: plan.format,
    scenes,
    totalDurationSeconds: plan.totalDurationSeconds,
  };
}

// ---------------------------------------------------------------------------
// Narration templates
// ---------------------------------------------------------------------------

const ROLE_HEADLINES: Record<string, string> = {
  hook: 'Descubra o Novo',
  context: 'Onde Tudo Começa',
  showcase: 'Conheça os Ambientes',
  lifestyle: 'Viva com Estilo',
  differentiator: 'O Diferencial',
  'social-proof': 'Qualidade Comprovada',
  investment: 'Investimento Inteligente',
  reinforcement: 'Mais Motivos',
  closing: 'O Momento é Agora',
  cta: 'Agende Sua Visita',
};

const SHORT_NARRATIONS: Record<string, string> = {
  hook: 'Conheça o {project}. O empreendimento que vai surpreender você.',
  context: '{project} — localização privilegiada e infraestrutura completa.',
  showcase: 'Ambientes pensados para seu conforto e bem-estar.',
  lifestyle: 'Lazer completo para toda a família.',
  differentiator: 'Diferenciais que fazem toda a diferença.',
  'social-proof': 'Qualidade e confiança que você merece.',
  investment: 'Investimento inteligente com alto potencial.',
  reinforcement: 'Mais um motivo para escolher o {project}.',
  closing: 'O {project} espera por você.',
  cta: 'Agende sua visita. Link na bio.',
};

const LONG_NARRATIONS: Record<string, string> = {
  hook: 'Bem-vindo ao {project}. Um empreendimento que redefine o conceito de viver bem, combinando design contemporâneo, localização estratégica e infraestrutura de primeira linha.',
  context: 'O {project} está localizado em uma das regiões mais valorizadas da cidade, com acesso facilitado a tudo o que você precisa para o dia a dia. Uma localização pensada para quem valoriza praticidade e qualidade de vida.',
  showcase: 'Ao percorrer os ambientes do {project}, é possível perceber o cuidado com cada detalhe. Dos acabamentos de alto padrão às plantas inteligentes, cada espaço foi projetado para proporcionar o máximo de conforto e funcionalidade.',
  lifestyle: 'A área de lazer do {project} é um capítulo à parte. Piscina, academia, espaço gourmet, playground — tudo pensado para que cada momento em casa seja especial, para todas as idades e ocasiões.',
  differentiator: 'O que torna o {project} verdadeiramente único são seus diferenciais exclusivos. Da tecnologia construtiva aos itens de conforto, cada elemento foi escolhido para superar as expectativas dos moradores mais exigentes.',
  'social-proof': 'Por trás do {project} está uma equipe comprometida com excelência. Anos de experiência e dezenas de empreendimentos entregues com sucesso são a garantia de que você está fazendo a escolha certa.',
  investment: 'Analisando o {project} sob a ótica do investimento, os números são convincentes. A valorização da região, aliada à qualidade construtiva, faz deste empreendimento uma oportunidade rara no mercado atual.',
  reinforcement: 'E os benefícios do {project} não param por aí. Cada novo detalhe que você descobre reforça a certeza de que este é o empreendimento certo para o seu momento de vida.',
  closing: 'O {project} é mais do que um empreendimento — é a materialização de um estilo de vida que combina sofisticação, praticidade e bem-estar em um só endereço.',
  cta: 'Não perca esta oportunidade. Agende sua visita ao {project} e conheça pessoalmente cada detalhe. Nossa equipe de consultores está pronta para apresentar as condições especiais disponíveis nesta fase.',
};
