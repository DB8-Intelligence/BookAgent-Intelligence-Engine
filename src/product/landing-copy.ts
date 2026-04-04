/**
 * BookAgent SaaS — Landing Page Copy
 *
 * Copy de alta conversão para a landing page principal.
 * Estruturada como dados consumíveis — pode ser usada por:
 * - Gerador de HTML estático
 * - Framework frontend (Next.js, Astro)
 * - Renderizador interno do BookAgent
 *
 * Modelo: AIDA (Attention → Interest → Desire → Action)
 * com blocos de prova social e urgência intercalados.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LandingSection {
  id: string;
  type: 'hero' | 'problem' | 'solution' | 'demo' | 'features' | 'how-it-works'
    | 'before-after' | 'pricing' | 'social-proof' | 'faq' | 'final-cta' | 'footer';
  heading: string;
  subheading?: string;
  body?: string;
  items?: Array<{ icon?: string; title: string; description: string }>;
  ctaText?: string;
  ctaUrl?: string;
  backgroundStyle: 'light' | 'dark' | 'gradient' | 'image';
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const LANDING_SECTIONS: LandingSection[] = [
  // ═══════════════ HERO ═══════════════
  {
    id: 'hero',
    type: 'hero',
    heading: 'Transforme qualquer book imobiliário em conteúdo de vendas automático',
    subheading: 'Upload do PDF. A IA analisa. Reels, carrosséis, blog e landing page prontos em minutos.',
    body: 'Chega de book parado no WhatsApp. O BookAgent entende seu material e gera tudo que você precisa para vender.',
    ctaText: 'Testar grátis por 7 dias',
    ctaUrl: '/signup',
    backgroundStyle: 'gradient',
  },

  // ═══════════════ PROBLEMA ═══════════════
  {
    id: 'problem',
    type: 'problem',
    heading: 'Você recebe o book e depois...',
    subheading: 'Seja honesto: quantos books já ficaram parados?',
    items: [
      {
        icon: 'inbox',
        title: 'O book chega no WhatsApp',
        description: 'A construtora manda um PDF bonito. Você salva. E ele fica lá.',
      },
      {
        icon: 'clock',
        title: 'Você não tem tempo de criar conteúdo',
        description: 'Teria que abrir o Canva, recortar imagens, pensar em texto. São horas.',
      },
      {
        icon: 'money',
        title: 'Pagar designer sai caro',
        description: 'R$ 200-500 por empreendimento. E ainda demora 3-5 dias para entregar.',
      },
      {
        icon: 'trending-down',
        title: 'Você perde o timing da venda',
        description: 'Enquanto espera o conteúdo, outros corretores já estão publicando.',
      },
    ],
    backgroundStyle: 'light',
  },

  // ═══════════════ SOLUÇÃO ═══════════════
  {
    id: 'solution',
    type: 'solution',
    heading: 'E se bastasse mandar o PDF?',
    subheading: 'O BookAgent faz em 2 minutos o que levaria horas',
    body: 'Você faz upload do book. A IA analisa cada página — identifica fachada, lazer, planta, localização. E gera automaticamente reels, posts, carrosséis, artigo de blog e landing page. Tudo com a sua marca.',
    ctaText: 'Quero ver funcionando',
    ctaUrl: '/demo',
    backgroundStyle: 'dark',
  },

  // ═══════════════ COMO FUNCIONA ═══════════════
  {
    id: 'how-it-works',
    type: 'how-it-works',
    heading: 'Como funciona',
    subheading: '3 passos. Sem complicação.',
    items: [
      {
        icon: '1',
        title: 'Upload do book',
        description: 'Mande o PDF do empreendimento. Pode ser o book, a lâmina, o material de vendas.',
      },
      {
        icon: '2',
        title: 'IA processa',
        description: 'O BookAgent analisa cada página, extrai imagens, identifica o estilo editorial e gera narrativas de vendas.',
      },
      {
        icon: '3',
        title: 'Conteúdo pronto',
        description: 'Baixe reels, carrosséis, stories, artigo de blog e landing page. Tudo personalizado com sua marca.',
      },
    ],
    backgroundStyle: 'light',
  },

  // ═══════════════ DEMO / ANTES x DEPOIS ═══════════════
  {
    id: 'before-after',
    type: 'before-after',
    heading: 'Antes vs Depois do BookAgent',
    items: [
      {
        icon: 'before',
        title: 'ANTES',
        description: 'PDF parado no celular. Sem conteúdo. Sem postagem. Sem leads.',
      },
      {
        icon: 'after',
        title: 'DEPOIS',
        description: '4 reels, 3 carrosséis, 1 artigo SEO, 1 landing page com formulário. Em 2 minutos.',
      },
    ],
    backgroundStyle: 'gradient',
  },

  // ═══════════════ FEATURES ═══════════════
  {
    id: 'features',
    type: 'features',
    heading: 'Tudo que você precisa para vender mais',
    subheading: 'Cada output é pensado para conversão',
    items: [
      {
        icon: 'video',
        title: 'Reels prontos para postar',
        description: 'Vídeos verticais com as melhores imagens do book, texto overlay e transições. Só baixar e publicar.',
      },
      {
        icon: 'grid',
        title: 'Carrosséis inteligentes',
        description: 'Posts com até 10 slides que contam a história do empreendimento. Texto de venda incluído.',
      },
      {
        icon: 'file-text',
        title: 'Artigo de blog',
        description: 'Texto completo, SEO-ready, com imagens do book. Ranqueie no Google para o nome do empreendimento.',
      },
      {
        icon: 'layout',
        title: 'Landing page',
        description: 'Página de captação com hero, diferenciais, galeria, planta e formulário de contato.',
      },
      {
        icon: 'mic',
        title: 'Voiceover com IA',
        description: 'Narração profissional para seus vídeos. 6 vozes disponíveis. Português natural.',
      },
      {
        icon: 'palette',
        title: 'Sua marca em tudo',
        description: 'Logo, cores, telefone, WhatsApp e CTA personalizados em todos os outputs.',
      },
    ],
    backgroundStyle: 'light',
  },

  // ═══════════════ SOCIAL PROOF ═══════════════
  {
    id: 'social-proof',
    type: 'social-proof',
    heading: 'Números que falam',
    items: [
      {
        icon: 'zap',
        title: '< 2 minutos',
        description: 'Tempo médio para processar um book completo',
      },
      {
        icon: 'package',
        title: '7+ outputs',
        description: 'Gerados automaticamente por cada book enviado',
      },
      {
        icon: 'cpu',
        title: '12 estágios de IA',
        description: 'Pipeline que entende, classifica e compõe como um profissional',
      },
      {
        icon: 'shield',
        title: '100% preservado',
        description: 'Imagens do book nunca são alteradas — qualidade original garantida',
      },
    ],
    backgroundStyle: 'dark',
  },

  // ═══════════════ PRICING ═══════════════
  {
    id: 'pricing',
    type: 'pricing',
    heading: 'Escolha seu plano',
    subheading: 'Cancele quando quiser. Sem fidelidade.',
    backgroundStyle: 'light',
  },

  // ═══════════════ FAQ ═══════════════
  {
    id: 'faq',
    type: 'faq',
    heading: 'Perguntas frequentes',
    items: [
      {
        title: 'Funciona com qualquer book?',
        description: 'Sim. O BookAgent processa PDFs de books imobiliários de qualquer construtora. Quanto melhor o material, melhor o resultado.',
      },
      {
        title: 'Preciso saber editar vídeo?',
        description: 'Não. Os reels e vídeos saem prontos para publicar. Você só baixa e posta.',
      },
      {
        title: 'As imagens do book são alteradas?',
        description: 'Nunca. O BookAgent tem uma política formal de preservação — as imagens originais são usadas como referência, nunca modificadas.',
      },
      {
        title: 'Posso colocar minha marca?',
        description: 'Sim. Logo, cores, telefone, WhatsApp e CTA aparecem em todos os outputs.',
      },
      {
        title: 'Como funciona o pagamento?',
        description: 'Assinatura mensal ou anual via cartão de crédito ou PIX. Cancele a qualquer momento.',
      },
      {
        title: 'Tem teste grátis?',
        description: 'Sim! 7 dias grátis para testar com seus próprios books. Sem compromisso.',
      },
      {
        title: 'Posso integrar no meu sistema?',
        description: 'Sim, no plano Enterprise. Oferecemos API REST completa para integração com CRM, ERP ou portal imobiliário.',
      },
    ],
    backgroundStyle: 'light',
  },

  // ═══════════════ FINAL CTA ═══════════════
  {
    id: 'final-cta',
    type: 'final-cta',
    heading: 'Pare de perder vendas por falta de conteúdo',
    subheading: 'Transforme seu próximo book em 7+ peças de conteúdo profissional',
    body: 'Enquanto você está lendo isso, outros corretores já estão publicando. A diferença? Eles automatizaram.',
    ctaText: 'Começar grátis agora',
    ctaUrl: '/signup',
    backgroundStyle: 'gradient',
  },

  // ═══════════════ FOOTER ═══════════════
  {
    id: 'footer',
    type: 'footer',
    heading: 'BookAgent',
    subheading: 'by DB8 Intelligence',
    body: 'Inteligência artificial especializada em marketing imobiliário.',
    backgroundStyle: 'dark',
  },
];
