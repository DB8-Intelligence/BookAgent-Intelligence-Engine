/**
 * BookAgent SDK — Integração com ImobCreator
 *
 * Exemplo de como o ImobCreator (produto consumidor) consome
 * o BookAgent Intelligence Engine para gerar material de marketing.
 *
 * Fluxos demonstrados:
 * - Upload de PDF de empreendimento
 * - Consumo de render specs para geração de vídeo
 * - Publicação de blog em CMS
 * - Deploy de landing page
 * - Webhook para notificação assíncrona
 */

import { BookAgentClient, BookAgentError } from '../client.js';
import type {
  ProcessInput_v1,
  ProcessResult_v1,
  ArtifactItem_v1,
  WebhookPayload_v1,
} from '../contracts.js';

// ═══════════════════════════════════════════════════════════════════════════
// Exemplo 1: Fluxo completo com processAndWait
// ═══════════════════════════════════════════════════════════════════════════

async function fullFlow() {
  const client = new BookAgentClient({
    baseUrl: process.env.BOOKAGENT_URL ?? 'http://localhost:3000',
    apiKey: process.env.BOOKAGENT_API_KEY,
  });

  try {
    // Processar e aguardar resultado de uma vez
    const result = await client.processAndWait({
      file_url: 'https://cdn.imobcreator.com/uploads/empreendimento-123.pdf',
      type: 'pdf',
      user_context: {
        name: 'Maria Santos',
        whatsapp: '5521988776655',
        region: 'Rio de Janeiro - Zona Sul',
      },
    });

    // Consumir resultado
    await handleResult(client, result);
  } catch (err) {
    if (err instanceof BookAgentError) {
      console.error(`BookAgent error [${err.code}]: ${err.message}`);
      if (err.code === 'JOB_FAILED') {
        // Notificar usuário que processamento falhou
      }
    }
    throw err;
  }
}

async function handleResult(client: BookAgentClient, result: ProcessResult_v1) {
  console.log(`Job ${result.job_id} concluído:`);
  console.log(`  ${result.sources.length} fontes identificadas`);
  console.log(`  ${result.artifacts.length} artefatos gerados`);

  // Agrupar artefatos por tipo
  const byType = groupBy(result.artifacts, (a) => a.artifact_type);

  // 1. Render specs → enviar para motor de vídeo
  const renderSpecs = byType['media-render-spec'] ?? [];
  for (const spec of renderSpecs) {
    const json = await client.downloadArtifact(result.job_id, spec.id);
    const renderSpec = JSON.parse(json);
    console.log(`  Enviando ${renderSpec.format} para renderização (${renderSpec.scenes.length} cenas)...`);
    // await videoRenderer.enqueue(renderSpec);
  }

  // 2. Blog articles → publicar no CMS
  const blogs = byType['blog-article']?.filter((a) => a.export_format === 'html') ?? [];
  for (const blog of blogs) {
    const html = await client.downloadArtifact(result.job_id, blog.id);
    console.log(`  Publicando blog "${blog.title}" (${html.length} chars)...`);
    // await cms.publish({ title: blog.title, html, assets: blog.referenced_asset_ids });
  }

  // 3. Landing pages → deploy
  const lps = byType['landing-page']?.filter((a) => a.export_format === 'html') ?? [];
  for (const lp of lps) {
    const html = await client.downloadArtifact(result.job_id, lp.id);
    console.log(`  Deploying LP "${lp.title}" (${html.length} chars)...`);
    // await deployer.deploy({ slug: lp.title, html });
  }

  // 4. Branding data → salvar no perfil do empreendimento
  if (result.branding) {
    console.log(`  Branding: style=${result.branding.style}, palette=[${result.branding.colors.primary}, ${result.branding.colors.accent}]`);
    // await db.updateEmpreendimento(empreendimentoId, { branding: result.branding });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exemplo 2: Webhook handler (Express)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handler para webhook de conclusão do BookAgent.
 * Registre este endpoint ao enviar webhook_url no ProcessInput.
 *
 * POST /webhooks/bookagent
 */
function webhookHandler(/* req: Request, res: Response */) {
  // const payload = req.body as WebhookPayload_v1;
  const payload: WebhookPayload_v1 = {
    event: 'job.completed',
    job_id: 'example-123',
    status: 'completed',
    output_summary: {
      source_count: 8,
      selected_outputs: 5,
      media_plans: 4,
      blog_plans: 1,
      landing_page_plans: 1,
      artifacts: 13,
    },
    timestamp: new Date().toISOString(),
  };

  switch (payload.event) {
    case 'job.completed':
      console.log(`Job ${payload.job_id} concluído com ${payload.output_summary?.artifacts} artefatos`);
      // Iniciar pipeline de consumo
      // await processCompletedJob(payload.job_id);
      break;
    case 'job.failed':
      console.error(`Job ${payload.job_id} falhou: ${payload.error}`);
      // Notificar equipe/usuário
      break;
  }

  // res.status(200).json({ received: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Exemplo 3: Polling manual com retry
// ═══════════════════════════════════════════════════════════════════════════

async function manualPollingWithRetry() {
  const client = new BookAgentClient('http://localhost:3000');

  const { job_id } = await client.process({
    file_url: 'https://cdn.example.com/doc.pdf',
    type: 'pdf',
  });

  // Polling manual com backoff
  let attempt = 0;
  const maxAttempts = 60; // 60 × 3s = 3 min max

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const status = await client.getJobStatus(job_id);

      if (status.status === 'completed') {
        console.log('Pronto! Buscando artefatos...');
        const result = await client.getResult(job_id);
        return result;
      }

      if (status.status === 'failed') {
        throw new Error(`Job failed: ${status.error}`);
      }

      console.log(`Tentativa ${attempt}: status=${status.status}`);
    } catch (err) {
      if (err instanceof BookAgentError && err.code === 'HTTP_ERROR') {
        console.warn(`Network error na tentativa ${attempt}, retrying...`);
      } else {
        throw err;
      }
    }

    // Backoff: 3s, 3s, 5s, 5s, 10s, 10s...
    const delay = attempt <= 2 ? 3000 : attempt <= 4 ? 5000 : 10000;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new Error('Timeout: job não completou em 3 minutos');
}

// ═══════════════════════════════════════════════════════════════════════════
// Exemplo 4: Filtrar artefatos por formato
// ═══════════════════════════════════════════════════════════════════════════

async function filterArtifacts() {
  const client = new BookAgentClient('http://localhost:3000');
  const jobId = 'existing-job-id';

  // Apenas render specs JSON (para motor de vídeo)
  const renderSpecs = await client.listArtifacts(jobId, {
    type: 'media-render-spec',
    format: 'render-spec',
  });
  console.log(`${renderSpecs.length} render specs`);

  // Apenas blogs em Markdown (para CMS)
  const blogsMd = await client.listArtifacts(jobId, {
    type: 'blog-article',
    format: 'markdown',
  });
  console.log(`${blogsMd.length} blog articles (markdown)`);

  // Landing pages em HTML
  const lpsHtml = await client.getLandingPages(jobId);
  console.log(`${lpsHtml.length} landing pages (html)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════════════════════════════

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// Run
fullFlow().catch(console.error);
