/**
 * Strategy Recommender
 *
 * Avalia os sinais estruturais do PDF e recomenda a melhor
 * estratégia de extração de assets.
 *
 * Lógica de decisão:
 *
 * 1. EMBEDDED_EXTRACTION: muitas imagens embutidas + alta resolução + texto vetorial
 *    → Extrair streams de imagem diretamente (rápido, alta qualidade)
 *
 * 2. PAGE_RENDER: páginas rasterizadas + pouco texto + imagens compostas
 *    → Renderizar cada página como snapshot (preserva composição)
 *
 * 3. HYBRID: mix de páginas com imagens embutidas e páginas compostas
 *    → Extrair embutidos onde possível + renderizar o restante
 *
 * 4. MANUAL_REVIEW: sinais conflitantes ou estrutura muito ambígua
 *    → Sinalizar para revisão humana
 */

import type { BookStructureSignals, BookCompatibilityProfile, StrategyScore } from '../../domain/entities/book-compatibility.js';
import {
  BookStructureType,
  ExtractionStrategy,
  ExtractionConfidence,
} from '../../domain/entities/book-compatibility.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function recommendStrategy(signals: BookStructureSignals): Omit<BookCompatibilityProfile, 'analysisTimeMs'> {
  const structureType = classifyStructure(signals);
  const strategyScores = scoreStrategies(signals, structureType);

  // Sort by score descending
  strategyScores.sort((a, b) => b.score - a.score);

  const best = strategyScores[0];
  const warnings = collectWarnings(signals, structureType);

  return {
    structureType,
    signals,
    recommendedStrategy: best.strategy,
    confidence: best.confidence,
    strategyScores,
    rationale: best.rationale,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Structure classification
// ---------------------------------------------------------------------------

function classifyStructure(signals: BookStructureSignals): BookStructureType {
  const {
    embeddedImageCount,
    hasVectorText,
    hasRasterizedPages,
    rasterizedPageRatio,
    creatorTool,
    hasLayerIndicators,
    pageCount,
    hasHighResImages,
  } = signals;

  // Check for Illustrator/InDesign origin
  if (hasLayerIndicators || isAdobeTool(creatorTool)) {
    return BookStructureType.ILLUSTRATOR_LIKE;
  }

  // Mostly rasterized pages (>70%)
  if (hasRasterizedPages && rasterizedPageRatio > 0.7) {
    return BookStructureType.RASTERIZED;
  }

  // Rich embedded images with vector text
  if (embeddedImageCount >= pageCount * 0.5 && hasVectorText && hasHighResImages) {
    return BookStructureType.EMBEDDED_ASSETS;
  }

  // Mix of embedded + rasterized
  if (embeddedImageCount > 0 && rasterizedPageRatio > 0.3) {
    return BookStructureType.HYBRID;
  }

  // Has some embedded images but not many signals
  if (embeddedImageCount > 0) {
    return BookStructureType.EMBEDDED_ASSETS;
  }

  return BookStructureType.LOW_STRUCTURE;
}

function isAdobeTool(creatorTool: string | null): boolean {
  if (!creatorTool) return false;
  const lower = creatorTool.toLowerCase();
  return lower.includes('illustrator')
    || lower.includes('indesign')
    || lower.includes('photoshop');
}

// ---------------------------------------------------------------------------
// Strategy scoring
// ---------------------------------------------------------------------------

function scoreStrategies(signals: BookStructureSignals, structureType: BookStructureType): StrategyScore[] {
  return [
    scoreEmbeddedExtraction(signals, structureType),
    scorePageRender(signals, structureType),
    scoreHybrid(signals, structureType),
    scoreManualReview(signals, structureType),
  ];
}

function scoreEmbeddedExtraction(signals: BookStructureSignals, structureType: BookStructureType): StrategyScore {
  let score = 0;
  const reasons: string[] = [];

  // Strong signals for embedded extraction
  if (signals.embeddedImageCount > 0) {
    score += 0.3;
    reasons.push(`${signals.embeddedImageCount} imagens embutidas detectadas`);
  }

  if (signals.hasHighResImages) {
    score += 0.2;
    reasons.push('imagens de alta resolução');
  }

  if (signals.hasVectorText) {
    score += 0.15;
    reasons.push('texto vetorial presente');
  }

  if (signals.pagesWithEmbeddedImages > 0.6) {
    score += 0.15;
    reasons.push(`${Math.round(signals.pagesWithEmbeddedImages * 100)}% das páginas com imagens`);
  }

  if (structureType === BookStructureType.EMBEDDED_ASSETS) {
    score += 0.1;
  }

  // Negative signals
  if (signals.hasRasterizedPages) {
    score -= 0.2;
    reasons.push('algumas páginas rasterizadas detectadas');
  }

  score = clamp(score);
  const confidence = score > 0.7 ? ExtractionConfidence.HIGH
    : score > 0.4 ? ExtractionConfidence.MEDIUM : ExtractionConfidence.LOW;

  return {
    strategy: ExtractionStrategy.EMBEDDED_EXTRACTION,
    score,
    confidence,
    rationale: `Extração de imagens embutidas: ${reasons.join('; ')}`,
  };
}

function scorePageRender(signals: BookStructureSignals, structureType: BookStructureType): StrategyScore {
  let score = 0;
  const reasons: string[] = [];

  if (signals.hasRasterizedPages) {
    score += 0.3;
    reasons.push('páginas rasterizadas detectadas');
  }

  if (signals.rasterizedPageRatio > 0.5) {
    score += 0.2;
    reasons.push(`${Math.round(signals.rasterizedPageRatio * 100)}% páginas rasterizadas`);
  }

  if (signals.embeddedImageCount === 0) {
    score += 0.2;
    reasons.push('sem imagens embutidas extraíveis');
  }

  if (structureType === BookStructureType.RASTERIZED) {
    score += 0.2;
  }

  if (structureType === BookStructureType.ILLUSTRATOR_LIKE) {
    score += 0.15;
    reasons.push('origem Adobe/editorial — composições complexas');
  }

  // Negative: if embedded extraction works well, page-render is worse
  if (signals.hasHighResImages && signals.embeddedImageCount > signals.pageCount * 0.5) {
    score -= 0.2;
  }

  score = clamp(score);
  const confidence = score > 0.7 ? ExtractionConfidence.HIGH
    : score > 0.4 ? ExtractionConfidence.MEDIUM : ExtractionConfidence.LOW;

  return {
    strategy: ExtractionStrategy.PAGE_RENDER,
    score,
    confidence,
    rationale: `Renderização de páginas: ${reasons.join('; ')}`,
  };
}

function scoreHybrid(signals: BookStructureSignals, structureType: BookStructureType): StrategyScore {
  let score = 0;
  const reasons: string[] = [];

  // Hybrid is good when we have mixed signals
  if (signals.embeddedImageCount > 0 && signals.rasterizedPageRatio > 0.2) {
    score += 0.4;
    reasons.push('mix de imagens embutidas e páginas rasterizadas');
  }

  if (structureType === BookStructureType.HYBRID) {
    score += 0.3;
    reasons.push('estrutura classificada como híbrida');
  }

  if (signals.hasVectorText && signals.hasRasterizedPages) {
    score += 0.15;
    reasons.push('texto vetorial + páginas sem texto');
  }

  // Hybrid is less ideal when one strategy clearly dominates
  if (signals.rasterizedPageRatio > 0.8 || signals.rasterizedPageRatio < 0.1) {
    score -= 0.2;
  }

  score = clamp(score);
  const confidence = score > 0.6 ? ExtractionConfidence.HIGH
    : score > 0.35 ? ExtractionConfidence.MEDIUM : ExtractionConfidence.LOW;

  return {
    strategy: ExtractionStrategy.HYBRID,
    score,
    confidence,
    rationale: `Estratégia híbrida: ${reasons.join('; ')}`,
  };
}

function scoreManualReview(signals: BookStructureSignals, structureType: BookStructureType): StrategyScore {
  let score = 0;
  const reasons: string[] = [];

  if (structureType === BookStructureType.LOW_STRUCTURE) {
    score += 0.4;
    reasons.push('estrutura de baixa legibilidade');
  }

  if (signals.embeddedImageCount === 0 && !signals.hasRasterizedPages && !signals.hasVectorText) {
    score += 0.3;
    reasons.push('poucos sinais detectados');
  }

  if (signals.pageCount === 0) {
    score += 0.5;
    reasons.push('PDF sem páginas válidas');
  }

  score = clamp(score);

  return {
    strategy: ExtractionStrategy.MANUAL_REVIEW,
    score,
    confidence: ExtractionConfidence.LOW,
    rationale: `Revisão manual: ${reasons.length > 0 ? reasons.join('; ') : 'backup strategy'}`,
  };
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

function collectWarnings(signals: BookStructureSignals, structureType: BookStructureType): string[] {
  const warnings: string[] = [];

  if (signals.embeddedImageCount === 0) {
    warnings.push('Nenhuma imagem embutida detectada — extração pode depender de page-render');
  }

  if (signals.rasterizedPageRatio > 0.5) {
    warnings.push(`${Math.round(signals.rasterizedPageRatio * 100)}% das páginas parecem rasterizadas — qualidade de extração pode variar`);
  }

  if (!signals.hasVectorText) {
    warnings.push('Texto vetorial não detectado — OCR pode ser necessário para extração de texto');
  }

  if (structureType === BookStructureType.ILLUSTRATOR_LIKE) {
    warnings.push('PDF de origem editorial (Adobe) — composições complexas podem não separar em assets individuais');
  }

  if (signals.fileSizeBytes > 100_000_000) {
    warnings.push(`Arquivo grande (${Math.round(signals.fileSizeBytes / 1_000_000)}MB) — processamento pode ser lento`);
  }

  if (signals.pageCount > 100) {
    warnings.push(`PDF extenso (${signals.pageCount} páginas) — considerar processamento por lotes`);
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(score: number): number {
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
