/**
 * Full Pipeline Validation (Part 31)
 *
 * Execução completa do pipeline ponta a ponta com validação detalhada.
 * Gera relatório técnico de qualidade.
 *
 * Stages executed:
 * 1. Ingestion (via fixture)
 * 2. Asset Extraction (via fixture)
 * 3. Correlation
 * 4. Branding (stub)
 * 5. Source Intelligence
 * 6. Narrative
 * 7. Output Selection
 * 8. Media Generation
 * 9. Blog
 * 10. Landing Page
 * 11. Personalization
 * 12. Text Generation (new!)
 * 13. Audio Plan Generation (new!)
 * 14. Render/Export
 * 15. Rich Rendering (HTML/Storyboard)
 * 16. Video Rendering
 *
 * Usage: npx tsx scripts/full-pipeline-validation.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createSampleContext } from './sample-fixture.js';
import type { ProcessingContext } from '../src/core/context.js';

// Modules
import { CorrelationModule } from '../src/modules/correlation/index.js';
import { SourceIntelligenceModule } from '../src/modules/source-intelligence/index.js';
import { NarrativeModule } from '../src/modules/narrative/index.js';
import { OutputSelectionModule } from '../src/modules/output-selection/index.js';
import { MediaGenerationModule } from '../src/modules/media/index.js';
import { BlogModule } from '../src/modules/blog/index.js';
import { LandingPageModule } from '../src/modules/landing-page/index.js';
import { PersonalizationModule } from '../src/modules/personalization/index.js';
import { RenderExportModule } from '../src/modules/render-export/index.js';
import { AudioModule } from '../src/modules/audio/index.js';
import { EMPTY_BRANDING } from '../src/domain/entities/branding.js';

// Generation
import { generateBlogText, generateLandingPageCopy, generateMediaScript } from '../src/generation/index.js';

// Renderers
import { renderAll } from '../src/renderers/index.js';
import { renderVideo, checkFFmpeg } from '../src/renderers/video/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_DIR = 'storage/validation';
const ASSETS_DIR = 'storage/validation/assets';
const TEMP_DIR = 'storage/validation/.tmp';

// ---------------------------------------------------------------------------
// Validation Report
// ---------------------------------------------------------------------------

interface ValidationReport {
  timestamp: string;
  pipeline: StageReport[];
  textGeneration: TextGenReport;
  audioGeneration: AudioGenReport;
  rendering: RenderReport;
  videoRendering: VideoReport;
  summary: SummaryReport;
}

interface StageReport {
  stage: string;
  status: 'pass' | 'warn' | 'fail';
  durationMs: number;
  details: string;
}

interface TextGenReport {
  blogArticle: { wordCount: number; sectionCount: number; hasCTA: boolean };
  landingPageCopy: { sectionCount: number; hasHero: boolean; hasCTA: boolean };
  mediaScripts: Array<{ format: string; sceneCount: number; hasNarration: boolean }>;
}

interface AudioGenReport {
  plans: Array<{
    format: string;
    mode: string;
    segments: number;
    voices: number;
    durationSeconds: number;
    soundtrack: string;
  }>;
}

interface RenderReport {
  blogs: number;
  landingPages: number;
  storyboards: number;
  totalOutputs: number;
}

interface VideoReport {
  rendered: Array<{
    format: string;
    filename: string;
    sizeKB: number;
    durationSeconds: number;
    sceneCount: number;
  }>;
  skipped: string[];
  ffmpegAvailable: boolean;
}

interface SummaryReport {
  totalStages: number;
  passed: number;
  warnings: number;
  failures: number;
  issues: string[];
  improvements: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═'.repeat(70));
  console.log('  BOOKAGENT — FULL PIPELINE VALIDATION');
  console.log('═'.repeat(70));
  console.log();

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    pipeline: [],
    textGeneration: {
      blogArticle: { wordCount: 0, sectionCount: 0, hasCTA: false },
      landingPageCopy: { sectionCount: 0, hasHero: false, hasCTA: false },
      mediaScripts: [],
    },
    audioGeneration: { plans: [] },
    rendering: { blogs: 0, landingPages: 0, storyboards: 0, totalOutputs: 0 },
    videoRendering: { rendered: [], skipped: [], ffmpegAvailable: false },
    summary: { totalStages: 0, passed: 0, warnings: 0, failures: 0, issues: [], improvements: [] },
  };

  // ── 1. Pipeline Execution ────────────────────────────────────────────
  console.log('── PIPELINE EXECUTION ──');
  let ctx = createSampleContext();
  ctx = { ...ctx, branding: EMPTY_BRANDING };

  const modules: Array<{ name: string; module: { run(ctx: ProcessingContext): Promise<ProcessingContext> } }> = [
    { name: 'Correlation', module: new CorrelationModule() },
    { name: 'Source Intelligence', module: new SourceIntelligenceModule() },
    { name: 'Narrative', module: new NarrativeModule() },
    { name: 'Output Selection', module: new OutputSelectionModule() },
    { name: 'Media Generation', module: new MediaGenerationModule() },
    { name: 'Blog', module: new BlogModule() },
    { name: 'Landing Page', module: new LandingPageModule() },
    { name: 'Personalization', module: new PersonalizationModule() },
    { name: 'Audio', module: new AudioModule() },
    { name: 'Render/Export', module: new RenderExportModule() },
  ];

  for (const { name, module } of modules) {
    const start = Date.now();
    try {
      ctx = await module.run(ctx);
      const elapsed = Date.now() - start;
      const status = validateStage(name, ctx);
      report.pipeline.push({ stage: name, status: status.status, durationMs: elapsed, details: status.details });
      const icon = status.status === 'pass' ? '✓' : status.status === 'warn' ? '~' : '✗';
      console.log(`  ${icon} ${name} (${elapsed}ms) — ${status.details}`);
    } catch (err) {
      const elapsed = Date.now() - start;
      report.pipeline.push({ stage: name, status: 'fail', durationMs: elapsed, details: (err as Error).message });
      console.log(`  ✗ ${name} (${elapsed}ms) — FAILED: ${(err as Error).message}`);
    }
  }

  // ── 2. Text Generation ───────────────────────────────────────────────
  console.log('\n── TEXT GENERATION ──');

  const genOptions = { mode: 'local' as const, projectName: 'Rua das Acácias, 1200' };

  if (ctx.blogPlans && ctx.blogPlans.length > 0) {
    const blogArticle = await generateBlogText(ctx.blogPlans[0], genOptions);
    report.textGeneration.blogArticle = {
      wordCount: blogArticle.wordCount,
      sectionCount: blogArticle.sections.length,
      hasCTA: blogArticle.ctaText.length > 10,
    };
    console.log(`  ✓ Blog: "${blogArticle.title}" — ${blogArticle.wordCount} words, ${blogArticle.sections.length} sections`);
    for (const s of blogArticle.sections) {
      console.log(`    [${s.editorialRole}] ${s.heading} — ${s.paragraphs.length} paragraphs, ${s.wordCount} words`);
    }
  }

  if (ctx.landingPagePlans && ctx.landingPagePlans.length > 0) {
    const lpCopy = await generateLandingPageCopy(ctx.landingPagePlans[0], genOptions);
    report.textGeneration.landingPageCopy = {
      sectionCount: lpCopy.sections.length,
      hasHero: lpCopy.heroHeadline.length > 5,
      hasCTA: lpCopy.sections.some((s) => !!s.ctaText),
    };
    console.log(`  ✓ LP: "${lpCopy.heroHeadline}"`);
    console.log(`    Sub: "${lpCopy.heroSubheadline}"`);
    for (const s of lpCopy.sections) {
      console.log(`    [${s.sectionType}] ${s.heading} — body=${s.body.length}chars, bullets=${s.bulletPoints.length}`);
    }
  }

  for (const mp of (ctx.mediaPlans ?? [])) {
    const script = await generateMediaScript(mp, genOptions);
    const hasNarration = script.scenes.some((s) => s.narration.length > 10);
    report.textGeneration.mediaScripts.push({
      format: script.format,
      sceneCount: script.scenes.length,
      hasNarration,
    });
    console.log(`  ✓ Script [${script.format}]: ${script.scenes.length} scenes, narration=${hasNarration}`);
  }

  // ── 3. Audio Generation ──────────────────────────────────────────────
  console.log('\n── AUDIO GENERATION ──');

  if (ctx.audioResult) {
    for (const plan of ctx.audioResult.plans) {
      report.audioGeneration.plans.push({
        format: plan.outputFormat,
        mode: plan.narrationMode,
        segments: plan.segments.length,
        voices: plan.voices.length,
        durationSeconds: plan.totalDurationSeconds,
        soundtrack: plan.soundtrack.category,
      });
      console.log(`  ✓ [${plan.outputFormat}] ${plan.narrationMode}: ${plan.segments.length} segments, ${plan.totalDurationSeconds}s, ${plan.voices.length} voice(s), music=${plan.soundtrack.category}`);
    }
  }

  // ── 4. Rich Rendering ────────────────────────────────────────────────
  console.log('\n── RICH RENDERING ──');

  const rendered = renderAll(
    ctx.blogPlans ?? [],
    ctx.landingPagePlans ?? [],
    ctx.mediaPlans ?? [],
    ctx.personalization?.profile,
  );
  report.rendering = {
    blogs: rendered.blogs.length,
    landingPages: rendered.landingPages.length,
    storyboards: rendered.storyboards.length,
    totalOutputs: rendered.totalOutputs,
  };
  console.log(`  ✓ ${rendered.totalOutputs} outputs: ${rendered.blogs.length} blogs, ${rendered.landingPages.length} LPs, ${rendered.storyboards.length} storyboards`);

  // ── 5. Video Rendering ───────────────────────────────────────────────
  console.log('\n── VIDEO RENDERING ──');

  const hasFFmpeg = await checkFFmpeg();
  report.videoRendering.ffmpegAvailable = hasFFmpeg;

  if (hasFFmpeg && ctx.mediaPlans && ctx.mediaPlans.length > 0) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const assetMap = await generatePlaceholderAssets(ctx.mediaPlans);

    // Render first 2 plans (keep validation fast)
    const plansToRender = ctx.mediaPlans.slice(0, 2);
    for (let i = 0; i < plansToRender.length; i++) {
      const mp = plansToRender[i];
      try {
        const result = await renderVideo(mp, {
          outputDir: OUTPUT_DIR,
          tempDir: `${TEMP_DIR}-${i}`,
          assetMap,
          resolution: mp.resolution,
          fps: 30,
        });
        report.videoRendering.rendered.push({
          format: mp.format,
          filename: result.filename,
          sizeKB: Math.round(result.sizeBytes / 1024),
          durationSeconds: result.durationSeconds,
          sceneCount: result.sceneCount,
        });
        console.log(`  ✓ [${mp.format}] ${result.filename} — ${result.durationSeconds}s, ${Math.round(result.sizeBytes / 1024)}KB`);
      } catch (err) {
        report.videoRendering.skipped.push(`${mp.format}: ${(err as Error).message}`);
        console.log(`  ✗ [${mp.format}] FAILED: ${(err as Error).message}`);
      }
    }
  } else if (!hasFFmpeg) {
    console.log('  ~ ffmpeg not available, video rendering skipped');
  }

  // ── 6. Save Report ───────────────────────────────────────────────────
  console.log('\n── SAVING OUTPUTS ──');
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Save rendered HTML/MD
  for (const blog of rendered.blogs) {
    await writeFile(join(OUTPUT_DIR, `blog--${blog.slug}.html`), blog.result.html);
    await writeFile(join(OUTPUT_DIR, `blog--${blog.slug}.md`), blog.result.markdown);
    console.log(`  [SAVE] blog--${blog.slug}.html/.md`);
  }
  for (const lp of rendered.landingPages) {
    await writeFile(join(OUTPUT_DIR, `lp--${lp.slug}.html`), lp.result.html);
    console.log(`  [SAVE] lp--${lp.slug}.html`);
  }
  for (const sb of rendered.storyboards) {
    await writeFile(join(OUTPUT_DIR, `storyboard--${sb.format}.html`), sb.result.html);
    console.log(`  [SAVE] storyboard--${sb.format}.html`);
  }

  // ── 7. Build Summary ─────────────────────────────────────────────────
  const summary = buildSummary(report);
  report.summary = summary;

  await writeFile(join(OUTPUT_DIR, 'validation-report.json'), JSON.stringify(report, null, 2));
  console.log(`  [SAVE] validation-report.json`);

  // ── 8. Print Report ──────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  VALIDATION REPORT');
  console.log('═'.repeat(70));
  console.log(`  Stages: ${summary.totalStages} total, ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failures} failures`);
  console.log(`  Text: blog=${report.textGeneration.blogArticle.wordCount}w, LP=${report.textGeneration.landingPageCopy.sectionCount} sections, scripts=${report.textGeneration.mediaScripts.length}`);
  console.log(`  Audio: ${report.audioGeneration.plans.length} plans, ${report.audioGeneration.plans.reduce((s, p) => s + p.segments, 0)} segments`);
  console.log(`  Render: ${report.rendering.totalOutputs} HTML outputs`);
  console.log(`  Video: ${report.videoRendering.rendered.length} videos rendered`);

  if (summary.issues.length > 0) {
    console.log('\n  Issues:');
    for (const issue of summary.issues) console.log(`    ⚠ ${issue}`);
  }
  if (summary.improvements.length > 0) {
    console.log('\n  Improvements:');
    for (const imp of summary.improvements) console.log(`    → ${imp}`);
  }
  console.log('═'.repeat(70));
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

function validateStage(name: string, ctx: ProcessingContext): { status: 'pass' | 'warn' | 'fail'; details: string } {
  switch (name) {
    case 'Correlation':
      return ctx.correlations && ctx.correlations.length > 0
        ? { status: 'pass', details: `${ctx.correlations.length} correlations` }
        : { status: 'fail', details: 'no correlations' };

    case 'Source Intelligence':
      return ctx.sources && ctx.sources.length > 0
        ? { status: 'pass', details: `${ctx.sources.length} sources, avg confidence ${(ctx.sources.reduce((s, src) => s + src.confidenceScore, 0) / ctx.sources.length).toFixed(2)}` }
        : { status: 'fail', details: 'no sources' };

    case 'Narrative':
      return ctx.narratives && ctx.narratives.length > 0
        ? { status: 'pass', details: `${ctx.narratives.length} narratives, ${ctx.narratives.reduce((s, n) => s + n.beats.length, 0)} total beats` }
        : { status: 'fail', details: 'no narratives' };

    case 'Output Selection':
      if (!ctx.selectedOutputs || ctx.selectedOutputs.length === 0) return { status: 'fail', details: 'no decisions' };
      const approved = ctx.selectedOutputs.filter((d) => d.status === 'approved').length;
      return { status: approved > 0 ? 'pass' : 'warn', details: `${approved} approved, ${ctx.selectedOutputs.length - approved} deferred/rejected` };

    case 'Media Generation':
      return ctx.mediaPlans && ctx.mediaPlans.length > 0
        ? { status: 'pass', details: `${ctx.mediaPlans.length} plans, ${ctx.mediaPlans.reduce((s, p) => s + p.scenes.length, 0)} scenes` }
        : { status: 'warn', details: 'no media plans' };

    case 'Blog':
      return ctx.blogPlans && ctx.blogPlans.length > 0
        ? { status: 'pass', details: `${ctx.blogPlans.length} plans, ${ctx.blogPlans[0].sections.length} sections` }
        : { status: 'warn', details: 'no blog plans' };

    case 'Landing Page':
      return ctx.landingPagePlans && ctx.landingPagePlans.length > 0
        ? { status: 'pass', details: `${ctx.landingPagePlans.length} plans, ${ctx.landingPagePlans[0].sections.length} sections` }
        : { status: 'warn', details: 'no LP plans' };

    case 'Personalization':
      return ctx.personalization?.profile.applied
        ? { status: 'pass', details: `applied: ${ctx.personalization.profile.contact.displayName}, ${ctx.personalization.profile.contact.channels.length} channels` }
        : { status: 'warn', details: 'not applied' };

    case 'Audio':
      return ctx.audioResult && ctx.audioResult.plans.length > 0
        ? { status: 'pass', details: `${ctx.audioResult.plans.length} plans, ${ctx.audioResult.totalSegments} segments, ${ctx.audioResult.totalDurationSeconds}s` }
        : { status: 'warn', details: 'no audio plans' };

    case 'Render/Export':
      return ctx.exportResult && ctx.exportResult.totalArtifacts > 0
        ? { status: ctx.exportResult.invalid > 0 ? 'warn' : 'pass', details: `${ctx.exportResult.totalArtifacts} artifacts (${ctx.exportResult.withWarnings} with warnings)` }
        : { status: 'fail', details: 'no artifacts' };

    default:
      return { status: 'pass', details: 'ok' };
  }
}

function buildSummary(report: ValidationReport): SummaryReport {
  const passed = report.pipeline.filter((s) => s.status === 'pass').length;
  const warnings = report.pipeline.filter((s) => s.status === 'warn').length;
  const failures = report.pipeline.filter((s) => s.status === 'fail').length;
  const issues: string[] = [];
  const improvements: string[] = [];

  // Check pipeline
  for (const stage of report.pipeline) {
    if (stage.status === 'fail') issues.push(`${stage.stage}: ${stage.details}`);
    if (stage.status === 'warn') issues.push(`${stage.stage} (warning): ${stage.details}`);
  }

  // Check text generation
  if (report.textGeneration.blogArticle.wordCount < 200) {
    improvements.push('Blog article is short — AI text generation would produce richer content');
  }
  if (!report.textGeneration.landingPageCopy.hasHero) {
    issues.push('Landing page missing hero headline');
  }

  // Check audio
  if (report.audioGeneration.plans.length === 0) {
    issues.push('No audio plans generated');
  }

  // Standard improvements
  improvements.push(
    'Implement real IAIAdapter (OpenAI/Gemini) for editorial-quality text generation',
    'Integrate real TTS (ElevenLabs) for audio narration generation',
    'Add real PDF ingestion + image extraction for production use',
    'Implement audio-video synchronization for narrated videos',
    'Add custom font support in video renderer for brand-specific typography',
  );

  return { totalStages: report.pipeline.length, passed, warnings, failures, issues, improvements };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generatePlaceholderAssets(plans: Array<{ scenes: Array<{ assetIds: string[] }> }>): Promise<Map<string, string>> {
  await mkdir(ASSETS_DIR, { recursive: true });
  const assetMap = new Map<string, string>();
  const allIds = new Set<string>();

  for (const plan of plans) {
    for (const scene of plan.scenes) {
      for (const id of scene.assetIds) allIds.add(id);
    }
  }

  const colors = [[45,90,61],[26,58,42],[200,169,110],[70,130,90],[40,60,80],[180,140,100],[60,100,120],[120,80,60],[90,130,150],[50,80,50],[160,120,80],[80,60,100],[100,140,100]];
  let idx = 0;

  for (const assetId of allIds) {
    const filePath = join(ASSETS_DIR, `${assetId}.ppm`);
    if (!existsSync(filePath)) {
      const [r,g,b] = colors[idx % colors.length];
      const w = 1080, h = 1920;
      const header = Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii');
      const pixels = Buffer.alloc(w * h * 3);
      for (let i = 0; i < w * h; i++) {
        const row = Math.floor(i / w);
        const f = 1 - (row / h) * 0.3;
        pixels[i*3] = Math.round(r*f);
        pixels[i*3+1] = Math.round(g*f);
        pixels[i*3+2] = Math.round(b*f);
      }
      await writeFile(filePath, Buffer.concat([header, pixels]));
    }
    assetMap.set(assetId, filePath);
    idx++;
  }

  return assetMap;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
