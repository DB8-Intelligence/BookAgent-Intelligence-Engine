/**
 * Asset Classifier
 *
 * Infere o SourceType de cada asset e o papel narrativo/comercial
 * de cada CorrelationBlock, usando heurísticas baseadas em:
 *
 * - Dimensões da imagem (aspect ratio, tamanho)
 * - Posição no documento (primeira página = hero, última = CTA)
 * - Palavras-chave do texto correlacionado
 * - Propriedades visuais (quando disponíveis via branding)
 *
 * v1: heurísticas puras
 * v2: classificação via IAIAdapter (Gemini/GPT-4 Vision)
 */

import { SourceType, NarrativeRole, CommercialRole } from '../../domain/value-objects/index.js';
import { TextBlockType } from '../../domain/entities/correlation.js';
import type { Asset } from '../../domain/entities/asset.js';
import type { CorrelationBlock } from '../../domain/entities/correlation.js';

// ---------------------------------------------------------------------------
// Keyword maps para inferência de SourceType
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS: Record<string, SourceType> = {};

// Hero indicators
for (const kw of ['lançamento', 'lancamento', 'apresenta', 'conheça', 'conheca', 'novo', 'nova']) {
  TYPE_KEYWORDS[kw] = SourceType.HERO;
}

// Lifestyle indicators
for (const kw of ['lazer', 'piscina', 'academia', 'salão', 'salao', 'festa', 'gourmet', 'churrasqueira', 'playground', 'quadra', 'spa', 'sauna', 'lounge']) {
  TYPE_KEYWORDS[kw] = SourceType.LIFESTYLE;
}

// Diferencial indicators
for (const kw of ['diferencial', 'diferenciais', 'exclusivo', 'exclusiva', 'premium', 'único', 'unico', 'destaque', 'vantagem', 'vantagens', 'benefício', 'beneficio']) {
  TYPE_KEYWORDS[kw] = SourceType.DIFERENCIAL;
}

// Infraestrutura indicators
for (const kw of ['infraestrutura', 'estrutura', 'acabamento', 'material', 'concreto', 'varanda', 'sacada', 'fachada', 'portaria', 'segurança', 'seguranca']) {
  TYPE_KEYWORDS[kw] = SourceType.INFRAESTRUTURA;
}

// Planta indicators
for (const kw of ['planta', 'plantas', 'metragem', 'dormitório', 'dormitorio', 'suíte', 'suite', 'quarto', 'quartos', 'cozinha', 'living', 'terraço', 'terraco']) {
  TYPE_KEYWORDS[kw] = SourceType.PLANTA;
}

// Investimento indicators
for (const kw of ['investimento', 'valorização', 'valorizacao', 'rentabilidade', 'preço', 'preco', 'parcela', 'entrada', 'financiamento', 'condição', 'condicao', 'tabela']) {
  TYPE_KEYWORDS[kw] = SourceType.INVESTIMENTO;
}

// CTA indicators
for (const kw of ['agende', 'visite', 'ligue', 'whatsapp', 'contato', 'cadastre', 'reserve', 'garanta', 'plantão', 'plantao']) {
  TYPE_KEYWORDS[kw] = SourceType.CTA;
}

// Institucional indicators
for (const kw of ['construtora', 'incorporadora', 'empresa', 'tradição', 'tradicao', 'história', 'historia', 'experiência', 'experiencia', 'anos', 'empreendimentos']) {
  TYPE_KEYWORDS[kw] = SourceType.INSTITUCIONAL;
}

// Comparativo indicators
for (const kw of ['comparativo', 'comparação', 'comparacao', 'versus', 'concorrência', 'concorrencia', 'região', 'regiao', 'bairro', 'localização', 'localizacao', 'mapa']) {
  TYPE_KEYWORDS[kw] = SourceType.COMPARATIVO;
}

// ---------------------------------------------------------------------------
// Narrative role keywords
// ---------------------------------------------------------------------------

const NARRATIVE_KEYWORDS: Record<string, NarrativeRole> = {};

for (const kw of ['lançamento', 'lancamento', 'apresenta', 'conheça', 'conheca', 'imperdível', 'imperdivel', 'incrível', 'incrivel']) {
  NARRATIVE_KEYWORDS[kw] = NarrativeRole.HOOK;
}
for (const kw of ['lazer', 'piscina', 'academia', 'planta', 'dormitório', 'dormitorio', 'varanda', 'living']) {
  NARRATIVE_KEYWORDS[kw] = NarrativeRole.SHOWCASE;
}
for (const kw of ['diferencial', 'exclusivo', 'único', 'unico', 'premium']) {
  NARRATIVE_KEYWORDS[kw] = NarrativeRole.DIFFERENTIATOR;
}
for (const kw of ['construtora', 'incorporadora', 'tradição', 'tradicao', 'experiência', 'experiencia']) {
  NARRATIVE_KEYWORDS[kw] = NarrativeRole.SOCIAL_PROOF;
}
for (const kw of ['agende', 'visite', 'ligue', 'whatsapp', 'contato', 'reserve', 'garanta']) {
  NARRATIVE_KEYWORDS[kw] = NarrativeRole.CLOSING;
}

// ---------------------------------------------------------------------------
// Commercial role keywords
// ---------------------------------------------------------------------------

const COMMERCIAL_KEYWORDS: Record<string, CommercialRole> = {};

for (const kw of ['cadastre', 'inscreva', 'contato', 'whatsapp', 'ligue']) {
  COMMERCIAL_KEYWORDS[kw] = CommercialRole.LEAD_CAPTURE;
}
for (const kw of ['segurança', 'seguranca', 'garantia', 'tradição', 'tradicao', 'qualidade']) {
  COMMERCIAL_KEYWORDS[kw] = CommercialRole.TRUST;
}
for (const kw of ['diferencial', 'exclusivo', 'premium', 'único', 'unico', 'vantagem']) {
  COMMERCIAL_KEYWORDS[kw] = CommercialRole.VALUE_PROPOSITION;
}
for (const kw of ['últimas', 'ultimas', 'poucas', 'oportunidade', 'imperdível', 'imperdivel', 'limitado']) {
  COMMERCIAL_KEYWORDS[kw] = CommercialRole.URGENCY;
}
for (const kw of ['construtora', 'incorporadora', 'prêmio', 'premio', 'certificação', 'certificacao']) {
  COMMERCIAL_KEYWORDS[kw] = CommercialRole.AUTHORITY;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enriquece CorrelationBlocks com inferências de tipo, papel narrativo
 * e papel comercial. Também atribui prioridade estimada.
 */
export function classifyAndEnrichBlocks(
  blocks: CorrelationBlock[],
  assets: Asset[],
  totalPages: number,
): CorrelationBlock[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  return blocks.map((block, index) => {
    const blockAssets = block.assetIds
      .map((id) => assetMap.get(id))
      .filter((a): a is Asset => a !== undefined);

    const inferredType = inferSourceType(block, blockAssets, totalPages);
    const inferredNarrativeRole = inferNarrativeRole(block, totalPages);
    const inferredCommercialRole = inferCommercialRole(block);
    const priority = calculatePriority(inferredType, inferredNarrativeRole, index, blocks.length);

    return {
      ...block,
      inferredType,
      inferredNarrativeRole,
      inferredCommercialRole,
      priority,
    };
  });
}

// ---------------------------------------------------------------------------
// Inference functions
// ---------------------------------------------------------------------------

function inferSourceType(
  block: CorrelationBlock,
  blockAssets: Asset[],
  totalPages: number,
): SourceType {
  // 1. Posição no documento
  if (block.page === 1 || block.page === 0) return SourceType.HERO;
  if (totalPages > 0 && block.page >= totalPages - 1) {
    // Última página geralmente é CTA
    const hasCTA = block.textBlocks.some((t) => t.blockType === TextBlockType.CTA);
    if (hasCTA) return SourceType.CTA;
  }

  // 2. Aspect ratio dos assets (plantas são geralmente landscape ou quadradas com linhas)
  const hasWideAsset = blockAssets.some(
    (a) => a.dimensions.width > a.dimensions.height * 1.3,
  );
  const hasVeryWideAsset = blockAssets.some(
    (a) => a.dimensions.width > a.dimensions.height * 2,
  );
  if (hasVeryWideAsset) {
    // Imagens muito largas: possivelmente comparativo (tabela) ou planta
    const keywords = block.tags;
    if (keywords.some((k) => k === 'planta' || k === 'plantas')) return SourceType.PLANTA;
    if (keywords.some((k) => k === 'comparativo' || k === 'tabela')) return SourceType.COMPARATIVO;
  }

  // 3. Keyword matching (mais forte que posição para páginas do meio)
  const typeVotes = new Map<SourceType, number>();
  for (const tag of block.tags) {
    const type = TYPE_KEYWORDS[tag];
    if (type) {
      typeVotes.set(type, (typeVotes.get(type) ?? 0) + 1);
    }
  }

  if (typeVotes.size > 0) {
    // Retornar o tipo com mais votos
    let bestType = SourceType.EDITORIAL;
    let bestCount = 0;
    for (const [type, count] of typeVotes) {
      if (count > bestCount) {
        bestType = type;
        bestCount = count;
      }
    }
    return bestType;
  }

  // 4. Se tem imagem grande e é das primeiras páginas → lifestyle
  if (blockAssets.length > 0 && block.page <= 3 && hasWideAsset) {
    return SourceType.LIFESTYLE;
  }

  // 5. Fallback: editorial
  return SourceType.EDITORIAL;
}

function inferNarrativeRole(block: CorrelationBlock, totalPages: number): NarrativeRole {
  // Primeira página → hook
  if (block.page <= 1) return NarrativeRole.HOOK;

  // Última página → closing
  if (totalPages > 0 && block.page >= totalPages - 1) return NarrativeRole.CLOSING;

  // Keyword matching
  const roleVotes = new Map<NarrativeRole, number>();
  for (const tag of block.tags) {
    const role = NARRATIVE_KEYWORDS[tag];
    if (role) {
      roleVotes.set(role, (roleVotes.get(role) ?? 0) + 1);
    }
  }

  if (roleVotes.size > 0) {
    let bestRole = NarrativeRole.CONTEXT;
    let bestCount = 0;
    for (const [role, count] of roleVotes) {
      if (count > bestCount) {
        bestRole = role;
        bestCount = count;
      }
    }
    return bestRole;
  }

  // Default: showcase (maioria das páginas de books são showcase)
  return NarrativeRole.SHOWCASE;
}

function inferCommercialRole(block: CorrelationBlock): CommercialRole {
  // CTA text block → lead-capture
  if (block.textBlocks.some((t) => t.blockType === TextBlockType.CTA)) {
    return CommercialRole.LEAD_CAPTURE;
  }

  // Keyword matching
  for (const tag of block.tags) {
    const role = COMMERCIAL_KEYWORDS[tag];
    if (role) return role;
  }

  // Default: value-proposition
  return CommercialRole.VALUE_PROPOSITION;
}

/**
 * Calcula prioridade (1 = mais alta) com base no tipo e papel.
 */
function calculatePriority(
  type: SourceType,
  narrativeRole: NarrativeRole,
  blockIndex: number,
  totalBlocks: number,
): number {
  let priority = 5; // Base

  // Hero e CTA são alta prioridade
  if (type === SourceType.HERO) priority = 1;
  else if (type === SourceType.CTA) priority = 2;
  else if (type === SourceType.LIFESTYLE) priority = 3;
  else if (type === SourceType.DIFERENCIAL) priority = 3;
  else if (type === SourceType.PLANTA) priority = 4;

  // Hooks e closings ganham boost
  if (narrativeRole === NarrativeRole.HOOK) priority = Math.min(priority, 2);
  if (narrativeRole === NarrativeRole.CLOSING) priority = Math.min(priority, 3);

  // Blocos no meio do documento têm prioridade ligeiramente menor
  if (totalBlocks > 5) {
    const relativePosition = blockIndex / totalBlocks;
    if (relativePosition > 0.2 && relativePosition < 0.8) {
      priority = Math.min(10, priority + 1);
    }
  }

  return priority;
}
