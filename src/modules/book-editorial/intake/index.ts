/**
 * Intake Step Handler — primeiro step do pipeline editorial
 *
 * Responsabilidade:
 *  - Validar o briefing inicial do job (title obrigatório, brief não vazio).
 *  - Normalizar metadata do input.
 *  - Produzir um artefato `intake_brief` com o briefing estruturado.
 *
 * Este handler NÃO chama LLM nem serviços externos. É determinístico. Steps
 * posteriores (`market_analysis`, `theme_validation`) é que consumirão o
 * artefato `intake_brief` e aplicarão IA.
 */

import type { IBookStepHandler, BookStepResult } from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import { logger } from '../../../utils/logger.js';

interface IntakeBriefContent {
  title: string;
  brief: string;
  metadata: Record<string, unknown>;
  normalizedAt: string;
}

export class IntakeStepHandler implements IBookStepHandler {
  readonly step = 'intake' as const;
  readonly name = 'Intake';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    const { job } = ctx;

    // Validação mínima
    const titleOk = job.title.trim().length > 0;
    if (!titleOk) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'Intake: job.title is empty',
      };
    }

    const brief = (job.brief ?? '').trim();
    if (brief.length === 0) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'Intake: job.brief is empty — cannot proceed without initial briefing',
      };
    }

    const content: IntakeBriefContent = {
      title: job.title.trim(),
      brief,
      metadata: job.metadata,
      normalizedAt: new Date().toISOString(),
    };

    logger.info(`[IntakeStepHandler] Validated brief for job ${job.id} (title="${content.title}")`);

    return {
      outcome: 'completed',
      artifacts: [
        {
          kind: 'intake_brief',
          title: `Intake brief: ${content.title}`,
          content: content as unknown as Record<string, unknown>,
        },
      ],
      metrics: {
        briefLength: brief.length,
        metadataKeys: Object.keys(job.metadata).length,
      },
    };
  }
}
