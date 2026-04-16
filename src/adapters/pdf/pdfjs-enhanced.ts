/**
 * PDF.js Enhanced Geometry Adapter
 *
 * Usa `pdfjs-dist` para extrair GEOMETRIA de imagens embutidas em um
 * PDF, escaneando o operator list de cada página e acumulando o CTM
 * (Current Transformation Matrix) até cada `paintImageXObject`.
 *
 * IMPORTANTE — o que este adapter faz e o que NÃO faz:
 *
 *   ✅ Reporta, para cada página, a lista de operadores de pintura de
 *      imagem encontrados, com seu CTM e z-index.
 *   ✅ Computa x/y/w/h na página a partir do CTM acumulado.
 *   ❌ NÃO extrai pixel data das imagens — isso continua sendo
 *      responsabilidade do `IPDFAdapter` existente (poppler `pdfimages`).
 *      A API para acessar XObject streams em `pdfjs-dist` não é pública
 *      e varia entre versões.
 *   ❌ NÃO detecta clipping paths (stub documentado — fica para uma fase
 *      seguinte com testes contra PDFs reais).
 *
 * Como o consumidor usa isto:
 *   1. Chama `extractPageGeometries(filePath)` → `PageGeometryReport[]`.
 *   2. Chama o adapter poppler existente para obter os bytes das imagens.
 *   3. Pareia as duas listas **por ordem dentro da página** — poppler
 *      extrai imagens respeitando a ordem do stream do PDF, que é a
 *      mesma ordem dos operadores `paintImageXObject` no operator list.
 *   4. Para cada imagem pareada, injeta o `PDFGeometry` no asset.
 *
 * O pareamento por ordem é um heurístico robusto para PDFs bem-formados
 * e é claramente documentado. Se o número de geometrias e de bytes por
 * página divergir, o consumidor deve reportar warning e pular a injeção
 * de geometria para aquela página (graceful degradation).
 */

// @ts-ignore — pdfjs-dist legacy ESM build has no type declarations in some envs
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { CTM, PDFGeometry } from '../../domain/interfaces/geometry.js';
import { logger } from '../../utils/logger.js';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface ImageOpGeometry {
  /** Posição do operador `paintImageXObject` no operator list da página. */
  readonly zIndex: number;
  /** Nome do XObject referenciado (primeiro argumento do operador). */
  readonly xObjectName: string | null;
  readonly ctm: CTM;
  readonly geometry: PDFGeometry;
}

export interface PageGeometryReport {
  readonly pageNumber: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly imageOps: readonly ImageOpGeometry[];
}

// ----------------------------------------------------------------------------
// Operator codes (resolvidos uma vez; `pdfjs-dist` expõe como namespace de
// números em runtime, tipados como `any`. Fazemos um single cast controlado.)
// ----------------------------------------------------------------------------

interface OpsCodes {
  readonly save: number;
  readonly restore: number;
  readonly transform: number;
  readonly paintImageXObject: number;
  readonly paintInlineImageXObject: number;
  readonly paintJpegXObject: number;
}

function resolveOpsCodes(): OpsCodes {
  // `OPS` é um namespace de números no runtime, mas pdfjs tipa como any.
  // Acesso em string-index para evitar que a assinatura do namespace force o cast.
  const rawOps = OPS as unknown as Record<string, number>;
  return {
    save: rawOps['save'] ?? -1,
    restore: rawOps['restore'] ?? -1,
    transform: rawOps['transform'] ?? -1,
    paintImageXObject: rawOps['paintImageXObject'] ?? -1,
    paintInlineImageXObject: rawOps['paintInlineImageXObject'] ?? -1,
    paintJpegXObject: rawOps['paintJpegXObject'] ?? -1,
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export class PDFJSEnhancedAdapter {
  private readonly ops: OpsCodes;

  constructor() {
    this.ops = resolveOpsCodes();
  }

  /**
   * Varre um PDF e retorna um relatório de geometria por página.
   * Não falha se uma página individual der erro — apenas pula.
   */
  async extractPageGeometries(filePath: string): Promise<PageGeometryReport[]> {
    const reports: PageGeometryReport[] = [];

    const doc = await getDocument({ url: filePath }).promise;
    try {
      const total = doc.numPages;
      for (let pageNum = 1; pageNum <= total; pageNum++) {
        try {
          const page = await doc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1 });
          const operatorList = await page.getOperatorList();
          const imageOps = this.scanImageOps(
            operatorList.fnArray,
            operatorList.argsArray as unknown as ReadonlyArray<ReadonlyArray<unknown>>,
            pageNum,
          );
          reports.push({
            pageNumber: pageNum,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
            imageOps,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[PDFJSEnhancedAdapter] Failed page ${pageNum}: ${msg}`);
        }
      }
    } finally {
      await doc.destroy();
    }

    return reports;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /**
   * Varre o operator list de uma página mantendo uma pilha de CTMs
   * (para respeitar operadores `save`/`restore`) e acumulando CTMs
   * `transform` no topo da pilha. Quando encontra um operador de
   * pintura de imagem, emite um `ImageOpGeometry` com o CTM corrente.
   */
  private scanImageOps(
    fnArray: ReadonlyArray<number>,
    argsArray: ReadonlyArray<ReadonlyArray<unknown>>,
    pageNum: number,
  ): ImageOpGeometry[] {
    const out: ImageOpGeometry[] = [];
    const stack: CTM[] = [identityCTM()];

    for (let i = 0; i < fnArray.length; i++) {
      const op = fnArray[i];
      const args = argsArray[i] ?? [];

      if (op === this.ops.save) {
        stack.push(top(stack));
        continue;
      }
      if (op === this.ops.restore) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      if (op === this.ops.transform) {
        const ctm = parseTransformArgs(args);
        if (ctm) {
          stack[stack.length - 1] = multiply(top(stack), ctm);
        }
        continue;
      }

      const isImageOp =
        op === this.ops.paintImageXObject ||
        op === this.ops.paintInlineImageXObject ||
        op === this.ops.paintJpegXObject;

      if (isImageOp) {
        const ctm = top(stack);
        const geometry = ctmToGeometry(ctm, pageNum, i);
        const xObjectName = readXObjectName(args);
        out.push({
          zIndex: i,
          xObjectName,
          ctm,
          geometry,
        });
      }
    }

    return out;
  }
}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

function identityCTM(): CTM {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function top(stack: CTM[]): CTM {
  const t = stack[stack.length - 1];
  if (!t) return identityCTM();
  return t;
}

/**
 * Multiplica duas CTMs no sentido PDF (left-to-right).
 * Resultado representa `apply(b) then apply(a)`.
 */
function multiply(a: CTM, b: CTM): CTM {
  return {
    a: a.a * b.a + a.b * b.c,
    b: a.a * b.b + a.b * b.d,
    c: a.c * b.a + a.d * b.c,
    d: a.c * b.b + a.d * b.d,
    e: a.e * b.a + a.f * b.c + b.e,
    f: a.e * b.b + a.f * b.d + b.f,
  };
}

function parseTransformArgs(args: ReadonlyArray<unknown>): CTM | null {
  if (args.length < 6) return null;
  const a = args[0];
  const b = args[1];
  const c = args[2];
  const d = args[3];
  const e = args[4];
  const f = args[5];
  if (
    typeof a !== 'number' ||
    typeof b !== 'number' ||
    typeof c !== 'number' ||
    typeof d !== 'number' ||
    typeof e !== 'number' ||
    typeof f !== 'number'
  ) {
    return null;
  }
  return { a, b, c, d, e, f };
}

function readXObjectName(args: ReadonlyArray<unknown>): string | null {
  const first = args[0];
  return typeof first === 'string' ? first : null;
}

/**
 * Converte uma CTM em geometria interpretável pelo consumidor.
 *
 * Observação sobre unidades: no espaço de um XObject de imagem antes do
 * CTM ser aplicado, a imagem é um quadrado unitário (0,0)-(1,1). A CTM
 * mapeia essa unidade para a página. Portanto:
 *   width  = |a|
 *   height = |d|
 *   x (canto inferior esquerdo) = e
 *   y (canto inferior esquerdo) = f
 *
 * Isto é uma simplificação válida quando b=c=0 (sem rotação/skew). Para
 * matrizes rotacionadas, o bounding box real requer transformar os 4
 * cantos do quadrado unitário e tirar min/max — reportamos então a
 * área axis-aligned que contém a imagem girada.
 */
function ctmToGeometry(ctm: CTM, pageNum: number, zIndex: number): PDFGeometry {
  const corners: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [u, v] of corners) {
    const x = ctm.a * u + ctm.c * v + ctm.e;
    const y = ctm.b * u + ctm.d * v + ctm.f;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    page: pageNum,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    zIndex,
    ctm,
  };
}
