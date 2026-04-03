# BookAgent Intelligence Engine — Arquitetura do Sistema v1.0

> Versão: 1.0 | Data: 2026-04-03 | Status: Referência técnica oficial

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Diagrama de Fluxo de Dados (ASCII)](#2-diagrama-de-fluxo-de-dados-ascii)
3. [Grafo de Dependências entre Módulos](#3-grafo-de-dependências-entre-módulos)
4. [Especificação Detalhada dos Módulos](#4-especificação-detalhada-dos-módulos)
5. [Padrões de Comunicação entre Módulos](#5-padrões-de-comunicação-entre-módulos)
6. [Tecnologias por Módulo](#6-tecnologias-por-módulo)
7. [Prioridades de Implementação](#7-prioridades-de-implementação)
8. [Princípios de Design e Decisões de Arquitetura](#8-princípios-de-design-e-decisões-de-arquitetura)
9. [Referências e Documentos Relacionados](#9-referências-e-documentos-relacionados)

---

## 1. Visão Geral da Arquitetura

O BookAgent Intelligence Engine é organizado em 9 módulos principais, cada um responsável por uma etapa distinta do pipeline de transformação de materiais brutos em conteúdo de marketing pronto para uso.

Os módulos formam um pipeline direcional com possibilidade de paralelismo em fases avançadas. O sistema é projetado para execução assíncrona via filas, com cada módulo funcionando como um worker independente e substituível.

---

## 2. Diagrama de Fluxo de Dados (ASCII)

Entradas (materiais brutos)

  PDF          Video        Audio        PPTX/DOCX     Logo/CTA
   |            |            |              |              |
   +------------+------------+--------------+              |
                             |                             |
                             v                             |
+-------------------------------------------------------------------+
|                    [1] INGESTION MODULE                          |
|  Download/leitura de arquivo -> Detecção de tipo de mídia        |
|  Extração de texto bruto -> Transcrição de áudio/vídeo           |
+-------------------------------------------------------------------+
                             |
                    texto bruto + metadata
                             |
                             v
+-------------------------------------------------------------------+
|                 [2] ASSET EXTRACTION MODULE                      |
|  Extração de image streams -> Renderização de páginas            |
|  Geração de thumbnails -> Classificação inicial de assets        |
+-------------------------------------------------------------------+
                             |
               ExtractedAsset[] + texto bruto
                             |
                             v
+-------------------------------------------------------------------+
|               [3] TEXT-IMAGE CORRELATION MODULE                  |
|  Proximidade espacial -> Co-localização de página                |
|  Matching semântico via LLM -> Mapa de correlações              |
+-------------------------------------------------------------------+
                             |
             correlacoes texto<->imagem
                             |
            +----------------+----------------+
            |                                 |
            v                                 v
+------------------------+       +----------------------------+
| [4] BRANDING           |       | [5] SOURCE INTELLIGENCE    |
| PRESERVATION           |       | MODULE                     |
| Extração de paleta     |       | Classificação por tipo     |
| Estilo visual          |       | Scoring de fontes          |
| Tipografia             |       | Estruturação Source[]      |
+------------------------+       +----------------------------+
            |                                 |
     BrandingProfile                       Source[]
            |                                 |
            +----------------+----------------+
                             |
                    Source[] + BrandingProfile
                             |
                             v
+-------------------------------------------------------------------+
|                  [6] NARRATIVE GENERATION MODULE                 |
|  Geração de narrativa comercial -> Editorial -> Social           |
|  Narrativa descritiva -> Geração de captions                     |
+-------------------------------------------------------------------+
                             |
                       narrativas indexadas
                             |
                             v
+-------------------------------------------------------------------+
|                   [7] OUTPUT SELECTION MODULE                    |
|  Verificação de requisitos mínimos por formato                   |
|  Análise de viabilidade -> Lista de formatos a gerar             |
+-------------------------------------------------------------------+
                             |
                      OutputFormat[]
                             |
                             v
+-------------------------------------------------------------------+
|                   [8] MEDIA GENERATION MODULE                    |
|                                                                  |
|   ImageGen     VideoGen    AudioGen    TextGen  WebGen SlideGen  |
|   Carrosseis   Reels       Monólogo    Blog     Landing PPTX     |
|   Posts        Stories     Podcast     Artigos  Pages            |
|                Curtos/Longos                                     |
+-------------------------------------------------------------------+
                             |
                    GeneratedOutput[] (brutos)
                             |
                             v
+-------------------------------------------------------------------+
|                [9] USER PERSONALIZATION MODULE                   |
|  Overlay de logo -> Injeção de CTA -> Dados do corretor          |
|  Posicionamento configurável -> Formatação de links              |
+-------------------------------------------------------------------+
                             |
                    GeneratedOutput[] (finalizados)
                             |
                             v
  Reels | Stories | Carrosseis | Posts | Blog | Landing Pages | Podcasts


---

## 3. Grafo de Dependências entre Módulos

```
[1] ingestion
      |
      +---------> [2] asset-extraction
                        |
                        +---------> [3] text-image-correlation
                                          |
                                          +--------> [4] branding-preservation
                                          |                    |
                                          |                    | BrandingProfile
                                          |                    |
                                          +--------> [5] source-intelligence
                                                           |
                                                    Source[]
                                                           |
                                          +----------------+----------------+
                                          |                                 |
                                          v                                 v
                               [6] narrative-generation        [7] output-selection
                                          |                                 |
                                    narrativas                    OutputFormat[]
                                          |                                 |
                                          +----------------+----------------+
                                                           |
                                                           v
                                              [8] media-generation
                                                           |
                                                  GeneratedOutput[]
                                                           |
                                                           v
                                              [9] user-personalization
                                                           |
                                                  Outputs Finalizados
```

### Legenda de Bloqueios Críticos

| Módulo Bloqueador | Módulos Dependentes |
|---|---|
| `ingestion` | Todos os demais (sem ingestão, nada funciona) |
| `asset-extraction` | `text-image-correlation`, `media-generation` (visual) |
| `text-image-correlation` | `source-intelligence`, `branding-preservation` |
| `source-intelligence` | `narrative-generation`, `output-selection`, `media-generation` |
| `media-generation` | `user-personalization` |

---

## 4. Especificação Detalhada dos Módulos

### 4.1 Módulo: `ingestion`

#### Visão Geral

O módulo de ingestão é o ponto de entrada do sistema. Ele recebe materiais brutos em qualquer formato suportado, faz o download ou leitura local, detecta o tipo de mídia e extrai o conteúdo textual inicial. Para vídeos e áudios, aciona a transcrição. Para documentos, extrai o texto estruturado. A saída é um objeto padronizado que alimenta o módulo seguinte independentemente do formato de entrada.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Receber materiais brutos (PDF, MP4, MP3, PPTX, DOCX), fazer download/leitura, detectar tipo de mídia, extrair texto bruto e metadados do arquivo |
| **Entrada** | URL remota ou caminho local de arquivo; tipo MIME ou extensão; configuração de job (`JobInput`) |
| **Saída** | `IngestionResult` — texto bruto extraído, metadados do arquivo (tipo, tamanho, páginas/duração, idioma detectado), caminho do arquivo baixado/copiado |
| **Dependências** | `storage/` adapter (salvar arquivo original); adapters de extração: `pdf/text-extractor`, `video/transcriber`, `audio/transcriber`, `pptx/extractor` |
| **Risco técnico** | **Médio** — PDFs baseados em imagem (scan) não têm texto extraível diretamente e requerem OCR; vídeos longos aumentam custo e tempo de transcrição; formatos exóticos podem falhar |
| **Prioridade de implementação** | **P0** — Primeiro módulo do pipeline; bloqueia absolutamente todos os demais |

#### Sub-responsabilidades

| Sub-tarefa | Descrição | Tecnologia |
|---|---|---|
| Download remoto | Baixar arquivo de URL com retry e timeout | `axios`, `got` |
| Detecção de tipo | Identificar formato pelo MIME type ou extensão | `file-type`, `mime` |
| Extração de texto (PDF) | Extrair texto estruturado por página com posições | `pdf-parse`, `pdfjs-dist` |
| Extração de texto (PPTX) | Extrair texto slide a slide, preservando ordem | `libreoffice` (CLI), `officegen` |
| Extração de texto (DOCX/TXT/CSV) | Extrair texto corrido ou tabular | `mammoth` (DOCX), `csv-parse` |
| Transcrição de vídeo | Extrair áudio do vídeo e transcrever | `ffmpeg` + Whisper API |
| Transcrição de áudio | Transcrever arquivo de áudio diretamente | Whisper API (OpenAI) |
| Fallback OCR | Para PDFs sem texto, usar OCR na página renderizada | `tesseract.js`, Google Vision |
| Detecção de idioma | Identificar idioma do texto para LLM correto | `franc`, `langdetect` |

#### Contratos de Interface

```typescript
interface JobInput {
  fileUrl?: string;
  filePath?: string;
  fileType: 'pdf' | 'video' | 'audio' | 'pptx' | 'docx' | 'txt' | 'csv';
  options?: {
    ocrFallback?: boolean;
    transcriptionLanguage?: string;
    maxPages?: number;
  };
}

interface IngestionResult {
  rawText: string;
  textByPage?: Record<number, string>;
  language: string;
  metadata: {
    fileType: string;
    fileSizeBytes: number;
    pageCount?: number;
    durationSeconds?: number;
    originalPath: string;
  };
}
```

#### Fluxo de Decisão Interno

```
Arquivo recebido
  |
  +-- PDF?   -> Extrair texto por página (pdf-parse)
  |             -> Se sem texto -> OCR via página renderizada
  |
  +-- Video? -> ffmpeg extrai áudio -> Whisper transcreve
  |
  +-- Audio? -> Whisper transcreve diretamente
  |
  +-- PPTX?  -> libreoffice converte -> extrair texto
  |
  +-- DOCX?  -> mammoth extrai HTML -> strip tags -> texto
  |
  +-- TXT/CSV? -> leitura direta
  |
  -> IngestionResult { rawText, textByPage, metadata }
```

---

### 4.2 Módulo: `asset-extraction`

#### Visão Geral

Responsável por extrair todos os assets visuais dos materiais processados. No caso de PDFs, tenta primeiro extrair as imagens embutidas como streams (melhor qualidade); se isso falhar, renderiza cada página como imagem PNG de alta resolução (fallback garantido). Gera thumbnails para preview rápido e registra metadados de cada asset extraído. Para vídeos, extrai frames-chave. Para PPTX, extrai imagens de cada slide.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Extrair todos os assets visuais (imagens embutidas, renders de página, frames de vídeo), gerar thumbnails e registrar metadados completos de cada asset |
| **Entrada** | Caminho do arquivo original + `IngestionResult` (metadados e tipo) |
| **Saída** | `ExtractionResult` — array de `ExtractedAsset[]` com path, dimensões, página de origem, tipo de extração, e `metadata.json` persistido em storage |
| **Dependências** | `ingestion` (arquivo original e metadados); `storage/` adapter (salvar assets, thumbnails); biblioteca de renderização PDF |
| **Risco técnico** | **Alto** — PDFs imobiliários são heterogêneos; imagens podem estar em formatos exóticos (JBIG2, CCITT F4, JPEG2000); imagens "achatadas" no layout não têm streams separados; qualidade pode ser insuficiente para geração de vídeo |
| **Prioridade de implementação** | **P0** — Sem assets visuais não há outputs visuais; bloqueia ImageGen, VideoGen e toda a cadeia de correlação |

#### Sub-responsabilidades

| Sub-tarefa | Descrição | Tecnologia |
|---|---|---|
| Extração de image streams (PDF) | Extrair objetos de imagem embutidos no PDF | `pdfjs-dist`, `pdf-lib` |
| Renderização de página (PDF) | Renderizar cada página como PNG a 300 DPI | `pdf2pic`, `pdfjs-dist` + canvas |
| Extração de imagens (PPTX) | Extrair imagens de cada slide | `pptx-extractor`, `libreoffice` |
| Extração de frames (vídeo) | Capturar frames-chave em intervalos regulares | `ffmpeg` |
| Geração de thumbnails | Redimensionar para 300x300 px | `sharp` |
| Conversão de formato | Converter JPEG2000, JBIG2, CCITT para PNG | `sharp`, ImageMagick |
| Filtro de artefatos | Descartar imagens com largura ou altura < 200px | lógica interna |
| Geração de metadata.json | Registrar índice completo de todos os assets | lógica interna |
| Detecção de ícones | Identificar assets pequenos (ícones, selos, logos) | heurística de tamanho/aspect ratio |

#### Contratos de Interface

```typescript
interface ExtractedAsset {
  id: string;                       // UUID
  type: 'image' | 'page_render' | 'thumbnail' | 'icon' | 'frame' | 'block';
  filePath: string;                 // caminho em storage
  thumbnailPath?: string;
  page: number;                     // página de origem (0 para vídeo = timestamp)
  width: number;
  height: number;
  sizeBytes: number;
  format: 'png' | 'jpg' | 'webp';
  extractionMethod: 'stream' | 'render' | 'crop' | 'frame';
  position?: { x: number; y: number; width: number; height: number };
  metadata?: Record<string, unknown>;
}

interface ExtractionResult {
  jobId: string;
  totalAssets: number;
  assets: ExtractedAsset[];
  storagePath: string;              // pasta raiz: storage/assets/{jobId}/
}
```

#### Estratégia Multi-Camada de Extração (PDF)

```
PDF recebido
  |
  [Camada 1] Tentar extrair image streams do PDF
      -> Sucesso: imagens em JPEG/PNG com qualidade original
      -> Falha (sem streams):
  |
  [Camada 2] Renderizar cada página como PNG a 300 DPI
      -> Gera page renders garantidos para todas as páginas
      -> Aplicar heurística de regiões para recortar áreas visuais
  |
  [Camada 3] Para páginas mistas (texto + imagem), recorte inteligente
      -> Detectar bounding boxes de regiões visuais
      -> Recortar sub-imagens (layout blocks)
  |
  [Camada 4] Fallback LLM Vision (apenas casos problemáticos)
      -> Enviar page render ao LLM para identificar regiões de interesse
```

#### Estrutura de Storage

```
storage/assets/{job_id}/
├── raw/              # Imagens extraídas — qualidade original
│   ├── page01_img01.png
│   └── page03_img01.png
├── pages/            # Página inteira renderizada (300 DPI)
│   ├── page01.png
│   └── page02.png
├── thumbnails/       # Previews 300x300 px
│   ├── page01_img01_thumb.png
│   └── page01_thumb.png
├── blocks/           # Regiões recortadas de páginas mistas
│   └── page03_block01.png
├── frames/           # Frames extraídos de vídeo (se aplicável)
│   └── frame_00m30s.png
└── metadata.json     # Índice completo de todos os assets
```

---

### 4.3 Módulo: `text-image-correlation`

#### Visão Geral

Este módulo resolve um dos problemas mais difíceis do pipeline: associar cada imagem extraída ao texto que a descreve ou a ela se refere no material original. A abordagem é híbrida e progressiva — começa pela análise mais barata (posição espacial) e escala para análise semântica via LLM apenas quando necessário. O resultado é o mapa de correlações que forma a base de cada `Source` estruturada.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Associar cada asset visual extraído ao bloco de texto semanticamente relacionado, gerando o mapa de correlações texto↔imagem que fundamenta todas as fontes |
| **Entrada** | `IngestionResult` (texto por página com posições) + `ExtractionResult` (assets com posições e página de origem) |
| **Saída** | `CorrelationMap` — mapeamento `assetId → CorrelatedTextBlock` com score de confiança por método utilizado |
| **Dependências** | `ingestion` (texto estruturado), `asset-extraction` (assets com metadados), adapters LLM (para matching semântico) |
| **Risco técnico** | **Alto** — Posições de texto em PDFs podem ser inconsistentes ou ausentes; matching semântico via LLM tem custo e latência; PDFs multi-coluna confundem correlação por proximidade |
| **Prioridade de implementação** | **P0** — Correlação incorreta compromete a qualidade de todas as fontes e outputs; é o núcleo semântico do pipeline |

#### Sub-responsabilidades

| Sub-tarefa | Descrição | Confiança | Custo |
|---|---|---|---|
| Correlação por proximidade espacial | Imagem e bloco de texto mais próximo na mesma página (coordenadas x,y) | Alta | Zero |
| Correlação por co-localização de página | Todo texto da página é associado à imagem dominante daquela página | Média | Zero |
| Correlação por matching semântico (LLM) | Enviar thumbnail + blocos de texto candidatos ao LLM para decisão | Alta | Alto |
| Correlação por posição ordinal | Para PDFs sem coordenadas: usar ordem de aparição no texto vs. imagens | Baixa | Zero |

#### Algoritmo de Decisão

```
Para cada ExtractedAsset:

  SE posições disponíveis no PDF:
    -> Calcular distância euclidiana para todos os blocos de texto da mesma página
    -> Selecionar bloco de texto com menor distância (proximidade espacial)
    -> Score de confiança: alto (>= 0.8)

  SE múltiplas imagens na mesma página (layout complexo):
    -> Aplicar co-localização de página como base
    -> Enviar ao LLM: thumbnail da imagem + 3 blocos de texto candidatos
    -> Score de confiança: alto (0.75–0.95) dependendo da resposta LLM

  SE página com imagem dominante (>60% da área visual):
    -> Associar todo o texto da página à imagem
    -> Score de confiança: médio (0.6–0.75)

  FALLBACK:
    -> Usar posição ordinal (imagem na posição N corresponde ao N-ésimo bloco temático)
    -> Marcar para revisão se confidence < 0.5
```

#### Contratos de Interface

```typescript
interface CorrelatedTextBlock {
  rawText: string;
  page: number;
  confidence: number;               // 0.0 a 1.0
  method: 'spatial' | 'colocation' | 'semantic' | 'ordinal';
  boundingBox?: { x: number; y: number; width: number; height: number };
}

interface CorrelationMap {
  jobId: string;
  correlations: Record<string, CorrelatedTextBlock>; // assetId -> texto
  uncorrelatedAssets: string[];     // assets sem correlação encontrada
  uncorrelatedTextBlocks: string[]; // blocos de texto sem imagem associada
  stats: {
    totalAssets: number;
    correlated: number;
    byMethod: Record<string, number>;
    averageConfidence: number;
  };
}
```

---

### 4.4 Módulo: `branding-preservation`

#### Visão Geral

O módulo de preservação de branding é um diferencial central do BookAgent em relação a concorrentes. Em vez de gerar conteúdo genérico, o sistema extrai a identidade visual do material original — paleta de cores, estilo visual, padrão de composição e classificação tipográfica — e aplica essa identidade em todos os outputs gerados. Isso garante que o carrossel, o reel ou a landing page gerados "pareçam" com o empreendimento, não com um template genérico.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Extrair e estruturar a identidade visual do material de origem — paleta de cores dominante, estilo visual, padrão de composição e classificação tipográfica — para uso pelos geradores de mídia |
| **Entrada** | `ExtractionResult` (assets extraídos, especialmente imagens hero e page renders) |
| **Saída** | `BrandingProfile` — paleta de 5 cores (primary, secondary, accent, background, text), estilo visual classificado, padrão de composição, categoria tipográfica e sugestões de fontes Google Fonts |
| **Dependências** | `asset-extraction` (assets visuais de alta qualidade); adapters LLM Vision (para classificação de estilo e tipografia) |
| **Risco técnico** | **Médio** — Extração de cores via k-means é confiável, mas pode ser dominada por cores de fundo; tipografia original não é extraível de imagens, apenas aproximada; PDFs com branding fraco podem gerar perfis pobres |
| **Prioridade de implementação** | **P1** — Importante para qualidade dos outputs mas não bloqueia geração básica com cores padrão |

#### Sub-responsabilidades

| Sub-tarefa | Descrição | Tecnologia |
|---|---|---|
| Extração de paleta de cores | Quantização k-means nas imagens hero e page renders | `sharp`, `color-thief-node`, `get-pixels` |
| Filtro de cores de fundo | Excluir brancos/pretos/cinzas de fundo da paleta principal | lógica interna (threshold HSL) |
| Classificação de estilo visual | Enviar imagens hero ao LLM para classificar estilo | LLM Vision (Gemini, GPT-4V) |
| Classificação tipográfica | Categorizar tipo de fonte usado nas páginas | LLM Vision (análise visual) |
| Mapeamento para Google Fonts | Sugerir fontes web equivalentes às encontradas | mapa curado interno |
| Classificação de composição | Identificar padrão de layout (full-bleed, grid, etc.) | LLM Vision + heurísticas |
| Detecção de logo do empreendimento | Identificar e recortar logo da incorporadora se presente | LLM Vision |

#### Contratos de Interface

```typescript
interface BrandingProfile {
  jobId: string;
  colors: ColorPalette;
  visualStyle: VisualStyle;
  composition: CompositionPattern;
  typography: TypographyProfile;
  extractedFrom: string[];          // IDs dos assets usados para extração
}

interface ColorPalette {
  primary: string;                  // hex, ex: "#1A3A5C"
  secondary: string;
  accent: string;
  background: string;
  text: string;
  raw: string[];                    // top-8 cores brutas extraídas
}

type VisualStyle =
  | 'luxury-modern'
  | 'luxury-classic'
  | 'urban-modern'
  | 'resort'
  | 'popular'
  | 'corporate';

type CompositionPattern =
  | 'full-bleed'
  | 'grid'
  | 'asymmetric'
  | 'centered'
  | 'minimal';

interface TypographyProfile {
  category: 'serif' | 'sans-serif' | 'display' | 'script' | 'monospace';
  googleFontsSuggestion: {
    heading: string;                // ex: "Playfair Display"
    body: string;                   // ex: "Open Sans"
  };
}
```

#### Algoritmo de Extração de Cores

```
1. Selecionar as 3 imagens hero com maior resolução
2. Para cada imagem:
   a. Redimensionar para 200x200px (performance)
   b. Aplicar k-means com k=8 para encontrar 8 cores dominantes
   c. Filtrar cores próximas de branco puro (#FFFFFF ±10%) e preto puro (#000000 ±10%)
3. Agregar as cores de todas as imagens
4. Ordenar por frequência de aparição
5. Mapear para slots: primary (mais dominante não-neutro), secondary, accent,
   background (mais claro), text (mais escuro com contraste adequado)
```

---

### 4.5 Módulo: `source-intelligence`

#### Visão Geral

O módulo de inteligência de fontes é o núcleo semântico do sistema. Ele transforma o mapa de correlações texto↔imagem em `Source[]` — as unidades semânticas estruturadas que alimentam toda a camada de geração. Cada fonte é classificada em um dos 10 tipos definidos (hero, lifestyle, diferencial, etc.), recebe um score de qualidade e é enriquecida com tags e metadados específicos do tipo. A abordagem é híbrida: heurísticas baratas primeiro, LLM para refinamento e ambiguidades.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Classificar cada par correlacionado (imagem + texto) em um tipo de fonte imobiliária, calcular score de qualidade, estruturar em `Source[]` com todos os metadados necessários para geração de conteúdo |
| **Entrada** | `CorrelationMap` + `BrandingProfile` + `IngestionResult` (texto completo para contexto) |
| **Saída** | `Source[]` — fontes estruturadas e pontuadas, prontas para consumo pelos módulos de geração; `SourcesByType` — fontes indexadas por tipo para acesso rápido |
| **Dependências** | `text-image-correlation` (mapa de correlações), `branding-preservation` (BrandingProfile), adapters LLM |
| **Risco técnico** | **Médio** — Classificação automática pode errar em materiais ambíguos; scoring pode não refletir qualidade real; PDFs com pouco texto dificultam a classificação |
| **Prioridade de implementação** | **P0** — As fontes são o modelo de dados central; sem elas, nenhum módulo de geração funciona |

#### Tipos de Fontes Suportados

| Tipo | Características de Identificação | Uso Principal |
|---|---|---|
| `hero` | Primeiras páginas, imagem dominante, nome do empreendimento, fachada/render | Capa de todos os outputs, hero de landing page |
| `lifestyle` | Pessoas em cena, ambientes decorados, apelo emocional | Reels, stories, posts de engajamento |
| `diferencial` | Lista de itens, ícones, textos curtos, palavras-chave de benefícios | Slides de diferenciais, seções de landing page |
| `infraestrutura` | Nomes de amenidades (piscina, academia, etc.), áreas comuns | Galeria, carrossel de amenidades |
| `planta` | Imagem técnica humanizada, "m²", "quartos", "suítes", "varanda" | Slides de planta, seção plantas em landing page |
| `comparativo` | Tabelas, colunas com dados, benchmarks, gráficos | Artigos de blog, slides de investimento |
| `investimento` | "R$", "parcela", "entrada", "financiamento", previsão de entrega | CTA final, slides de fechamento |
| `cta` | "Fale com", "Agende", "Saiba mais", dados de contato | Tela final de reels, último slide/card |
| `institucional` | Logo da incorporadora, histórico, portfólio, certificações | Seção "quem somos", selos de confiança |
| `editorial` | Texto sobre bairro/cidade, infraestrutura urbana, mobilidade | Artigos de blog, seção localização |

#### Sub-responsabilidades

| Sub-tarefa | Descrição |
|---|---|
| Classificação por heurísticas | Regras baseadas em palavras-chave, posição no documento e tamanho da imagem |
| Classificação por LLM | Envio de texto + thumbnail ao LLM para classificação com confidence score |
| Validação cruzada | Comparar resultado de heurísticas vs LLM; reduzir score quando divergem |
| Extração de campos específicos | Para `planta`: extrair m², quartos; para `investimento`: extrair preço, data |
| Cálculo de score composto | Combinar 5 fatores ponderados em score 1–10 |
| Geração de tags | Extrair palavras-chave relevantes para busca e filtragem |
| Deduplicação | Identificar e mesclar fontes duplicadas ou muito similares |

#### Contratos de Interface

```typescript
interface Source {
  id: string;
  type: SourceType;
  title: string;
  description: string;
  images: ExtractedAsset[];
  tags: string[];
  confidenceScore: number;          // 0.0 a 1.0
  sourcePage?: number;
  rawText?: string;
  brandingContext?: BrandingProfile;
  metadata?: SourceMetadata;
  priority: number;                 // 1 a 10
  createdAt: Date;
}

type SourceType =
  | 'hero' | 'lifestyle' | 'diferencial' | 'infraestrutura'
  | 'planta' | 'comparativo' | 'investimento' | 'cta'
  | 'institucional' | 'editorial';
```

#### Algoritmo de Scoring

| Fator | Peso | Cálculo |
|---|---|---|
| Confiança da classificação | 30% | Score retornado pelo LLM (0–1) |
| Qualidade visual | 25% | `(largura_imagem / 1920)` capped em 1.0 |
| Relevância textual | 20% | Comprimento do texto normalizado (min 50, max 500 chars) |
| Posição no material | 15% | Primeiras páginas recebem score maior (hero bias) |
| Unicidade | 10% | Primeiro do tipo recebe 1.0; repetições decrementam |

**Score final** = soma ponderada, normalizada para escala 1–10.

---

### 4.6 Módulo: `narrative-generation`

#### Visão Geral

O módulo de geração de narrativas transforma fontes estruturadas em texto pronto para uso em cada tipo de output. Não é apenas um "resumo" — o módulo gera versões distintas do texto para propósitos diferentes: narrativa comercial (para vendas), editorial (para blog e autoridade), social (para captions curtos de redes sociais) e descritiva (para narração em vídeos e podcasts). Cada narrativa é gerada com o tom, tamanho e vocabulário adequados ao formato de destino.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Gerar narrativas textuais especializadas a partir das fontes estruturadas, parametrizadas por tipo de narrativa (comercial, editorial, social, descritiva), tom, tamanho e público-alvo |
| **Entrada** | `Source[]` + `BrandingProfile` (para tom e estilo) + configuração de narrativa (tipos desejados, idioma, tom) |
| **Saída** | `NarrativeSet` — conjunto de narrativas indexadas por `sourceId + narrativeType`, prontas para injeção nos templates de output |
| **Dependências** | `source-intelligence` (Source[]), `branding-preservation` (BrandingProfile para tom), adapters LLM (`openai/`, `gemini/`) |
| **Risco técnico** | **Baixo-Médio** — Geração de texto via LLM é madura; riscos são tom inadequado ao setor, repetição entre fontes similares e alucinações sobre dados numéricos (preços, metragens) |
| **Prioridade de implementação** | **P1** — Necessário para todos os outputs textuais (blog, landing page, captions); outputs puramente visuais podem funcionar sem narrativa completa |

#### Tipos de Narrativa

| Tipo | Tamanho | Tom | Uso |
|---|---|---|---|
| `comercial` | 100–300 palavras | Persuasivo, orientado a benefícios | Landing page, slides de apresentação, posts |
| `editorial` | 400–800 palavras | Informativo, consultivo, autoridade | Blog posts, artigos de autoridade |
| `social` | 20–80 palavras | Casual, engajante, com emoji opcional | Captions de Instagram/LinkedIn, stories |
| `descritiva` | 150–400 palavras | Narrativo, fluido, para fala | Narração de vídeos, roteiro de podcast |
| `headline` | 5–15 palavras | Impactante, direto | Título de slides, headline de landing page |
| `bullet_points` | 3–7 itens | Objetivo, escanável | Slides de diferenciais, listas de features |

#### Sub-responsabilidades

| Sub-tarefa | Descrição |
|---|---|
| Seleção de fontes por tipo de narrativa | Diferentes narrativas consomem diferentes combinações de fontes |
| Prompt engineering por tipo | Prompts especializados para cada tipo de narrativa |
| Validação de dados numéricos | Verificar que preços/metragens mencionados existem no texto fonte |
| Deduplicação de conteúdo | Evitar repetição excessiva entre narrativas de fontes similares |
| Geração de headline | Criar títulos impactantes para cada fonte |
| Cache de narrativas | Cachear por `(sourceId + type + lang)` para evitar re-geração |

#### Contratos de Interface

```typescript
type NarrativeType = 'comercial' | 'editorial' | 'social' | 'descritiva' | 'headline' | 'bullet_points';

interface Narrative {
  sourceId: string;
  type: NarrativeType;
  content: string;                  // texto gerado
  wordCount: number;
  generatedBy: 'openai' | 'gemini'; // provider LLM usado
  cachedAt?: Date;
}

interface NarrativeSet {
  jobId: string;
  narratives: Record<string, Narrative[]>; // sourceId -> Narrative[]
  globalNarrative?: {               // narrativa do empreendimento como um todo
    headline: string;
    comercial: string;
    editorial: string;
  };
}
```

#### Prompts-Base por Tipo (Templates)

```
[comercial]
"Você é um copywriter especializado no mercado imobiliário de alto padrão.
Com base nas informações a seguir sobre o empreendimento {nome}, escreva
um texto comercial de {min}-{max} palavras, em tom {tom}, destacando os
principais benefícios. NÃO invente informações. Use apenas os dados fornecidos.
Informações: {rawText}"

[social]
"Escreva uma caption para Instagram sobre este empreendimento imobiliário.
Máximo de 80 palavras. Tom descontraído e aspiracional. Inclua 3-5 hashtags
relevantes no final. Informações: {rawText}"

[descritiva]
"Você é um locutor de vídeos imobiliários. Escreva o roteiro de narração
para uma cena de {segundos} segundos sobre: {rawText}. Escreva em linguagem
oral, fluida, sem listas. Termine com uma frase de transição."
```

---

### 4.7 Módulo: `output-selection`

#### Visão Geral

O módulo de seleção de outputs decide quais formatos de conteúdo podem ser gerados com qualidade adequada, dado o conjunto de fontes e assets disponíveis. Evita gerar outputs que ficariam ruins por falta de material. No MVP, pode funcionar de forma simplificada (gerar tudo o que for possível). Em versões avançadas, aplica regras de negócio, preferências do usuário e análise preditiva de qualidade.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Analisar o conjunto de fontes e assets disponíveis, verificar se os requisitos mínimos de cada formato são atendidos, e retornar a lista priorizada de outputs a serem gerados |
| **Entrada** | `Source[]` + `NarrativeSet` + `UserContext` (quais outputs o usuário solicitou, se especificou) |
| **Saída** | `OutputSelectionResult` — lista de `OutputFormat[]` com status (viável/inviável/parcial) e motivo para cada formato |
| **Dependências** | `source-intelligence` (Source[] com scores), `narrative-generation` (narrativas disponíveis) |
| **Risco técnico** | **Baixo** — Lógica determinística baseada em regras; risco principal é critérios de viabilidade muito restritivos que bloqueiam outputs úteis |
| **Prioridade de implementação** | **P2** — No MVP, gerar todos os formatos possíveis; seleção inteligente é otimização para versões posteriores |

#### Regras de Viabilidade por Formato

| Formato | Fonte Obrigatória | Assets Mínimos | Texto Mínimo |
|---|---|---|---|
| Reel (MP4 9:16, até 90s) | `hero` + 2 outras | 3 imagens >= 1080px | Nome do empreendimento |
| Stories (5-8 cards) | `hero` + 1 outra | 2 imagens | Nome + 1 diferencial |
| Carrossel (5-10 slides) | `hero` + 3 outras | 4 imagens | Nome + 3 blocos de texto |
| Post estático | Qualquer 1 fonte | 1 imagem | Headline (5-15 palavras) |
| Blog post (800-2000 palavras) | `hero` + 3 fontes textuais | 3 imagens | 800 palavras brutas |
| Artigo autoridade (2000+ palavras) | 5+ fontes variadas | 3 imagens | 2000 palavras brutas |
| Landing page | `hero` + 4 outras | 5 imagens | Textos por seção |
| Vídeo longo (>120s) | `hero` + 4 outras | 5 imagens | Texto para narração completa |
| Apresentação PPTX (10-20 slides) | `hero` + 5 outras | 6 imagens | Textos por slide |
| Áudio monólogo (2-5 min) | 3+ fontes quaisquer | 0 (só texto) | 500 palavras |
| Áudio podcast (5-15 min) | 5+ fontes variadas | 0 (só texto) | 1000 palavras |

#### Contratos de Interface

```typescript
type OutputFormatType =
  | 'reel' | 'stories' | 'carousel' | 'post'
  | 'blog_post' | 'authority_article' | 'briefing'
  | 'landing_page' | 'video_long' | 'presentation'
  | 'audio_monologue' | 'audio_podcast';

interface OutputEvaluation {
  format: OutputFormatType;
  viable: boolean;
  reason?: string;                  // por que não é viável, se for o caso
  qualityEstimate: 'high' | 'medium' | 'low';
  missingRequirements?: string[];
}

interface OutputSelectionResult {
  jobId: string;
  requested: OutputFormatType[];    // outputs que o usuário pediu (ou todos se não especificou)
  selected: OutputFormatType[];     // outputs que serão gerados
  evaluations: OutputEvaluation[];  // detalhe de cada formato avaliado
}
```

---

### 4.8 Módulo: `media-generation`

#### Visão Geral

O módulo de geração de mídia é o maior e mais complexo do sistema. Ele é subdividido em 6 sub-geradores especializados, cada um responsável por uma família de outputs. Todos compartilham os dados de entrada (fontes, narrativas, branding) e o contrato de saída (`GeneratedOutput`), mas têm implementações completamente independentes. O módulo é projetado para execução paralela — múltiplos formatos podem ser gerados simultaneamente.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Gerar os arquivos finais de mídia em todos os formatos selecionados — vídeos, imagens, áudios, textos web e slides — aplicando branding e narrativas extraídas nas etapas anteriores |
| **Entrada** | `Source[]` + `NarrativeSet` + `BrandingProfile` + `OutputSelectionResult` (formatos a gerar) + `ExtractionResult` (assets visuais) |
| **Saída** | `GeneratedOutput[]` — arquivos gerados em `storage/outputs/{jobId}/`, com metadados de formato, tamanho, duração e qualidade |
| **Dependências** | Todos os módulos anteriores (especialmente `source-intelligence`, `narrative-generation`, `branding-preservation`, `asset-extraction`); adapters externos: `ffmpeg`, TTS API, LLM |
| **Risco técnico** | **Alto** — Geração de vídeo é computacionalmente cara e complexa; qualidade dos outputs visuais depende muito dos templates; rendering de vídeo pode demorar minutos; TTS tem custo por caractere; templates precisam de manutenção contínua |
| **Prioridade de implementação** | **P0** (ImageGen — carrosseis/posts), **P1** (VideoGen, AudioGen, TextGen), **P2** (WebGen, SlideGen) |

#### Sub-módulos de Geração

##### 4.8.1 ImageGen — Posts e Carrosseis

| Atributo | Detalhe |
|---|---|
| **Outputs** | Posts estáticos (PNG/JPG), carrosseis (PNG, 5-10 slides), stories estáticos |
| **Resoluções** | 1080x1080 (1:1), 1080x1350 (4:5), 1080x1920 (9:16) |
| **Abordagem** | Templates HTML/CSS renderizados como imagem via headless browser ou composição direta com `sharp` |
| **Branding aplicado** | Paleta de cores, fontes Google Fonts equivalentes, logo do empreendimento |
| **Tecnologias** | `sharp` (composição), `puppeteer`/`playwright` (HTML→imagem), `canvas` |
| **Prioridade** | P0 |

##### 4.8.2 VideoGen — Reels, Stories e Vídeos

| Atributo | Detalhe |
|---|---|
| **Outputs** | Reels MP4 9:16 (15-90s), Stories MP4 9:16 (cards animados), Vídeos curtos (<120s), Vídeos longos (>120s, ≤16MB para WhatsApp) |
| **Abordagem** | Composição de slides com Ken Burns effect + transições + texto overlay + narração opcional; renderização via `ffmpeg` ou `Remotion` |
| **Áudio** | Música de fundo (biblioteca royalty-free) + narração TTS (opcional) |
| **Branding aplicado** | Cores nas transições, logo em overlay, fonte tipográfica |
| **Tecnologias** | `ffmpeg` (CLI), `fluent-ffmpeg` (Node wrapper), `Remotion` (composição React) |
| **Prioridade** | P1 |

##### 4.8.3 AudioGen — Monólogo e Podcast

| Atributo | Detalhe |
|---|---|
| **Outputs** | Áudio monólogo MP3 (2-5 min, 1 voz), Áudio podcast MP3 (5-15 min, 2+ vozes) |
| **Abordagem** | Geração de roteiro via LLM → conversão para áudio via TTS → composição com `ffmpeg` (fade in/out, silêncio entre blocos) |
| **Vozes** | 1 voz para monólogo; 2 vozes distintas (host + entrevistado) para podcast |
| **Tecnologias** | OpenAI TTS (`tts-1-hd`), ElevenLabs (qualidade premium), `ffmpeg` (composição) |
| **Prioridade** | P1 |

##### 4.8.4 TextGen — Blog e Artigos

| Atributo | Detalhe |
|---|---|
| **Outputs** | Blog post HTML/Markdown (800-2000 palavras), Artigo de autoridade (2000-4000 palavras), Briefing executivo (300-500 palavras) |
| **Abordagem** | LLM gera texto estruturado com headings, imagens inline e metadata SEO; converter para HTML ou Markdown |
| **SEO** | Meta title, meta description, H1-H3, alt text em imagens, URL slug |
| **Tecnologias** | OpenAI GPT-4 / Gemini Pro, `marked` (Markdown→HTML), `gray-matter` (frontmatter) |
| **Prioridade** | P1 |

##### 4.8.5 WebGen — Landing Pages

| Atributo | Detalhe |
|---|---|
| **Outputs** | Landing page HTML+CSS+JS standalone (arquivo único ou pasta) |
| **Abordagem** | Template HTML pré-construído com seções configuráveis; injeção de dados (textos, imagens, cores, CTA) via engine de templates |
| **Seções** | Hero, diferenciais, galeria, plantas, infraestrutura, investimento, localização, sobre, formulário |
| **Performance** | Lighthouse ≥ 80; mobile-first; sem dependências externas |
| **Tecnologias** | Templates HTML/CSS/JS (Handlebars ou EJS), `puppeteer` para screenshot de preview |
| **Prioridade** | P2 |

##### 4.8.6 SlideGen — Apresentações

| Atributo | Detalhe |
|---|---|
| **Outputs** | Apresentação PPTX (10-20 slides, 16:9), versão PDF |
| **Abordagem** | `pptxgenjs` para criar slides programaticamente com textos, imagens e formatação |
| **Estrutura** | Capa, índice, empreendimento, diferenciais, infraestrutura, plantas, investimento, institucional, contato |
| **Branding** | Cores e fontes aplicadas a cada slide |
| **Tecnologias** | `pptxgenjs`, `libreoffice` (PPTX→PDF) |
| **Prioridade** | P2 |

#### Contratos de Interface

```typescript
interface GeneratedOutput {
  id: string;
  jobId: string;
  format: OutputFormatType;
  filePath: string;                 // caminho em storage
  fileSize: number;
  mimeType: string;
  metadata: {
    width?: number;
    height?: number;
    durationSeconds?: number;
    slideCount?: number;
    wordCount?: number;
    generatedAt: string;
    renderTimeMs: number;
  };
  previewPath?: string;             // thumbnail/screenshot do output
  status: 'generated' | 'failed' | 'partial';
  error?: string;
}
```

---

### 4.9 Módulo: `user-personalization`

#### Visão Geral

O módulo de personalização do usuário é a camada final do pipeline, responsável por transformar outputs genéricos em materiais prontos para uso comercial pelo corretor ou imobiliária. Aplica o logo do usuário como overlay, injeta os dados de contato (CTA) nos locais corretos de cada formato e formata os links de WhatsApp, Instagram e site conforme as convenções de cada canal.

#### Tabela de Especificação

| Campo | Descrição |
|---|---|
| **Função** | Aplicar identidade do usuário (corretor/imobiliária) nos outputs gerados — logo overlay, injeção de CTA com nome/WhatsApp/Instagram/site/região — em todos os formatos produzidos |
| **Entrada** | `GeneratedOutput[]` (outputs sem personalização) + `UserContext` (logo, dados de CTA) |
| **Saída** | `GeneratedOutput[]` atualizados com personalização aplicada e `UserContext.applied = true` |
| **Dependências** | `media-generation` (outputs brutos gerados); `storage/` adapter (logo do usuário) |
| **Risco técnico** | **Baixo** — Overlay de logo e injeção de texto são operações determinísticas; risco é posicionamento incorreto em alguns formatos ou logo de baixa qualidade sendo ampliado |
| **Prioridade de implementação** | **P1** — Essencial para valor comercial do produto (o output sem personalização tem utilidade reduzida); não bloqueia a geração base |

#### Campos de Personalização

| Campo | Tipo | Obrigatório | Uso |
|---|---|---|---|
| `logo` | Arquivo PNG/SVG/JPG | Não | Overlay em todos os outputs visuais |
| `name` | string | Não | Assinatura, CTA textual |
| `whatsapp` | string (número E.164) | Não | Link `wa.me/`, botão de contato |
| `instagram` | string (@handle) | Não | @handle em posts, link em landing page |
| `site` | string (URL) | Não | URL em landing page, blog, slides |
| `region` | string | Não | Contexto geográfico ("Especialista no Tatuapé") |

#### Regras de Aplicação por Formato

| Formato | Posição do Logo | Formato do CTA |
|---|---|---|
| Reel | Overlay canto inferior direito, últimos 3-5s | Tela final: nome + WhatsApp + Instagram |
| Stories | Overlay em cada card + último card dedicado | Card CTA completo |
| Carrossel | Overlay no slide 1 + slide CTA final | Slide com todos os dados + botão |
| Post | Overlay canto inferior direito | Rodapé: nome + WhatsApp |
| Blog | Logo no header + byline do autor | Bloco CTA no final + sidebar |
| Landing page | Header + footer + botão flutuante | Formulário + WhatsApp link + todos os dados |
| Vídeo longo | Splash inicial (3-5s) + tela final | Tela completa de contato no final |
| Apresentação | Capa + contra-capa + rodapé de cada slide | Último slide: contato completo |
| Áudio | — (sem visual) | Menção verbal no início e fim da narração |

#### Regras de Formatação de Links

| Campo | Regra de Formatação | Exemplo Visual | Link Gerado |
|---|---|---|---|
| WhatsApp | Número sem formatação para wa.me | (11) 99999-9999 | `https://wa.me/5511999999999` |
| Instagram | Sempre com @ | @corretor_nome | `https://instagram.com/corretor_nome` |
| Site | Sem protocolo no texto visual | www.site.com.br | `https://www.site.com.br` |
| Região | Texto livre, usado para contextualização | Especialista no Itaim Bibi | — |

#### Fallbacks para Dados Ausentes

| Situação | Comportamento |
|---|---|
| Nenhum dado de CTA fornecido | Output sem bloco de CTA (genérico) |
| Apenas WhatsApp fornecido | CTA simplificado: "Fale com consultor: (11) 99999-9999" |
| Apenas nome fornecido | Assinatura textual sem links |
| Logo não fornecido | Output sem overlay de logo |
| Todos os dados fornecidos | CTA completo com layout rico |

#### Sub-responsabilidades

| Sub-tarefa | Descrição |
|---|---|
| Pré-processamento do logo | Redimensionar, recortar fundo branco se necessário, converter para PNG com transparência |
| Overlay de logo em imagens | Posicionar logo com opacidade configurável, tamanho relativo ≤15% da largura |
| Overlay de logo em vídeos | Injetar logo como filtro `ffmpeg` (overlay fixo ou animado) |
| Injeção de CTA em slides | Modificar último slide/card com dados de contato via `pptxgenjs` |
| Injeção de CTA em HTML | Substituir placeholders em templates de landing page e blog |
| Injeção de CTA em script de áudio | Adicionar frase de encerramento ao roteiro antes da síntese de voz |
| Geração de link WhatsApp | Formatar número como URL `wa.me/` com código do país |

#### Contratos de Interface

```typescript
interface UserContext {
  userId?: string;
  logo?: {
    filePath: string;
    mimeType: 'image/png' | 'image/svg+xml' | 'image/jpeg';
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    opacity?: number;               // 0.0 a 1.0, default 0.9
    maxWidthPercent?: number;       // % da largura do output, default 15
  };
  cta?: {
    name?: string;
    whatsapp?: string;              // número E.164: "5511999999999"
    instagram?: string;             // sem @: "corretor_nome"
    site?: string;                  // sem protocolo: "www.site.com.br"
    region?: string;
  };
}
```

---

## 5. Padrões de Comunicação entre Módulos

### 5.1 Padrão Atual (MVP): Pipeline Síncrono com Context Object

No MVP, os módulos se comunicam passando um único objeto de contexto (`PipelineContext`) ao longo do pipeline. Cada módulo enriquece o contexto com seus resultados antes de passar para o próximo.

```
Request HTTP
     |
     v
[Orchestrator]
     |
     v
[JobManager] -> cria job, salva em memória/DB
     |
     v
[Pipeline] -> executa módulos em sequência:
     |
     +-> ingestion(context)         -> context.ingestion = IngestionResult
     +-> assetExtraction(context)   -> context.assets = ExtractionResult
     +-> textImageCorrelation(ctx)  -> context.correlations = CorrelationMap
     +-> brandingPreservation(ctx)  -> context.branding = BrandingProfile
     +-> sourceIntelligence(ctx)    -> context.sources = Source[]
     +-> narrativeGeneration(ctx)   -> context.narratives = NarrativeSet
     +-> outputSelection(ctx)       -> context.selectedOutputs = OutputFormat[]
     +-> mediaGeneration(ctx)       -> context.outputs = GeneratedOutput[]
     +-> userPersonalization(ctx)   -> context.outputs (atualizado)
     |
     v
[JobManager] -> salva resultado final
     |
     v
Response HTTP (job_id + resultado)
```

**Contrato do PipelineContext:**

```typescript
interface PipelineContext {
  jobId: string;
  startedAt: Date;
  input: JobInput;
  userContext?: UserContext;

  // Resultados por módulo (preenchidos progressivamente)
  ingestion?: IngestionResult;
  extraction?: ExtractionResult;
  correlations?: CorrelationMap;
  branding?: BrandingProfile;
  sources?: Source[];
  narratives?: NarrativeSet;
  selectedOutputs?: OutputSelectionResult;
  outputs?: GeneratedOutput[];

  // Estado e observabilidade
  errors: ModuleError[];
  timings: Record<string, number>;  // módulo -> ms
  progress: number;                 // 0-100
}
```

---

### 5.2 Padrão Futuro (Pós-MVP): Event-Driven com Filas

Em produção, cada módulo opera como um worker independente consumindo de uma fila. Isso permite:
- Escalonamento horizontal de workers por módulo
- Retentativas automáticas em caso de falha
- Priorização de jobs
- Processamento paralelo de múltiplos formatos na fase de media-generation

```
[API] POST /process
  |
  v
[Queue: ingestion]      <- job enfileirado
  |
  [Worker: ingestion] -> processa -> emite evento "ingestion:complete"
  |
  v
[Queue: asset-extraction]
  |
  [Worker: asset-extraction] -> processa -> emite "extraction:complete"
  |
  v
[Queue: text-image-correlation]
  |
  ... (sequencial até source-intelligence)
  |
  v
[Queue: media-generation] <- PARALELISMO aqui
  |
  +-> [Worker: ImageGen]    -> gera carrosseis, posts
  +-> [Worker: VideoGen]    -> gera reels, stories
  +-> [Worker: AudioGen]    -> gera monologo, podcast
  +-> [Worker: TextGen]     -> gera blog, artigos
  +-> [Worker: WebGen]      -> gera landing page
  +-> [Worker: SlideGen]    -> gera apresentacao
  |
  (todos concluem)
  |
  v
[Queue: user-personalization]
  |
  [Worker: personalization] -> aplica logo e CTA
  |
  v
[Webhook] -> notifica sistema externo de conclusao
```

**Eventos emitidos por módulo:**

| Evento | Payload | Consumidor |
|---|---|---|
| `job:created` | `{ jobId, input }` | ingestion worker |
| `ingestion:complete` | `{ jobId, ingestionResult }` | asset-extraction worker |
| `extraction:complete` | `{ jobId, extractionResult }` | correlation worker |
| `correlation:complete` | `{ jobId, correlationMap }` | branding + source workers |
| `branding:complete` | `{ jobId, brandingProfile }` | source worker (aguarda correlação) |
| `sources:complete` | `{ jobId, sources }` | narrative + output-selection workers |
| `narratives:complete` | `{ jobId, narrativeSet }` | media-generation workers |
| `output:generated` | `{ jobId, output }` | personalization worker |
| `job:complete` | `{ jobId, outputs[] }` | webhook caller |
| `job:failed` | `{ jobId, error, module }` | retry logic + notification |

**Tecnologias de Filas:**

| Opção | Vantagem | Uso recomendado |
|---|---|---|
| **BullMQ** (Redis) | Simples, TypeScript-first, visualização (Bull Board) | MVP → Produção |
| **RabbitMQ** | Robusto, multi-consumer, federação | Produção de larga escala |
| **AWS SQS + Lambda** | Serverless, escalonamento automático | Cloud-native |

---

### 5.3 Observabilidade

Cada módulo deve emitir:
- **Logs estruturados** (JSON): `{ jobId, module, event, durationMs, status }`
- **Métricas**: tempo de execução por módulo, taxa de erro, custo de API
- **Tracing**: span por módulo para rastreamento end-to-end

**Tecnologias:** `pino` (logging), OpenTelemetry (tracing), Prometheus (métricas)

---

## 6. Tecnologias por Módulo

### Tabela Consolidada de Tecnologias

| Módulo | Tecnologia Principal | Alternativa / Fallback | Categoria |
|---|---|---|---|
| **ingestion** (PDF texto) | `pdfjs-dist` + `pdf-parse` | `pdf2json` | Parser |
| **ingestion** (vídeo transcrição) | Whisper API (OpenAI) | AssemblyAI, Deepgram | STT |
| **ingestion** (áudio transcrição) | Whisper API (OpenAI) | ElevenLabs STT | STT |
| **ingestion** (PPTX) | `libreoffice` (CLI) | `officegen`, `pptx-extractor` | Parser |
| **ingestion** (DOCX) | `mammoth` | `docx`, `office-parser` | Parser |
| **ingestion** (OCR fallback) | `tesseract.js` | Google Vision API | OCR |
| **asset-extraction** (PDF imagens) | `pdfjs-dist` streams | `pdf-lib`, `mutool` | Extração |
| **asset-extraction** (renderização) | `pdf2pic` (Ghostscript) | `pdfjs-dist` canvas | Render |
| **asset-extraction** (processamento) | `sharp` | `jimp`, ImageMagick | Imagem |
| **text-image-correlation** (semântico) | Gemini Vision | GPT-4 Vision | LLM Vision |
| **branding-preservation** (cores) | `color-thief-node` | `vibrant.js`, `sharp` k-means | Análise cor |
| **branding-preservation** (estilo) | Gemini Vision | GPT-4 Vision | LLM Vision |
| **source-intelligence** (classificação) | Gemini Pro / GPT-4 | Claude 3 | LLM texto |
| **narrative-generation** | Gemini Pro / GPT-4 | Claude 3 | LLM texto |
| **media-generation** ImageGen | `sharp` + `puppeteer` | `canvas`, `playwright` | Render imagem |
| **media-generation** VideoGen | `ffmpeg` + `fluent-ffmpeg` | `Remotion` | Vídeo |
| **media-generation** AudioGen | OpenAI TTS (`tts-1-hd`) | ElevenLabs | TTS |
| **media-generation** TextGen | Gemini Pro / GPT-4 | Claude 3 | LLM texto |
| **media-generation** WebGen | Templates EJS/Handlebars | `mjml` | Template |
| **media-generation** SlideGen | `pptxgenjs` | LibreOffice SDK | PPTX |
| **user-personalization** (overlay) | `sharp` (imagem) | `canvas` | Composição |
| **user-personalization** (vídeo) | `ffmpeg` overlay filter | `Remotion` | Vídeo |
| **storage** (local) | `fs` (filesystem local) | MinIO | Storage |
| **storage** (cloud) | AWS S3 | Google Cloud Storage, Cloudflare R2 | Storage |
| **filas** | BullMQ (Redis) | RabbitMQ | Queue |
| **API** | Express + Zod | Fastify | HTTP |
| **runtime** | Node.js 20 LTS | — | Runtime |
| **linguagem** | TypeScript 5.6+ | — | Linguagem |
| **testes** | Vitest | Jest | Teste |
| **logging** | `pino` | `winston` | Observabilidade |
| **tracing** | OpenTelemetry | Datadog | Observabilidade |

---

### Estratégia de Multi-Provider LLM

O sistema abstrai os provedores de LLM através de um adapter interface. Isso permite:
- Trocar de provider sem alterar os módulos
- Usar diferentes providers por módulo (ex: Gemini para visão, GPT-4 para texto)
- Fallback automático se um provider falhar

```typescript
interface LLMAdapter {
  generateText(prompt: string, options?: LLMOptions): Promise<string>;
  generateWithVision(prompt: string, imageBase64: string, options?: LLMOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
}

// Implementações: GeminiAdapter, OpenAIAdapter, ClaudeAdapter
```

---

## 7. Prioridades de Implementação

### Classificação por Fase

| Prioridade | Módulo / Sub-módulo | Fase de Desenvolvimento | Bloqueador |
|---|---|---|---|
| **P0** | `ingestion` (PDF texto) | MVP Fase 1 | Tudo depende disso |
| **P0** | `asset-extraction` (extração + render) | MVP Fase 1 | Outputs visuais |
| **P0** | `text-image-correlation` (co-localização) | MVP Fase 1 | Fontes estruturadas |
| **P0** | `source-intelligence` (heurísticas) | MVP Fase 1 | Todos os geradores |
| **P0** | `media-generation` / ImageGen (carrosseis) | MVP Fase 2 | Primeiro output tangível |
| **P1** | `branding-preservation` | MVP Fase 2 | Qualidade visual |
| **P1** | `source-intelligence` (classificação LLM) | MVP Fase 2 | Qualidade das fontes |
| **P1** | `narrative-generation` | MVP Fase 2 | Outputs textuais |
| **P1** | `media-generation` / TextGen (blog) | MVP Fase 2 | Outputs editoriais |
| **P1** | `user-personalization` (logo + CTA básico) | MVP Fase 2 | Valor comercial |
| **P1** | `ingestion` (vídeo + áudio) | MVP Fase 2 | Suporte multi-formato |
| **P1** | `media-generation` / VideoGen (reels) | Pós-MVP | Engajamento social |
| **P1** | `media-generation` / AudioGen | Pós-MVP | Podcast/monólogo |
| **P2** | `output-selection` (inteligente) | Pós-MVP | Otimização |
| **P2** | `media-generation` / WebGen (landing page) | Pós-MVP | Captação de leads |
| **P2** | `media-generation` / SlideGen (PPTX) | Pós-MVP | Apresentações |
| **P2** | `text-image-correlation` (matching LLM) | Pós-MVP | Qualidade máxima |
| **P2** | Infraestrutura de filas (BullMQ) | Pós-MVP | Escalonamento |
| **P2** | Storage cloud (S3) | Pós-MVP | Produção |
| **P2** | `user-personalization` (avançado) | Pós-MVP | CTA completo |

---

### Sequência de Implementação Recomendada

```
SEMANA  1-2    3-4    5-6    7-8    9-10   11-12  13-14  15-16+
        |      |      |      |      |      |      |      |
        [Core + API framework]
        [ingestion — PDF texto]
               [asset-extraction — PDF imagens + renders]
               [text-image-correlation — co-localização]
                      [source-intelligence — heurísticas]
                      [ImageGen — primeiro carrossel]
                             [branding-preservation]
                             [LLM adapter — OpenAI/Gemini]
                             [source-intelligence — LLM]
                                    [narrative-generation]
                                    [TextGen — blog]
                                    [user-personalization — básico]
                                           [VideoGen — reels]
                                           [AudioGen — monólogo]
                                                  [WebGen — landing]
                                                  [SlideGen — PPTX]
                                                         [Filas — BullMQ]
                                                         [Storage — S3]
```

---

## 8. Princípios de Design e Decisões de Arquitetura

### 8.1 Princípios Fundamentais

| # | Princípio | Descrição |
|---|---|---|
| 1 | **Modular por padrão** | Cada módulo é independente e substituível. Trocar um módulo não deve exigir mudanças em outros |
| 2 | **Pipeline assíncrono** | O processamento nunca bloqueia a API. Jobs são criados e executados em background |
| 3 | **Branding-first** | A identidade visual não é pós-processamento — é extraída antes da geração e informa todos os outputs |
| 4 | **Engine, não app** | O produto é um motor consumido via API. Interfaces de usuário são responsabilidade dos consumidores |
| 5 | **Formato-agnóstico na entrada** | Novos formatos de entrada (ex: email marketing, DOC) são novos adapters, não reescritas |
| 6 | **Formato-agnóstico na saída** | Novos formatos de saída são novos sub-geradores no `media-generation`, não mudanças estruturais |
| 7 | **Cache agressivo** | Resultados de LLM, extrações e renders são cacheados por hash do arquivo de origem |
| 8 | **Observável** | Cada etapa emite logs, métricas e eventos; nenhum processamento é opaco |
| 9 | **Fallback em camadas** | Toda operação cara ou que pode falhar tem fallback (ex: extração → render; LLM A → LLM B) |
| 10 | **Dados numéricos inalterados** | Preços, metragens, datas extraídos das fontes nunca são inventados pelo LLM — apenas formatados |

---

### 8.2 Decisões de Arquitetura (ADRs Resumidas)

#### ADR-001: Context Object vs. Event Bus no MVP

**Decisão**: Usar um único `PipelineContext` passado de módulo em módulo no MVP.

**Motivo**: Simplicidade de implementação, debugging facilitado, sem overhead de infraestrutura de filas.

**Trade-off**: Não escala horizontalmente; processamento sequencial. Aceitável no MVP.

**Revisão**: Migrar para BullMQ + event-driven quando o volume de jobs simultâneos exigir.

---

#### ADR-002: Abordagem Híbrida Heurísticas + LLM

**Decisão**: Usar heurísticas baratas primeiro e LLM apenas para refinamento e casos ambíguos.

**Motivo**: Redução de custo de API; heurísticas cobrem 60-70% dos casos com boa precisão.

**Trade-off**: Maior complexidade de código; dois sistemas de classificação para manter.

**Revisão**: Se o custo de API LLM cair significativamente, simplificar para LLM-only.

---

#### ADR-003: FFmpeg como Motor de Vídeo

**Decisão**: Usar `ffmpeg` (via `fluent-ffmpeg`) para toda composição e encoding de vídeo.

**Motivo**: Maturidade, suporte universal a codecs, sem custo de licença, controle total.

**Trade-off**: API de baixo nível; curva de aprendizado para composições complexas.

**Alternativa considerada**: Remotion — mais alto nível (React), mas overhead de browser e limitações de codec.

**Revisão**: Para reels com animações complexas, avaliar Remotion como complemento.

---

#### ADR-004: Storage Local no MVP, S3 em Produção

**Decisão**: Abstrair storage via interface `StorageAdapter`; implementar filesystem local no MVP, S3 em produção.

**Motivo**: Simplicidade no desenvolvimento; mesma interface sem mudança de código no restante do sistema.

**Implementação**:

```typescript
interface StorageAdapter {
  save(path: string, buffer: Buffer): Promise<string>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getPublicUrl(path: string): string;
}
// LocalStorageAdapter, S3StorageAdapter, GCSStorageAdapter
```

---

#### ADR-005: Múltiplos Provedores LLM

**Decisão**: Abstrair provedores LLM via `LLMAdapter`; usar Gemini como padrão, OpenAI como fallback.

**Motivo**: Evitar lock-in em provedor único; Gemini tem contexto maior e custo menor para tarefas de visão.

**Estratégia de roteamento**:
- Tarefas de visão (análise de imagem) → Gemini Vision
- Geração de texto longo → GPT-4 Turbo
- Classificação simples → Gemini Flash (mais barato)
- Fallback global → OpenAI

---

### 8.3 Mapa de Riscos Técnicos Consolidado

| # | Risco | Módulo Afetado | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|---|
| 1 | PDFs com imagens achatadas (sem streams) | `asset-extraction` | Alta | Alto | Page render como fallback garantido |
| 2 | Correlação texto-imagem incorreta | `text-image-correlation` | Média | Alto | Abordagem híbrida + score de confiança |
| 3 | Custo de API LLM acima do esperado | `source-intelligence`, `narrative-generation` | Média | Médio | Cache; heurísticas first; Gemini Flash para tarefas simples |
| 4 | Qualidade visual dos carrosseis | `media-generation` / ImageGen | Média | Alto | Templates bem desenhados; iteração rápida com feedback |
| 5 | Latência alta de geração de vídeo | `media-generation` / VideoGen | Alta | Médio | Pipeline assíncrono; feedback de progresso; timeout configurável |
| 6 | Qualidade do TTS (voz robotizada) | `media-generation` / AudioGen | Média | Médio | ElevenLabs como provider premium; OpenAI TTS como fallback |
| 7 | Escalabilidade do pipeline síncrono | Toda a arquitetura | Baixa (MVP) | Alto | BullMQ planejado para Pós-MVP; arquitetura já preparada para migração |
| 8 | Extração de cores incorreta (fundo branco) | `branding-preservation` | Média | Médio | Filtrar cores próximas a branco/preto; focar em imagens hero |
| 9 | Alucinações LLM em dados numéricos | `narrative-generation` | Baixa | Alto | Validar dados numéricos contra fontes; nunca gerar preços sem fonte |
| 10 | Formatos de imagem exóticos no PDF | `asset-extraction` | Baixa | Médio | Conversão via `sharp` + ImageMagick; fallback page render |

---

## 9. Referências e Documentos Relacionados

| Documento | Descrição |
|---|---|
| `PRODUCT_VISION.md` | Visão estratégica, posicionamento e diferenciais do produto |
| `BOOKAGENT_SOURCE_MODEL.md` | Modelo de dados completo das fontes estruturadas |
| `BOOKAGENT_VISUAL_PIPELINE.md` | Estratégia detalhada de extração de assets visuais |
| `BOOKAGENT_OUTPUTS_AND_PERSONALIZATION.md` | Especificações completas de outputs e regras de CTA |
| `BOOKAGENT_MVP_ROADMAP.md` | Roadmap de implementação com milestones e critérios de pronto |

---

*Documento gerado como referência técnica oficial para o BookAgent Intelligence Engine.*
*Versão: 1.0 | Data: 2026-04-03*
*Baseado na Fase 1 — Definição do Produto.*
