/**
 * BookAgent SaaS — Sales Page Copy (Página de Vendas)
 *
 * Estrutura completa da página de vendas com blocos de conversão.
 * Modelo: Problema → Solução → Demonstração → Prova → Oferta
 *
 * Diferente da landing page (captação), a sales page é para
 * visitantes que já conhecem o produto e precisam de convencimento.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalesBlock {
  id: string;
  type: 'problem' | 'agitation' | 'solution' | 'demonstration' | 'proof'
    | 'objection-handler' | 'offer' | 'urgency' | 'guarantee' | 'cta';
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  ctaText?: string;
}

// ---------------------------------------------------------------------------
// Sales blocks (PAS + Proof + Offer)
// ---------------------------------------------------------------------------

export const SALES_BLOCKS: SalesBlock[] = [
  // ═══════ PROBLEMA ═══════
  {
    id: 'problem',
    type: 'problem',
    heading: 'Você recebe books incríveis. E não faz nada com eles.',
    paragraphs: [
      'Todo mês chega material novo da construtora. Book de 20 páginas, imagens profissionais, perspectivas renderizadas, plantas detalhadas.',
      'Você abre, dá uma olhada, salva no celular. E ali ele fica.',
      'Não é por falta de vontade. É porque transformar aquele PDF em conteúdo de vendas dá trabalho. Muito trabalho.',
    ],
  },

  // ═══════ AGITAÇÃO ═══════
  {
    id: 'agitation',
    type: 'agitation',
    heading: 'Enquanto isso, outros corretores já estão vendendo',
    paragraphs: [
      'Aquele corretor que publica reels todo dia? Ele não é mais criativo que você. Ele tem processo.',
      'Aquela imobiliária que aparece no Google? Ela não tem mais conteúdo que você. Ela tem automação.',
      'A diferença entre quem vende e quem não vende não é talento. É velocidade de publicação.',
    ],
    bullets: [
      'O lead vê 3 corretores antes de escolher. Quem publica primeiro, pega o contato.',
      'Empreendimento com landing page própria gera 3x mais leads que link genérico.',
      'Corretor que posta reels todo dia vende 40% mais que quem posta uma vez por semana.',
    ],
  },

  // ═══════ SOLUÇÃO ═══════
  {
    id: 'solution',
    type: 'solution',
    heading: 'Apresentamos o BookAgent',
    paragraphs: [
      'O BookAgent é uma inteligência artificial especializada em marketing imobiliário.',
      'Você manda o PDF do book. A IA analisa cada página, identifica o que é fachada, o que é lazer, o que é planta, o que é localização.',
      'E gera automaticamente: reels, carrosséis, stories, artigo de blog, landing page com formulário. Tudo com a sua marca.',
      'Em menos de 2 minutos.',
    ],
  },

  // ═══════ DEMONSTRAÇÃO ═══════
  {
    id: 'demonstration',
    type: 'demonstration',
    heading: 'Veja o que o BookAgent gera a partir de um único PDF',
    paragraphs: [
      'A partir do book "Residencial Vista Verde" (10 páginas), o sistema gerou automaticamente:',
    ],
    bullets: [
      '4 reels em formato 9:16 (prontos para Instagram e TikTok)',
      '3 carrosséis com texto de venda e imagens do book',
      '1 artigo completo de blog (SEO-ready, 1.500+ palavras)',
      '1 landing page com hero, diferenciais, planta e formulário',
      '1 vídeo longo com narração por IA (60 segundos)',
      'Todos os outputs com logo, cores e CTA personalizados',
    ],
  },

  // ═══════ PROVA ═══════
  {
    id: 'proof',
    type: 'proof',
    heading: 'Tecnologia real, não promessa',
    paragraphs: [
      'O BookAgent não é um template pronto. É uma engine de 12 estágios de inteligência artificial.',
      'Cada book passa por: ingestão, análise de compatibilidade, reverse engineering editorial, extração de assets, correlação texto-imagem, branding, inteligência de fontes, narrativa, seleção de outputs, geração de mídia, personalização e exportação.',
      'A mesma tecnologia que empresas de mídia usam para produzir conteúdo em escala.',
    ],
    bullets: [
      '12 estágios de processamento inteligente',
      'IA que entende a estrutura editorial do book (não é OCR genérico)',
      'Preservação total das imagens originais (política formal de imutabilidade)',
      'Suporte a Claude (Anthropic) e GPT-4 (OpenAI) para geração de texto',
      'Voiceover profissional com 6 vozes via IA',
    ],
  },

  // ═══════ OBJEÇÃO ═══════
  {
    id: 'objection-quality',
    type: 'objection-handler',
    heading: '"Mas IA não faz conteúdo bom..."',
    paragraphs: [
      'Essa IA é diferente. Ela não gera conteúdo genérico — ela lê e entende o seu material.',
      'O BookAgent analisa a hierarquia visual do book, identifica o que é hero, lifestyle, técnico. E monta o conteúdo na mesma lógica que um profissional de marketing faria.',
      'As imagens originais nunca são alteradas. A composição visual usa camadas separadas. O resultado é profissional porque a base é profissional.',
    ],
  },
  {
    id: 'objection-price',
    type: 'objection-handler',
    heading: '"R$ 197/mês é caro..."',
    paragraphs: [
      'Um designer cobra R$ 300-500 por empreendimento. Um videomaker cobra R$ 500-1.000 por reel.',
      'Com o BookAgent Pro, você processa 15 books por mês. Isso daria R$ 13 por book.',
      'E entrega em 2 minutos o que demoraria 3-5 dias.',
    ],
    bullets: [
      'Sem designer: R$ 13/book vs R$ 300-500/book',
      'Sem videomaker: reels automáticos vs R$ 500/reel',
      'Sem redator: blog + landing page inclusos',
      'ROI: 1 venda paga mais de 1 ano de assinatura',
    ],
  },

  // ═══════ OFERTA ═══════
  {
    id: 'offer',
    type: 'offer',
    heading: 'Comece hoje. Teste grátis por 7 dias.',
    paragraphs: [
      'Escolha o plano que faz sentido para você. Teste com seus próprios books. Se não gostar, cancela sem pagar nada.',
    ],
    bullets: [
      'Starter (R$ 97/mês): 3 books/mês, reels, carrosséis, stories, branding',
      'Pro (R$ 197/mês): 15 books/mês, tudo do Starter + blog, landing page, vídeo, IA, voiceover',
      'Enterprise (R$ 497/mês): ilimitado + API + white-label + suporte dedicado',
    ],
    ctaText: 'Começar meu teste grátis',
  },

  // ═══════ URGÊNCIA ═══════
  {
    id: 'urgency',
    type: 'urgency',
    heading: 'Cada dia sem conteúdo é um lead perdido',
    paragraphs: [
      'O próximo book vai chegar no seu WhatsApp em breve. Você vai continuar salvando no celular? Ou vai transformar em 7+ peças de conteúdo profissional em 2 minutos?',
      'A diferença entre o corretor que vende e o que não vende não é o imóvel. É quem aparece primeiro.',
    ],
  },

  // ═══════ GARANTIA ═══════
  {
    id: 'guarantee',
    type: 'guarantee',
    heading: 'Garantia: 7 dias grátis + cancelamento sem burocracia',
    paragraphs: [
      'Teste com quantos books quiser nos primeiros 7 dias. Se não fizer sentido, cancela pelo painel. Sem ligação, sem e-mail, sem pergunta.',
    ],
  },

  // ═══════ CTA FINAL ═══════
  {
    id: 'final-cta',
    type: 'cta',
    heading: 'Transforme seu próximo book em conteúdo agora',
    paragraphs: [
      'Upload do PDF. 2 minutos. Conteúdo profissional pronto.',
    ],
    ctaText: 'Criar minha conta grátis',
  },
];
