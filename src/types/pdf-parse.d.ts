declare module 'pdf-parse' {
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }

  interface PDFParseOptions {
    pagerender?: (pageData: {
      pageIndex: number;
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
    }) => Promise<string>;
    max?: number;
  }

  function pdfParse(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFParseResult>;

  export = pdfParse;
}
