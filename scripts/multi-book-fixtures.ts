/**
 * Multi-Book Fixtures
 *
 * 3 books de referência com estilos editoriais diferentes:
 *
 * 1. Book A — "Residencial Vista Verde" (luxury-modern, image-first)
 *    10 páginas, imagens hero, lifestyle pesado, muitas fotos
 *
 * 2. Book B — "Edifício Corporativo Prime" (corporate, text-first)
 *    8 páginas, foco técnico, plantas, investimento, pouca imagem
 *
 * 3. Book C — "Resort Praia Dourada" (resort, balanced)
 *    12 páginas, híbrido, galeria de fotos, mapa, lifestyle + técnico
 *
 * Cada book simula um cenário diferente de extração e composição.
 */

import type { Asset } from '../src/domain/entities/asset.js';
import type { ProcessingContext } from '../src/core/context.js';
import type { BookCompatibilityProfile } from '../src/domain/entities/book-compatibility.js';
import {
  BookStructureType,
  ExtractionStrategy,
  ExtractionConfidence,
} from '../src/domain/entities/book-compatibility.js';
import { InputType, AssetOrigin } from '../src/domain/value-objects/index.js';

// ═══════════════════════════════════════════════════════════════════════
// BOOK A — Residencial Vista Verde (luxury-modern, image-first)
// ═══════════════════════════════════════════════════════════════════════

export const BOOK_A_PAGES: Array<{ pageNumber: number; text: string }> = [
  { pageNumber: 1, text: 'RESIDENCIAL VISTA VERDE\nSeu novo endereço na Zona Sul de São Paulo\nLançamento exclusivo Construtora Horizonte\nApartamentos de 65m² a 110m²' },
  { pageNumber: 2, text: 'CONCEITO DO EMPREENDIMENTO\nO Vista Verde nasce da união entre natureza e sofisticação urbana.\nProjetado pelo escritório Aflalo & Gasperini.' },
  { pageNumber: 3, text: 'LAZER COMPLETO\nPiscina adulto e infantil\nChurrasqueira gourmet\nAcademia completa\nPlayground\nSalão de festas\nEspaço coworking' },
  { pageNumber: 4, text: 'ROOFTOP COM VISTA PANORÂMICA\nLounge bar\nSpa com sauna\nEspaço gourmet com vista\nPiscina aquecida' },
  { pageNumber: 5, text: 'DIFERENCIAIS EXCLUSIVOS\n• Fachada ventilada com ACM\n• Piso aquecido nas suítes\n• Automação residencial\n• Medição individual de gás e água\n• Gerador para áreas comuns' },
  { pageNumber: 6, text: 'ACABAMENTOS PREMIUM\nPorcelanato 90x90 nas áreas sociais\nMármore nos banheiros\nEsquadrias com vidro duplo\nBancadas em quartzo' },
  { pageNumber: 7, text: 'PLANTAS\nApartamento Tipo — 85m²\n3 dormitórios (1 suíte)\n2 vagas de garagem\nVaranda gourmet\nÁrea útil: 85m²\nÁrea privativa: 92m²' },
  { pageNumber: 8, text: 'LOCALIZAÇÃO PRIVILEGIADA\nRua das Acácias, 1200 — Santo Amaro\nPróximo ao Metrô Adolfo Pinheiro\n5 min do Shopping Morumbi\n10 min da Marginal Pinheiros\nHospitais, escolas e parques no entorno' },
  { pageNumber: 9, text: 'INVESTIMENTO\nA partir de R$ 650.000\nEntrada facilitada em 36x\nFinanciamento pela Caixa\nTabela direta com a construtora\nITBI e registro inclusos' },
  { pageNumber: 10, text: 'AGENDE SUA VISITA\nPlantão: Rua das Acácias, 1200\nTelefone: (11) 3456-7890\nWhatsApp: (11) 99887-6655\nwww.vistaverde.com.br\nCRECI: 123456-J' },
];

export const BOOK_A_ASSETS: Asset[] = [
  { id: 'a-001', filePath: 'storage/a/fachada.jpg', dimensions: { width: 2400, height: 1600 }, page: 1, format: 'jpg', sizeBytes: 850_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a001' },
  { id: 'a-002', filePath: 'storage/a/logo.png', dimensions: { width: 400, height: 200 }, page: 1, format: 'png', sizeBytes: 45_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a002' },
  { id: 'a-003', filePath: 'storage/a/conceito.jpg', dimensions: { width: 2000, height: 1333 }, page: 2, format: 'jpg', sizeBytes: 620_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a003' },
  { id: 'a-004', filePath: 'storage/a/piscina.jpg', dimensions: { width: 2200, height: 1467 }, page: 3, format: 'jpg', sizeBytes: 720_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a004' },
  { id: 'a-005', filePath: 'storage/a/rooftop.jpg', dimensions: { width: 2000, height: 1200 }, page: 4, format: 'jpg', sizeBytes: 680_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a005' },
  { id: 'a-006', filePath: 'storage/a/acabamento.jpg', dimensions: { width: 1800, height: 1200 }, page: 6, format: 'jpg', sizeBytes: 550_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a006' },
  { id: 'a-007', filePath: 'storage/a/planta.png', dimensions: { width: 1500, height: 1200 }, page: 7, format: 'png', sizeBytes: 195_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a007' },
  { id: 'a-008', filePath: 'storage/a/mapa.jpg', dimensions: { width: 1600, height: 1200 }, page: 8, format: 'jpg', sizeBytes: 320_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a008' },
  { id: 'a-009', filePath: 'storage/a/living.jpg', dimensions: { width: 2000, height: 1333 }, page: 10, format: 'jpg', sizeBytes: 680_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'a009' },
];

export const BOOK_A_COMPATIBILITY: BookCompatibilityProfile = {
  structureType: BookStructureType.EMBEDDED_ASSETS,
  signals: {
    pageCount: 10, embeddedImageCount: 9, avgEmbeddedImageSize: 520_000,
    pagesWithEmbeddedImages: 0.9, hasVectorText: true, avgTextPerPage: 180,
    hasHighResImages: true, hasRasterizedPages: false, rasterizedPageRatio: 0,
    creatorTool: 'Adobe InDesign', hasLayerIndicators: true,
    fileSizeBytes: 8_500_000, imageToFileSizeRatio: 0.55,
  },
  recommendedStrategy: ExtractionStrategy.EMBEDDED_EXTRACTION,
  confidence: ExtractionConfidence.HIGH,
  strategyScores: [
    { strategy: ExtractionStrategy.EMBEDDED_EXTRACTION, score: 0.92, confidence: ExtractionConfidence.HIGH, rationale: 'PDF com imagens embutidas separáveis de alta resolução' },
    { strategy: ExtractionStrategy.HYBRID, score: 0.65, confidence: ExtractionConfidence.MEDIUM, rationale: 'Hybrid desnecessário — embedded já cobre 90% das páginas' },
  ],
  rationale: 'PDF criado no InDesign com imagens embutidas de alta qualidade. Embedded extraction é a melhor estratégia.',
  warnings: [],
  analysisTimeMs: 45,
};

// ═══════════════════════════════════════════════════════════════════════
// BOOK B — Edifício Corporativo Prime (corporate, text-first)
// ═══════════════════════════════════════════════════════════════════════

export const BOOK_B_PAGES: Array<{ pageNumber: number; text: string }> = [
  { pageNumber: 1, text: 'EDIFÍCIO CORPORATIVO PRIME\nO endereço certo para o seu negócio\nSalas comerciais de 40m² a 200m²\nFaria Lima — São Paulo' },
  { pageNumber: 2, text: 'O PROJETO\nLocalizado no coração financeiro de São Paulo, o Prime oferece infraestrutura completa para empresas modernas.\nCertificação LEED Gold\nEficiência energética classe A\nPiso elevado e forro modular\nAr-condicionado central VRF' },
  { pageNumber: 3, text: 'ESPECIFICAÇÕES TÉCNICAS\nPé-direito livre: 2,80m\nCarga de piso: 500kg/m²\nPiso elevado: 15cm\nVidros com fator solar 0,35\nGerador para 100% das cargas\nElevadores de alta velocidade\nEstacionamento com 4 subsolos\n450 vagas rotativas' },
  { pageNumber: 4, text: 'PLANTAS FLEXÍVEIS\nSala tipo 40m² — ideal para startups\nConjunto 80m² — escritório médio\nAndar corrido 200m² — operação corporativa\nPossibilidade de junção de unidades\nLaje técnica para cabeamento' },
  { pageNumber: 5, text: 'TABELA DE PREÇOS\nSala 40m²: a partir de R$ 520.000\nConjunto 80m²: a partir de R$ 980.000\nAndar corrido 200m²: sob consulta\nCondições: 30% entrada + 70% financiamento\nEntrega: dezembro 2027' },
  { pageNumber: 6, text: 'LOCALIZAÇÃO ESTRATÉGICA\nAv. Brigadeiro Faria Lima, 3500\nPróximo ao Metrô Faria Lima\nConcentração de bancos e fundos\nFácil acesso pela Marginal Pinheiros\nHeliponto no edifício' },
  { pageNumber: 7, text: 'CONSTRUTORA ATLAS\n35 anos de mercado\n120 edifícios entregues\nFoco em empreendimentos corporativos\nPrêmio Master Imobiliário 2023\nCertificação ISO 9001 e 14001' },
  { pageNumber: 8, text: 'ENTRE EM CONTATO\nComercial: (11) 3456-0000\nWhatsApp: (11) 91234-5678\nprime@construtora-atlas.com.br\nwww.edificioprime.com.br' },
];

export const BOOK_B_ASSETS: Asset[] = [
  { id: 'b-001', filePath: 'storage/b/fachada-prime.jpg', dimensions: { width: 1800, height: 2400 }, page: 1, format: 'jpg', sizeBytes: 450_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'b001' },
  { id: 'b-002', filePath: 'storage/b/planta-40m.png', dimensions: { width: 1200, height: 900 }, page: 4, format: 'png', sizeBytes: 180_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'b002' },
  { id: 'b-003', filePath: 'storage/b/planta-80m.png', dimensions: { width: 1200, height: 900 }, page: 4, format: 'png', sizeBytes: 190_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'b003' },
  { id: 'b-004', filePath: 'storage/b/mapa.jpg', dimensions: { width: 1400, height: 1000 }, page: 6, format: 'jpg', sizeBytes: 280_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'b004' },
];

export const BOOK_B_COMPATIBILITY: BookCompatibilityProfile = {
  structureType: BookStructureType.HYBRID,
  signals: {
    pageCount: 8, embeddedImageCount: 4, avgEmbeddedImageSize: 275_000,
    pagesWithEmbeddedImages: 0.5, hasVectorText: true, avgTextPerPage: 320,
    hasHighResImages: false, hasRasterizedPages: false, rasterizedPageRatio: 0,
    creatorTool: 'Microsoft PowerPoint', hasLayerIndicators: false,
    fileSizeBytes: 3_200_000, imageToFileSizeRatio: 0.34,
  },
  recommendedStrategy: ExtractionStrategy.HYBRID,
  confidence: ExtractionConfidence.MEDIUM,
  strategyScores: [
    { strategy: ExtractionStrategy.HYBRID, score: 0.78, confidence: ExtractionConfidence.MEDIUM, rationale: 'Poucas imagens embutidas, muitas páginas sem visual — hybrid para cobrir tudo' },
    { strategy: ExtractionStrategy.PAGE_RENDER, score: 0.65, confidence: ExtractionConfidence.MEDIUM, rationale: 'Page render funcionaria mas perde qualidade das plantas' },
  ],
  rationale: 'PDF híbrido criado no PowerPoint. Poucas imagens embutidas e muitas páginas text-heavy. Hybrid recomendado.',
  warnings: ['Resolução das imagens embutidas é moderada (< 2000px)'],
  analysisTimeMs: 38,
};

// ═══════════════════════════════════════════════════════════════════════
// BOOK C — Resort Praia Dourada (resort, balanced)
// ═══════════════════════════════════════════════════════════════════════

export const BOOK_C_PAGES: Array<{ pageNumber: number; text: string }> = [
  { pageNumber: 1, text: 'RESORT PRAIA DOURADA\nO paraíso é aqui.\nGuarujá — Litoral Paulista' },
  { pageNumber: 2, text: '' },
  { pageNumber: 3, text: 'VIVA O LITORAL DE VERDADE\nAcordar com vista para o mar\nCaminhar na areia ao pôr do sol\nLazer à beira da piscina\nGastronomia de primeira' },
  { pageNumber: 4, text: 'LAZER RESORT\nPiscina infinity com borda infinita\nBar molhado\nSpa & wellness center\nQuadra de tênis\nCampo de golfe 9 buracos\nMarina com 20 vagas para embarcações' },
  { pageNumber: 5, text: '' },
  { pageNumber: 6, text: 'GALERIA DE AMBIENTES\nSala de estar com vista panorâmica\nSuíte master com varanda privativa\nCozinha gourmet integrada\nBanheiro com banheira freestanding' },
  { pageNumber: 7, text: 'MASTERPLAN DO EMPREENDIMENTO\nImplantação geral do resort\n3 torres residenciais\nClube com 5.000m² de lazer\nÁrea verde preservada: 40% do terreno' },
  { pageNumber: 8, text: 'PLANTA DO APARTAMENTO\nApartamento Garden — 120m²\n3 suítes\nVaranda com churrasqueira\n2 vagas\nÁrea privativa com jardim: 45m²' },
  { pageNumber: 9, text: 'LOCALIZAÇÃO\nPraia do Tombo, Guarujá\n1h30 de São Paulo pela Imigrantes\nPróximo ao Aquário de Santos\nHeliponto a 10km\nAeroporto de Guarulhos: 2h' },
  { pageNumber: 10, text: 'INVESTIMENTO E VALORIZAÇÃO\nA partir de R$ 1.200.000\nValoração estimada: 12% ao ano\nRenda com aluguel por temporada\nPool de locação disponível\nFinanciamento direto' },
  { pageNumber: 11, text: 'CONSTRUTORA OCEANO\n25 anos no litoral paulista\n15 resorts entregues\nReferência em empreendimentos de praia\nPrêmio Adit 2024 — Melhor Resort Residencial' },
  { pageNumber: 12, text: 'RESERVE SUA UNIDADE\nVisite nosso decorado na Praia do Tombo\nWhatsApp: (13) 99876-5432\nwww.praiadourada.com.br\nAgende uma experiência exclusiva' },
];

export const BOOK_C_ASSETS: Asset[] = [
  { id: 'c-001', filePath: 'storage/c/aerial-resort.jpg', dimensions: { width: 3000, height: 2000 }, page: 1, format: 'jpg', sizeBytes: 1_200_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c001' },
  { id: 'c-002', filePath: 'storage/c/sunset-beach.jpg', dimensions: { width: 2400, height: 1600 }, page: 2, format: 'jpg', sizeBytes: 900_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c002' },
  { id: 'c-003', filePath: 'storage/c/lifestyle-pool.jpg', dimensions: { width: 2200, height: 1467 }, page: 3, format: 'jpg', sizeBytes: 780_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c003' },
  { id: 'c-004', filePath: 'storage/c/spa.jpg', dimensions: { width: 2000, height: 1333 }, page: 4, format: 'jpg', sizeBytes: 650_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c004' },
  { id: 'c-005', filePath: 'storage/c/galeria-1.jpg', dimensions: { width: 1800, height: 1200 }, page: 5, format: 'jpg', sizeBytes: 520_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c005' },
  { id: 'c-006', filePath: 'storage/c/galeria-2.jpg', dimensions: { width: 1800, height: 1200 }, page: 5, format: 'jpg', sizeBytes: 480_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c006' },
  { id: 'c-007', filePath: 'storage/c/galeria-3.jpg', dimensions: { width: 1800, height: 1200 }, page: 6, format: 'jpg', sizeBytes: 510_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c007' },
  { id: 'c-008', filePath: 'storage/c/galeria-4.jpg', dimensions: { width: 1800, height: 1200 }, page: 6, format: 'jpg', sizeBytes: 490_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c008' },
  { id: 'c-009', filePath: 'storage/c/masterplan.png', dimensions: { width: 2500, height: 1800 }, page: 7, format: 'png', sizeBytes: 350_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c009' },
  { id: 'c-010', filePath: 'storage/c/planta-garden.png', dimensions: { width: 1500, height: 1200 }, page: 8, format: 'png', sizeBytes: 210_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c010' },
  { id: 'c-011', filePath: 'storage/c/mapa-litoral.jpg', dimensions: { width: 1600, height: 1200 }, page: 9, format: 'jpg', sizeBytes: 310_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c011' },
  { id: 'c-012', filePath: 'storage/c/decorado.jpg', dimensions: { width: 2400, height: 1600 }, page: 12, format: 'jpg', sizeBytes: 750_000, origin: AssetOrigin.PDF_EXTRACTED, isOriginal: true as const, hash: 'c012' },
];

export const BOOK_C_COMPATIBILITY: BookCompatibilityProfile = {
  structureType: BookStructureType.EMBEDDED_ASSETS,
  signals: {
    pageCount: 12, embeddedImageCount: 12, avgEmbeddedImageSize: 596_000,
    pagesWithEmbeddedImages: 0.83, hasVectorText: true, avgTextPerPage: 120,
    hasHighResImages: true, hasRasterizedPages: false, rasterizedPageRatio: 0,
    creatorTool: 'Adobe Illustrator', hasLayerIndicators: true,
    fileSizeBytes: 12_000_000, imageToFileSizeRatio: 0.60,
  },
  recommendedStrategy: ExtractionStrategy.EMBEDDED_EXTRACTION,
  confidence: ExtractionConfidence.HIGH,
  strategyScores: [
    { strategy: ExtractionStrategy.EMBEDDED_EXTRACTION, score: 0.95, confidence: ExtractionConfidence.HIGH, rationale: 'PDF com 12 imagens embutidas de alta resolução, 83% das páginas com visuais' },
  ],
  rationale: 'PDF premium criado no Illustrator com assets de altíssima qualidade. Embedded extraction ideal.',
  warnings: [],
  analysisTimeMs: 52,
};

// ═══════════════════════════════════════════════════════════════════════
// Context builders
// ═══════════════════════════════════════════════════════════════════════

export interface BookFixture {
  name: string;
  style: string;
  context: ProcessingContext;
  compatibility: BookCompatibilityProfile;
}

export function createBookFixtures(): BookFixture[] {
  return [
    {
      name: 'Residencial Vista Verde',
      style: 'luxury-modern / image-first',
      context: {
        jobId: 'multi-book-A',
        input: { fileUrl: 'https://example.com/book-a.pdf', type: InputType.PDF, userContext: { name: 'Corretor A', whatsapp: '11999000001' } },
        extractedText: BOOK_A_PAGES.map(p => p.text).join('\n\n'),
        pageTexts: BOOK_A_PAGES,
        localFilePath: 'storage/temp/book-a/input.pdf',
        assets: BOOK_A_ASSETS,
        bookCompatibility: BOOK_A_COMPATIBILITY,
        executionLogs: [],
      },
      compatibility: BOOK_A_COMPATIBILITY,
    },
    {
      name: 'Edifício Corporativo Prime',
      style: 'corporate / text-first',
      context: {
        jobId: 'multi-book-B',
        input: { fileUrl: 'https://example.com/book-b.pdf', type: InputType.PDF, userContext: { name: 'Corretor B', whatsapp: '11999000002' } },
        extractedText: BOOK_B_PAGES.map(p => p.text).join('\n\n'),
        pageTexts: BOOK_B_PAGES,
        localFilePath: 'storage/temp/book-b/input.pdf',
        assets: BOOK_B_ASSETS,
        bookCompatibility: BOOK_B_COMPATIBILITY,
        executionLogs: [],
      },
      compatibility: BOOK_B_COMPATIBILITY,
    },
    {
      name: 'Resort Praia Dourada',
      style: 'resort / balanced',
      context: {
        jobId: 'multi-book-C',
        input: { fileUrl: 'https://example.com/book-c.pdf', type: InputType.PDF, userContext: { name: 'Corretor C', whatsapp: '13999000003' } },
        extractedText: BOOK_C_PAGES.map(p => p.text).join('\n\n'),
        pageTexts: BOOK_C_PAGES,
        localFilePath: 'storage/temp/book-c/input.pdf',
        assets: BOOK_C_ASSETS,
        bookCompatibility: BOOK_C_COMPATIBILITY,
        executionLogs: [],
      },
      compatibility: BOOK_C_COMPATIBILITY,
    },
  ];
}
