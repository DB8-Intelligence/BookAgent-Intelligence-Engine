/**
 * Theme Validation Step Handler — terceiro step do pipeline editorial
 *
 * Responsabilidade:
 *  - Lê `intake_brief` + `market_report`.
 *  - Produz um `theme_decision` com a proposta de tema.
 *  - Pede **gate de aprovação intermediária** (outcome=`awaiting_approval`):
 *    o tema precisa ser validado pelo humano antes do book-DNA.
 *
 * Este é o primeiro handler do pipeline que demonstra o padrão de aprovação.
 * O processor vai:
 *  - Marcar este step como completed (o HANDLER terminou com sucesso).
 *  - Criar um row pendente em `book_approval_rounds`.
 *  - Marcar o job como awaiting_approval.
 *  - NÃO enfileirar o próximo step automaticamente.
 *
 * A retomada depois da aprovação é responsabilidade da API/UI (fora deste
 * escopo): ao gravar decision=approved, a API deve chamar
 * `enqueueBookEditorialStep({ bookJobId, stepName: 'book_dna', attempt: 1 })`.
 */

import type { IBookStepHandler, BookStepResult } from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import { logger } from '../../../utils/logger.js';

interface ThemeDecisionContent {
  sourceBriefArtifactId: string;
  sourceMarketArtifactId: string;
  proposedTheme: string;
  rationale: string;
  alternativeThemes: string[];
  placeholder: boolean;
  generatedAt: string;
}

export class ThemeValidationStepHandler implements IBookStepHandler {
  readonly step = 'theme_validation' as const;
  readonly name = 'Theme Validation';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    const intake = ctx.priorArtifacts.find((a) => a.kind === 'intake_brief');
    const market = ctx.priorArtifacts.find((a) => a.kind === 'market_report');

    if (!intake) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'ThemeValidation: intake_brief artifact not found',
      };
    }
    if (!market) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'ThemeValidation: market_report artifact not found',
      };
    }

    const content: ThemeDecisionContent = {
      sourceBriefArtifactId: intake.id,
      sourceMarketArtifactId: market.id,
      proposedTheme: ctx.job.title,
      rationale: 'Placeholder rationale — LLM integration pending.',
      alternativeThemes: [],
      placeholder: true,
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      `[ThemeValidationStepHandler] Proposed theme for job ${ctx.job.id}; ` +
      `awaiting human approval`,
    );

    return {
      outcome: 'awaiting_approval',
      approvalKind: 'intermediate',
      artifacts: [
        {
          kind: 'theme_decision',
          title: `Theme decision: ${ctx.job.title}`,
          content: content as unknown as Record<string, unknown>,
        },
      ],
      metrics: {
        priorArtifactsConsidered: ctx.priorArtifacts.length,
      },
    };
  }
}
