import { describe, it, expect } from 'vitest';
import { buildSources } from '../../src/modules/source-intelligence/source-builder.js';
import { mergeSimilarSources } from '../../src/modules/source-intelligence/source-merger.js';
import { rankSources } from '../../src/modules/source-intelligence/source-ranker.js';
import {
  createMockCorrelationBlock,
  createMockCorrelationBlocks,
  createMockSource,
  createMockSources,
} from '../fixtures.js';
import { SourceType, NarrativeRole } from '../../src/domain/value-objects/index.js';
import { CorrelationConfidence } from '../../src/domain/entities/correlation.js';

// ---------------------------------------------------------------------------
// Source Builder
// ---------------------------------------------------------------------------

describe('Source Builder', () => {
  it('converts correlation blocks to sources', () => {
    const blocks = createMockCorrelationBlocks();
    const sources = buildSources(blocks);

    expect(sources).toHaveLength(blocks.length);
    sources.forEach((s) => {
      expect(s.id).toBeDefined();
      expect(s.type).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.text.length).toBeGreaterThan(0);
    });
  });

  it('maps correlation confidence to numeric score', () => {
    const highBlock = createMockCorrelationBlock({
      confidence: CorrelationConfidence.HIGH,
    });
    const lowBlock = createMockCorrelationBlock({
      confidence: CorrelationConfidence.LOW,
    });

    const [highSource] = buildSources([highBlock]);
    const [lowSource] = buildSources([lowBlock]);

    expect(highSource.confidenceScore).toBe(0.9);
    expect(lowSource.confidenceScore).toBe(0.5);
  });

  it('transfers assetIds and tags from block', () => {
    const block = createMockCorrelationBlock({
      assetIds: ['a1', 'a2', 'a3'],
      tags: ['piscina', 'lazer'],
    });

    const [source] = buildSources([block]);

    expect(source.assetIds).toEqual(['a1', 'a2', 'a3']);
    expect(source.tags).toEqual(['piscina', 'lazer']);
  });

  it('generates title from headline', () => {
    const block = createMockCorrelationBlock({
      headline: 'Vista Verde Residencial Premium',
    });

    const [source] = buildSources([block]);
    expect(source.title).toBe('Vista Verde Residencial Premium');
  });

  it('generates fallback title from type when no headline', () => {
    const block = createMockCorrelationBlock({
      headline: '',
      inferredType: SourceType.CTA,
      textBlocks: [
        {
          content: 'CTA',
          headline: '',
          page: 1,
          blockType: 'headline' as any,
          keywords: [],
        },
      ],
    });

    const [source] = buildSources([block]);
    expect(source.title).toContain('Página');
  });

  it('includes branding context when provided', () => {
    const block = createMockCorrelationBlock();
    const branding = {
      colors: { primary: '#001', secondary: '#002', accent: '#003', background: '#fff', text: '#000' },
      style: 'luxury-modern' as any,
      typography: { headingFont: 'Arial', bodyFont: 'Helvetica', sizes: { heading: 24, body: 14, caption: 10 } },
      sophisticationLevel: 'premium' as any,
      visualIntensity: 'high' as any,
      dominantColors: [],
    };

    const [source] = buildSources([block], branding);
    expect(source.brandingContext).toBeDefined();
    expect(source.brandingContext!.colors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Source Merger
// ---------------------------------------------------------------------------

describe('Source Merger', () => {
  it('returns single source unchanged', () => {
    const source = createMockSource();
    const result = mergeSimilarSources([source]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(source.id);
  });

  it('merges sources of same type on adjacent pages with keyword overlap', () => {
    const s1 = createMockSource({
      id: 'src-1',
      type: SourceType.LIFESTYLE,
      sourcePage: 3,
      tags: ['piscina', 'lazer', 'academia'],
      confidenceScore: 0.9,
    });
    const s2 = createMockSource({
      id: 'src-2',
      type: SourceType.LIFESTYLE,
      sourcePage: 4,
      tags: ['piscina', 'lazer', 'playground'],
      confidenceScore: 0.7,
    });

    const result = mergeSimilarSources([s1, s2]);

    // Should merge into one
    expect(result).toHaveLength(1);
    // Tags should be combined
    expect(result[0].tags).toContain('piscina');
    expect(result[0].tags).toContain('playground');
  });

  it('does not merge sources of different types', () => {
    const s1 = createMockSource({ id: 'src-1', type: SourceType.HERO, sourcePage: 1 });
    const s2 = createMockSource({ id: 'src-2', type: SourceType.CTA, sourcePage: 1 });

    const result = mergeSimilarSources([s1, s2]);
    expect(result).toHaveLength(2);
  });

  it('does not merge sources on distant pages', () => {
    const s1 = createMockSource({
      id: 'src-1',
      type: SourceType.LIFESTYLE,
      sourcePage: 1,
      tags: ['piscina', 'lazer'],
    });
    const s2 = createMockSource({
      id: 'src-2',
      type: SourceType.LIFESTYLE,
      sourcePage: 10,
      tags: ['piscina', 'lazer'],
    });

    const result = mergeSimilarSources([s1, s2]);
    expect(result).toHaveLength(2);
  });

  it('combines assetIds without duplicates', () => {
    const s1 = createMockSource({
      id: 'src-1',
      type: SourceType.DIFERENCIAL,
      sourcePage: 5,
      assetIds: ['a1', 'a2'],
      tags: ['premium', 'acabamento', 'porcelanato'],
      confidenceScore: 0.8,
    });
    const s2 = createMockSource({
      id: 'src-2',
      type: SourceType.DIFERENCIAL,
      sourcePage: 6,
      assetIds: ['a2', 'a3'],
      tags: ['premium', 'acabamento', 'esquadria'],
      confidenceScore: 0.7,
    });

    const result = mergeSimilarSources([s1, s2]);

    expect(result).toHaveLength(1);
    expect(result[0].assetIds).toContain('a1');
    expect(result[0].assetIds).toContain('a2');
    expect(result[0].assetIds).toContain('a3');
    // No duplicates
    expect(new Set(result[0].assetIds).size).toBe(result[0].assetIds.length);
  });
});

// ---------------------------------------------------------------------------
// Source Ranker
// ---------------------------------------------------------------------------

describe('Source Ranker', () => {
  it('returns empty array for empty input', () => {
    expect(rankSources([])).toEqual([]);
  });

  it('assigns sequential priority starting from 1', () => {
    const sources = createMockSources();
    const ranked = rankSources(sources);

    expect(ranked[0].priority).toBe(1);
    expect(ranked[ranked.length - 1].priority).toBe(ranked.length);
  });

  it('ranks HERO source higher than EDITORIAL', () => {
    const hero = createMockSource({
      id: 'hero',
      type: SourceType.HERO,
      narrativeRole: NarrativeRole.HOOK,
      confidenceScore: 0.9,
      text: 'Residencial Vista Verde — empreendimento exclusivo com localização privilegiada na zona sul.',
      assetIds: ['a1', 'a2'],
      tags: ['residencial', 'exclusivo'],
    });
    const editorial = createMockSource({
      id: 'editorial',
      type: SourceType.EDITORIAL,
      narrativeRole: NarrativeRole.CONTEXT,
      confidenceScore: 0.3,
      text: 'Nota editorial',
      assetIds: [],
      tags: [],
    });

    const ranked = rankSources([editorial, hero]);

    expect(ranked[0].id).toBe('hero');
    expect(ranked[1].id).toBe('editorial');
  });

  it('preserves all source data during ranking', () => {
    const source = createMockSource({
      id: 'src-test',
      title: 'Test Title',
      text: 'Some long enough text for the source to be meaningful and rich.',
      tags: ['tag1', 'tag2'],
    });

    const [ranked] = rankSources([source]);

    expect(ranked.id).toBe('src-test');
    expect(ranked.title).toBe('Test Title');
    expect(ranked.tags).toEqual(['tag1', 'tag2']);
  });

  it('favors sources with more assets and text', () => {
    const rich = createMockSource({
      id: 'rich',
      type: SourceType.LIFESTYLE,
      text: 'Piscina aquecida, academia completa, salão de festas com 200m², playground e pet place. Tudo projetado para sua família.',
      assetIds: ['a1', 'a2', 'a3', 'a4'],
      confidenceScore: 0.9,
      tags: ['piscina', 'academia', 'lazer'],
    });
    const poor = createMockSource({
      id: 'poor',
      type: SourceType.LIFESTYLE,
      text: 'Lazer',
      assetIds: [],
      confidenceScore: 0.3,
      tags: [],
    });

    const ranked = rankSources([poor, rich]);

    expect(ranked[0].id).toBe('rich');
  });
});
