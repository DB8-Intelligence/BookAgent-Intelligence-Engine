/**
 * Market Analysis Step Handler — segundo step do pipeline editorial
 *
 * Responsabilidade (v1, placeholder sem LLM):
 *  - Lê o artefato `intake_brief` gerado pelo step anterior.
 *  - Produz um `market_report` estruturado com campos para serem preenchidos
 *    por um adapter de IA em uma evolução futura.
 *  - Não chama provedor externo ainda — a integração com `IAIAdapter` fica
 *    como ponto de extensão documentado.
 *
 * Por que placeholder: a integração LLM é um compromisso em si (custo, erro,
 * latência) e será feita em um step dedicado. Aqui entregamos a *forma*
 * do artefato e a conexão com o pipeline — o runtime já funciona end-to-end.
 */

import type { IBookStepHandler, BookStepResult } from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import { logger } from '../../../utils/logger.js';

interface MarketReportContent {
  sourceBriefArtifactId: string;
  targetAudience: string[];
  competitors: string[];
  positioning: string | null;
  opportunities: string[];
  risks: string[];
  generatedAt: string;
  /** Se true, este artefato ainda precisa ser enriquecido por LLM. */
  placeholder: boolean;
}

export class MarketAnalysisStepHandler implements IBookStepHandler {
  readonly step = 'market_analysis' as const;
  readonly name = 'Market Analysis';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    const intakeArtifact = ctx.priorArtifacts.find((a) => a.kind === 'intake_brief');
    if (!intakeArtifact) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'MarketAnalysis: intake_brief artifact not found — pipeline out of order',
      };
    }

    logger.info(
      `[MarketAnalysisStepHandler] Analyzing brief for job ${ctx.job.id} ` +
      `(source artifact=${intakeArtifact.id})`,
    );

    const content: MarketReportContent = {
      sourceBriefArtifactId: intakeArtifact.id,
      targetAudience: [],
      competitors: [],
      positioning: null,
      opportunities: [],
      risks: [],
      generatedAt: new Date().toISOString(),
      placeholder: true,
    };

    return {
      outcome: 'completed',
      artifacts: [
        {
          kind: 'market_report',
          title: `Market report: ${ctx.job.title}`,
          content: content as unknown as Record<string, unknown>,
        },
      ],
      metrics: {
        priorArtifactsConsidered: ctx.priorArtifacts.length,
      },
    };
  }
}
