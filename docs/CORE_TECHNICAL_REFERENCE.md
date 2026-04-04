# BookAgent Intelligence Engine — Core Technical Reference

> Estado: **Core Finalizado — Pronto para Integração**
> Versão: 0.2.0
> Data: 2026-04-04

---

## 1. Arquitetura Geral

```
                         ┌──────────────┐
                         │  Express API │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │ Orchestrator │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │   Pipeline   │ ← 15 estágios sequenciais
                         └──────┬───────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
         ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
         │   Modules   │ │   Domain   │ │  Adapters   │
         │  (15 IModule)│ │ (entities, │ │ (AI, PDF,   │
         │             │ │  policies) │ │  TTS, etc.) │
         └─────────────┘ └────────────┘ └─────────────┘
```

**Stack**: Node.js 20+ / TypeScript 5.6 / ESM / Express / Vitest

---

## 2. Pipeline — 15 Estágios

| # | Stage | Módulo | Lê do Contexto | Escreve no Contexto |
|---|-------|--------|----------------|---------------------|
| 1 | `ingestion` | IngestionModule | `input` | `extractedText`, `pageTexts`, `localFilePath` |
| 2 | `book_analysis` | BookCompatibilityAnalysisModule | `localFilePath`, `pageTexts` | `bookCompatibility` |
| 3 | `reverse_engineering` | BookReverseEngineeringModule | `pageTexts`, `assets` | `bookPrototype` |
| 4 | `extraction` | AssetExtractionModule | `localFilePath`, `bookCompatibility` | `assets` |
| 5 | `branding` | BrandingModule | `assets` | `branding` |
| 6 | `correlation` | CorrelationModule | `pageTexts`, `assets` | `correlations`, `assets` (correlationIds) |
| 7 | `source_intelligence` | SourceIntelligenceModule | `correlations`, `branding` | `sources` |
| 8 | `narrative` | NarrativeModule | `sources` | `narratives` |
| 9 | `output_selection` | OutputSelectionModule | `narratives`, `sources`, `assets` | `selectedOutputs` |
| 10 | `media_generation` | MediaGenerationModule | `selectedOutputs`, `narratives`, `sources`, `assets`, `branding`, `bookPrototype` | `mediaPlans`, `outputs` |
| 11 | `blog` | BlogModule | `selectedOutputs`, `narratives`, `sources` | `blogPlans` |
| 12 | `landing_page` | LandingPageModule | `selectedOutputs`, `narratives`, `sources`, `branding`, `bookPrototype` | `landingPagePlans` |
| 13 | `personalization` | PersonalizationModule | `input.userContext`, `mediaPlans`, `blogPlans`, `landingPagePlans` | `personalization` |
| 14 | `render_export` | RenderExportModule | `mediaPlans`, `blogPlans`, `landingPagePlans` | `exportResult` |
| 15 | `delivery` | DeliveryModule | `exportResult` | `deliveryResult` |

**Ordem importante**: Branding executa ANTES de Correlation (estágio 5 antes do 6) para que o contexto de branding esteja disponível para enriquecer as correlações.

---

## 3. ProcessingContext

Objeto central que flui por todo o pipeline. Cada módulo recebe o contexto, enriquece-o e devolve.

```typescript
interface ProcessingContext {
  readonly jobId: string;
  readonly input: JobInput;

  // Ingestion
  extractedText?: string;
  pageTexts?: Array<{ pageNumber: number; text: string }>;
  localFilePath?: string;

  // Book Analysis
  bookCompatibility?: BookCompatibilityProfile;

  // Reverse Engineering
  bookPrototype?: BookPrototype;

  // Extraction
  assets?: Asset[];

  // Correlation
  correlations?: CorrelationBlock[];

  // Branding
  branding?: BrandingProfile;

  // Source Intelligence
  sources?: Source[];

  // Narrative
  narratives?: NarrativePlan[];

  // Output Selection
  selectedOutputs?: OutputDecision[];

  // Media / Blog / Landing Page
  mediaPlans?: MediaPlan[];
  blogPlans?: BlogPlan[];
  landingPagePlans?: LandingPagePlan[];
  outputs?: GeneratedOutput[];

  // Personalization
  personalization?: PersonalizationResult;

  // Audio (opcional)
  audioResult?: AudioGenerationResult;

  // Render/Export
  exportResult?: ExportResult;

  // Delivery
  deliveryResult?: DeliveryResult;

  // Pipeline logs
  executionLogs?: ModuleExecutionLog[];
}
```

---

## 4. Política de Asset Immutability

**Regra fundamental**: Assets originais são IMUTÁVEIS.

### Operações permitidas
- `read` — ler metadados e conteúdo
- `classify` — classificar semanticamente
- `correlate` — associar a blocos de texto
- `reference` — referenciar por ID em planos
- `compose-layer` — compor em camada separada
- `thumbnail` — gerar thumbnail como arquivo separado
- `hash` — calcular hash para deduplicação
- `metadata` — ler dimensões, formato
- `position` — posicionar em layout

### Operações proibidas
- `modify` — alterar bytes do original
- `overwrite` — sobrescrever no storage
- `enhance` — aplicar IA generativa
- `replace` — substituir por versão gerada
- `crop` — recorte destrutivo
- `resize` — redimensionar original
- `recolor` — alterar cores do original
- `remove-elements` — remover partes da imagem

### Composição segura (CompositionSpec)
```
┌─────────────────────────────┐
│  Layer 3: Branding Overlay  │ ← logo, watermark
│  Layer 2: Text Overlay      │ ← headline, CTA
│  Layer 1: Visual Effect     │ ← gradiente, vinheta
│  Layer 0: Base Asset (READ) │ ← asset original INTACTO
└─────────────────────────────┘
```

O renderizador gera um `DerivedOutput` (novo arquivo). O original nunca é tocado.

Validação: `assertAssetImmutable()`, `validateCompositionLayers()`, `assertOperationAllowed()`

---

## 5. Extraction Strategy (Book Compatibility → Asset Extraction)

O módulo de Book Compatibility Analysis analisa a estrutura do PDF e recomenda uma estratégia:

| Estratégia | Quando usar | Comportamento |
|------------|-------------|---------------|
| `embedded-extraction` | PDF com imagens embutidas separáveis | Extrai streams de imagem diretamente |
| `page-render` | Páginas rasterizadas inteiras | Renderiza cada página como snapshot |
| `hybrid` | Mix de embutidos + compostos | Extrai embutidos + renderiza o restante |
| `manual-review` | Estrutura muito ambígua | Sinaliza para revisão humana |

O Asset Extraction module lê `context.bookCompatibility.recommendedStrategy` e adapta sua abordagem.

---

## 6. BookPrototype (Reverse Engineering → Composição)

O BookPrototype é gerado pelo módulo de Reverse Engineering e influencia:
- **Media**: layout hint baseado no design mode (image-first → full-bleed, text-first → overlay)
- **Landing Page**: ordem de seções, estilo de background, tamanho de headlines
- **Composição**: padrões visuais dominantes guiam a composição

```typescript
interface BookPrototype {
  pageCount: number;
  layoutPatterns: LayoutPattern[];
  designHierarchy: DesignHierarchy;
  consistencyScore: number;
  archetypeDistribution: Record<string, number>;
}
```

---

## 7. Testes

| Arquivo | Testes | Cobertura |
|---------|--------|-----------|
| `tests/core/pipeline.test.ts` | 6 | Pipeline execution, ordering, error handling |
| `tests/core/pipeline-stages.test.ts` | 5 | 15-stage order, branding before correlation |
| `tests/core/orchestrator.test.ts` | 4 | Job lifecycle, error propagation |
| `tests/core/context.test.ts` | 5 | Context creation, immutability |
| `tests/modules/source-intelligence.test.ts` | 16 | Source building, ranking, merging |
| `tests/modules/narrative.test.ts` | 8 | Narrative planning, beat generation |
| `tests/modules/output-selection.test.ts` | 7 | Feasibility evaluation, prioritization |
| `tests/modules/personalization.test.ts` | 13 | Profile resolution, plan personalization |
| `tests/modules/asset-immutability.test.ts` | 10 | Policy validation, operation safety |
| `tests/modules/blog.test.ts` | 4 | Blog plan generation, stage correctness |
| `tests/modules/branding.test.ts` | 3 | Empty branding, format filtering |
| `tests/modules/correlation.test.ts` | 4 | Block correlation, asset linking |
| `tests/modules/delivery.test.ts` | 4 | Manifest building, status handling |

**Total: 89 testes, 13 arquivos, todos passando.**

---

## 8. Sample Run

```bash
npx tsx scripts/sample-run.ts
```

Executa o pipeline completo com fixture realista (Residencial Vista Verde, 10 páginas, 13 assets). Stubs para Ingestion, Extraction e Branding. Output em `storage/sample-run/`.

Resultado típico:
- 10 correlations → 10 sources → 10 narratives → 7 approved outputs
- 4 media plans + 1 blog plan + 1 landing page plan
- 13 export artifacts (68KB total)
- Delivery status: ready

---

## 9. Delivery / API Layer

### HTTP Endpoints (Express)
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/process` | Iniciar processamento |
| `GET` | `/api/v1/jobs` | Listar jobs |
| `GET` | `/api/v1/jobs/:jobId` | Detalhe do job |
| `GET` | `/api/v1/jobs/:jobId/sources` | Sources do job |
| `GET` | `/api/v1/jobs/:jobId/plans` | Planos do job |
| `GET` | `/api/v1/jobs/:jobId/artifacts` | Artifacts do job |
| `GET` | `/api/v1/jobs/:jobId/artifacts/:id/download` | Download do artifact |

### Delivery Module (Pipeline Stage 15)
O módulo de Delivery monta um manifesto de entrega a partir dos artifacts gerados:
- Status: `ready` | `partial` | `pending_upload` | `delivered` | `failed`
- Canais: `api` | `webhook` | `storage` | `email`
- Na fase atual: apenas canal `api` (sem upload externo ou webhooks)

---

## 10. Próximos Passos (Fase de Integração)

O core está pronto. A próxima fase é integração operacional:

1. **Adapters reais**: Conectar Anthropic/OpenAI para análise de imagem e geração de texto
2. **Storage externo**: Supabase/S3 para persistência de artifacts
3. **Queue/Workers**: n8n ou Bull para processamento assíncrono
4. **Deployment**: Railway/Docker para produção
5. **Webhooks**: Delivery module com notificação real
6. **MCP Server**: Expor tools para ecossistema (ImobCreator, DB8)
7. **Monitoring**: Logs estruturados, métricas, alertas

---

## 11. Estrutura de Diretórios

```
src/
├── core/           → Pipeline, Orchestrator, Context, JobManager
├── domain/
│   ├── entities/   → Asset, Source, Narrative, Blog, LP, Media, etc.
│   ├── interfaces/ → IModule, IAIAdapter, IPDFAdapter, ITTSAdapter
│   ├── policies/   → Asset Immutability Policy
│   └── value-objects/ → Enums, ColorPalette, Position, Dimensions
├── modules/        → 15 módulos do pipeline
│   ├── ingestion/
│   ├── book-compatibility-analysis/
│   ├── book-reverse-engineering/
│   ├── asset-extraction/
│   ├── branding/
│   ├── correlation/
│   ├── source-intelligence/
│   ├── narrative/
│   ├── output-selection/
│   ├── media/
│   ├── blog/
│   ├── landing-page/
│   ├── personalization/
│   ├── render-export/
│   └── delivery/
├── adapters/       → AI (Anthropic, OpenAI, Gemini), PDF, Storage, TTS
├── api/            → Controllers, Routes, Schemas, Middleware
├── renderers/      → Blog, LP, Media Storyboard, Video
├── generation/     → Text generators (blog, LP, media script)
├── product/        → SaaS plans, MCP contract, API spec
└── config/         → Environment configuration
```
