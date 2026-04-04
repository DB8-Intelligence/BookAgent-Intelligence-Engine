/**
 * Multi-Book Validation (Part 39)
 *
 * Executa o pipeline em 3 books diferentes e gera relatório comparativo.
 * Valida que o sistema se comporta de forma adaptativa com:
 * - Diferentes estilos editoriais (luxury, corporate, resort)
 * - Diferentes estratégias de extração (embedded, hybrid)
 * - Diferentes hierarquias visuais (image-first, text-first, balanced)
 *
 * Para cada book, registra:
 * - Estratégia de extração escolhida
 * - Tipo estrutural do book
 * - Page archetypes identificados
 * - Layout patterns detectados
 * - Quantidade de sources, outputs, media plans
 * - Score de consistência visual
 * - Tempos de execução
 *
 * Usage: npx tsx scripts/multi-book-validation.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createBookFixtures, type BookFixture } from './multi-book-fixtures.js';
import type { ProcessingContext } from '../src/core/context.js';

// Modules (pós-extração)
import { BookReverseEngineeringModule } from '../src/modules/book-reverse-engineering/index.js';
import { CorrelationModule } from '../src/modules/correlation/index.js';
import { SourceIntelligenceModule } from '../src/modules/source-intelligence/index.js';
import { NarrativeModule } from '../src/modules/narrative/index.js';
import { OutputSelectionModule } from '../src/modules/output-selection/index.js';
import { MediaGenerationModule } from '../src/modules/media/index.js';
import { BlogModule } from '../src/modules/blog/index.js';
import { LandingPageModule } from '../src/modules/landing-page/index.js';
import { PersonalizationModule } from '../src/modules/personalization/index.js';
import { RenderExportModule } from '../src/modules/render-export/index.js';
import { EMPTY_BRANDING } from '../src/domain/entities/branding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookReport {
  name: string;
  style: string;
  // Compatibility
  structureType: string;
  extractionStrategy: string;
  extractionConfidence: string;
  warnings: string[];
  // Reverse Engineering
  pageCount: number;
  archetypeDistribution: Record<string, number>;
  layoutPatternCount: number;
  dominantPattern: string;
  designMode: string;
  headlineStyle: string;
  consistencyScore: number;
  hasNarrativeFlow: boolean;
  // Pipeline results
  assetCount: number;
  correlationCount: number;
  sourceCount: number;
  narrativeCount: number;
  approvedOutputCount: number;
  mediaPlanCount: number;
  blogPlanCount: number;
  landingPagePlanCount: number;
  exportArtifactCount: number;
  // Timing
  reverseEngineeringMs: number;
  fullPipelineMs: number;
}

interface ComparisonReport {
  generatedAt: string;
  bookCount: number;
  books: BookReport[];
  comparison: {
    strategies: Record<string, string[]>;
    designModes: Record<string, string[]>;
    bestConsistency: { book: string; score: number };
    worstConsistency: { book: string; score: number };
    mostAssets: { book: string; count: number };
    mostOutputs: { book: string; count: number };
    averagePipelineMs: number;
    insights: string[];
  };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

const modules = [
  new BookReverseEngineeringModule(),
  new CorrelationModule(),
  new SourceIntelligenceModule(),
  new NarrativeModule(),
  new OutputSelectionModule(),
  new MediaGenerationModule(),
  new BlogModule(),
  new LandingPageModule(),
  new PersonalizationModule(),
  new RenderExportModule(),
];

// ---------------------------------------------------------------------------
// Run single book
// ---------------------------------------------------------------------------

async function runBook(fixture: BookFixture): Promise<BookReport> {
  const bookStart = Date.now();

  // Inject stub branding
  let ctx: ProcessingContext = {
    ...fixture.context,
    branding: {
      ...EMPTY_BRANDING,
      colors: { primary: '#1a1a2e', secondary: '#16213e', accent: '#e94560', background: '#ffffff', text: '#1a1a1a' },
      style: 'minimal',
    },
  };

  // Track reverse engineering time separately
  let reMs = 0;

  for (const mod of modules) {
    const start = Date.now();
    ctx = await mod.run(ctx);
    const elapsed = Date.now() - start;

    if (mod.name === 'BookReverseEngineering') {
      reMs = elapsed;
    }
  }

  const fullPipelineMs = Date.now() - bookStart;

  // Extract metrics
  const prototype = ctx.bookPrototype;
  const compat = fixture.compatibility;

  return {
    name: fixture.name,
    style: fixture.style,
    // Compatibility
    structureType: compat.structureType,
    extractionStrategy: compat.recommendedStrategy,
    extractionConfidence: compat.confidence,
    warnings: compat.warnings,
    // Reverse Engineering
    pageCount: prototype?.pageCount ?? 0,
    archetypeDistribution: prototype?.archetypeDistribution ?? {},
    layoutPatternCount: prototype?.layoutPatterns.length ?? 0,
    dominantPattern: prototype?.layoutPatterns[0]?.name ?? 'none',
    designMode: prototype?.designHierarchy.dominantMode ?? 'unknown',
    headlineStyle: prototype?.designHierarchy.headlineStyle ?? 'unknown',
    consistencyScore: prototype?.consistencyScore ?? 0,
    hasNarrativeFlow: prototype?.designHierarchy.hasNarrativeFlow ?? false,
    // Pipeline results
    assetCount: ctx.assets?.length ?? 0,
    correlationCount: ctx.correlations?.length ?? 0,
    sourceCount: ctx.sources?.length ?? 0,
    narrativeCount: ctx.narratives?.length ?? 0,
    approvedOutputCount: ctx.selectedOutputs?.filter(o => o.status === 'approved' || o.status === 'approved-with-gaps').length ?? 0,
    mediaPlanCount: ctx.mediaPlans?.length ?? 0,
    blogPlanCount: ctx.blogPlans?.length ?? 0,
    landingPagePlanCount: ctx.landingPagePlans?.length ?? 0,
    exportArtifactCount: ctx.exportResult?.artifacts.length ?? 0,
    // Timing
    reverseEngineeringMs: reMs,
    fullPipelineMs,
  };
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

function buildComparison(books: BookReport[]): ComparisonReport['comparison'] {
  // Group by strategy
  const strategies: Record<string, string[]> = {};
  const designModes: Record<string, string[]> = {};

  for (const b of books) {
    (strategies[b.extractionStrategy] ??= []).push(b.name);
    (designModes[b.designMode] ??= []).push(b.name);
  }

  // Best/worst consistency
  const sorted = [...books].sort((a, b) => b.consistencyScore - a.consistencyScore);
  const bestConsistency = { book: sorted[0].name, score: sorted[0].consistencyScore };
  const worstConsistency = { book: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].consistencyScore };

  // Most assets / outputs
  const byAssets = [...books].sort((a, b) => b.assetCount - a.assetCount);
  const byOutputs = [...books].sort((a, b) => b.approvedOutputCount - a.approvedOutputCount);

  const avgMs = Math.round(books.reduce((s, b) => s + b.fullPipelineMs, 0) / books.length);

  // Generate insights
  const insights: string[] = [];

  // Strategy insights
  for (const [strategy, bookNames] of Object.entries(strategies)) {
    insights.push(`Strategy "${strategy}" chosen for: ${bookNames.join(', ')}`);
  }

  // Design mode insights
  for (const [mode, bookNames] of Object.entries(designModes)) {
    insights.push(`Design mode "${mode}" detected in: ${bookNames.join(', ')}`);
  }

  // Consistency insight
  if (bestConsistency.score - worstConsistency.score > 0.3) {
    insights.push(
      `Large consistency gap: ${bestConsistency.book} (${bestConsistency.score.toFixed(2)}) ` +
      `vs ${worstConsistency.book} (${worstConsistency.score.toFixed(2)})`
    );
  }

  // Narrative flow insight
  const withFlow = books.filter(b => b.hasNarrativeFlow);
  const withoutFlow = books.filter(b => !b.hasNarrativeFlow);
  if (withFlow.length > 0 && withoutFlow.length > 0) {
    insights.push(
      `Narrative flow detected in: ${withFlow.map(b => b.name).join(', ')}. ` +
      `Not detected in: ${withoutFlow.map(b => b.name).join(', ')}`
    );
  }

  // Asset density insight
  for (const b of books) {
    const density = b.assetCount / b.pageCount;
    insights.push(`${b.name}: ${density.toFixed(1)} assets/page (${b.assetCount} assets, ${b.pageCount} pages)`);
  }

  // Output yield insight
  for (const b of books) {
    insights.push(
      `${b.name}: ${b.approvedOutputCount} approved outputs → ` +
      `${b.mediaPlanCount} media + ${b.blogPlanCount} blog + ${b.landingPagePlanCount} LP`
    );
  }

  return {
    strategies,
    designModes,
    bestConsistency,
    worstConsistency,
    mostAssets: { book: byAssets[0].name, count: byAssets[0].assetCount },
    mostOutputs: { book: byOutputs[0].name, count: byOutputs[0].approvedOutputCount },
    averagePipelineMs: avgMs,
    insights,
  };
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

function formatReport(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  MULTI-BOOK VALIDATION REPORT');
  lines.push(`  Generated: ${report.generatedAt}`);
  lines.push(`  Books analyzed: ${report.bookCount}`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  for (const book of report.books) {
    lines.push(`┌─────────────────────────────────────────────────────────────`);
    lines.push(`│ ${book.name} (${book.style})`);
    lines.push(`├─────────────────────────────────────────────────────────────`);
    lines.push(`│ COMPATIBILITY`);
    lines.push(`│   Structure type:      ${book.structureType}`);
    lines.push(`│   Extraction strategy: ${book.extractionStrategy}`);
    lines.push(`│   Confidence:          ${book.extractionConfidence}`);
    if (book.warnings.length > 0) {
      for (const w of book.warnings) lines.push(`│   ⚠ ${w}`);
    }
    lines.push(`│`);
    lines.push(`│ REVERSE ENGINEERING (${book.reverseEngineeringMs}ms)`);
    lines.push(`│   Pages:               ${book.pageCount}`);
    lines.push(`│   Design mode:         ${book.designMode}`);
    lines.push(`│   Headline style:      ${book.headlineStyle}`);
    lines.push(`│   Consistency score:   ${book.consistencyScore.toFixed(2)}`);
    lines.push(`│   Narrative flow:      ${book.hasNarrativeFlow ? 'YES' : 'NO'}`);
    lines.push(`│   Layout patterns:     ${book.layoutPatternCount}`);
    lines.push(`│   Dominant pattern:    ${book.dominantPattern}`);
    lines.push(`│   Archetypes:          ${JSON.stringify(book.archetypeDistribution)}`);
    lines.push(`│`);
    lines.push(`│ PIPELINE RESULTS (${book.fullPipelineMs}ms)`);
    lines.push(`│   Assets:              ${book.assetCount}`);
    lines.push(`│   Correlations:        ${book.correlationCount}`);
    lines.push(`│   Sources:             ${book.sourceCount}`);
    lines.push(`│   Narratives:          ${book.narrativeCount}`);
    lines.push(`│   Approved outputs:    ${book.approvedOutputCount}`);
    lines.push(`│   Media plans:         ${book.mediaPlanCount}`);
    lines.push(`│   Blog plans:          ${book.blogPlanCount}`);
    lines.push(`│   Landing page plans:  ${book.landingPagePlanCount}`);
    lines.push(`│   Export artifacts:    ${book.exportArtifactCount}`);
    lines.push(`└─────────────────────────────────────────────────────────────`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  COMPARISON');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  const c = report.comparison;
  lines.push(`  Best consistency:    ${c.bestConsistency.book} (${c.bestConsistency.score.toFixed(2)})`);
  lines.push(`  Worst consistency:   ${c.worstConsistency.book} (${c.worstConsistency.score.toFixed(2)})`);
  lines.push(`  Most assets:         ${c.mostAssets.book} (${c.mostAssets.count})`);
  lines.push(`  Most outputs:        ${c.mostOutputs.book} (${c.mostOutputs.count})`);
  lines.push(`  Avg pipeline time:   ${c.averagePipelineMs}ms`);
  lines.push('');
  lines.push('  INSIGHTS:');
  for (const insight of c.insights) {
    lines.push(`    → ${insight}`);
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🔍 Multi-Book Validation — Starting...\n');

  const fixtures = createBookFixtures();
  const bookReports: BookReport[] = [];

  for (const fixture of fixtures) {
    console.log(`\n━━━ Processing: ${fixture.name} (${fixture.style}) ━━━\n`);
    const report = await runBook(fixture);
    bookReports.push(report);
    console.log(`\n✓ ${fixture.name}: ${report.approvedOutputCount} outputs, ${report.fullPipelineMs}ms\n`);
  }

  // Build comparison
  const fullReport: ComparisonReport = {
    generatedAt: new Date().toISOString(),
    bookCount: bookReports.length,
    books: bookReports,
    comparison: buildComparison(bookReports),
  };

  // Format and print
  const formatted = formatReport(fullReport);
  console.log('\n' + formatted);

  // Save
  await mkdir('storage/multi-book', { recursive: true });
  await writeFile('storage/multi-book/report.txt', formatted, 'utf-8');
  await writeFile('storage/multi-book/report.json', JSON.stringify(fullReport, null, 2), 'utf-8');

  console.log('\n📁 Reports saved to storage/multi-book/');
  console.log('   → report.txt (human readable)');
  console.log('   → report.json (machine readable)\n');
}

main().catch((err) => {
  console.error('Multi-book validation failed:', err);
  process.exit(1);
});
