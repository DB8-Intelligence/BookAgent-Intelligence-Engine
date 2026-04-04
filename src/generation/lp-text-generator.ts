/**
 * Landing Page Text Generator
 *
 * Transforma LandingPagePlan em copy final por seção.
 * V1: geração local com copy patterns de alta conversão.
 * V2: IAIAdapter para copy refinada com LLM.
 *
 * Estratégia:
 * - Gera headline/subheadline de hero com impacto
 * - Transforma contentPoints em copy persuasiva
 * - Gera CTAs contextuais por seção
 * - Aplica padrões AIDA (Attention, Interest, Desire, Action)
 */

import type { LandingPagePlan, LandingPageSection } from '../domain/entities/landing-page-plan.js';
import { LPSectionType, ConversionRole } from '../domain/entities/landing-page-plan.js';
import type { ToneOfVoice } from '../domain/entities/narrative.js';
import type { IAIAdapter } from '../domain/interfaces/ai-adapter.js';
import type {
  GeneratedLandingPageCopy,
  GeneratedLPSection,
  TextGenerationOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateLandingPageCopy(
  plan: LandingPagePlan,
  options: TextGenerationOptions,
  aiAdapter?: IAIAdapter,
): Promise<GeneratedLandingPageCopy> {
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
  plan: LandingPagePlan,
  options: TextGenerationOptions,
  projectName: string,
): GeneratedLandingPageCopy {
  const tone = options.tone ?? plan.tone;
  const heroSection = plan.sections.find((s) => s.sectionType === LPSectionType.HERO);

  const heroHeadline = generateHeroHeadline(heroSection, projectName, tone);
  const heroSubheadline = generateHeroSubheadline(heroSection, projectName, tone);
  const sections = plan.sections.map((s) => generateSectionCopy(s, projectName, tone));

  return {
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    heroHeadline,
    heroSubheadline,
    sections,
    metaDescription: plan.metaDescription,
    tone,
  };
}

function generateHeroHeadline(section: LandingPageSection | undefined, projectName: string, tone: ToneOfVoice): string {
  if (section?.heading && section.heading.length > 10) return section.heading;

  const headlines: Record<string, string> = {
    aspiracional: `${projectName} — Onde Seus Sonhos Ganham Endereço`,
    informativo: `${projectName} — Conheça Cada Detalhe`,
    emocional: `${projectName} — O Lar Que Sua Família Merece`,
    urgente: `${projectName} — Unidades Limitadas, Oportunidade Única`,
    conversacional: `${projectName} — Venha Conhecer de Perto`,
    institucional: `${projectName} — Excelência em Cada Metro Quadrado`,
  };
  return headlines[tone] ?? `${projectName} — Seu Novo Endereço`;
}

function generateHeroSubheadline(section: LandingPageSection | undefined, projectName: string, tone: ToneOfVoice): string {
  if (section?.subheading && section.subheading.length > 10) return section.subheading;

  const subs: Record<string, string> = {
    aspiracional: 'Localização privilegiada, design exclusivo e infraestrutura completa para uma vida extraordinária.',
    informativo: 'Empreendimento com localização estratégica, infraestrutura moderna e plantas inteligentes.',
    emocional: 'Cada espaço foi pensado para criar momentos que sua família nunca vai esquecer.',
    urgente: 'Condições especiais de lançamento. Garanta sua unidade antes que acabe.',
    conversacional: 'Quer saber por que tanta gente está falando desse empreendimento? Vem que a gente te mostra.',
    institucional: 'Um projeto que reflete décadas de experiência em desenvolvimento imobiliário de alto padrão.',
  };
  return subs[tone] ?? 'Descubra tudo sobre este empreendimento.';
}

function generateSectionCopy(section: LandingPageSection, projectName: string, tone: ToneOfVoice): GeneratedLPSection {
  const body = generateSectionBody(section, projectName, tone);
  const bulletPoints = generateBulletPoints(section, projectName);
  const ctaText = generateSectionCTA(section, projectName, tone);

  return {
    sectionType: section.sectionType,
    heading: section.heading,
    body,
    bulletPoints,
    ctaText,
  };
}

function generateSectionBody(section: LandingPageSection, projectName: string, tone: ToneOfVoice): string {
  // If section already has meaningful content points, compose them
  if (section.contentPoints.length >= 2) {
    const expanded = section.contentPoints
      .filter((p) => p.length > 10)
      .map((p) => ensureSentence(p))
      .join(' ');
    if (expanded.length > 50) return expanded;
  }

  // Generate body based on section type
  const bodies: Record<string, string> = {
    [LPSectionType.HERO]: `O ${projectName} é um empreendimento que une o melhor em localização, arquitetura e qualidade de vida. Cada detalhe foi cuidadosamente planejado para proporcionar uma experiência de moradia excepcional.`,
    [LPSectionType.ABOUT]: `Conheça o ${projectName} — um projeto que se destaca pela atenção aos detalhes, desde a fachada contemporânea até os acabamentos premium nos espaços privativos. Uma proposta que equilibra elegância e funcionalidade.`,
    [LPSectionType.GALLERY]: `Explore os ambientes do ${projectName} através das imagens. Cada espaço reflete o compromisso com design inteligente e acabamentos de alto padrão que fazem deste empreendimento uma referência na região.`,
    [LPSectionType.DIFFERENTIALS]: `O que torna o ${projectName} verdadeiramente especial vai além do convencional. São diferenciais pensados para quem exige mais do seu investimento e do seu estilo de vida.`,
    [LPSectionType.LIFESTYLE]: `No ${projectName}, o lazer é completo. Espaços projetados para todas as idades e momentos — da academia ao playground, do salão gourmet ao lounge — tudo ao alcance dos moradores.`,
    [LPSectionType.FLOOR_PLANS]: `As plantas do ${projectName} foram projetadas para otimizar cada metro quadrado, oferecendo opções que atendem desde casais até famílias maiores, com layouts funcionais e versáteis.`,
    [LPSectionType.INVESTMENT]: `Investir no ${projectName} é uma decisão inteligente. A localização estratégica, a qualidade construtiva e o potencial de valorização da região formam uma equação favorável para o seu patrimônio.`,
    [LPSectionType.LOCATION]: `A localização do ${projectName} coloca você no centro de tudo. Acesso facilitado a vias principais, comércios, serviços, escolas e opções de lazer que tornam o dia a dia mais prático e agradável.`,
    [LPSectionType.SOCIAL_PROOF]: `Quem conhece o ${projectName} de perto entende por que ele se destaca. A credibilidade da construtora, somada ao projeto inovador, gera confiança e segurança para quem está pronto para investir.`,
    [LPSectionType.CTA_FORM]: `Preencha o formulário abaixo e nossa equipe de consultores especializados entrará em contato para apresentar as condições especiais disponíveis para o ${projectName}.`,
    [LPSectionType.CTA_INLINE]: `Não deixe para depois. Agende sua visita ao ${projectName} e conheça pessoalmente cada detalhe que faz deste empreendimento uma escolha acertada.`,
    [LPSectionType.FOOTER]: `${projectName} — Imagens meramente ilustrativas. Informações sujeitas a alteração sem aviso prévio. Consulte condições vigentes.`,
  };

  return bodies[section.sectionType] ?? `Conheça mais sobre o ${projectName} e descubra por que este empreendimento é a escolha certa para você.`;
}

function generateBulletPoints(section: LandingPageSection, projectName: string): string[] {
  // If section has content points, use them (cleaned up)
  if (section.contentPoints.length > 0) {
    return section.contentPoints
      .filter((p) => p.length > 5)
      .map((p) => p.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);
  }

  // Generate defaults based on section type
  const defaults: Record<string, string[]> = {
    [LPSectionType.DIFFERENTIALS]: [
      'Acabamentos premium em todos os ambientes',
      'Projeto arquitetônico contemporâneo',
      'Infraestrutura de lazer completa',
      'Segurança 24 horas com tecnologia',
    ],
    [LPSectionType.LIFESTYLE]: [
      'Piscina adulto e infantil',
      'Academia completa e espaço fitness',
      'Salão gourmet e churrasqueira',
      'Playground e brinquedoteca',
      'Espaço coworking',
    ],
    [LPSectionType.INVESTMENT]: [
      'Região em crescente valorização',
      'Condições flexíveis de pagamento',
      'Padrão construtivo de alto nível',
      'Potencial de rentabilidade atrativo',
    ],
  };

  return defaults[section.sectionType] ?? [];
}

function generateSectionCTA(section: LandingPageSection, projectName: string, tone: ToneOfVoice): string | undefined {
  if (section.ctaText && section.ctaText.length > 5) return section.ctaText;

  // Only generate CTA for conversion-oriented sections
  if (section.conversionRole === ConversionRole.ACTION || section.conversionRole === ConversionRole.DESIRE) {
    const ctas: Record<string, string> = {
      aspiracional: 'Quero Conhecer',
      informativo: 'Saiba Mais',
      emocional: 'Realize Seu Sonho',
      urgente: 'Garanta Sua Unidade',
      conversacional: 'Fale com a Gente',
      institucional: 'Solicite Informações',
    };
    return ctas[tone] ?? 'Saiba Mais';
  }

  return section.ctaText || undefined;
}

// ---------------------------------------------------------------------------
// AI generation (V2)
// ---------------------------------------------------------------------------

async function generateWithAI(
  plan: LandingPagePlan,
  options: TextGenerationOptions,
  ai: IAIAdapter,
  projectName: string,
): Promise<GeneratedLandingPageCopy> {
  const systemPrompt = `Você é um copywriter especializado em landing pages de alta conversão para o mercado imobiliário brasileiro. Tom: ${options.tone ?? plan.tone}. Empreendimento: "${projectName}"${options.region ? `, ${options.region}` : ''}.`;

  const heroPrompt = `Crie uma headline impactante (máximo 10 palavras) e uma subheadline (máximo 25 palavras) para a hero section da landing page do ${projectName}. Formato: HEADLINE\\nSUBHEADLINE`;
  const heroResult = await ai.generateText(heroPrompt, { systemPrompt, maxTokens: 100, temperature: 0.8 });
  const [heroHeadline, heroSubheadline] = heroResult.split('\n').map((l) => l.trim());

  const sections: GeneratedLPSection[] = [];
  for (const section of plan.sections) {
    const sectionPrompt = `Escreva copy para a seção "${section.heading}" (tipo: ${section.sectionType}, papel: ${section.conversionRole}). Gere: 1) body (2-3 frases persuasivas), 2) até 4 bullet points, 3) texto de CTA se aplicável. Contexto: ${section.contentPoints.join('; ') || section.subheading}`;
    const sectionText = await ai.generateText(sectionPrompt, { systemPrompt, maxTokens: 300, temperature: 0.7 });

    // Parse AI response into structured format
    const lines = sectionText.split('\n').filter((l) => l.trim());
    const body = lines.filter((l) => !l.startsWith('-') && !l.startsWith('•') && !l.startsWith('CTA:')).join(' ');
    const bulletPoints = lines.filter((l) => l.startsWith('-') || l.startsWith('•')).map((l) => l.replace(/^[-•]\s*/, ''));
    const ctaLine = lines.find((l) => l.startsWith('CTA:'));

    sections.push({
      sectionType: section.sectionType,
      heading: section.heading,
      body: body || generateSectionBody(section, projectName, options.tone ?? plan.tone),
      bulletPoints,
      ctaText: ctaLine?.replace('CTA:', '').trim(),
    });
  }

  return {
    planId: plan.id,
    title: plan.title,
    slug: plan.slug,
    heroHeadline: heroHeadline ?? plan.title,
    heroSubheadline: heroSubheadline ?? plan.metaDescription,
    sections,
    metaDescription: plan.metaDescription,
    tone: options.tone ?? plan.tone,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')) return trimmed;
  return `${trimmed}.`;
}
