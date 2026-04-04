/**
 * BookAgent SaaS — Definição de Produto
 *
 * Estrutura completa de monetização do BookAgent Intelligence Engine
 * como produto SaaS de assinatura mensal.
 *
 * Posicionamento:
 *   "Transforme qualquer book imobiliário em conteúdo de vendas automático"
 *
 * Público-alvo:
 *   - Corretores de imóveis (individual)
 *   - Imobiliárias (equipe)
 *   - Incorporadoras (enterprise/API)
 *
 * Modelo de distribuição:
 *   ┌─────────────────────────────────────┐
 *   │    BookAgent Intelligence Engine    │  ← Core (este projeto)
 *   ├─────────┬───────────┬──────────────┤
 *   │  SaaS   │    MCP    │    API B2B   │  ← Canais de distribuição
 *   │ (direto)│ (interno) │  (empresas)  │
 *   └─────────┴───────────┴──────────────┘
 */

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export enum PlanTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export interface PlanFeature {
  /** ID da feature */
  id: string;
  /** Descrição curta */
  label: string;
  /** Descrição expandida (para tooltip) */
  description: string;
  /** Disponível neste plano? */
  included: boolean;
  /** Limite quantitativo (null = ilimitado) */
  limit: number | null;
  /** Unidade do limite */
  unit?: string;
}

export interface PricingPlan {
  /** Identificador do plano */
  tier: PlanTier;
  /** Nome de exibição */
  name: string;
  /** Subtítulo / tagline */
  tagline: string;
  /** Preço mensal em BRL */
  priceMonthly: number;
  /** Preço anual em BRL (com desconto) */
  priceYearly: number;
  /** Features incluídas */
  features: PlanFeature[];
  /** Se é o plano destacado (mais vendido) */
  highlighted: boolean;
  /** CTA text do botão */
  ctaText: string;
  /** Texto de desconto (ex: "Economize 20%") */
  yearlyDiscount?: string;
}

// ---------------------------------------------------------------------------
// Definição dos planos
// ---------------------------------------------------------------------------

const SHARED_FEATURES = {
  bookUpload: (limit: number | null): PlanFeature => ({
    id: 'book-upload',
    label: `${limit ?? '∞'} books/mês`,
    description: 'Upload de books em PDF para processamento automático',
    included: true,
    limit,
    unit: 'books/mês',
  }),
  reels: (included: boolean, limit: number | null): PlanFeature => ({
    id: 'reels',
    label: 'Geração de Reels',
    description: 'Vídeos verticais 9:16 otimizados para Instagram/TikTok',
    included,
    limit,
    unit: 'reels/book',
  }),
  carousels: (included: boolean): PlanFeature => ({
    id: 'carousels',
    label: 'Carrosséis automáticos',
    description: 'Posts carrossel com até 10 slides, texto e branding',
    included,
    limit: null,
  }),
  stories: (included: boolean): PlanFeature => ({
    id: 'stories',
    label: 'Stories prontos',
    description: 'Stories verticais com texto overlay e CTA',
    included,
    limit: null,
  }),
  blog: (included: boolean): PlanFeature => ({
    id: 'blog',
    label: 'Artigo de blog',
    description: 'Artigo SEO-ready com seções, imagens e CTA',
    included,
    limit: null,
  }),
  landingPage: (included: boolean): PlanFeature => ({
    id: 'landing-page',
    label: 'Landing page',
    description: 'Página de conversão AIDA com formulário e WhatsApp',
    included,
    limit: null,
  }),
  video: (included: boolean): PlanFeature => ({
    id: 'video',
    label: 'Vídeo longo com narração',
    description: 'Vídeo de 60-120s com voiceover profissional',
    included,
    limit: null,
  }),
  aiCopy: (included: boolean): PlanFeature => ({
    id: 'ai-copy',
    label: 'Copy gerada por IA',
    description: 'Textos refinados por Claude/GPT-4 (vs geração local)',
    included,
    limit: null,
  }),
  voiceover: (included: boolean): PlanFeature => ({
    id: 'voiceover',
    label: 'Voiceover IA',
    description: 'Narração profissional via OpenAI TTS com 6 vozes',
    included,
    limit: null,
  }),
  branding: (included: boolean): PlanFeature => ({
    id: 'branding',
    label: 'Personalização de marca',
    description: 'Logo, cores, assinatura e CTA personalizados',
    included,
    limit: null,
  }),
  apiAccess: (included: boolean): PlanFeature => ({
    id: 'api-access',
    label: 'Acesso à API',
    description: 'Integração via REST API para automação e sistemas próprios',
    included,
    limit: null,
  }),
  whiteLabel: (included: boolean): PlanFeature => ({
    id: 'white-label',
    label: 'White-label',
    description: 'Marca própria nos outputs (sem logo BookAgent)',
    included,
    limit: null,
  }),
  dedicatedSupport: (included: boolean): PlanFeature => ({
    id: 'dedicated-support',
    label: 'Suporte dedicado',
    description: 'Gerente de conta + onboarding personalizado',
    included,
    limit: null,
  }),
};

export const PRICING_PLANS: PricingPlan[] = [
  // --- STARTER ---
  {
    tier: PlanTier.STARTER,
    name: 'Starter',
    tagline: 'Para corretores que querem começar a usar IA',
    priceMonthly: 97,
    priceYearly: 970,
    yearlyDiscount: 'Economize R$ 194/ano',
    highlighted: false,
    ctaText: 'Começar agora',
    features: [
      SHARED_FEATURES.bookUpload(3),
      SHARED_FEATURES.reels(true, 2),
      SHARED_FEATURES.carousels(true),
      SHARED_FEATURES.stories(true),
      SHARED_FEATURES.blog(false),
      SHARED_FEATURES.landingPage(false),
      SHARED_FEATURES.video(false),
      SHARED_FEATURES.aiCopy(false),
      SHARED_FEATURES.voiceover(false),
      SHARED_FEATURES.branding(true),
      SHARED_FEATURES.apiAccess(false),
      SHARED_FEATURES.whiteLabel(false),
      SHARED_FEATURES.dedicatedSupport(false),
    ],
  },

  // --- PRO ---
  {
    tier: PlanTier.PRO,
    name: 'Pro',
    tagline: 'Para profissionais que vivem de imóveis',
    priceMonthly: 197,
    priceYearly: 1970,
    yearlyDiscount: 'Economize R$ 394/ano',
    highlighted: true,
    ctaText: 'Quero o Pro',
    features: [
      SHARED_FEATURES.bookUpload(15),
      SHARED_FEATURES.reels(true, null),
      SHARED_FEATURES.carousels(true),
      SHARED_FEATURES.stories(true),
      SHARED_FEATURES.blog(true),
      SHARED_FEATURES.landingPage(true),
      SHARED_FEATURES.video(true),
      SHARED_FEATURES.aiCopy(true),
      SHARED_FEATURES.voiceover(true),
      SHARED_FEATURES.branding(true),
      SHARED_FEATURES.apiAccess(false),
      SHARED_FEATURES.whiteLabel(false),
      SHARED_FEATURES.dedicatedSupport(false),
    ],
  },

  // --- ENTERPRISE ---
  {
    tier: PlanTier.ENTERPRISE,
    name: 'Enterprise',
    tagline: 'Para imobiliárias e incorporadoras',
    priceMonthly: 497,
    priceYearly: 4970,
    yearlyDiscount: 'Economize R$ 994/ano',
    highlighted: false,
    ctaText: 'Falar com especialista',
    features: [
      SHARED_FEATURES.bookUpload(null),
      SHARED_FEATURES.reels(true, null),
      SHARED_FEATURES.carousels(true),
      SHARED_FEATURES.stories(true),
      SHARED_FEATURES.blog(true),
      SHARED_FEATURES.landingPage(true),
      SHARED_FEATURES.video(true),
      SHARED_FEATURES.aiCopy(true),
      SHARED_FEATURES.voiceover(true),
      SHARED_FEATURES.branding(true),
      SHARED_FEATURES.apiAccess(true),
      SHARED_FEATURES.whiteLabel(true),
      SHARED_FEATURES.dedicatedSupport(true),
    ],
  },
];

// ---------------------------------------------------------------------------
// Value proposition
// ---------------------------------------------------------------------------

export const VALUE_PROPOSITION = {
  headline: 'Transforme qualquer book imobiliário em conteúdo de vendas automático',
  subheadline: 'Upload do PDF → IA analisa → Conteúdo pronto em minutos',
  targetAudience: [
    'Corretores de imóveis que recebem books e não sabem o que fazer com eles',
    'Imobiliárias que precisam de conteúdo para múltiplos empreendimentos',
    'Incorporadoras que querem escalar a produção de marketing',
  ],
  painPoints: [
    'Recebe o book da construtora e ele fica parado no WhatsApp',
    'Gasta horas tentando criar conteúdo manualmente',
    'Paga designer caro para algo que deveria ser automático',
    'Perde vendas porque não publica conteúdo no tempo certo',
    'Não sabe criar reels, carrosséis ou landing pages',
  ],
  benefits: [
    { icon: 'upload', title: 'Upload simples', description: 'Manda o PDF e deixa a IA trabalhar' },
    { icon: 'video', title: 'Reels automáticos', description: 'Vídeos prontos para Instagram e TikTok' },
    { icon: 'carousel', title: 'Carrosséis inteligentes', description: 'Posts com as melhores imagens e textos do book' },
    { icon: 'blog', title: 'Blog SEO-ready', description: 'Artigo completo para ranquear no Google' },
    { icon: 'landing', title: 'Landing page', description: 'Página de captação com formulário e WhatsApp' },
    { icon: 'brand', title: 'Sua marca', description: 'Logo, cores e CTA personalizados em tudo' },
  ],
  differentials: [
    'Não é um editor genérico — é especializado em imóveis',
    'Preserva as imagens originais do book (não distorce, não "melhora")',
    'Entende a estrutura do book: hero, lifestyle, planta, localização',
    'Gera conteúdo alinhado ao estilo editorial do material',
    'IA de verdade (Claude/GPT-4), não templates prontos',
  ],
  socialProof: {
    metric1: { value: '< 2 min', label: 'Tempo médio de processamento' },
    metric2: { value: '7+', label: 'Outputs gerados por book' },
    metric3: { value: '12', label: 'Estágios de IA no pipeline' },
  },
} as const;

// ---------------------------------------------------------------------------
// Distribution channels
// ---------------------------------------------------------------------------

export enum DistributionChannel {
  /** Produto SaaS vendido diretamente */
  SAAS_DIRECT = 'saas-direct',
  /** MCP Server para uso em ecossistema interno */
  MCP_SERVER = 'mcp-server',
  /** API REST para integração B2B */
  API_B2B = 'api-b2b',
}

export interface ChannelConfig {
  channel: DistributionChannel;
  name: string;
  description: string;
  targetAudience: string;
  revenueModel: string;
  status: 'active' | 'planned' | 'beta';
}

export const DISTRIBUTION_CHANNELS: ChannelConfig[] = [
  {
    channel: DistributionChannel.SAAS_DIRECT,
    name: 'BookAgent SaaS',
    description: 'Produto web com upload de PDF e geração automática de conteúdo',
    targetAudience: 'Corretores individuais e pequenas imobiliárias',
    revenueModel: 'Assinatura mensal/anual (R$ 97 - R$ 497/mês)',
    status: 'planned',
  },
  {
    channel: DistributionChannel.MCP_SERVER,
    name: 'BookAgent MCP',
    description: 'Model Context Protocol server para uso dentro do ecossistema Claude/AI',
    targetAudience: 'Desenvolvedores e agentes internos DB8',
    revenueModel: 'Uso interno + licenciamento para parceiros',
    status: 'planned',
  },
  {
    channel: DistributionChannel.API_B2B,
    name: 'BookAgent API',
    description: 'REST API para incorporadoras e plataformas imobiliárias',
    targetAudience: 'Incorporadoras, portais imobiliários, ERPs',
    revenueModel: 'Pay-per-use + plano enterprise mensal',
    status: 'planned',
  },
];
