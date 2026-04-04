/**
 * Sample Run — Fixture Data
 *
 * Dados de fixture representando um book imobiliário real de 10 páginas:
 * "Residencial Vista Verde" — um lançamento fictício na zona sul de SP.
 *
 * Simula os outputs dos módulos de Ingestion e Asset Extraction,
 * permitindo testar o pipeline dos módulos 3-10 de ponta a ponta.
 *
 * Páginas:
 *   1. Capa — HERO
 *   2. Conceito — INSTITUCIONAL
 *   3. Lazer — LIFESTYLE
 *   4. Lazer (continuação) — LIFESTYLE
 *   5. Diferenciais — DIFERENCIAL
 *   6. Acabamentos — DIFERENCIAL
 *   7. Plantas — PLANTA
 *   8. Localização — COMPARATIVO
 *   9. Investimento — INVESTIMENTO
 *  10. CTA / Encerramento — CTA
 */

import type { Asset } from '../src/domain/entities/asset.js';
import type { ProcessingContext } from '../src/core/context.js';
import { InputType, AssetOrigin } from '../src/domain/value-objects/index.js';

// ---------------------------------------------------------------------------
// Page Texts — Simula output do Ingestion (pdf-parse)
// ---------------------------------------------------------------------------

export const SAMPLE_PAGE_TEXTS: Array<{ pageNumber: number; text: string }> = [
  {
    pageNumber: 1,
    text: `RESIDENCIAL VISTA VERDE
Seu novo endereço na Zona Sul de São Paulo

Lançamento exclusivo Construtora Horizonte
Apartamentos de 65m² a 110m²
2 e 3 dormitórios com suíte

Rua das Acácias, 1200 — Santo Amaro`,
  },
  {
    pageNumber: 2,
    text: `CONCEITO DO EMPREENDIMENTO

O Vista Verde nasce da união entre natureza e sofisticação urbana.
Projetado pelo escritório Aflalo & Gasperini, o empreendimento traz
linhas contemporâneas que dialogam com o entorno arborizado.

A Construtora Horizonte tem mais de 30 anos de tradição no mercado
imobiliário, com mais de 50 empreendimentos entregues em São Paulo.

Certificação AQUA de sustentabilidade.
Projeto paisagístico por Benedito Abbud.`,
  },
  {
    pageNumber: 3,
    text: `LAZER COMPLETO PARA SUA FAMÍLIA

O Vista Verde oferece mais de 20 itens de lazer em 3.000m² de área comum.

• Piscina adulto com raia de 25m
• Piscina infantil aquecida
• Academia completa Technogym
• Salão de festas gourmet para 80 pessoas
• Churrasqueira com forno de pizza
• Playground temático
• Pet place com agility`,
  },
  {
    pageNumber: 4,
    text: `LAZER E BEM-ESTAR

• Quadra poliesportiva
• Espaço zen com jardim japonês
• Coworking com 12 posições
• Brinquedoteca com monitoria
• Sala de cinema com 20 lugares
• Bike sharing com 30 bicicletas
• Horta comunitária orgânica

Todos os espaços com acabamento premium e paisagismo integrado.`,
  },
  {
    pageNumber: 5,
    text: `DIFERENCIAIS EXCLUSIVOS

O que torna o Vista Verde único:

Acabamento Premium
Porcelanato Portobello 80x80 em todos os ambientes.
Esquadrias de alumínio com ruptura térmica.
Bancadas em quartzo stone.

Tecnologia Residencial
Fechadura digital biométrica.
Tomadas USB em todos os cômodos.
Infraestrutura para automação residencial.
Ponto de carregamento para veículos elétricos na garagem.`,
  },
  {
    pageNumber: 6,
    text: `ACABAMENTOS DE ALTO PADRÃO

Cozinha
Bancada em quartzo stone branco.
Cuba inox dupla embutida.
Ponto para cooktop e forno elétrico.

Banheiros
Louças e metais Deca linha Unic.
Chuveiro de teto com ducha higiênica.
Box com perfil de alumínio e vidro temperado.

Áreas Sociais
Piso em porcelanato 80x80 retificado.
Rodapé embutido. Forro de gesso tabicado.
Pintura acrílica acetinada.`,
  },
  {
    pageNumber: 7,
    text: `PLANTAS E TIPOLOGIAS

Tipo A — 2 Dormitórios (1 suíte) — 65m²
Living amplo integrado à varanda gourmet.
Cozinha americana. 1 vaga de garagem.

Tipo B — 3 Dormitórios (1 suíte) — 85m²
Sala para dois ambientes. Varanda gourmet com churrasqueira.
Cozinha fechada opcional. 2 vagas de garagem.

Tipo C — 3 Dormitórios (2 suítes) — 110m²
Suíte master com closet e banheira.
Lavabo social. Home office.
Varanda gourmet em L com 15m².
2 vagas de garagem cobertas.`,
  },
  {
    pageNumber: 8,
    text: `LOCALIZAÇÃO PRIVILEGIADA

O Vista Verde está no coração de Santo Amaro, a 5 minutos do
Parque Severo Gomes e a 10 minutos do Shopping Morumbi.

Proximidades:
• Metrô Santo Amaro — 800m (5 min a pé)
• Hospital Albert Einstein — 3km
• Colégio Bandeirantes — 2km
• Shopping Morumbi — 4km
• Marginal Pinheiros — acesso direto
• Parque Burle Marx — 6km

Região com alto índice de valorização: +18% nos últimos 3 anos.`,
  },
  {
    pageNumber: 9,
    text: `INVESTIMENTO E CONDIÇÕES

Tabela de preços (lançamento):

Tipo A (65m²) — a partir de R$ 620.000
Tipo B (85m²) — a partir de R$ 810.000
Tipo C (110m²) — a partir de R$ 1.150.000

Condições de pagamento:
• Entrada: 20% em até 36x direto com a construtora
• Financiamento: até 80% pela Caixa Econômica
• Desconto de 5% para pagamento à vista da entrada
• FGTS aceito como entrada

Previsão de entrega: Dezembro/2028
Registro de incorporação: R-12345 / 15° CRI SP`,
  },
  {
    pageNumber: 10,
    text: `AGENDE SUA VISITA AO DECORADO

Venha conhecer o apartamento decorado e sinta a experiência Vista Verde.

Plantão de vendas:
Rua das Acácias, 1200 — Santo Amaro, São Paulo

Horário: Segunda a Sábado, das 9h às 18h
Domingo: das 10h às 16h

Fale com um consultor:
WhatsApp: (11) 99988-7766
Telefone: (11) 3456-7890
E-mail: vendas@vistaverde.com.br

Construtora Horizonte — Construindo sonhos há 30 anos.`,
  },
];

// ---------------------------------------------------------------------------
// Assets — Simula output do Asset Extraction
// ---------------------------------------------------------------------------

export const SAMPLE_ASSETS: Asset[] = [
  // Página 1 — Capa
  {
    id: 'asset-001',
    filePath: 'storage/assets/sample/capa-fachada.jpg',
    thumbnailPath: 'storage/assets/sample/capa-fachada-thumb.jpg',
    dimensions: { width: 2400, height: 1600 },
    page: 1,
    format: 'jpg',
    sizeBytes: 850_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'a1b2c3d4e5f6',
  },
  {
    id: 'asset-002',
    filePath: 'storage/assets/sample/capa-logo-construtora.png',
    thumbnailPath: 'storage/assets/sample/capa-logo-thumb.png',
    dimensions: { width: 400, height: 120 },
    page: 1,
    format: 'png',
    sizeBytes: 45_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'b2c3d4e5f6a1',
  },
  // Página 2 — Conceito
  {
    id: 'asset-003',
    filePath: 'storage/assets/sample/conceito-perspectiva.jpg',
    thumbnailPath: 'storage/assets/sample/conceito-perspectiva-thumb.jpg',
    dimensions: { width: 1800, height: 1200 },
    page: 2,
    format: 'jpg',
    sizeBytes: 620_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'c3d4e5f6a1b2',
  },
  // Página 3 — Lazer
  {
    id: 'asset-004',
    filePath: 'storage/assets/sample/lazer-piscina.jpg',
    thumbnailPath: 'storage/assets/sample/lazer-piscina-thumb.jpg',
    dimensions: { width: 2000, height: 1333 },
    page: 3,
    format: 'jpg',
    sizeBytes: 720_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'd4e5f6a1b2c3',
  },
  {
    id: 'asset-005',
    filePath: 'storage/assets/sample/lazer-academia.jpg',
    thumbnailPath: 'storage/assets/sample/lazer-academia-thumb.jpg',
    dimensions: { width: 1600, height: 1067 },
    page: 3,
    format: 'jpg',
    sizeBytes: 480_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'e5f6a1b2c3d4',
  },
  // Página 4 — Lazer cont.
  {
    id: 'asset-006',
    filePath: 'storage/assets/sample/lazer-playground.jpg',
    thumbnailPath: 'storage/assets/sample/lazer-playground-thumb.jpg',
    dimensions: { width: 1800, height: 1200 },
    page: 4,
    format: 'jpg',
    sizeBytes: 550_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'f6a1b2c3d4e5',
  },
  // Página 5 — Diferenciais
  {
    id: 'asset-007',
    filePath: 'storage/assets/sample/diferencial-acabamento.jpg',
    thumbnailPath: 'storage/assets/sample/diferencial-acabamento-thumb.jpg',
    dimensions: { width: 1600, height: 1200 },
    page: 5,
    format: 'jpg',
    sizeBytes: 390_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'a1f6b2e5c3d4',
  },
  // Página 6 — Acabamentos
  {
    id: 'asset-008',
    filePath: 'storage/assets/sample/acabamento-cozinha.jpg',
    thumbnailPath: 'storage/assets/sample/acabamento-cozinha-thumb.jpg',
    dimensions: { width: 1400, height: 1050 },
    page: 6,
    format: 'jpg',
    sizeBytes: 320_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'b2a1c3f6d4e5',
  },
  {
    id: 'asset-009',
    filePath: 'storage/assets/sample/acabamento-banheiro.jpg',
    thumbnailPath: 'storage/assets/sample/acabamento-banheiro-thumb.jpg',
    dimensions: { width: 1400, height: 1050 },
    page: 6,
    format: 'jpg',
    sizeBytes: 310_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'c3b2d4a1e5f6',
  },
  // Página 7 — Plantas
  {
    id: 'asset-010',
    filePath: 'storage/assets/sample/planta-2d-65m2.png',
    thumbnailPath: 'storage/assets/sample/planta-2d-65m2-thumb.png',
    dimensions: { width: 1200, height: 900 },
    page: 7,
    format: 'png',
    sizeBytes: 180_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'd4c3e5b2f6a1',
  },
  {
    id: 'asset-011',
    filePath: 'storage/assets/sample/planta-2d-110m2.png',
    thumbnailPath: 'storage/assets/sample/planta-2d-110m2-thumb.png',
    dimensions: { width: 1200, height: 900 },
    page: 7,
    format: 'png',
    sizeBytes: 195_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'e5d4f6c3a1b2',
  },
  // Página 8 — Localização
  {
    id: 'asset-012',
    filePath: 'storage/assets/sample/mapa-localizacao.jpg',
    thumbnailPath: 'storage/assets/sample/mapa-localizacao-thumb.jpg',
    dimensions: { width: 1600, height: 1200 },
    page: 8,
    format: 'jpg',
    sizeBytes: 420_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'f6e5a1d4b2c3',
  },
  // Página 10 — CTA
  {
    id: 'asset-013',
    filePath: 'storage/assets/sample/decorado-sala.jpg',
    thumbnailPath: 'storage/assets/sample/decorado-sala-thumb.jpg',
    dimensions: { width: 2000, height: 1333 },
    page: 10,
    format: 'jpg',
    sizeBytes: 680_000,
    origin: AssetOrigin.PDF_EXTRACTED,
    hash: 'a1b2e5f6c3d4',
  },
];

// ---------------------------------------------------------------------------
// Full text — Simula extractedText do Ingestion
// ---------------------------------------------------------------------------

export const SAMPLE_EXTRACTED_TEXT = SAMPLE_PAGE_TEXTS.map((p) => p.text).join('\n\n');

// ---------------------------------------------------------------------------
// User Context
// ---------------------------------------------------------------------------

export const SAMPLE_USER_CONTEXT = {
  name: 'Douglas Silva',
  whatsapp: '11999887766',
  instagram: '@douglas.imoveis',
  site: 'https://douglas.imob.com',
  region: 'São Paulo - Zona Sul',
  logoUrl: 'https://example.com/logo-douglas.png',
};

// ---------------------------------------------------------------------------
// Pre-built ProcessingContext (post-Ingestion + post-Extraction)
// ---------------------------------------------------------------------------

export function createSampleContext(): ProcessingContext {
  return {
    jobId: 'sample-run-001',
    input: {
      fileUrl: 'https://example.com/book-vista-verde.pdf',
      type: InputType.PDF,
      userContext: SAMPLE_USER_CONTEXT,
    },
    extractedText: SAMPLE_EXTRACTED_TEXT,
    pageTexts: SAMPLE_PAGE_TEXTS,
    localFilePath: 'storage/temp/sample-run-001/input.pdf',
    assets: SAMPLE_ASSETS,
    executionLogs: [],
  };
}
