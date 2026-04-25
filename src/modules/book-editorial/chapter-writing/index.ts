/**
 * Chapter Writing Step Handler — sexto step do pipeline editorial
 *
 * Consome:
 *  - outline (obrigatório): fonte da lista de capítulos a escrever
 *  - book_dna (opcional): injeta tom, voz, restrições
 *  - chapter_drafts existentes (para idempotência e versionamento)
 *
 * Produz:
 *  - N artefatos `chapter_draft`, um por capítulo processado nesta execução.
 *
 * Reexecução parcial por capítulo:
 *  - Se `ctx.currentStep.inputRef.onlyChapterNumbers` estiver definido,
 *    apenas esses capítulos são escritos. Se um capítulo já possuir draft,
 *    uma nova versão (`version = latest + 1`) é criada — histórico preservado.
 *  - Se `onlyChapterNumbers` estiver ausente, escreve TODOS os capítulos
 *    do outline que ainda não possuem draft. Idempotente — reexecutar com
 *    todos os drafts presentes é um no-op e marca o step como completed.
 *
 * Este handler NÃO dispara enqueue direto. Reexecução parcial é iniciada
 * pela API (book-editorial-approval-service) criando um novo step row com
 * `attempt++` e `inputRef = { onlyChapterNumbers: [...] }` antes de
 * enfileirar — o processor existente já suporta esse fluxo.
 */

import type {
  IBookStepHandler,
  BookStepResult,
  BookStepArtifactOutput,
} from '../../../domain/interfaces/book-step-handler.js';
import type { BookEditorialContext } from '../../../domain/entities/book-editorial-context.js';
import type { BookArtifact } from '../../../domain/entities/book-editorial.js';
import type { OutlineContent, OutlineChapter } from '../outline/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Payload estruturado de um draft de capítulo. Cada draft é um row em
 * `book_artifacts` — `chapterNumber` vive aqui no content para permitir
 * filtragem client-side sem mudar schema.
 */
export interface ChapterDraftContent {
  chapterNumber: number;
  title: string;
  synopsis: string;
  body: string;
  wordCount: number;
  sourceOutlineArtifactId: string;
  sourceDnaArtifactId: string | null;
  placeholder: boolean;
  generatedAt: string;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function parseOutlineContent(artifact: BookArtifact): OutlineContent | null {
  const content = artifact.content as unknown as OutlineContent;
  if (!content || !Array.isArray(content.chapters)) return null;
  return content;
}

function readChapterNumber(artifact: BookArtifact): number | null {
  const c = artifact.content as unknown as { chapterNumber?: number };
  if (typeof c?.chapterNumber !== 'number') return null;
  return c.chapterNumber;
}

/**
 * Agrupa todos os chapter_drafts existentes por chapterNumber, retornando
 * a VERSÃO mais alta de cada. Usado para:
 *  - decidir o próximo número de versão ao regravar
 *  - descobrir quais capítulos já existem (escrita incremental)
 */
function indexLatestDraftsByChapter(
  priors: readonly BookArtifact[],
): Map<number, BookArtifact> {
  const byNumber = new Map<number, BookArtifact>();
  for (const a of priors) {
    if (a.kind !== 'chapter_draft') continue;
    const n = readChapterNumber(a);
    if (n === null) continue;
    const existing = byNumber.get(n);
    if (!existing || a.version > existing.version) {
      byNumber.set(n, a);
    }
  }
  return byNumber;
}

/** Extrai `onlyChapterNumbers` do inputRef do step corrente, se houver. */
function readOnlyChapterNumbers(ctx: BookEditorialContext): number[] | null {
  const ref = ctx.currentStep.inputRef;
  const raw = (ref as { onlyChapterNumbers?: unknown })?.onlyChapterNumbers;
  if (!Array.isArray(raw)) return null;
  const filtered: number[] = [];
  for (const v of raw) {
    if (typeof v === 'number' && Number.isFinite(v)) filtered.push(v);
  }
  return filtered.length > 0 ? filtered : null;
}

/**
 * Gera o corpo placeholder de um capítulo. A integração com LLM substitui
 * esta função (mesma assinatura: recebe outline + dna → retorna body).
 */
function generatePlaceholderBody(chapter: OutlineChapter): string {
  const lines: string[] = [];
  lines.push(`# ${chapter.title}`);
  lines.push('');
  lines.push(`> ${chapter.synopsis}`);
  lines.push('');
  lines.push('Placeholder content — to be replaced by LLM-generated prose.');
  lines.push('');
  if (chapter.keyPoints.length > 0) {
    lines.push('## Key points');
    for (const kp of chapter.keyPoints) lines.push(`- ${kp}`);
    lines.push('');
  }
  lines.push(`_Target length: ~${chapter.estimatedWords} words._`);
  return lines.join('\n');
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------

export class ChapterWritingStepHandler implements IBookStepHandler {
  readonly step = 'chapter_writing' as const;
  readonly name = 'Chapter Writing';

  async run(ctx: BookEditorialContext): Promise<BookStepResult> {
    // 1. Carrega outline
    const outlineArtifact = ctx.priorArtifacts.find((a) => a.kind === 'outline');
    if (!outlineArtifact) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'ChapterWriting: outline artifact not found',
      };
    }
    const outline = parseOutlineContent(outlineArtifact);
    if (!outline) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'ChapterWriting: outline artifact has invalid shape',
      };
    }
    if (outline.chapters.length === 0) {
      return {
        outcome: 'failed',
        artifacts: [],
        error: 'ChapterWriting: outline has zero chapters',
      };
    }

    // 2. Descobre escopo alvo
    const dnaArtifact = ctx.priorArtifacts.find((a) => a.kind === 'book_dna');
    const latestDrafts = indexLatestDraftsByChapter(ctx.priorArtifacts);
    const onlyNumbers = readOnlyChapterNumbers(ctx);

    const targetChapters: OutlineChapter[] = [];
    if (onlyNumbers) {
      // Partial re-execution — só os explicitamente pedidos.
      for (const n of onlyNumbers) {
        const ch = outline.chapters.find((c) => c.number === n);
        if (!ch) {
          return {
            outcome: 'failed',
            artifacts: [],
            error: `ChapterWriting: requested chapter ${n} not present in outline`,
          };
        }
        targetChapters.push(ch);
      }
    } else {
      // Full run — só os que ainda não têm draft.
      for (const ch of outline.chapters) {
        if (!latestDrafts.has(ch.number)) targetChapters.push(ch);
      }
    }

    if (targetChapters.length === 0) {
      logger.info(
        `[ChapterWritingStepHandler] Nothing to do for job ${ctx.job.id} — ` +
        `all ${outline.chapters.length} chapters already drafted`,
      );
      return {
        outcome: 'completed',
        artifacts: [],
        metrics: {
          outlineChapters: outline.chapters.length,
          existingDrafts: latestDrafts.size,
          writtenThisRun: 0,
        },
      };
    }

    // 3. Escreve (versão = latest + 1 por capítulo)
    const outputs: BookStepArtifactOutput[] = [];
    for (const ch of targetChapters) {
      const prior = latestDrafts.get(ch.number);
      const nextVersion = (prior?.version ?? 0) + 1;
      const body = generatePlaceholderBody(ch);
      const content: ChapterDraftContent = {
        chapterNumber: ch.number,
        title: ch.title,
        synopsis: ch.synopsis,
        body,
        wordCount: body.split(/\s+/).filter((w) => w.length > 0).length,
        sourceOutlineArtifactId: outlineArtifact.id,
        sourceDnaArtifactId: dnaArtifact?.id ?? null,
        placeholder: true,
        generatedAt: new Date().toISOString(),
      };
      outputs.push({
        kind: 'chapter_draft',
        title: `Chapter ${ch.number}: ${ch.title}`,
        content: content as unknown as Record<string, unknown>,
        version: nextVersion,
      });
    }

    logger.info(
      `[ChapterWritingStepHandler] Wrote ${outputs.length} chapter drafts ` +
      `for job ${ctx.job.id} (partial=${onlyNumbers !== null})`,
    );

    return {
      outcome: 'completed',
      artifacts: outputs,
      metrics: {
        outlineChapters: outline.chapters.length,
        existingDrafts: latestDrafts.size,
        writtenThisRun: outputs.length,
        partialMode: onlyNumbers !== null ? 1 : 0,
      },
    };
  }
}
