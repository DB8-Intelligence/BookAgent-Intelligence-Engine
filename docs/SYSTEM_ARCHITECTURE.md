# BookAgent Intelligence Engine — Arquitetura do Sistema v1.0

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENTRADA (Materiais Brutos)                       │
│          PDF  │  Vídeo  │  Áudio  │  PPTX  │  Documentos               │
└──────┬────────┴────┬────┴────┬────┴───┬────┴────┬───────────────────────┘
       │             │         │        │         │
       ▼             ▼         ▼        ▼         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         1. INGESTION MODULE                             │
│  Download/leitura → Detecção de tipo → Extração de texto bruto          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      2. ASSET EXTRACTION MODULE                         │
│  Extração de imagens → Renderização de páginas → Thumbnails             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   3. TEXT-IMAGE CORRELATION MODULE                       │
│  Proximidade espacial → Co-localização → Matching semântico (LLM)       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    4. BRANDING PRESERVATION MODULE                       │
│  Paleta de cores → Estilo visual → Composição → Tipografia              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    5. SOURCE INTELLIGENCE MODULE                         │
│  Classificação por tipo → Scoring → Estruturação de fontes              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    6. NARRATIVE GENERATION MODULE                        │
│  Narrativa comercial → Editorial → Social → Descritiva                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     7. OUTPUT SELECTION MODULE                           │
│  Análise de viabilidade → Requisitos mínimos → Lista de outputs         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     8. MEDIA GENERATION MODULE                          │
│  VideoGen │ ImageGen │ AudioGen │ TextGen │ WebGen │ SlideGen            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    9. USER PERSONALIZATION MODULE                        │
│  Logo overlay → CTA injection → Dados do corretor                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SAÍDA (Outputs Finais)                           │
│  Reels │ Stories │ Carrosséis │ Posts │ Blog │ Landing │ Vídeos │ Áudio  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Especificação dos Módulos

### 2.1 Ingestion Module

| Campo | Descrição |
|---|---|
| **Função** | Receber materiais brutos, detectar tipo, fazer download/leitura e extrair texto bruto |
| **Entrada** | URL ou path de arquivo (PDF, MP4, MP3, PPTX, DOCX) |
| **Saída** | Texto bruto extraído + metadados do arquivo (tipo, tamanho, páginas) |
| **Dependências** | Adapters: `pdf/`, `video/`, `audio/`, `storage/` |
| **Risco técnico** | **Médio** — PDFs heterogêneos podem ter texto como imagem (OCR necessário); vídeos precisam de transcrição |
| **Prioridade** | **P0** — Primeiro módulo do pipeline, bloqueia todos os outros |

**Tecnologias sugeridas**: `pdf-parse`, `pdfjs-dist`, `whisper` (transcrição), `libreoffice` (PPTX→texto)

---

### 2.2 Asset Extraction Module

| Campo | Descrição |
|---|---|
| **Função** | Extrair imagens embutidas de PDFs, renderizar páginas como imagem, gerar thumbnails |
| **Entrada** | Arquivo PDF/PPTX processado pelo Ingestion |
| **Saída** | Array de `ExtractedAsset[]` com metadados (página, posição, dimensões, path) |
| **Dependências** | Ingestion Module, `storage/` adapter |
| **Risco técnico** | **Alto** — Imagens embutidas em PDFs podem ter formatos variados (JPEG, PNG, JBIG2, CCITT); extração pode corromper ou perder qualidade |
| **Prioridade** | **P0** — Sem assets, não há conteúdo visual para gerar |

**Tecnologias sugeridas**: `pdf-lib`, `pdfjs-dist`, `sharp`, `pdf2pic`

---

### 2.3 Text-Image Correlation Module

| Campo | Descrição |
|---|---|
| **Função** | Associar cada imagem extraída ao bloco de texto mais relevante |
| **Entrada** | Texto bruto + `ExtractedAsset[]` com posições |
| **Saída** | Mapa de correlações `{ assetId → textBlock }` |
| **Dependências** | Ingestion Module, Asset Extraction Module, adapters LLM (`gemini/`, `openai/`) |
| **Risco técnico** | **Alto** — Correlação semântica depende de LLM; correlação espacial depende de posição precisa no PDF |
| **Prioridade** | **P0** — Correlação errada compromete todas as fontes e narrativas |

**Estratégias**:
1. **Proximidade espacial**: imagem e texto na mesma região da página
2. **Co-localização de página**: texto da mesma página associado à imagem
3. **Matching semântico**: LLM descreve a imagem e compara com blocos de texto

---

### 2.4 Branding Preservation Module

| Campo | Descrição |
|---|---|
| **Função** | Extrair e preservar identidade visual do material original (cores, estilo, composição) |
| **Entrada** | Assets extraídos (imagens) + páginas renderizadas |
| **Saída** | `BrandingProfile` (paleta de cores, estilo visual, padrão de composição) |
| **Dependências** | Asset Extraction Module, adapters LLM (visão) |
| **Risco técnico** | **Médio** — Extração de cores é confiável; classificação de estilo depende de LLM; tipografia é aproximação |
| **Prioridade** | **P1** — Importante mas não bloqueia geração básica |

**Tecnologias sugeridas**: `sharp` (análise de cor), `color-thief`, LLM Vision (classificação de estilo)

---

### 2.5 Source Intelligence Module

| Campo | Descrição |
|---|---|
| **Função** | Classificar conteúdo correlacionado em tipos de fonte (hero, lifestyle, planta, etc.) e calcular score |
| **Entrada** | Correlações texto-imagem + branding |
| **Saída** | `Source[]` — fontes estruturadas com tipo, título, descrição, imagens, tags, confidence |
| **Dependências** | Correlation Module, Branding Module, adapters LLM |
| **Risco técnico** | **Médio** — Classificação depende de LLM; pode haver ambiguidade entre tipos |
| **Prioridade** | **P0** — Fontes são o modelo central do sistema |

**Tipos de fonte**: hero, lifestyle, diferencial, infraestrutura, planta, comparativo, investimento, CTA, institucional, editorial

---

### 2.6 Narrative Generation Module

| Campo | Descrição |
|---|---|
| **Função** | Gerar narrativas textuais a partir das fontes, parametrizadas por tipo e tom |
| **Entrada** | `Source[]` + `BrandingProfile` |
| **Saída** | Narrativas indexadas por `sourceId + tipo` (comercial, editorial, social, descritiva) |
| **Dependências** | Source Intelligence Module, adapters LLM |
| **Risco técnico** | **Baixo** — Geração de texto via LLM é madura; risco é qualidade/tom inadequado |
| **Prioridade** | **P1** — Necessário para outputs textuais (blog, landing page, captions) |

---

### 2.7 Output Selection Module

| Campo | Descrição |
|---|---|
| **Função** | Decidir quais formatos gerar com base na disponibilidade e qualidade dos assets e fontes |
| **Entrada** | `Source[]` + `BrandingProfile` + configuração do usuário |
| **Saída** | `OutputFormat[]` — lista de formatos a gerar |
| **Dependências** | Source Intelligence Module, Narrative Module |
| **Risco técnico** | **Baixo** — Lógica determinística baseada em regras |
| **Prioridade** | **P2** — No MVP, gerar todos os formatos possíveis; seleção inteligente vem depois |

---

### 2.8 Media Generation Module

| Campo | Descrição |
|---|---|
| **Função** | Gerar os arquivos finais de mídia (vídeo, imagem, áudio, texto, web, slides) |
| **Entrada** | `Source[]` + narrativas + `BrandingProfile` + `OutputFormat[]` |
| **Saída** | `GeneratedOutput[]` — arquivos gerados com metadados |
| **Dependências** | Todos os módulos anteriores; adapters `video/`, `audio/`, `storage/` |
| **Risco técnico** | **Alto** — Geração de vídeo/áudio é complexa; qualidade visual depende de templates; processamento pesado |
| **Prioridade** | **P0 (imagens)**, **P1 (vídeo/áudio)**, **P2 (web/slides)** |

**Sub-geradores**:
| Sub-módulo | Output | Tecnologia |
|---|---|---|
| ImageGen | Posts, carrosséis | `sharp`, `canvas`, templates HTML→imagem |
| VideoGen | Reels, stories, vídeos curtos/longos | `ffmpeg`, `remotion` |
| AudioGen | Monólogo, podcast | TTS API (OpenAI, ElevenLabs) |
| TextGen | Blog, artigos | LLM + Markdown |
| WebGen | Landing pages | Templates HTML + dados dinâmicos |
| SlideGen | Apresentações | `pptxgenjs` |

---

### 2.9 User Personalization Module

| Campo | Descrição |
|---|---|
| **Função** | Aplicar logo, CTA e dados do corretor nos outputs gerados |
| **Entrada** | `GeneratedOutput[]` + `UserContext` (logo, nome, WhatsApp, etc.) |
| **Saída** | Outputs atualizados com personalização aplicada |
| **Dependências** | Media Generation Module |
| **Risco técnico** | **Baixo** — Overlay de logo e injeção de texto são operações determinísticas |
| **Prioridade** | **P1** — Essencial para valor comercial, mas não bloqueia geração base |

---

## 3. Grafo de Dependências

```
Ingestion (P0)
    │
    ├──▶ Asset Extraction (P0)
    │         │
    │         ├──▶ Text-Image Correlation (P0)
    │         │         │
    │         │         ├──▶ Branding Preservation (P1)
    │         │         │         │
    │         │         └──▶ Source Intelligence (P0)
    │         │                   │
    │         │                   ├──▶ Narrative Generation (P1)
    │         │                   │         │
    │         │                   └──▶ Output Selection (P2)
    │         │                             │
    │         │                             ▼
    │         └─────────────────────▶ Media Generation (P0-P2)
    │                                       │
    │                                       ▼
    └──────────────────────────────▶ Personalization (P1)
```

---

## 4. Comunicação Entre Módulos

### Padrão: Pipeline Sequencial com Context Object

Cada módulo recebe um `PipelineContext`, enriquece-o com seus resultados e passa adiante.

```typescript
interface PipelineContext {
  jobId: string;
  input: JobInput;
  extractedText?: string;        // Ingestion
  assets?: SourceAsset[];         // Asset Extraction
  correlations?: Map<string, string>; // Correlation
  branding?: BrandingProfile;     // Branding
  sources?: Source[];             // Source Intelligence
  narratives?: Record<string, string>; // Narrative
  selectedOutputs?: OutputFormat[];    // Output Selection
  outputs?: GeneratedOutput[];    // Media Generation
  // Personalization modifica outputs in-place
}
```

### Evolução Futura: Event-Driven

```
Job Created → [Queue] → Ingestion Worker
                              ↓
                    Ingestion Complete → [Queue] → Extraction Worker
                                                          ↓
                                              Extraction Complete → [Queue] → ...
```

**Tecnologias futuras**: BullMQ (Redis), RabbitMQ, ou AWS SQS

---

## 5. Tecnologias por Camada

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Runtime** | Node.js 20+ | Ecossistema rico para I/O assíncrono |
| **Linguagem** | TypeScript 5.6+ | Tipagem forte para sistema complexo |
| **API** | Express | Simplicidade; migração futura para Fastify se necessário |
| **Validação** | Zod | Runtime validation + inferência de tipos |
| **PDF** | pdf-parse + pdfjs-dist | Texto + renderização com fallback |
| **Imagem** | Sharp | Redimensionamento, thumbnails, análise de cor |
| **Vídeo** | FFmpeg (via fluent-ffmpeg) | Composição, encoding, redimensionamento |
| **Áudio** | OpenAI TTS / ElevenLabs | Text-to-speech de qualidade |
| **LLM** | OpenAI GPT-4 / Gemini Pro | Classificação, narrativas, correlação semântica |
| **Visão** | GPT-4 Vision / Gemini Vision | Classificação de imagens, análise de branding |
| **Filas** | BullMQ (futuro) | Processamento assíncrono distribuído |
| **Storage** | Local → S3 | Arquivos de assets e outputs |
| **Slides** | pptxgenjs | Geração programática de PPTX |
| **Testes** | Vitest | Rápido, TypeScript nativo |

---

## 6. Resumo de Prioridades

| Prioridade | Módulos | Fase |
|---|---|---|
| **P0** | Ingestion, Asset Extraction, Correlation, Source Intelligence, Media (imagens) | MVP 1 |
| **P1** | Branding, Narrative, Personalization, Media (vídeo/áudio) | MVP 2 |
| **P2** | Output Selection, Media (web/slides), Dashboard | Pós-MVP |

---

*Documento gerado como Parte 2 — Arquitetura do Sistema.*
*Versão: 1.0 | Data: 2026-04-03*
