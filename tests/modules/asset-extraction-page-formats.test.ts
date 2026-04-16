/**
 * Tests: Asset Extraction — Page Formats (PNG + SVG)
 *
 * Valida o novo fluxo do Module 04 que renderiza cada página do PDF
 * como PNG 300dpi e SVG, faz upload ao Supabase Storage e retorna as
 * URLs públicas em result.pageFormats.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetExtractor } from '../../src/modules/asset-extraction/extractor.js';
import type {
  IPDFAdapter,
  PDFTextResult,
  PDFImageResult,
} from '../../src/domain/interfaces/pdf-adapter.js';
import type { IStorageAdapter } from '../../src/domain/interfaces/storage-adapter.js';
import { SupabaseStorageUploader } from '../../src/adapters/storage/supabase.js';
import type { ExtractionOptions } from '../../src/modules/asset-extraction/types.js';

// ---------- Mocks ----------

class MockPDFAdapter implements IPDFAdapter {
  pages = 3;
  renderPage = vi.fn(async (_f: string, n: number, dpi = 300) =>
    Buffer.from(`PNG-page-${n}-dpi-${dpi}`),
  );
  renderPageSvg = vi.fn(async (_f: string, n: number) =>
    Buffer.from(`<svg>page ${n}</svg>`),
  );
  async extractText(): Promise<PDFTextResult> {
    return { fullText: '', pages: [] };
  }
  async extractImages(): Promise<PDFImageResult[]> {
    return [];
  }
  async getPageCount(): Promise<number> {
    return this.pages;
  }
}

class MockStorageAdapter implements IStorageAdapter {
  save = vi.fn(async (jobId: string, fileName: string) => `/tmp/${jobId}/${fileName}`);
  read = vi.fn(async () => Buffer.alloc(0));
  exists = vi.fn(async () => true);
  delete = vi.fn(async () => undefined);
  createJobDir = vi.fn(async (jobId: string) => `/tmp/${jobId}`);
  cleanupTemp = vi.fn(async () => undefined);
}

const BASE_OPTIONS: ExtractionOptions = {
  outputDir: '/tmp/out',
  generateThumbnails: false,
  minWidth: 100,
  minHeight: 100,
  strategy: 'embedded-extraction',
  renderDpi: 200,
};

function makeUploader() {
  const uploader = new SupabaseStorageUploader({
    supabaseUrl: 'https://xhfiyukhjzwhqbacuyxq.supabase.co',
    serviceRoleKey: 'test-service-role-key',
    bucket: 'book-assets',
  });
  // Stub upload/ensureBucket to avoid real HTTP
  vi.spyOn(uploader, 'ensureBucket').mockResolvedValue(undefined);
  vi.spyOn(uploader, 'upload').mockImplementation(async (path) =>
    `https://xhfiyukhjzwhqbacuyxq.supabase.co/storage/v1/object/public/book-assets/${path}`,
  );
  return uploader;
}

// ---------- Tests ----------

describe('AssetExtractor — page formats', () => {
  let pdf: MockPDFAdapter;
  let storage: MockStorageAdapter;

  beforeEach(() => {
    pdf = new MockPDFAdapter();
    storage = new MockStorageAdapter();
  });

  it('returns empty pageFormats when uploader is not provided', async () => {
    const extractor = new AssetExtractor(BASE_OPTIONS, pdf, storage);
    const result = await extractor.extractFromPDF('/tmp/book.pdf', 'job-1');

    expect(result.pageFormats).toEqual({ png_pages: [], svg_pages: [] });
    expect(pdf.renderPage).not.toHaveBeenCalled();
  });

  it('renders PNG 300dpi + SVG for every page and returns public URLs', async () => {
    const uploader = makeUploader();
    const extractor = new AssetExtractor(BASE_OPTIONS, pdf, storage, uploader);

    const result = await extractor.extractFromPDF('/tmp/book.pdf', 'job-42');

    expect(pdf.renderPage).toHaveBeenCalledTimes(3);
    expect(pdf.renderPageSvg).toHaveBeenCalledTimes(3);

    // Render at 300 dpi, not the renderDpi option (which is for asset strategy)
    expect(pdf.renderPage).toHaveBeenCalledWith('/tmp/book.pdf', 1, 300);
    expect(pdf.renderPage).toHaveBeenCalledWith('/tmp/book.pdf', 3, 300);

    expect(result.pageFormats?.png_pages).toHaveLength(3);
    expect(result.pageFormats?.svg_pages).toHaveLength(3);

    expect(result.pageFormats?.png_pages[0]).toBe(
      'https://xhfiyukhjzwhqbacuyxq.supabase.co/storage/v1/object/public/book-assets/job-42/pages/png/page-1.png',
    );
    expect(result.pageFormats?.svg_pages[2]).toBe(
      'https://xhfiyukhjzwhqbacuyxq.supabase.co/storage/v1/object/public/book-assets/job-42/pages/svg/page-3.svg',
    );
  });

  it('runs page-format rendering regardless of extraction strategy', async () => {
    const uploader = makeUploader();
    const extractor = new AssetExtractor(
      { ...BASE_OPTIONS, strategy: 'embedded-extraction' },
      pdf,
      storage,
      uploader,
    );

    const result = await extractor.extractFromPDF('/tmp/book.pdf', 'job-99');

    expect(result.pageFormats?.png_pages.length).toBe(3);
  });

  it('skips SVG gracefully when adapter does not support renderPageSvg', async () => {
    const pdfNoSvg: IPDFAdapter = {
      extractText: pdf.extractText.bind(pdf),
      extractImages: pdf.extractImages.bind(pdf),
      getPageCount: pdf.getPageCount.bind(pdf),
      renderPage: pdf.renderPage,
      // renderPageSvg omitted
    };
    const uploader = makeUploader();
    const extractor = new AssetExtractor(BASE_OPTIONS, pdfNoSvg, storage, uploader);

    const result = await extractor.extractFromPDF('/tmp/book.pdf', 'job-5');

    expect(result.pageFormats?.png_pages).toHaveLength(3);
    expect(result.pageFormats?.svg_pages).toHaveLength(0);
  });

  it('tolerates individual page failures without aborting the batch', async () => {
    pdf.renderPage = vi.fn(async (_f: string, n: number) => {
      if (n === 2) throw new Error('poppler crashed on page 2');
      return Buffer.from(`PNG-${n}`);
    });
    const uploader = makeUploader();
    const extractor = new AssetExtractor(BASE_OPTIONS, pdf, storage, uploader);

    const result = await extractor.extractFromPDF('/tmp/book.pdf', 'job-err');

    expect(result.pageFormats?.png_pages).toHaveLength(2);
    expect(result.pageFormats?.svg_pages).toHaveLength(3);
  });
});

describe('SupabaseStorageUploader', () => {
  it('builds the correct public URL', () => {
    const uploader = new SupabaseStorageUploader({
      supabaseUrl: 'https://xhfiyukhjzwhqbacuyxq.supabase.co',
      serviceRoleKey: 'k',
      bucket: 'book-assets',
    });
    expect(uploader.publicUrl('job-1/pages/png/page-1.png')).toBe(
      'https://xhfiyukhjzwhqbacuyxq.supabase.co/storage/v1/object/public/book-assets/job-1/pages/png/page-1.png',
    );
  });

  it('uploads with auth header and x-upsert', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const uploader = new SupabaseStorageUploader({
      supabaseUrl: 'https://xhfiyukhjzwhqbacuyxq.supabase.co',
      serviceRoleKey: 'test-key',
      bucket: 'book-assets',
    });
    vi.spyOn(uploader, 'ensureBucket').mockResolvedValue(undefined);

    const url = await uploader.upload('job-1/pages/png/page-1.png', Buffer.from('x'), 'image/png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      'https://xhfiyukhjzwhqbacuyxq.supabase.co/storage/v1/object/book-assets/job-1/pages/png/page-1.png',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.headers['x-upsert']).toBe('true');
    expect(init.headers['Content-Type']).toBe('image/png');
    expect(url).toContain('/object/public/book-assets/');

    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });
    vi.stubGlobal('fetch', fetchMock);

    const uploader = new SupabaseStorageUploader({
      supabaseUrl: 'https://xhfiyukhjzwhqbacuyxq.supabase.co',
      serviceRoleKey: 'k',
      bucket: 'book-assets',
    });
    vi.spyOn(uploader, 'ensureBucket').mockResolvedValue(undefined);

    await expect(
      uploader.upload('a/b.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });

  it('ensureBucket treats 409 conflict as success (idempotent)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => 'bucket exists',
    });
    vi.stubGlobal('fetch', fetchMock);

    const uploader = new SupabaseStorageUploader({
      supabaseUrl: 'https://xhfiyukhjzwhqbacuyxq.supabase.co',
      serviceRoleKey: 'k',
      bucket: 'book-assets',
    });

    await expect(uploader.ensureBucket()).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
