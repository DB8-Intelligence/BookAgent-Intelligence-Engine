/**
 * Book DNA Step Handler — quarto step do pipeline editorial
 *
 * Consome:
 *  - intake_brief (obrigatório)
 *  - market_report (obrigatório)
 *  - theme_decision (obrigatório; assumido aprovado na rodada anterior)
 *
 * Produz:
 *  - book_dna (obrigatório) — estrutura criativa base do livro:
 *    gênero, tom, voz narrativa, persona do leitor-alvo, pilares temáticos,
 *    restrições editoriais. Os steps seguintes (outline, chapter_writing)
 *    consomem o book_dna como espinha dorsal.
 *
 * Outcome: `completed`. Não pede gate de aprovação por padrão — o gate já
 * aconteceu em theme_validation e acontecerá novamente em editorial_qa.
 *
 * Integração LLM: este handler é placeholder determinístico. A evolução
 * natural injeta um `IAIAdapter` via construtor e gera os campos via prompt
 * — a forma do artefato não muda.
 */

import type {
  IBookStepHandler,
  BookStepResult,
} from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import type { BookArtifact } from '../../../domain/entities/book-editorial.js';
import { logger } from '../../../utils/logger.js';

/**
 * Forma estruturada do artefato `book_dna`. Usada por outline e
 * chapter_writing para alinhamento de tom/voz.
 */
export interface BookDnaContent {
  sourceBriefArtifactId: string;
  sourceMarketArtifactId: string;
  sourceThemeArtifactId: string;
  genre: string;
  subGenres: string[];
  tone: string;
  narrativeVoice: string;
  readerPersona: {
    description: string;
    painPoints: string[];
    desires: string[];
  };
  thematicPillars: string[];
  editorialConstraints: {
    minWordsPerChapter: number;
    maxWordsPerChapter: number;
    forbiddenTerms: string[];
  };
  placeholder: boolean;
  generatedAt: string;
}

function requireArtifact(
  priors: readonly BookArtifact[],
  kind: BookArtifact['kind'],
): BookArtifact | null {
  return priors.find((a) => a.kind === kind) ?? null;
}

export class BookDnaStepHandler implements IBookStepHandler {
  readonly step = 'book_dna' as const;
  readonly name = 'Book DNA';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    const intake = requireArtifact(ctx.priorArtifacts, 'intake_brief');
    const market = requireArtifact(ctx.priorArtifacts, 'market_report');
    const theme = requireArtifact(ctx.priorArtifacts, 'theme_decision');

    if (!intake) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'BookDna: intake_brief artifact not found',
      };
    }
    if (!market) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'BookDna: market_report artifact not found',
      };
    }
    if (!theme) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'BookDna: theme_decision artifact not found — theme must be approved before DNA',
      };
    }

    logger.info(
      `[BookDnaStepHandler] Building DNA for job ${ctx.job.id} ` +
      `(intake=${intake.id}, market=${market.id}, theme=${theme.id})`,
    );

    const content: BookDnaContent = {
      sourceBriefArtifactId: intake.id,
      sourceMarketArtifactId: market.id,
      sourceThemeArtifactId: theme.id,
      genre: 'unspecified',
      subGenres: [],
      tone: 'neutral',
      narrativeVoice: 'third_person',
      readerPersona: {
        description: 'Placeholder persona — populate via LLM',
        painPoints: [],
        desires: [],
      },
      thematicPillars: [],
      editorialConstraints: {
        minWordsPerChapter: 1200,
        maxWordsPerChapter: 4000,
        forbiddenTerms: [],
      },
      placeholder: true,
      generatedAt: new Date().toISOString(),
    };

    return {
      outcome: 'completed',
      artifacts: [
        {
          kind: 'book_dna',
          title: `Book DNA: ${ctx.job.title}`,
          content: content as unknown as Record<string, unknown>,
        },
      ],
      metrics: {
        priorArtifactsConsidered: ctx.priorArtifacts.length,
        thematicPillars: content.thematicPillars.length,
      },
    };
  }
}
