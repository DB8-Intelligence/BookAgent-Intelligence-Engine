/**
 * Catalog — Template Marketplace
 *
 * Catálogo estático de templates, styles e collections.
 * Mapeia os recursos visuais já implementados no BookAgent
 * e adiciona novos itens declarativos.
 *
 * Parte 83: Template Marketplace / Configurable Styles
 */

import type {
  TemplateCatalogItem,
  StyleProfile,
  TemplateCollection,
  CatalogEntry,
} from '../../domain/entities/template-marketplace.js';
import {
  VisualLayerType,
  CatalogItemStatus,
  CatalogTier,
  OutputCategory,
} from '../../domain/entities/template-marketplace.js';

// ---------------------------------------------------------------------------
// Templates (structural)
// ---------------------------------------------------------------------------

export const TEMPLATES: TemplateCatalogItem[] = [
  {
    id: 'hero-showcase-cta',
    name: 'Hero → Showcase → CTA',
    description: 'Abertura impactante, demonstração do imóvel e call-to-action final. Ideal para Reels.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_SHORT, OutputCategory.STORY],
    sceneCount: 3,
    sceneRoles: ['hook', 'showcase', 'cta'],
    compatiblePresets: ['luxury', 'corporate', 'fast-sales'],
    recommendedStyles: ['dark-gold', 'clean-white', 'bold-red'],
    tags: ['reel', 'curto', 'impactante', 'imobiliário'],
  },
  {
    id: 'walkthrough-5',
    name: 'Tour Virtual (5 cenas)',
    description: 'Tour completo: fachada, living, suíte, lazer e localização.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_SHORT, OutputCategory.VIDEO_LONG],
    sceneCount: 5,
    sceneRoles: ['hook', 'showcase', 'lifestyle', 'differentiator', 'cta'],
    compatiblePresets: ['luxury', 'corporate'],
    recommendedStyles: ['dark-gold', 'clean-white'],
    tags: ['tour', 'completo', 'imobiliário', 'walkthrough'],
  },
  {
    id: 'story-highlights',
    name: 'Story Highlights',
    description: 'Sequência rápida de destaques para Instagram Stories. 4 cards verticais.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    outputCategories: [OutputCategory.STORY, OutputCategory.CAROUSEL],
    sceneCount: 4,
    sceneRoles: ['hook', 'showcase', 'social_proof', 'cta'],
    compatiblePresets: ['fast-sales', 'corporate'],
    recommendedStyles: ['bold-red', 'ocean-teal'],
    tags: ['story', 'highlights', 'rápido', 'carousel'],
  },
  {
    id: 'investment-pitch',
    name: 'Pitch de Investimento',
    description: 'Apresentação completa: contexto, números, diferenciais, projeção e CTA.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.PRO,
    outputCategories: [OutputCategory.VIDEO_LONG, OutputCategory.CAROUSEL],
    sceneCount: 6,
    sceneRoles: ['hook', 'context', 'investment', 'differentiator', 'social_proof', 'cta'],
    compatiblePresets: ['corporate', 'luxury'],
    recommendedStyles: ['clean-white', 'dark-gold'],
    tags: ['investimento', 'números', 'pitch', 'apresentação'],
  },
  {
    id: 'before-after',
    name: 'Antes & Depois',
    description: 'Comparação visual de evolução do empreendimento. Forte impacto.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.BETA,
    tier: CatalogTier.PRO,
    outputCategories: [OutputCategory.REEL, OutputCategory.POST],
    sceneCount: 3,
    sceneRoles: ['context', 'showcase', 'cta'],
    compatiblePresets: ['fast-sales', 'corporate'],
    recommendedStyles: ['bold-red', 'clean-white'],
    tags: ['comparação', 'evolução', 'obra', 'antes-depois'],
  },
  {
    id: 'minimal-quote',
    name: 'Citação Minimalista',
    description: 'Texto sobre fundo clean com asset sutil. Para posts e stories.',
    layer: VisualLayerType.TEMPLATE,
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    outputCategories: [OutputCategory.POST, OutputCategory.STORY, OutputCategory.THUMBNAIL],
    sceneCount: 1,
    sceneRoles: ['hook'],
    compatiblePresets: ['corporate', 'luxury'],
    recommendedStyles: ['clean-white', 'dark-gold'],
    tags: ['minimal', 'citação', 'texto', 'post'],
  },
];

// ---------------------------------------------------------------------------
// Style Profiles (visual/branding)
// ---------------------------------------------------------------------------

export const STYLES: StyleProfile[] = [
  {
    id: 'dark-gold',
    name: 'Dark Gold',
    description: 'Fundo escuro com acentos dourados. Premium e sofisticado.',
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    colors: { primary: '#1a1a2e', secondary: '#16213e', accent: '#c9a96e', background: '#0f0f1a', text: '#f0e6d3' },
    textStyle: 'elegant',
    overlayStyle: 'gradient',
    overlayOpacity: 0.6,
    mood: 'luxury',
    borderRadius: 0,
    tags: ['luxury', 'premium', 'dark', 'gold', 'sofisticado'],
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_SHORT, OutputCategory.THUMBNAIL],
  },
  {
    id: 'clean-white',
    name: 'Clean White',
    description: 'Fundo claro, tipografia neutra. Profissional e versátil.',
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    colors: { primary: '#ffffff', secondary: '#f8f9fa', accent: '#3498db', background: '#ffffff', text: '#2c3e50' },
    textStyle: 'minimal',
    overlayStyle: 'solid',
    overlayOpacity: 0.85,
    mood: 'corporate',
    borderRadius: 8,
    tags: ['clean', 'white', 'profissional', 'neutro', 'corporativo'],
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_SHORT, OutputCategory.CAROUSEL, OutputCategory.POST, OutputCategory.THUMBNAIL],
  },
  {
    id: 'bold-red',
    name: 'Bold Red',
    description: 'Alto contraste, vermelho vibrante. Para vendas e urgência.',
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.FREE,
    colors: { primary: '#000000', secondary: '#1a1a1a', accent: '#ff4444', background: '#000000', text: '#ffffff' },
    textStyle: 'impact',
    overlayStyle: 'gradient',
    overlayOpacity: 0.7,
    mood: 'energetic',
    borderRadius: 0,
    tags: ['bold', 'red', 'urgente', 'vendas', 'dinâmico'],
    outputCategories: [OutputCategory.REEL, OutputCategory.STORY, OutputCategory.THUMBNAIL],
  },
  {
    id: 'ocean-teal',
    name: 'Ocean Teal',
    description: 'Tons de azul e verde-água. Refrescante, resort e lazer.',
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.PRO,
    colors: { primary: '#0a192f', secondary: '#112240', accent: '#64ffda', background: '#0a192f', text: '#ccd6f6' },
    textStyle: 'elegant',
    overlayStyle: 'gradient',
    overlayOpacity: 0.5,
    mood: 'chill',
    borderRadius: 12,
    tags: ['ocean', 'teal', 'resort', 'lazer', 'praia'],
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_SHORT, OutputCategory.CAROUSEL],
  },
  {
    id: 'warm-earth',
    name: 'Warm Earth',
    description: 'Tons terrosos e quentes. Acolhedor, familiar, residencial.',
    status: CatalogItemStatus.ACTIVE,
    tier: CatalogTier.PRO,
    colors: { primary: '#2d1b0e', secondary: '#3e2723', accent: '#d4a574', background: '#1a0f07', text: '#f5e6d3' },
    textStyle: 'elegant',
    overlayStyle: 'gradient',
    overlayOpacity: 0.55,
    mood: 'emotional',
    borderRadius: 4,
    tags: ['earth', 'warm', 'familiar', 'acolhedor', 'residencial'],
    outputCategories: [OutputCategory.REEL, OutputCategory.VIDEO_LONG, OutputCategory.BLOG],
  },
];

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const COLLECTIONS: TemplateCollection[] = [
  {
    id: 'essentials',
    name: 'Essenciais',
    description: 'Templates e estilos básicos para começar. Inclusos em todos os planos.',
    tier: CatalogTier.FREE,
    itemIds: ['hero-showcase-cta', 'walkthrough-5', 'story-highlights', 'minimal-quote', 'dark-gold', 'clean-white', 'bold-red'],
    tags: ['essencial', 'básico', 'starter'],
    status: CatalogItemStatus.ACTIVE,
    sortOrder: 0,
  },
  {
    id: 'luxury-collection',
    name: 'Coleção Luxury',
    description: 'Estilos premium para alto padrão. Elegância e sofisticação.',
    tier: CatalogTier.PRO,
    itemIds: ['walkthrough-5', 'investment-pitch', 'dark-gold', 'ocean-teal', 'warm-earth'],
    tags: ['luxury', 'premium', 'alto-padrão'],
    status: CatalogItemStatus.ACTIVE,
    sortOrder: 1,
  },
  {
    id: 'fast-sales-collection',
    name: 'Coleção Vendas',
    description: 'Templates dinâmicos e urgentes para conversão rápida.',
    tier: CatalogTier.FREE,
    itemIds: ['hero-showcase-cta', 'story-highlights', 'before-after', 'bold-red'],
    tags: ['vendas', 'rápido', 'conversão', 'urgente'],
    status: CatalogItemStatus.ACTIVE,
    sortOrder: 2,
  },
];

// ---------------------------------------------------------------------------
// Unified Catalog
// ---------------------------------------------------------------------------

/**
 * Retorna todos os itens do catálogo como CatalogEntry[].
 */
export function getAllCatalogEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const t of TEMPLATES) {
    entries.push({
      id: t.id,
      name: t.name,
      description: t.description,
      layer: VisualLayerType.TEMPLATE,
      status: t.status,
      tier: t.tier,
      outputCategories: t.outputCategories,
      tags: t.tags,
      previewUrl: t.previewUrl,
      collectionId: t.collectionId,
      compatibleWith: [...t.compatiblePresets, ...t.recommendedStyles],
    });
  }

  for (const s of STYLES) {
    entries.push({
      id: s.id,
      name: s.name,
      description: s.description,
      layer: VisualLayerType.STYLE,
      status: s.status,
      tier: s.tier,
      outputCategories: s.outputCategories,
      tags: s.tags,
      previewUrl: s.previewUrl,
      collectionId: s.collectionId,
    });
  }

  return entries;
}
