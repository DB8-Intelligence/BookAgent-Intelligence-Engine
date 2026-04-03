/**
 * Test Fixtures
 *
 * Mocks e dados de teste reutilizáveis para todo o projeto.
 * Fornece factories para criar entidades populadas de forma
 * consistente nos testes.
 */

import type { Asset } from '../src/domain/entities/asset.js';
import type { Source } from '../src/domain/entities/source.js';
import type { CorrelationBlock, TextBlock } from '../src/domain/entities/correlation.js';
import type { UserContext } from '../src/domain/entities/user-context.js';
import type { JobInput } from '../src/domain/entities/job.js';
import type { ProcessingContext } from '../src/core/context.js';
import {
  SourceType,
  NarrativeRole,
  CommercialRole,
  InputType,
  AssetOrigin,
} from '../src/domain/value-objects/index.js';
import {
  CorrelationConfidence,
  CorrelationMethod,
  TextBlockType,
} from '../src/domain/entities/correlation.js';

// ---------------------------------------------------------------------------
// UserContext
// ---------------------------------------------------------------------------

export function createMockUserContext(overrides?: Partial<UserContext>): UserContext {
  return {
    name: 'Douglas Silva',
    whatsapp: '11999887766',
    instagram: '@douglas.imoveis',
    site: 'https://douglas.imob.com',
    region: 'São Paulo - Zona Sul',
    logoUrl: 'https://example.com/logo.png',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// JobInput
// ---------------------------------------------------------------------------

export function createMockJobInput(overrides?: Partial<JobInput>): JobInput {
  return {
    fileUrl: 'https://example.com/book-empreendimento.pdf',
    type: InputType.PDF,
    userContext: createMockUserContext(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ProcessingContext (partial, for mid-pipeline tests)
// ---------------------------------------------------------------------------

export function createMockContext(overrides?: Partial<ProcessingContext>): ProcessingContext {
  return {
    jobId: 'test-job-001',
    input: createMockJobInput(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export function createMockAsset(overrides?: Partial<Asset>): Asset {
  return {
    id: `asset-${Math.random().toString(36).slice(2, 8)}`,
    filePath: '/storage/assets/test-image.jpg',
    thumbnailPath: '/storage/assets/test-image-thumb.jpg',
    dimensions: { width: 1920, height: 1080 },
    page: 1,
    format: 'jpg',
    sizeBytes: 250000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'abc123def456',
    ...overrides,
  };
}

export function createMockAssets(count: number): Asset[] {
  return Array.from({ length: count }, (_, i) =>
    createMockAsset({
      id: `asset-${i + 1}`,
      page: Math.floor(i / 2) + 1,
      filePath: `/storage/assets/image-${i + 1}.jpg`,
    }),
  );
}

// ---------------------------------------------------------------------------
// TextBlocks
// ---------------------------------------------------------------------------

export function createMockTextBlock(overrides?: Partial<TextBlock>): TextBlock {
  return {
    content: 'Conheça o Residencial Vista Verde, um empreendimento exclusivo.',
    headline: 'Residencial Vista Verde',
    page: 1,
    blockType: TextBlockType.HEADLINE,
    keywords: ['residencial', 'vista', 'verde', 'exclusivo'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CorrelationBlocks
// ---------------------------------------------------------------------------

export function createMockCorrelationBlock(
  overrides?: Partial<CorrelationBlock>,
): CorrelationBlock {
  return {
    id: `corr-${Math.random().toString(36).slice(2, 8)}`,
    page: 1,
    textBlocks: [createMockTextBlock()],
    assetIds: ['asset-1'],
    headline: 'Residencial Vista Verde',
    summary: 'Empreendimento exclusivo com localização privilegiada.',
    inferredType: SourceType.HERO,
    inferredNarrativeRole: NarrativeRole.HOOK,
    inferredCommercialRole: CommercialRole.VALUE_PROPOSITION,
    confidence: CorrelationConfidence.HIGH,
    methods: [CorrelationMethod.PAGE_PROXIMITY],
    tags: ['residencial', 'exclusivo', 'localização'],
    priority: 1,
    ...overrides,
  };
}

export function createMockCorrelationBlocks(): CorrelationBlock[] {
  return [
    createMockCorrelationBlock({
      id: 'corr-hero',
      page: 1,
      inferredType: SourceType.HERO,
      inferredNarrativeRole: NarrativeRole.HOOK,
      headline: 'Residencial Vista Verde',
      assetIds: ['asset-1', 'asset-2'],
      tags: ['lançamento', 'residencial', 'vista', 'verde'],
    }),
    createMockCorrelationBlock({
      id: 'corr-lifestyle',
      page: 3,
      inferredType: SourceType.LIFESTYLE,
      inferredNarrativeRole: NarrativeRole.SHOWCASE,
      headline: 'Lazer Completo',
      textBlocks: [createMockTextBlock({
        content: 'Piscina, academia, salão de festas e playground.',
        headline: 'Lazer Completo',
        page: 3,
        blockType: TextBlockType.BULLET_LIST,
        keywords: ['piscina', 'academia', 'salão', 'playground'],
      })],
      assetIds: ['asset-3', 'asset-4'],
      tags: ['piscina', 'academia', 'lazer', 'playground'],
    }),
    createMockCorrelationBlock({
      id: 'corr-diferencial',
      page: 5,
      inferredType: SourceType.DIFERENCIAL,
      inferredNarrativeRole: NarrativeRole.DIFFERENTIATOR,
      headline: 'Diferenciais Exclusivos',
      textBlocks: [createMockTextBlock({
        content: 'Acabamento premium com porcelanato importado e esquadrias de alumínio.',
        headline: 'Diferenciais Exclusivos',
        page: 5,
        blockType: TextBlockType.PARAGRAPH,
        keywords: ['acabamento', 'premium', 'porcelanato', 'esquadrias'],
      })],
      assetIds: ['asset-5'],
      tags: ['diferencial', 'acabamento', 'premium', 'exclusivo'],
    }),
    createMockCorrelationBlock({
      id: 'corr-planta',
      page: 7,
      inferredType: SourceType.PLANTA,
      inferredNarrativeRole: NarrativeRole.SHOWCASE,
      headline: 'Plantas de 2 e 3 Dormitórios',
      textBlocks: [createMockTextBlock({
        content: 'Apartamentos de 65m² a 110m² com suíte e varanda gourmet.',
        headline: 'Plantas de 2 e 3 Dormitórios',
        page: 7,
        blockType: TextBlockType.PARAGRAPH,
        keywords: ['apartamento', 'dormitório', 'suíte', 'varanda', 'gourmet'],
      })],
      assetIds: ['asset-6'],
      tags: ['planta', 'dormitório', 'suíte', 'varanda'],
    }),
    createMockCorrelationBlock({
      id: 'corr-cta',
      page: 10,
      inferredType: SourceType.CTA,
      inferredNarrativeRole: NarrativeRole.CLOSING,
      inferredCommercialRole: CommercialRole.LEAD_CAPTURE,
      headline: 'Agende Sua Visita',
      textBlocks: [createMockTextBlock({
        content: 'Agende sua visita ao decorado. Ligue ou fale pelo WhatsApp.',
        headline: 'Agende Sua Visita',
        page: 10,
        blockType: TextBlockType.CTA,
        keywords: ['agende', 'visita', 'whatsapp', 'decorado'],
      })],
      assetIds: ['asset-7'],
      tags: ['agende', 'visita', 'whatsapp', 'contato'],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Sources (built from mock correlations, simulating source-intelligence output)
// ---------------------------------------------------------------------------

export function createMockSource(overrides?: Partial<Source>): Source {
  return {
    id: `src-${Math.random().toString(36).slice(2, 8)}`,
    type: SourceType.HERO,
    title: 'Residencial Vista Verde',
    text: 'Conheça o Residencial Vista Verde, um empreendimento exclusivo com localização privilegiada.',
    summary: 'Empreendimento exclusivo com localização privilegiada.',
    description: '[Abertura] Residencial Vista Verde — empreendimento exclusivo.',
    assetIds: ['asset-1', 'asset-2'],
    tags: ['residencial', 'exclusivo', 'localização'],
    confidenceScore: 0.9,
    sourcePage: 1,
    narrativeRole: NarrativeRole.HOOK,
    commercialRole: CommercialRole.VALUE_PROPOSITION,
    priority: 1,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

export function createMockSources(): Source[] {
  return [
    createMockSource({ id: 'src-hero', type: SourceType.HERO, priority: 1, narrativeRole: NarrativeRole.HOOK }),
    createMockSource({ id: 'src-lifestyle', type: SourceType.LIFESTYLE, title: 'Lazer Completo', priority: 2, narrativeRole: NarrativeRole.SHOWCASE, assetIds: ['asset-3', 'asset-4'], tags: ['piscina', 'academia', 'lazer'] }),
    createMockSource({ id: 'src-diferencial', type: SourceType.DIFERENCIAL, title: 'Diferenciais Exclusivos', priority: 3, narrativeRole: NarrativeRole.DIFFERENTIATOR, assetIds: ['asset-5'], tags: ['diferencial', 'premium'] }),
    createMockSource({ id: 'src-planta', type: SourceType.PLANTA, title: 'Plantas e Tipologias', priority: 4, narrativeRole: NarrativeRole.SHOWCASE, assetIds: ['asset-6'], tags: ['planta', 'dormitório'] }),
    createMockSource({ id: 'src-cta', type: SourceType.CTA, title: 'Agende Sua Visita', priority: 5, narrativeRole: NarrativeRole.CLOSING, commercialRole: CommercialRole.LEAD_CAPTURE, assetIds: ['asset-7'], tags: ['agende', 'whatsapp'] }),
  ];
}
