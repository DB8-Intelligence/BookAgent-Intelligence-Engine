/**
 * BookAgent MCP — Model Context Protocol Server Contract
 *
 * Define o contrato MCP que permite outros produtos do ecossistema
 * DB8 Intelligence chamarem o BookAgent como serviço:
 *
 * Produtos consumidores:
 * - ImobCreator (criação de conteúdo)
 * - DB8 Intelligence (analytics + geração)
 * - Nexoomnix (automação de marketing)
 * - Futuros SaaS do ecossistema
 *
 * Fluxo:
 *   Produto → MCP Tool Call → BookAgent Engine → Resultado
 *
 * O MCP server expõe o BookAgent como tools + resources,
 * reutilizando 100% da engine sem reescrever lógica.
 *
 * Spec: https://modelcontextprotocol.io/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
      default?: unknown;
    }>;
    required: string[];
  };
  outputDescription: string;
  examples: Array<{
    description: string;
    input: Record<string, unknown>;
    outputSummary: string;
  }>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const MCP_TOOLS: MCPToolDefinition[] = [
  // ═══════ PROCESS BOOK ═══════
  {
    name: 'process_book',
    description: 'Processa um book imobiliário (PDF) e gera todos os outputs de conteúdo: reels, carrosséis, blog, landing page, vídeo. Pipeline completo de 12 estágios.',
    inputSchema: {
      type: 'object',
      properties: {
        pdf_url: {
          type: 'string',
          description: 'URL do PDF do book para download',
        },
        outputs: {
          type: 'array',
          description: 'Quais outputs gerar. Se vazio, gera todos disponíveis.',
          items: { type: 'string' },
          enum: ['reel', 'video_short', 'video_long', 'story', 'carousel', 'post', 'presentation', 'blog', 'landing_page'],
        },
        user_context: {
          type: 'object',
          description: 'Dados do corretor/imobiliária para personalização (nome, whatsapp, logo, etc)',
        },
        tone: {
          type: 'string',
          description: 'Tom de voz para o conteúdo gerado',
          enum: ['aspiracional', 'informativo', 'emocional', 'urgente', 'conversacional', 'institucional'],
          default: 'aspiracional',
        },
        ai_mode: {
          type: 'string',
          description: 'Modo de geração de texto: local (sem API) ou ai (com Claude/GPT)',
          enum: ['local', 'ai'],
          default: 'local',
        },
      },
      required: ['pdf_url'],
    },
    outputDescription: 'JSON com jobId, status, outputs gerados (media plans, blog plans, LP plans, export artifacts)',
    examples: [
      {
        description: 'Processar book completo com todos os outputs',
        input: {
          pdf_url: 'https://storage.example.com/book-vista-verde.pdf',
          user_context: { name: 'Douglas Silva', whatsapp: '11999887766' },
        },
        outputSummary: '4 media plans (reel, video_short, carousel, story) + 1 blog + 1 landing page + 13 export artifacts',
      },
      {
        description: 'Gerar apenas reels e blog',
        input: {
          pdf_url: 'https://storage.example.com/book-prime.pdf',
          outputs: ['reel', 'blog'],
          tone: 'institucional',
        },
        outputSummary: '1 reel media plan + 1 blog plan + 4 export artifacts',
      },
    ],
  },

  // ═══════ GET JOB STATUS ═══════
  {
    name: 'get_job_status',
    description: 'Consulta o status de processamento de um job. Retorna progresso, estágio atual e outputs disponíveis.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID do job retornado por process_book',
        },
      },
      required: ['job_id'],
    },
    outputDescription: 'JSON com status (processing, completed, failed), estágio atual, tempo de execução, outputs disponíveis',
    examples: [
      {
        description: 'Consultar job completo',
        input: { job_id: 'job-abc123' },
        outputSummary: 'status: completed, duration: 1.8s, outputs: 7 items',
      },
    ],
  },

  // ═══════ GET OUTPUTS ═══════
  {
    name: 'get_outputs',
    description: 'Retorna os outputs gerados de um job. Pode filtrar por tipo.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID do job',
        },
        format: {
          type: 'string',
          description: 'Filtrar por formato. Se vazio, retorna todos.',
          enum: ['reel', 'video_short', 'video_long', 'story', 'carousel', 'post', 'blog', 'landing_page', 'render_spec', 'metadata'],
        },
      },
      required: ['job_id'],
    },
    outputDescription: 'Array de export artifacts com content, referencedAssetIds, formato e metadata',
    examples: [
      {
        description: 'Pegar todos os outputs de um job',
        input: { job_id: 'job-abc123' },
        outputSummary: '13 artifacts: 8 render specs, 2 metadata, 1 blog HTML, 1 LP HTML, 1 blog markdown',
      },
    ],
  },

  // ═══════ ANALYZE BOOK ═══════
  {
    name: 'analyze_book',
    description: 'Analisa a estrutura de um book SEM gerar outputs. Retorna: tipo do PDF, estratégia de extração, arquétipos de página, padrões de layout, hierarquia de design.',
    inputSchema: {
      type: 'object',
      properties: {
        pdf_url: {
          type: 'string',
          description: 'URL do PDF do book',
        },
      },
      required: ['pdf_url'],
    },
    outputDescription: 'JSON com BookCompatibilityProfile + BookPrototype (sem gerar outputs)',
    examples: [
      {
        description: 'Analisar estrutura de um book',
        input: { pdf_url: 'https://storage.example.com/book-resort.pdf' },
        outputSummary: 'structure: embedded-assets, strategy: embedded-extraction, 12 pages, 7 layout patterns, design: balanced, consistency: 0.45',
      },
    ],
  },

  // ═══════ GENERATE TEXT ═══════
  {
    name: 'generate_text',
    description: 'Gera texto de conteúdo a partir de um job já processado. Útil quando o job foi feito em modo local e agora quer upgrade para IA.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID do job já processado',
        },
        type: {
          type: 'string',
          description: 'Tipo de texto a gerar',
          enum: ['blog', 'landing_page', 'media_script'],
        },
        tone: {
          type: 'string',
          description: 'Tom de voz',
          enum: ['aspiracional', 'informativo', 'emocional', 'urgente', 'conversacional', 'institucional'],
        },
      },
      required: ['job_id', 'type'],
    },
    outputDescription: 'Texto gerado (blog article, LP copy, ou media script)',
    examples: [
      {
        description: 'Gerar artigo de blog com IA',
        input: { job_id: 'job-abc123', type: 'blog', tone: 'aspiracional' },
        outputSummary: 'Artigo de 1.500 palavras com 5 seções, introdução, conclusão e CTA',
      },
    ],
  },

  // ═══════ LIST ASSETS ═══════
  {
    name: 'list_assets',
    description: 'Lista todos os assets (imagens) extraídos de um job. Assets são IMUTÁVEIS — nunca modificados pela IA.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID do job',
        },
        page: {
          type: 'number',
          description: 'Filtrar por página (número). Se vazio, retorna todos.',
        },
      },
      required: ['job_id'],
    },
    outputDescription: 'Array de assets com id, filePath, dimensions, page, format, origin',
    examples: [
      {
        description: 'Listar assets de um book',
        input: { job_id: 'job-abc123' },
        outputSummary: '9 assets: 7 JPEG (embedded), 2 PNG (planta/mapa)',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Resources (dados estáticos acessíveis via MCP)
// ---------------------------------------------------------------------------

export const MCP_RESOURCES: MCPResource[] = [
  {
    uri: 'bookagent://policy/asset-immutability',
    name: 'Asset Immutability Policy',
    description: 'Política formal de preservação de assets originais do BookAgent',
    mimeType: 'application/json',
  },
  {
    uri: 'bookagent://schema/processing-context',
    name: 'Processing Context Schema',
    description: 'Schema do contexto de processamento que flui pelo pipeline',
    mimeType: 'application/json',
  },
  {
    uri: 'bookagent://config/pipeline-stages',
    name: 'Pipeline Stages',
    description: 'Lista dos 12 estágios do pipeline com ordem de execução',
    mimeType: 'application/json',
  },
  {
    uri: 'bookagent://config/output-formats',
    name: 'Output Formats',
    description: 'Formatos de output suportados (reel, carousel, blog, landing_page, etc.)',
    mimeType: 'application/json',
  },
  {
    uri: 'bookagent://config/provider-status',
    name: 'Provider Status',
    description: 'Status dos providers de IA e TTS configurados',
    mimeType: 'application/json',
  },
];

// ---------------------------------------------------------------------------
// MCP Server Config
// ---------------------------------------------------------------------------

export const MCP_SERVER_CONFIG = {
  name: 'bookagent-intelligence-engine',
  version: '1.0.0',
  description: 'BookAgent Intelligence Engine — IA especializada em marketing imobiliário. Transforma books (PDF) em conteúdo de vendas: reels, carrosséis, blog, landing page, vídeo.',
  capabilities: {
    tools: true,
    resources: true,
    prompts: false,
  },
  /** Produtos do ecossistema que podem consumir este MCP */
  consumers: [
    'imob-creator',
    'db8-intelligence',
    'nexoomnix',
  ],
} as const;
