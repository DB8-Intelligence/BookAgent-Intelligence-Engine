/**
 * Entity: Source
 *
 * Unidade semântica central do BookAgent.
 * Uma fonte combina texto + imagens + metadados extraídos do material original,
 * classificada por tipo (hero, lifestyle, planta, etc.).
 *
 * Inspirada no NotebookLM, mas com suporte real a imagem + branding + comercial.
 */

import type { SourceType, ColorPalette, NarrativeRole, CommercialRole } from '../value-objects/index.js';

export interface BrandingContext {
  colors: ColorPalette;
  style: string;
}

export interface Source {
  /** Identificador único da fonte */
  id: string;

  /** Classificação semântica */
  type: SourceType;

  /** Título extraído ou gerado */
  title: string;

  /** Texto completo do bloco de conteúdo */
  text: string;

  /** Resumo gerado automaticamente (1-2 frases) */
  summary?: string;

  /** Descrição detalhada (para uso em outputs) */
  description: string;

  /** IDs dos assets visuais associados a esta fonte */
  assetIds: string[];

  /** Tags para busca e filtragem */
  tags: string[];

  /** Confiança na classificação (0.0 a 1.0) */
  confidenceScore: number;

  /** Página de origem no material */
  sourcePage?: number;

  /** Papel desta fonte na narrativa (hook, showcase, closing, etc.) */
  narrativeRole?: NarrativeRole;

  /** Papel desta fonte na estratégia comercial */
  commercialRole?: CommercialRole;

  /** Contexto de branding extraído deste bloco */
  brandingContext?: BrandingContext;

  /** Prioridade de uso (1 = mais alta, 10 = mais baixa) */
  priority: number;

  /** Timestamp de criação */
  createdAt: Date;
}
