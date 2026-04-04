#!/usr/bin/env npx tsx
/**
 * BookAgent Intelligence Engine — Sample Run
 *
 * Executa o pipeline completo com fixture controlado, validando
 * o fluxo de ponta a ponta sem dependências externas.
 *
 * Estratégia:
 * - Bypassa Ingestion, Extraction e Branding (requerem arquivo real / Sharp)
 * - Injeta dados de fixture realistas no ProcessingContext
 * - Executa sequencialmente: Correlation → Source Intelligence → Narrative →
 *   Output Selection → Media → Blog → Landing Page →
 *   Personalization → Render/Export
 * - Gera relatório detalhado no console e em storage/sample-run/
 *
 * Nota: Blog e Landing Page compartilham PipelineStage.MEDIA_GENERATION
 * com o MediaGenerationModule, então são executados manualmente em
 * sequência fora do Pipeline formal.
 *
 * Uso:
 *   npx tsx scripts/sample-run.ts
 *   npm run sample
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessingContext } from '../src/core/context.js';
import type { IModule } from '../src/domain/interfaces/module.js';
import { PipelineStage } from '../src/domain/value-objects/index.js';
import { EMPTY_BRANDING } from '../src/domain/entities/branding.js';

// Pipeline modules
import { CorrelationModule } from '../src/modules/correlation/index.js';
import { SourceIntelligenceModule } from '../src/modules/source-intelligence/index.js';
import { NarrativeModule } from '../src/modules/narrative/index.js';
import { OutputSelectionModule } from '../src/modules/output-selection/index.js';
import { MediaGenerationModule } from '../src/modules/media/index.js';
import { BlogModule } from '../src/modules/blog/index.js';
import { LandingPageModule } from '../src/modules/landing-page/index.js';
import { PersonalizationModule } from '../src/modules/personalization/index.js';
import { RenderExportModule } from '../src/modules/render-export/index.js';

// Fixture
import { createSampleContext, SAMPLE_PAGE_TEXTS, SAMPLE_ASSETS } from './sample-fixture.js';

// Renderers
import { renderAll } from '../src/renderers/index.js';

// ---------------------------------------------------------------------------
// Branding Stub — injeta um BrandingProfile fake (sem Sharp)
// ---------------------------------------------------------------------------

class BrandingStubModule implements IModule {
  readonly stage = PipelineStage.BRANDING;
  readonly name = 'Branding (Stub)';

  async run(context: ProcessingContext): Promise<ProcessingContext> {
    return {
      ...context,
      branding: {
        ...EMPTY_BRANDING,
        colors: {
          primary: '#1a3a2a',
          secondary: '#2d5a3d',
          accent: '#c8a96e',
          background: '#f5f3ef',
          text: '#1a1a1a',
        },
        dominantColors: [
          { hex: '#1a3a2a', r: 26, g: 58, b: 42, frequency: 0.35, luminance: 0.18 },
          { hex: '#c8a96e', r: 200, g: 169, b: 110, frequency: 0.25, luminance: 0.68 },
          { hex: '#f5f3ef', r: 245, g: 243, b: 239, frequency: 0.20, luminance: 0.95 },
        ],
        style: 'luxury-modern' as any,
        typography: {
          headingFont: 'Playfair Display',
          bodyFont: 'Source Sans Pro',
          sizes: { heading: 28, body: 16, caption: 12 },
        },
        sophisticationLevel: 'premium' as any,
        visualIntensity: 'high' as any,
        averageLuminance: 0.55,
        averageSaturation: 0.35,
        consistencyScore: 0.82,
        analyzedAssets: SAMPLE_ASSETS.length,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Sequential module runner
// ---------------------------------------------------------------------------

async function runModule(mod: IModule, ctx: ProcessingContext): Promise<ProcessingContext> {
  const start = Date.now();
  console.log(`  [${mod.stage}] ${mod.name}...`);
  const result = await mod.run(ctx);
  console.log(`  [${mod.stage}] ${mod.name} ✓ (${Date.now() - start}ms)`);
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUTPUT_DIR = 'storage/sample-run';

async function main() {
  console.log('='.repeat(70));
  console.log('  BookAgent Intelligence Engine — SAMPLE RUN');
  console.log('  Fixture: Residencial Vista Verde (10 páginas, 13 assets)');
  console.log('='.repeat(70));
  console.log();

  // --- Create initial context (post-Ingestion, post-Extraction) ---
  let ctx = createSampleContext();

  console.log(`[INPUT] Job ID: ${ctx.jobId}`);
  console.log(`[INPUT] Pages: ${SAMPLE_PAGE_TEXTS.length}`);
  console.log(`[INPUT] Assets: ${SAMPLE_ASSETS.length}`);
  console.log(`[INPUT] Text: ${ctx.extractedText!.length} chars`);
  console.log(`[INPUT] User: ${ctx.input.userContext.name}`);
  console.log();

  // --- Execute modules sequentially ---
  console.log('[PIPELINE] Executing modules...');
  console.log();
  const startTime = Date.now();

  ctx = await runModule(new CorrelationModule(), ctx);
  ctx = await runModule(new BrandingStubModule(), ctx);
  ctx = await runModule(new SourceIntelligenceModule(), ctx);
  ctx = await runModule(new NarrativeModule(), ctx);
  ctx = await runModule(new OutputSelectionModule(), ctx);
  ctx = await runModule(new MediaGenerationModule(), ctx);
  ctx = await runModule(new BlogModule(), ctx);
  ctx = await runModule(new LandingPageModule(), ctx);
  ctx = await runModule(new PersonalizationModule(), ctx);
  ctx = await runModule(new RenderExportModule(), ctx);

  const elapsed = Date.now() - startTime;
  console.log();

  // --- Report ---
  console.log('='.repeat(70));
  console.log('  PIPELINE RESULT');
  console.log('='.repeat(70));
  console.log();

  // Correlations
  const correlations = ctx.correlations ?? [];
  console.log(`[CORRELATIONS] ${correlations.length} blocos correlacionados:`);
  for (const c of correlations) {
    console.log(`  p${c.page} [${c.inferredType ?? '?'}] "${c.headline ?? '(sem headline)'}" — ${c.textBlocks.length} text, ${c.assetIds.length} assets, conf=${c.confidence}`);
  }
  console.log();

  // Sources
  const sources = ctx.sources ?? [];
  console.log(`[SOURCES] ${sources.length} sources geradas:`);
  for (const s of sources) {
    console.log(`  #${s.priority} [${s.type}] "${s.title}" (conf=${s.confidenceScore}, assets=${s.assetIds.length})`);
  }
  console.log();

  // Narratives
  const narratives = ctx.narratives ?? [];
  console.log(`[NARRATIVES] ${narratives.length} planos narrativos:`);
  for (const n of narratives) {
    console.log(`  [${n.narrativeType}] "${n.title}" — ${n.beats.length} beats, conf=${n.confidence.toFixed(2)}, format=${n.targetFormat}`);
  }
  console.log();

  // Selected outputs
  const selectedOutputs = ctx.selectedOutputs ?? [];
  const approved = selectedOutputs.filter((d) => d.status === 'approved' || d.status === 'approved-with-gaps');
  const rejected = selectedOutputs.filter((d) => d.status === 'rejected');
  const deferred = selectedOutputs.filter((d) => d.status === 'deferred');
  console.log(`[OUTPUT SELECTION] ${selectedOutputs.length} formatos avaliados (${approved.length} approved, ${deferred.length} deferred, ${rejected.length} rejected):`);
  for (const d of selectedOutputs) {
    const icon = d.status === 'approved' ? '✓'
      : d.status === 'approved-with-gaps' ? '~'
      : d.status === 'deferred' ? '⏸'
      : '✗';
    console.log(`  ${icon} ${d.format} [${d.narrativeType}] — ${d.status} (p=${d.priority}, conf=${d.confidence}, beats=${d.filledBeats}/${d.totalBeats})`);
  }
  console.log();

  // Media Plans
  const mediaPlans = ctx.mediaPlans ?? [];
  console.log(`[MEDIA PLANS] ${mediaPlans.length} planos de mídia:`);
  for (const mp of mediaPlans) {
    console.log(`  [${mp.format}] "${mp.title}" — ${mp.scenes.length} cenas, status=${mp.renderStatus}`);
  }
  console.log();

  // Blog Plans
  const blogPlans = ctx.blogPlans ?? [];
  console.log(`[BLOG PLANS] ${blogPlans.length} artigos:`);
  for (const bp of blogPlans) {
    console.log(`  "${bp.title}" — ${bp.sections.length} seções, ~${bp.estimatedWordCount} palavras`);
    console.log(`    slug: ${bp.slug}`);
    console.log(`    keywords: ${bp.keywords.slice(0, 8).join(', ')}`);
  }
  console.log();

  // Landing Page Plans
  const lpPlans = ctx.landingPagePlans ?? [];
  console.log(`[LANDING PAGE PLANS] ${lpPlans.length} landing pages:`);
  for (const lp of lpPlans) {
    console.log(`  "${lp.title}" — ${lp.sections.length} seções`);
    console.log(`    intents: ${lp.leadCaptureIntents.join(', ')}`);
  }
  console.log();

  // Personalization
  const personalization = ctx.personalization;
  if (personalization) {
    const p = personalization.profile;
    console.log(`[PERSONALIZATION] applied=${p.applied}`);
    console.log(`  contact: ${p.contact.displayName}`);
    console.log(`  channels: ${p.contact.channels.map((c) => c.type).join(', ')}`);
    console.log(`  CTA: "${p.cta.primaryText}"`);
    console.log(`  media personalized: ${personalization.mediaPlansPersonalized}`);
    console.log(`  blog personalized: ${personalization.blogPlansPersonalized}`);
    console.log(`  LP personalized: ${personalization.landingPagePlansPersonalized}`);
  }
  console.log();

  // Export artifacts
  const exportResult = ctx.exportResult;
  if (exportResult) {
    console.log(`[EXPORT] ${exportResult.totalArtifacts} artefatos gerados:`);
    console.log(`  Media specs: ${exportResult.mediaSpecs}`);
    console.log(`  Blog articles: ${exportResult.blogArticles}`);
    console.log(`  Landing pages: ${exportResult.landingPages}`);
    console.log(`  Com warnings: ${exportResult.withWarnings}`);
    console.log(`  Inválidos: ${exportResult.invalid}`);
    console.log();

    let totalSizeKB = 0;
    for (const a of exportResult.artifacts) {
      const sizeKB = a.sizeBytes / 1024;
      totalSizeKB += sizeKB;
      const statusIcon = a.status === 'valid' ? '✓' : a.status === 'partial' ? '~' : '✗';
      console.log(`  ${statusIcon} [${a.exportFormat}] ${a.artifactType} — "${a.title}" (${sizeKB.toFixed(1)}KB)`);
    }
    console.log();
    console.log(`  Total size: ${totalSizeKB.toFixed(1)}KB`);
  }
  console.log();

  // Timing
  console.log(`[TIMING] Pipeline executado em ${elapsed}ms`);
  console.log();

  // --- Rich Rendering ---
  console.log('[RENDER] Generating polished outputs...');
  const rendered = renderAll(
    ctx.blogPlans ?? [],
    ctx.landingPagePlans ?? [],
    ctx.mediaPlans ?? [],
    ctx.personalization?.profile,
  );
  console.log(`[RENDER] ${rendered.totalOutputs} outputs rendered:`);
  for (const b of rendered.blogs) {
    console.log(`  Blog: "${b.title}" — ${b.result.wordCount} words, ${b.result.sectionCount} sections`);
  }
  for (const lp of rendered.landingPages) {
    console.log(`  LP: "${lp.title}" — ${lp.result.sectionCount} sections, form=${lp.result.hasForm}, cta=${lp.result.hasCTA}`);
  }
  for (const sb of rendered.storyboards) {
    console.log(`  Storyboard: "${sb.title}" [${sb.format}] — ${sb.result.sceneCount} scenes, ${sb.result.totalDuration ?? '?'}s, status=${sb.result.renderStatus}`);
  }
  console.log();

  // --- Save to disk ---
  await saveResults(ctx, rendered);

  console.log('='.repeat(70));
  console.log('  SAMPLE RUN COMPLETE');
  console.log(`  Output: ${OUTPUT_DIR}/`);
  console.log('='.repeat(70));
}

// ---------------------------------------------------------------------------
// Save results to disk
// ---------------------------------------------------------------------------

async function saveResults(ctx: ProcessingContext, rendered?: import('../src/renderers/index.js').RenderedOutput) {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Summary JSON
  const summary = {
    jobId: ctx.jobId,
    pipelineStages: [
      'correlation', 'branding (stub)', 'source_intelligence', 'narrative',
      'output_selection', 'media_generation', 'blog', 'landing_page',
      'personalization', 'render_export',
    ],
    correlations: (ctx.correlations ?? []).length,
    sources: (ctx.sources ?? []).map((s) => ({
      id: s.id, type: s.type, title: s.title, priority: s.priority,
      confidence: s.confidenceScore, assets: s.assetIds.length,
    })),
    narratives: (ctx.narratives ?? []).map((n) => ({
      type: n.narrativeType, title: n.title, beats: n.beats.length,
      confidence: n.confidence, format: n.targetFormat,
    })),
    selectedOutputs: (ctx.selectedOutputs ?? []).map((d) => ({
      format: d.format, type: d.narrativeType, status: d.status,
      priority: d.priority, confidence: d.confidence,
    })),
    mediaPlans: (ctx.mediaPlans ?? []).length,
    blogPlans: (ctx.blogPlans ?? []).length,
    landingPagePlans: (ctx.landingPagePlans ?? []).length,
    exportArtifacts: ctx.exportResult?.totalArtifacts ?? 0,
    personalization: ctx.personalization ? {
      applied: ctx.personalization.profile.applied,
      name: ctx.personalization.profile.contact.displayName,
      channels: ctx.personalization.profile.contact.channels.length,
      mediaPersonalized: ctx.personalization.mediaPlansPersonalized,
      blogPersonalized: ctx.personalization.blogPlansPersonalized,
      lpPersonalized: ctx.personalization.landingPagePlansPersonalized,
    } : null,
  };

  await writeFile(join(OUTPUT_DIR, 'result-summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[SAVE] result-summary.json`);

  // Individual artifacts
  if (ctx.exportResult?.artifacts) {
    const artifactsDir = join(OUTPUT_DIR, 'artifacts');
    await mkdir(artifactsDir, { recursive: true });

    for (const artifact of ctx.exportResult.artifacts) {
      const ext = artifact.exportFormat === 'html' ? 'html'
        : artifact.exportFormat === 'markdown' ? 'md'
        : 'json';
      const safeName = artifact.artifactType.replace(/[^a-z0-9-]/g, '-');
      const safeFormat = artifact.outputFormat.replace(/[^a-z0-9_]/g, '-');
      const filename = `${safeName}--${safeFormat}.${ext}`;
      await writeFile(join(artifactsDir, filename), artifact.content);
      console.log(`[SAVE] artifacts/${filename}`);
    }
  }

  // Rich rendered outputs
  if (rendered) {
    const renderedDir = join(OUTPUT_DIR, 'rendered');
    await mkdir(renderedDir, { recursive: true });

    for (const blog of rendered.blogs) {
      await writeFile(join(renderedDir, `blog--${blog.slug}.html`), blog.result.html);
      console.log(`[SAVE] rendered/blog--${blog.slug}.html`);
      await writeFile(join(renderedDir, `blog--${blog.slug}.md`), blog.result.markdown);
      console.log(`[SAVE] rendered/blog--${blog.slug}.md`);
    }

    for (const lp of rendered.landingPages) {
      await writeFile(join(renderedDir, `lp--${lp.slug}.html`), lp.result.html);
      console.log(`[SAVE] rendered/lp--${lp.slug}.html`);
    }

    for (const sb of rendered.storyboards) {
      const safeName = sb.format.replace(/[^a-z0-9_]/g, '-');
      await writeFile(join(renderedDir, `storyboard--${safeName}.html`), sb.result.html);
      console.log(`[SAVE] rendered/storyboard--${safeName}.html`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
