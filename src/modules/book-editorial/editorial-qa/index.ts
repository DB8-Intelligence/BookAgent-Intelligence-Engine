/**
 * Editorial QA Step Handler — sétimo (e último) step do pipeline editorial
 *
 * Consome:
 *  - outline (obrigatório)
 *  - chapter_draft (todos, versão mais alta por capítulo)
 *  - book_dna (opcional — usado para checar `editorialConstraints`)
 *
 * Produz:
 *  - qa_report: estrutura per-capítulo com status individual, permitindo
 *    reprovar capítulos específicos sem invalidar o livro inteiro.
 *
 * Outcome:
 *  - Todos capítulos passam → `awaiting_approval` kind=`final` para revisão
 *    humana final. O aprovador pode concluir o job ou pedir ajustes.
 *  - Algum capítulo falha → `awaiting_approval` kind=`final` com o qa_report
 *    listando os capítulos problemáticos. O reprocessamento parcial é
 *    disparado pela API (book-editorial-approval-service) que cria um novo
 *    step row de `chapter_writing` com `attempt++` e
 *    `inputRef = { onlyChapterNumbers: [...] }`.
 *
 * Decidimos NÃO fazer o handler disparar enqueue automático: isso seria um
 * loop de execução controlado em memória, e a decisão de reprocessar é
 * humana (pode-se aceitar draft imperfeito para ganhar tempo).
 */

import type {
  IBookStepHandler,
  BookStepResult,
} from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import type { BookArtifact } from '../../../domain/entities/book-editorial.js';
import type { OutlineContent } from '../outline/index.js';
import type { ChapterDraftContent } from '../chapter-writing/index.js';
import { logger } from '../../../utils/logger.js';

// ----------------------------------------------------------------------------
// Shape do qa_report
// ----------------------------------------------------------------------------

export type ChapterQaStatus = 'pass' | 'fail';

export interface ChapterQaFinding {
  code: string;
  severity: 'warning' | 'error';
  message: string;
}

export interface ChapterQaResult {
  chapterNumber: number;
  title: string;
  status: ChapterQaStatus;
  wordCount: number;
  findings: ChapterQaFinding[];
  draftArtifactId: string;
  draftVersion: number;
}

export interface QaReportContent {
  sourceOutlineArtifactId: string;
  overallStatus: ChapterQaStatus;
  chapters: ChapterQaResult[];
  failedChapterNumbers: number[];
  summary: {
    totalChapters: number;
    passed: number;
    failed: number;
  };
  generatedAt: string;
}

// ----------------------------------------------------------------------------
// Regras placeholder (LLM substitui sem mudar shape)
// ----------------------------------------------------------------------------

const MIN_WORDS_DEFAULT = 50;

function lintChapterDraft(
  draft: ChapterDraftContent,
  minWords: number,
): ChapterQaFinding[] {
  const findings: ChapterQaFinding[] = [];

  if (draft.wordCount < minWords) {
    findings.push({
      code: 'word_count_below_threshold',
      severity: 'error',
      message: `Chapter ${draft.chapterNumber} has ${draft.wordCount} words, minimum ${minWords}`,
    });
  }

  if (draft.body.trim().length === 0) {
    findings.push({
      code: 'empty_body',
      severity: 'error',
      message: `Chapter ${draft.chapterNumber} body is empty`,
    });
  }

  if (/\bTODO\b/i.test(draft.body)) {
    findings.push({
      code: 'todo_marker_present',
      severity: 'warning',
      message: `Chapter ${draft.chapterNumber} still contains TODO markers`,
    });
  }

  if (!draft.title || draft.title.trim().length === 0) {
    findings.push({
      code: 'missing_title',
      severity: 'error',
      message: `Chapter ${draft.chapterNumber} has no title`,
    });
  }

  return findings;
}

function parseOutlineContent(artifact: BookArtifact): OutlineContent | null {
  const content = artifact.content as unknown as OutlineContent;
  if (!content || !Array.isArray(content.chapters)) return null;
  return content;
}

function parseChapterDraft(artifact: BookArtifact): ChapterDraftContent | null {
  const c = artifact.content as unknown as ChapterDraftContent;
  if (!c || typeof c.chapterNumber !== 'number') return null;
  return c;
}

function indexLatestDrafts(
  priors: readonly BookArtifact[],
): Map<number, BookArtifact> {
  const map = new Map<number, BookArtifact>();
  for (const a of priors) {
    if (a.kind !== 'chapter_draft') continue;
    const parsed = parseChapterDraft(a);
    if (!parsed) continue;
    const existing = map.get(parsed.chapterNumber);
    if (!existing || a.version > existing.version) {
      map.set(parsed.chapterNumber, a);
    }
  }
  return map;
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

export class EditorialQaStepHandler implements IBookStepHandler {
  readonly step = 'editorial_qa' as const;
  readonly name = 'Editorial QA';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    const outlineArtifact = ctx.priorArtifacts.find((a) => a.kind === 'outline');
    if (!outlineArtifact) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'EditorialQa: outline artifact not found',
      };
    }
    const outline = parseOutlineContent(outlineArtifact);
    if (!outline) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'EditorialQa: outline has invalid shape',
      };
    }

    const dnaArtifact = ctx.priorArtifacts.find((a) => a.kind === 'book_dna');
    const minWords = (() => {
      if (!dnaArtifact) return MIN_WORDS_DEFAULT;
      const dnaContent = dnaArtifact.content as unknown as {
        editorialConstraints?: { minWordsPerChapter?: number };
      };
      const configured = dnaContent?.editorialConstraints?.minWordsPerChapter;
      return typeof configured === 'number' && configured > 0
        ? configured
        : MIN_WORDS_DEFAULT;
    })();

    const latestDrafts = indexLatestDrafts(ctx.priorArtifacts);

    // Todos os capítulos do outline devem ter draft
    const results: ChapterQaResult[] = [];
    for (const chapter of outline.chapters) {
      const draftArtifact = latestDrafts.get(chapter.number);
      if (!draftArtifact) {
        results.push({
          chapterNumber: chapter.number,
          title: chapter.title,
          status: 'fail',
          wordCount: 0,
          findings: [
            {
              code: 'missing_draft',
              severity: 'error',
              message: `Chapter ${chapter.number} has no draft`,
            },
          ],
          draftArtifactId: '',
          draftVersion: 0,
        });
        continue;
      }

      const draft = parseChapterDraft(draftArtifact);
      if (!draft) {
        results.push({
          chapterNumber: chapter.number,
          title: chapter.title,
          status: 'fail',
          wordCount: 0,
          findings: [
            {
              code: 'invalid_draft_shape',
              severity: 'error',
              message: `Chapter ${chapter.number} draft has invalid shape`,
            },
          ],
          draftArtifactId: draftArtifact.id,
          draftVersion: draftArtifact.version,
        });
        continue;
      }

      const findings = lintChapterDraft(draft, minWords);
      const hasError = findings.some((f) => f.severity === 'error');
      results.push({
        chapterNumber: chapter.number,
        title: draft.title,
        status: hasError ? 'fail' : 'pass',
        wordCount: draft.wordCount,
        findings,
        draftArtifactId: draftArtifact.id,
        draftVersion: draftArtifact.version,
      });
    }

    const failedChapterNumbers = results
      .filter((r) => r.status === 'fail')
      .map((r) => r.chapterNumber);

    const overallStatus: ChapterQaStatus =
      failedChapterNumbers.length === 0 ? 'pass' : 'fail';

    const report: QaReportContent = {
      sourceOutlineArtifactId: outlineArtifact.id,
      overallStatus,
      chapters: results,
      failedChapterNumbers,
      summary: {
        totalChapters: outline.chapters.length,
        passed: results.filter((r) => r.status === 'pass').length,
        failed: failedChapterNumbers.length,
      },
      generatedAt: new Date().toISOString(),
    };

    logger.info(
      `[EditorialQaStepHandler] QA for job ${ctx.job.id}: ` +
      `${report.summary.passed}/${report.summary.totalChapters} pass, ` +
      `failed=[${failedChapterNumbers.join(',')}]`,
    );

    return {
      outcome: 'awaiting_approval',
      approvalKind: 'final',
      artifacts: [
        {
          kind: 'qa_report',
          title: `Editorial QA report: ${ctx.job.title}`,
          content: report as unknown as Record<string, unknown>,
        },
      ],
      metrics: {
        totalChapters: report.summary.totalChapters,
        passed: report.summary.passed,
        failed: report.summary.failed,
      },
    };
  }
}
