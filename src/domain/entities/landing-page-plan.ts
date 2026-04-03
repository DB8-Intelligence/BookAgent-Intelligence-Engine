/**
 * Entity: LandingPagePlan / LandingPageSection
 *
 * Plano estruturado para uma landing page de conversão.
 *
 * Uma landing page segue uma progressão de convencimento:
 * hero → contexto → diferenciais → lifestyle → prova visual →
 * investimento → autoridade → CTA com formulário
 *
 * Cada seção tem um papel na conversão (attention, interest,
 * desire, action — modelo AIDA) e carrega assets, textos
 * e instruções de branding.
 *
 * Consumido por renderizadores futuros (HTML builder, page
 * generators) que transformam o plano em página deployável.
 */

import type { NarrativeType, ToneOfVoice } from './narrative.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Tipo de seção na landing page */
export enum LPSectionType {
  HERO = 'hero',                   // Banner principal com headline + CTA
  ABOUT = 'about',                 // Sobre o empreendimento (conceito, visão)
  GALLERY = 'gallery',             // Galeria de imagens / carrossel visual
  DIFFERENTIALS = 'differentials', // Cards ou lista de diferenciais
  LIFESTYLE = 'lifestyle',         // Lazer e áreas comuns com imagens
  FLOOR_PLANS = 'floor-plans',     // Seletor de plantas / tipologias
  INVESTMENT = 'investment',       // Condições comerciais / valorização
  LOCATION = 'location',           // Mapa e vantagens de localização
  SOCIAL_PROOF = 'social-proof',   // Construtora, credenciais, prêmios
  CTA_INLINE = 'cta-inline',      // CTA intermediário (WhatsApp, agendar)
  CTA_FORM = 'cta-form',          // Formulário de captação de lead
  FOOTER = 'footer',              // Rodapé com contato e legal
}

/** Papel da seção na conversão (modelo AIDA) */
export enum ConversionRole {
  ATTENTION = 'attention',   // Captura atenção (hero, headline)
  INTEREST = 'interest',     // Gera interesse (diferenciais, lifestyle)
  DESIRE = 'desire',         // Cria desejo (galeria, investimento)
  ACTION = 'action',         // Converte (formulário, WhatsApp, CTA)
  TRUST = 'trust',           // Confiança (social proof, construtora)
}

/** Intenção de captação de lead */
export enum LeadCaptureIntent {
  VISIT_SCHEDULE = 'visit-schedule',   // Agendar visita ao decorado/plantão
  WHATSAPP_CONTACT = 'whatsapp',       // Falar via WhatsApp
  FORM_SUBMISSION = 'form',            // Preencher formulário
  PHONE_CALL = 'phone-call',           // Ligar para plantão
  DOWNLOAD_MATERIAL = 'download',      // Baixar material (book, tabela)
}

// ---------------------------------------------------------------------------
// LandingPageSection
// ---------------------------------------------------------------------------

export interface LandingPageSection {
  /** Identificador único da seção */
  id: string;

  /** Ordem na página (0-based, top to bottom) */
  order: number;

  /** Tipo da seção */
  sectionType: LPSectionType;

  /** Papel na conversão */
  conversionRole: ConversionRole;

  /** Heading principal (H1 no hero, H2 nas demais) */
  heading: string;

  /** Subheading / texto de apoio */
  subheading: string;

  /** IDs das Sources associadas */
  sourceIds: string[];

  /** IDs dos assets visuais */
  assetIds: string[];

  /** Resumo do conteúdo / briefing */
  summary: string;

  /** Pontos-chave a exibir (bullets, cards, features) */
  contentPoints: string[];

  /** Texto de CTA desta seção (se houver) */
  ctaText?: string;

  /** Background: 'image' | 'color' | 'gradient' */
  backgroundType: 'image' | 'color' | 'gradient';

  /** Cor de fundo hex (para color/gradient) */
  backgroundColor: string;
}

// ---------------------------------------------------------------------------
// LandingPagePlan
// ---------------------------------------------------------------------------

export interface LandingPagePlan {
  /** Identificador único do plano */
  id: string;

  /** Título da página (para <title> e OG) */
  title: string;

  /** Slug sugerido para URL */
  slug: string;

  /** Meta description (SEO / OG) */
  metaDescription: string;

  /** Tipo de narrativa de origem */
  narrativeType: NarrativeType;

  /** ID do NarrativePlan de origem */
  narrativePlanId: string;

  /** ID da OutputDecision de origem */
  outputDecisionId: string;

  /** Seções da página (ordenadas top-to-bottom) */
  sections: LandingPageSection[];

  /** Tom de voz */
  tone: ToneOfVoice;

  /** Intenções de captação suportadas */
  leadCaptureIntents: LeadCaptureIntent[];

  /** Fluxo de conversão recomendado */
  conversionFlow: string;

  /** Keywords/tags para SEO */
  keywords: string[];

  /** ID do asset para hero background */
  heroAssetId?: string;

  /** Cores de branding para a página */
  brandColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };

  /** Score de confiança (0-1) */
  confidence: number;
}
