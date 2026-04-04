/**
 * BookAgent API — B2B REST API Specification
 *
 * API pública para integração com empresas externas:
 * - Imobiliárias
 * - Incorporadoras
 * - Portais imobiliários
 * - CRMs
 * - Plataformas de marketing
 *
 * Base URL: https://api.bookagent.ai/v1
 * Auth: Bearer token (API key)
 * Rate limit: varia por plano (ver API_RATE_LIMITS)
 *
 * Modelo de cobrança:
 * - Pay-per-use (por book processado) OU
 * - Plano mensal enterprise (volume fixo)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  summary: string;
  description: string;
  auth: boolean;
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
  };
  queryParams?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  pathParams?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  responses: Array<{
    status: number;
    description: string;
    schema?: Record<string, unknown>;
  }>;
}

export interface APIExample {
  endpoint: string;
  description: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
  };
  response: {
    status: number;
    body: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const API_AUTH = {
  type: 'bearer',
  headerName: 'Authorization',
  format: 'Bearer <api_key>',
  description: 'API key gerada no painel do BookAgent. Inclua em todas as requisições.',
  keyPrefix: 'ba_',
  example: 'Bearer ba_sk_1234567890abcdef',
  scopes: [
    { scope: 'read', description: 'Consultar jobs e outputs' },
    { scope: 'write', description: 'Criar jobs (processar books)' },
    { scope: 'admin', description: 'Gerenciar conta e configurações' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Rate Limits
// ---------------------------------------------------------------------------

export const API_RATE_LIMITS = {
  starter: { requestsPerMinute: 10, booksPerMonth: 3 },
  pro: { requestsPerMinute: 30, booksPerMonth: 15 },
  enterprise: { requestsPerMinute: 100, booksPerMonth: null },
} as const;

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const API_ENDPOINTS: APIEndpoint[] = [
  // ═══════ POST /v1/books/process ═══════
  {
    method: 'POST',
    path: '/v1/books/process',
    summary: 'Processar book',
    description: 'Envia um book (PDF) para processamento completo. Retorna um jobId para acompanhar o progresso. O processamento é assíncrono — use GET /v1/jobs/:jobId para consultar o status.',
    auth: true,
    requestBody: {
      contentType: 'application/json',
      schema: {
        type: 'object',
        required: ['pdf_url'],
        properties: {
          pdf_url: { type: 'string', description: 'URL do PDF para download' },
          outputs: { type: 'array', items: { type: 'string' }, description: 'Filtro de outputs. Default: todos' },
          tone: { type: 'string', enum: ['aspiracional', 'informativo', 'emocional', 'urgente', 'conversacional', 'institucional'] },
          ai_mode: { type: 'string', enum: ['local', 'ai'], default: 'local' },
          user_context: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              whatsapp: { type: 'string' },
              instagram: { type: 'string' },
              site: { type: 'string' },
              logoUrl: { type: 'string' },
              region: { type: 'string' },
            },
          },
          webhook_url: { type: 'string', description: 'URL para notificação quando o processamento terminar' },
        },
      },
    },
    responses: [
      {
        status: 202,
        description: 'Job criado com sucesso (processamento iniciado)',
        schema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string', value: 'processing' },
            estimatedDurationMs: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      { status: 400, description: 'Requisição inválida (PDF URL ausente ou formato errado)' },
      { status: 401, description: 'API key inválida ou ausente' },
      { status: 429, description: 'Rate limit excedido' },
    ],
  },

  // ═══════ GET /v1/jobs/:jobId ═══════
  {
    method: 'GET',
    path: '/v1/jobs/:jobId',
    summary: 'Status do job',
    description: 'Retorna o status atual de um job de processamento, incluindo estágio atual, tempo decorrido e outputs disponíveis.',
    auth: true,
    pathParams: [
      { name: 'jobId', type: 'string', description: 'ID do job retornado por POST /v1/books/process' },
    ],
    responses: [
      {
        status: 200,
        description: 'Status do job',
        schema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            status: { type: 'string', enum: ['processing', 'completed', 'failed'] },
            currentStage: { type: 'string' },
            progress: { type: 'number', description: '0-100' },
            durationMs: { type: 'number' },
            outputCount: { type: 'number' },
            error: { type: 'string', nullable: true },
          },
        },
      },
      { status: 404, description: 'Job não encontrado' },
    ],
  },

  // ═══════ GET /v1/jobs/:jobId/outputs ═══════
  {
    method: 'GET',
    path: '/v1/jobs/:jobId/outputs',
    summary: 'Outputs do job',
    description: 'Retorna todos os outputs gerados de um job concluído. Pode filtrar por formato.',
    auth: true,
    pathParams: [
      { name: 'jobId', type: 'string', description: 'ID do job' },
    ],
    queryParams: [
      { name: 'format', type: 'string', required: false, description: 'Filtrar por formato (reel, blog, landing_page, etc)' },
      { name: 'type', type: 'string', required: false, description: 'Filtrar por tipo de artefato (render_spec, html, markdown, json)' },
    ],
    responses: [
      {
        status: 200,
        description: 'Lista de outputs',
        schema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            totalOutputs: { type: 'number' },
            outputs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  format: { type: 'string' },
                  type: { type: 'string' },
                  title: { type: 'string' },
                  content: { type: 'string' },
                  referencedAssetIds: { type: 'array', items: { type: 'string' } },
                  sizeBytes: { type: 'number' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
      },
      { status: 404, description: 'Job não encontrado' },
    ],
  },

  // ═══════ GET /v1/jobs/:jobId/assets ═══════
  {
    method: 'GET',
    path: '/v1/jobs/:jobId/assets',
    summary: 'Assets do job',
    description: 'Lista todos os assets (imagens) extraídos do book. Assets são IMUTÁVEIS e preservados na qualidade original.',
    auth: true,
    pathParams: [
      { name: 'jobId', type: 'string', description: 'ID do job' },
    ],
    queryParams: [
      { name: 'page', type: 'number', required: false, description: 'Filtrar por número da página' },
    ],
    responses: [
      {
        status: 200,
        description: 'Lista de assets',
        schema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            totalAssets: { type: 'number' },
            assets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  filePath: { type: 'string' },
                  thumbnailUrl: { type: 'string' },
                  dimensions: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } } },
                  page: { type: 'number' },
                  format: { type: 'string' },
                  sizeBytes: { type: 'number' },
                  origin: { type: 'string', enum: ['pdf-extracted', 'page-render'] },
                  isOriginal: { type: 'boolean', value: true },
                },
              },
            },
          },
        },
      },
    ],
  },

  // ═══════ GET /v1/jobs/:jobId/analysis ═══════
  {
    method: 'GET',
    path: '/v1/jobs/:jobId/analysis',
    summary: 'Análise do book',
    description: 'Retorna a análise de compatibilidade e o protótipo editorial do book. Inclui tipo do PDF, estratégia de extração, arquétipos de página, padrões de layout e hierarquia de design.',
    auth: true,
    pathParams: [
      { name: 'jobId', type: 'string', description: 'ID do job' },
    ],
    responses: [
      {
        status: 200,
        description: 'Análise completa do book',
        schema: {
          type: 'object',
          properties: {
            compatibility: { type: 'object', description: 'BookCompatibilityProfile' },
            prototype: { type: 'object', description: 'BookPrototype com archetypes, layout patterns e design hierarchy' },
          },
        },
      },
    ],
  },

  // ═══════ DELETE /v1/jobs/:jobId ═══════
  {
    method: 'DELETE',
    path: '/v1/jobs/:jobId',
    summary: 'Deletar job',
    description: 'Remove um job e todos os seus dados (outputs, assets, análise). Irreversível.',
    auth: true,
    pathParams: [
      { name: 'jobId', type: 'string', description: 'ID do job' },
    ],
    responses: [
      { status: 204, description: 'Job deletado com sucesso' },
      { status: 404, description: 'Job não encontrado' },
    ],
  },

  // ═══════ GET /v1/account/usage ═══════
  {
    method: 'GET',
    path: '/v1/account/usage',
    summary: 'Uso da conta',
    description: 'Retorna o consumo atual da conta: books processados, outputs gerados, limite do plano.',
    auth: true,
    responses: [
      {
        status: 200,
        description: 'Resumo de uso',
        schema: {
          type: 'object',
          properties: {
            plan: { type: 'string' },
            booksProcessed: { type: 'number' },
            booksLimit: { type: 'number', nullable: true },
            outputsGenerated: { type: 'number' },
            currentPeriod: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
          },
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Examples (curl-ready)
// ---------------------------------------------------------------------------

export const API_EXAMPLES: APIExample[] = [
  {
    endpoint: 'POST /v1/books/process',
    description: 'Processar book completo com personalização',
    request: {
      method: 'POST',
      url: 'https://api.bookagent.ai/v1/books/process',
      headers: {
        'Authorization': 'Bearer ba_sk_1234567890abcdef',
        'Content-Type': 'application/json',
      },
      body: {
        pdf_url: 'https://storage.example.com/book-vista-verde.pdf',
        tone: 'aspiracional',
        ai_mode: 'ai',
        user_context: {
          name: 'Douglas Silva',
          whatsapp: '11999887766',
          instagram: '@douglas.imoveis',
          logoUrl: 'https://example.com/logo.png',
        },
        webhook_url: 'https://myapp.com/webhooks/bookagent',
      },
    },
    response: {
      status: 202,
      body: {
        jobId: 'job_a1b2c3d4e5f6',
        status: 'processing',
        estimatedDurationMs: 2000,
        createdAt: '2026-04-04T12:00:00.000Z',
      },
    },
  },
  {
    endpoint: 'GET /v1/jobs/:jobId',
    description: 'Consultar status de um job',
    request: {
      method: 'GET',
      url: 'https://api.bookagent.ai/v1/jobs/job_a1b2c3d4e5f6',
      headers: {
        'Authorization': 'Bearer ba_sk_1234567890abcdef',
      },
    },
    response: {
      status: 200,
      body: {
        jobId: 'job_a1b2c3d4e5f6',
        status: 'completed',
        currentStage: 'render_export',
        progress: 100,
        durationMs: 1847,
        outputCount: 13,
        error: null,
      },
    },
  },
  {
    endpoint: 'GET /v1/jobs/:jobId/outputs?format=blog',
    description: 'Pegar outputs de blog de um job',
    request: {
      method: 'GET',
      url: 'https://api.bookagent.ai/v1/jobs/job_a1b2c3d4e5f6/outputs?format=blog',
      headers: {
        'Authorization': 'Bearer ba_sk_1234567890abcdef',
      },
    },
    response: {
      status: 200,
      body: {
        jobId: 'job_a1b2c3d4e5f6',
        totalOutputs: 2,
        outputs: [
          {
            id: 'artifact-001',
            format: 'blog',
            type: 'html',
            title: 'Residencial Vista Verde — Blog',
            content: '<article>...</article>',
            referencedAssetIds: ['asset-001', 'asset-003', 'asset-004'],
            sizeBytes: 12450,
            status: 'valid',
          },
          {
            id: 'artifact-002',
            format: 'blog',
            type: 'markdown',
            title: 'Residencial Vista Verde — Blog (Markdown)',
            content: '# Residencial Vista Verde\n\n...',
            referencedAssetIds: ['asset-001', 'asset-003', 'asset-004'],
            sizeBytes: 8320,
            status: 'valid',
          },
        ],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// SDK structure (future)
// ---------------------------------------------------------------------------

export const SDK_SPEC = {
  languages: ['typescript', 'python'],
  packageNames: {
    typescript: '@db8/bookagent-sdk',
    python: 'bookagent-sdk',
  },
  quickStart: `
// TypeScript SDK (futuro)
import { BookAgent } from '@db8/bookagent-sdk';

const agent = new BookAgent({ apiKey: 'ba_sk_...' });

// Processar book
const job = await agent.processBook({
  pdfUrl: 'https://storage.example.com/book.pdf',
  tone: 'aspiracional',
  userContext: { name: 'Douglas', whatsapp: '11999887766' },
});

// Esperar processamento
const result = await job.waitForCompletion();

// Pegar outputs
const blog = result.getOutput('blog', 'html');
const reels = result.getOutputs('reel');
const assets = result.getAssets();
`,
} as const;
