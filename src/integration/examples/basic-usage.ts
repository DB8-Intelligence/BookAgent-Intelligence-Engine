/**
 * BookAgent SDK — Exemplo de Uso Básico
 *
 * Demonstra o fluxo completo:
 * 1. Enviar PDF para processamento
 * 2. Aguardar conclusão
 * 3. Listar artefatos gerados
 * 4. Baixar conteúdo de cada artefato
 */

import { BookAgentClient } from '../client.js';
import type { ProcessInput_v1 } from '../contracts.js';

async function main() {
  // ─── 1. Configurar o cliente ─────────────────────────────────────────
  const client = new BookAgentClient({
    baseUrl: 'http://localhost:3000',
    apiKey: 'sua-api-key-aqui',
    pollInterval: 2000,    // Checar status a cada 2s
    maxWaitTime: 300_000,  // Timeout de 5 minutos
  });

  // ─── 2. Enviar PDF para processamento ────────────────────────────────
  const input: ProcessInput_v1 = {
    file_url: 'https://cdn.example.com/empreendimentos/vista-verde.pdf',
    type: 'pdf',
    user_context: {
      name: 'Douglas Silva',
      whatsapp: '5511999887766',
      instagram: '@douglas.imoveis',
      site: 'https://douglas.imob.com',
      region: 'São Paulo - Zona Sul',
      logo_url: 'https://example.com/logo-douglas.png',
      logo_placement: 'bottom-right',
    },
  };

  console.log('Enviando PDF para processamento...');
  const { job_id } = await client.process(input);
  console.log(`Job criado: ${job_id}`);

  // ─── 3. Aguardar conclusão ───────────────────────────────────────────
  console.log('Aguardando processamento...');
  const status = await client.waitForCompletion(job_id);
  console.log(`Job ${status.status}!`);
  console.log(`  Sources: ${status.output_summary?.source_count}`);
  console.log(`  Artifacts: ${status.output_summary?.artifacts}`);

  // ─── 4. Listar artefatos ─────────────────────────────────────────────
  const artifacts = await client.listArtifacts(job_id);
  console.log(`\n${artifacts.length} artefatos disponíveis:`);
  for (const a of artifacts) {
    console.log(`  [${a.export_format}] ${a.artifact_type} — "${a.title}" (${a.size_bytes} bytes)`);
  }

  // ─── 5. Baixar blog HTML ─────────────────────────────────────────────
  const blogArtifacts = await client.getBlogArticles(job_id);
  if (blogArtifacts.length > 0) {
    const blogHtml = await client.downloadArtifact(job_id, blogArtifacts[0].id);
    console.log(`\nBlog HTML baixado: ${blogHtml.length} chars`);
    // Salvar, servir em CMS, etc.
  }

  // ─── 6. Baixar landing page ──────────────────────────────────────────
  const lpArtifacts = await client.getLandingPages(job_id);
  if (lpArtifacts.length > 0) {
    const lpHtml = await client.downloadArtifact(job_id, lpArtifacts[0].id);
    console.log(`LP HTML baixada: ${lpHtml.length} chars`);
  }

  // ─── 7. Baixar render specs (para motor de vídeo) ────────────────────
  const mediaSpecs = await client.getMediaSpecs(job_id);
  for (const spec of mediaSpecs) {
    const json = await client.downloadArtifact(job_id, spec.id);
    const renderSpec = JSON.parse(json);
    console.log(`\nMedia [${renderSpec.format}]: ${renderSpec.scenes.length} cenas, ${renderSpec.totalDurationSeconds ?? '?'}s`);
  }
}

main().catch(console.error);
