/**
 * Entity: OutputDecision
 *
 * Resultado da avaliação de viabilidade de um output.
 *
 * O Output Selection Engine avalia cada NarrativePlan e decide
 * se o output correspondente deve ser gerado, com base em:
 * - Cobertura de assets e sources
 * - Confiança da narrativa
 * - Preenchimento dos beats obrigatórios
 * - Requisitos mínimos do OutputSpec
 *
 * Cada OutputDecision carrega a justificativa da decisão
 * e metadados para os módulos de geração.
 */

import type { OutputFormat } from '../value-objects/index.js';
import type { NarrativeType } from './narrative.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Status de aprovação do output */
export enum ApprovalStatus {
  APPROVED = 'approved',             // Viável e aprovado para geração
  APPROVED_WITH_GAPS = 'approved-with-gaps', // Viável com lacunas aceitáveis
  REJECTED = 'rejected',             // Não viável — requisitos mínimos não atendidos
  DEFERRED = 'deferred',             // Viável mas adiado (redundância ou baixa prioridade)
}

/** Complexidade estimada de geração */
export enum OutputComplexity {
  LOW = 'low',         // Post, story — geração rápida
  MEDIUM = 'medium',   // Reel, carousel — composição moderada
  HIGH = 'high',       // Blog, landing page — geração textual pesada
  VERY_HIGH = 'very-high', // Vídeo longo, podcast — processamento intensivo
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/** Razão de rejeição ou gap identificado */
export interface FeasibilityGap {
  /** Critério avaliado */
  criterion: string;
  /** Valor requerido */
  required: string | number;
  /** Valor disponível */
  actual: string | number;
  /** Se é bloqueante (impede geração) ou apenas um gap aceitável */
  blocking: boolean;
}

export interface OutputDecision {
  /** Identificador único da decisão */
  id: string;

  /** Formato do output avaliado */
  format: OutputFormat;

  /** Tipo de narrativa associada */
  narrativeType: NarrativeType;

  /** ID do NarrativePlan associado */
  narrativePlanId: string;

  /** Status de aprovação */
  status: ApprovalStatus;

  /** Prioridade de geração (1 = mais alta) */
  priority: number;

  /** Confiança na viabilidade (0-1) */
  confidence: number;

  /** Complexidade estimada de geração */
  complexity: OutputComplexity;

  /** Gaps identificados na avaliação */
  gaps: FeasibilityGap[];

  /** Resumo da razão da decisão (legível por humano) */
  reason: string;

  // --- Métricas de cobertura ---

  /** Assets requeridos pelo OutputSpec */
  requiredAssetCount: number;

  /** Assets disponíveis para este output */
  availableAssetCount: number;

  /** Source types requeridos pelo OutputSpec */
  requiredSourceTypes: string[];

  /** Source types presentes nas fontes do plano */
  availableSourceTypes: string[];

  /** Total de beats no template */
  totalBeats: number;

  /** Beats preenchidos no plano */
  filledBeats: number;

  /** Beats obrigatórios preenchidos */
  requiredBeatsFilled: number;

  /** Total de beats obrigatórios */
  requiredBeatsTotal: number;

  /** Se necessita personalização do usuário (logo, contato, etc.) */
  requiresPersonalization: boolean;
}
