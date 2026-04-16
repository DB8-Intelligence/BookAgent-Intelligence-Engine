/**
 * PDF Geometry — contratos de geometria extraída do PDF
 *
 * Esses tipos descrevem a geometria de uma imagem dentro do espaço do
 * documento PDF (user space units), como reportada pelo operator list
 * do `pdfjs-dist`. São puramente declarativos — nenhum runtime depende
 * deste arquivo além dos consumidores explicitados.
 *
 * REGRA IMPORTANTE: este tipo NÃO substitui `Position` nem `Dimensions`
 * do value-objects. Ele é um *complemento* opcional para assets que
 * passaram pela extração enhanced (pdfjs-dist). Asssets extraídos via
 * poppler-only continuam válidos sem geometry populado.
 */

/**
 * Current Transformation Matrix. É o vetor de 6 floats que o PDF usa
 * para posicionar e escalar qualquer objeto (imagem, texto, path) na
 * página. `pdfjs-dist` retorna como `Array<number>` de tamanho 6.
 *
 * Semântica padrão do PDF 1.7 (ISO 32000-1):
 *   [a  b  0]    a = escala X,       b = skew Y,
 *   [c  d  0]    c = skew X,         d = escala Y,
 *   [e  f  1]    e = translação X,   f = translação Y.
 */
export interface CTM {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/**
 * Geometria final de uma imagem no espaço da página. x/y são o canto
 * inferior-esquerdo do asset (convenção PDF, origem no canto inferior),
 * width/height são tamanho renderizado (não o da imagem-fonte).
 *
 * Unidades: PDF user space points (1pt = 1/72 inch).
 */
export interface PDFGeometry {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Posição ordinal da imagem no operator list da página. Serve como
   * "z-index" no sentido PDF: operadores posteriores desenham em cima.
   */
  readonly zIndex: number;
  /** Matrix completa, para consumidores que precisam fazer math mais fino. */
  readonly ctm: CTM;
}

/**
 * Metadados de cor e alpha de uma imagem extraída. Não inclui pixel data.
 * Populado em esforço-máximo — quando pdfjs não expõe um campo, fica null.
 */
export interface PDFImageMetadata {
  readonly geometry: PDFGeometry;
  readonly colorSpace:
    | 'DeviceRGB'
    | 'DeviceCMYK'
    | 'DeviceGray'
    | 'CalRGB'
    | 'CalGray'
    | 'ICCBased'
    | 'Indexed'
    | 'Unknown';
  readonly bitsPerComponent: number | null;
  readonly hasAlpha: boolean;
  readonly interpolate: boolean;
}
