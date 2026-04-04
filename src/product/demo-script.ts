/**
 * BookAgent SaaS — Demo Reel Script + Instagram Content Strategy
 *
 * Roteiro do reel de demonstração do produto e
 * estratégia de conteúdo para aquisição via Instagram.
 *
 * O demo reel pode ser gerado pelo próprio BookAgent
 * usando o media script generator + video renderer.
 */

// ---------------------------------------------------------------------------
// Demo Reel Script (30s - Instagram Reel)
// ---------------------------------------------------------------------------

export interface ReelScene {
  order: number;
  durationSeconds: number;
  visual: string;
  text: string;
  narration: string;
  transition: 'cut' | 'fade' | 'slide';
}

export const DEMO_REEL_SCRIPT: ReelScene[] = [
  {
    order: 0,
    durationSeconds: 3,
    visual: 'Tela de celular com PDF de book aberto',
    text: 'Você recebe o book...',
    narration: 'Você recebe o book da construtora.',
    transition: 'cut',
  },
  {
    order: 1,
    durationSeconds: 2,
    visual: 'Gesto de arrastar PDF para o BookAgent',
    text: '...manda o PDF...',
    narration: 'Manda o PDF.',
    transition: 'slide',
  },
  {
    order: 2,
    durationSeconds: 3,
    visual: 'Animação de processamento (barra de progresso com ícones dos 12 estágios)',
    text: 'A IA analisa tudo',
    narration: 'A IA analisa cada página em segundos.',
    transition: 'fade',
  },
  {
    order: 3,
    durationSeconds: 4,
    visual: 'Grid mostrando 4 reels gerados + carrossel + blog',
    text: '7+ conteúdos prontos',
    narration: 'E entrega sete peças de conteúdo profissional. Prontas para publicar.',
    transition: 'slide',
  },
  {
    order: 4,
    durationSeconds: 3,
    visual: 'Exemplo de reel gerado com imagens do book',
    text: 'Reels automáticos',
    narration: 'Reels com as melhores imagens do book.',
    transition: 'slide',
  },
  {
    order: 5,
    durationSeconds: 3,
    visual: 'Exemplo de carrossel com texto de venda',
    text: 'Carrosséis inteligentes',
    narration: 'Carrosséis com texto de venda incluído.',
    transition: 'slide',
  },
  {
    order: 6,
    durationSeconds: 3,
    visual: 'Landing page com formulário',
    text: 'Landing page com formulário',
    narration: 'Landing page com formulário de captação.',
    transition: 'slide',
  },
  {
    order: 7,
    durationSeconds: 4,
    visual: 'Logo BookAgent + CTA',
    text: 'BookAgent\nTeste grátis por 7 dias',
    narration: 'BookAgent. Teste grátis por sete dias. Link na bio.',
    transition: 'fade',
  },
  {
    order: 8,
    durationSeconds: 5,
    visual: 'Tela do produto com outputs sendo baixados',
    text: 'Em menos de 2 minutos',
    narration: 'Tudo em menos de dois minutos. Chega de book parado.',
    transition: 'fade',
  },
];

// ---------------------------------------------------------------------------
// Instagram Content Strategy
// ---------------------------------------------------------------------------

export interface ContentPillar {
  id: string;
  name: string;
  description: string;
  frequency: string;
  formats: string[];
  examples: string[];
}

export interface ContentCalendar {
  weekday: string;
  pillar: string;
  format: string;
  example: string;
}

export const CONTENT_PILLARS: ContentPillar[] = [
  {
    id: 'transformation',
    name: 'Transformação',
    description: 'Mostrar o antes/depois: book parado → conteúdo pronto',
    frequency: '3x/semana',
    formats: ['reel', 'carrossel'],
    examples: [
      'Reel: "Do PDF ao Reel em 2 minutos" (screencast acelerado)',
      'Carrossel: "O que a IA encontrou neste book" (página por página)',
      'Reel: "Corretor que posta vs corretor que não posta" (meme format)',
    ],
  },
  {
    id: 'education',
    name: 'Educação',
    description: 'Ensinar conceitos de marketing imobiliário digital',
    frequency: '2x/semana',
    formats: ['carrossel', 'story'],
    examples: [
      'Carrossel: "5 tipos de conteúdo que todo corretor deveria criar"',
      'Carrossel: "Por que seu empreendimento precisa de uma landing page"',
      'Story: "Dica rápida: como usar o hero do book no seu feed"',
    ],
  },
  {
    id: 'proof',
    name: 'Prova social',
    description: 'Resultados reais, números, outputs gerados',
    frequency: '2x/semana',
    formats: ['reel', 'post'],
    examples: [
      'Reel: "7 outputs a partir de 1 PDF. Veja todos." (slideshow)',
      'Post: "Processamos 47 books esta semana. 329 peças de conteúdo geradas."',
      'Reel: "Corretor testou o BookAgent pela primeira vez" (reaction)',
    ],
  },
  {
    id: 'product',
    name: 'Produto',
    description: 'Features, novidades, tutoriais do BookAgent',
    frequency: '1x/semana',
    formats: ['reel', 'carrossel'],
    examples: [
      'Reel: "Nova feature: voiceover com IA nos seus vídeos"',
      'Carrossel: "Tutorial: como personalizar sua marca no BookAgent"',
      'Reel: "Comparando: fazer manual vs BookAgent" (split screen)',
    ],
  },
];

export const WEEKLY_CALENDAR: ContentCalendar[] = [
  { weekday: 'Segunda', pillar: 'transformation', format: 'reel', example: 'Antes/depois de um book real' },
  { weekday: 'Terça', pillar: 'education', format: 'carrossel', example: 'Dica de marketing imobiliário' },
  { weekday: 'Quarta', pillar: 'proof', format: 'reel', example: 'Resultados reais / outputs gerados' },
  { weekday: 'Quinta', pillar: 'transformation', format: 'carrossel', example: 'Análise de um book página por página' },
  { weekday: 'Sexta', pillar: 'product', format: 'reel', example: 'Feature spotlight ou tutorial' },
  { weekday: 'Sábado', pillar: 'proof', format: 'post', example: 'Número da semana / case' },
  { weekday: 'Domingo', pillar: 'education', format: 'story', example: 'Dica rápida + CTA para testar' },
];

// ---------------------------------------------------------------------------
// Acquisition Strategy
// ---------------------------------------------------------------------------

export const ACQUISITION_STRATEGY = {
  organic: {
    instagram: {
      handle: '@bookagent.ai',
      bio: 'Transforme books imobiliários em conteúdo de vendas automático.\nIA que entende seu material.\nTeste grátis 7 dias 👇',
      linkInBio: 'https://bookagent.ai/signup',
      postFrequency: '7x/semana (1 post + stories diários)',
      reelsHashtags: [
        '#corretordeimoveis', '#marketingimobiliario', '#imoveis',
        '#vendadeimoveis', '#imobiliaria', '#corretagem',
        '#lancamentoimobiliario', '#mercadoimobiliario',
        '#conteudoimobiliario', '#iaparacorretores',
      ],
    },
    youtube: {
      channelFocus: 'Demonstrações longas + tutoriais de marketing imobiliário',
      videoIdeas: [
        'Como transformar um book de 20 páginas em 7 peças de conteúdo (demo completa)',
        'BookAgent vs fazer manual: comparação real com cronômetro',
        'O pipeline de 12 estágios de IA por trás do BookAgent',
        'Como corretores top usam conteúdo para vender mais',
      ],
    },
  },
  paid: {
    facebook: {
      objective: 'Conversão (signup para trial)',
      targeting: 'Corretores, imobiliárias, CRECI, construtoras',
      adFormats: ['Video (reel de demo)', 'Carrossel (antes/depois)', 'Lead form'],
      estimatedCPA: 'R$ 15-30 por trial signup',
      budgetSuggestion: 'Começar com R$ 50/dia, escalar com CPA < R$ 25',
    },
    instagram: {
      objective: 'Tráfego para landing page',
      adFormats: ['Reel patrocinado', 'Story com swipe-up'],
    },
    google: {
      keywords: [
        'gerar conteúdo imobiliário', 'ia para corretores',
        'automação marketing imobiliário', 'criar reel imobiliário',
        'landing page empreendimento', 'conteúdo para corretor de imóveis',
      ],
      estimatedCPC: 'R$ 2-5 por clique',
    },
  },
  partnerships: {
    targets: [
      'Construtoras (oferecer BookAgent para os corretores parceiros)',
      'Portais imobiliários (integração via API)',
      'Influencers do mercado imobiliário',
      'CRECIs e associações de corretores',
      'Plataformas de CRM imobiliário',
    ],
  },
} as const;
