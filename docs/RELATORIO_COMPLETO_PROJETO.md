# BookAgent Intelligence Engine — Relatorio Completo do Projeto

**Data:** 16 de Abril de 2026
**Versao:** 0.2.0
**Autor:** Douglas Bonanzza / DB8 Intelligence
**Repo:** github.com/DB8-Intelligence/BookAgent-Intelligence-Engine
**Stack:** Node.js 20 + TypeScript + Next.js 14 + Supabase + BullMQ

---

## 1. FILOSOFIA DO PROJETO

### 1.1 Visao Geral

BookAgent e um SaaS B2B que transforma materiais imobiliarios (PDFs de empreendimentos, videos, audios, apresentacoes) em conteudo de marketing multimodal — reels com narracao TTS, carrosseis, stories, landing pages, blog posts e podcasts — preservando a identidade visual do corretor.

O problema que resolve: corretores de imoveis gastam 4-6 horas por empreendimento criando posts manualmente, contratam designers para cada imovel, e publicam 1x por semana. BookAgent automatiza esse processo em minutos.

### 1.2 Principios Arquiteturais

**Domain-Driven Design (DDD) Modular:**
- Cada modulo e independente, implementa a interface `IModule`
- Estado compartilhado via `ProcessingContext` (imutavel entre modulos)
- Orquestrador executa modulos em sequencia definida pelo pipeline
- Zero acoplamento entre modulos — comunicacao apenas via context

**Asset Immutability:**
- Assets extraidos do material original sao IMUTAVEIS
- A IA pode extrair, classificar, correlacionar, referenciar e prototipar
- Nunca pode alterar, retocar, reconstruir ou substituir o conteudo original
- Composicoes visuais (overlays, textos, branding) usam camada separada

**Feature Flags + Graceful Degradation:**
- Funcionalidades novas controladas por env vars
- `ENHANCED_EXTRACTION=true` — extracao geometrica via pdfjs-dist
- `POI_DETECTION_METHOD=clip` — ML-based POI detection
- Fallback cascade: ML -> heuristico -> center (0.5, 0.5)
- Pipeline nunca quebra — degrada graciosamente

**Pure Functions First:**
- Modulos de processamento sao funcoes puras (sem I/O, sem side effects)
- Facilita teste, composicao e paralelismo
- I/O confinado a adapters e persistence layer

### 1.3 Pipeline de 17 Estagios

```
 1. Ingestion          — Recebe e valida input (PDF, video, audio)
 2. Book Analysis      — Analisa compatibilidade e estrutura do material
 3. Reverse Engineering — Analisa layout, margens, tipografia
 4. Asset Extraction   — Extrai imagens, renderiza paginas (PNG 300dpi + SVG)
 5. Branding           — Extrai paleta de cores, fontes, estilo visual
 6. Correlation        — Correlaciona texto com assets (espacial + semantico)
 7. Source Intelligence — Ranqueia e deduplica fontes de conteudo
 8. Narrative          — Gera narrativa estruturada (hook, clusters, CTA)
 9. Output Selection   — Decide quais formatos gerar (reel, blog, LP)
10. Media Generation   — Gera storyboard, cenas, FFmpeg commands
11. Blog               — Gera plano de blog com SEO
12. Landing Page       — Gera estrutura de landing page
13. Personalization    — Personaliza conteudo por perfil do usuario
14. Content Scoring    — Avalia qualidade do conteudo gerado
15. Render Export      — Exporta em multiplos formatos (HTML, MP4, PDF)
16. Delivery           — Entrega ao usuario (download, preview)
17. Performance        — Monitora custos, latencia, qualidade
```

### 1.4 Multi-Tenant SaaS

```
Planos:
  Starter — R$ 47/mes (1 book/mes)
  Pro     — R$ 97/mes (3 books/mes)
  Agency  — R$ 247/mes (10 books/mes)

Isolamento:
  - RLS (Row Level Security) no Supabase
  - Tenant context resolvido por middleware em cada request
  - Feature flags por plano (plan-guard middleware)
  - Rate limiting por tenant
```

---

## 2. ESTRUTURA COMPLETA DO PROJETO

### 2.1 Metricas Gerais

| Metrica | Valor |
|---------|-------|
| Arquivos TypeScript (src/) | 446 |
| Modulos independentes (src/modules/) | 55+ subdiretorios |
| Entidades de dominio | 64 interfaces |
| Controllers de API | 41 |
| Rotas de API | 25+ |
| Middleware | 5 |
| Adapters (AI, PDF, TTS, Storage) | 15 |
| Renderers (Blog, LP, Video) | 12 |
| Migrations Supabase | 12 |
| Testes | 18 arquivos, 160+ tests |
| Paginas Next.js | 19 |
| Componentes React | 14 |
| Documentacao | 40+ arquivos |
| Linhas de codigo estimadas | ~50.000+ |

### 2.2 Camadas da Arquitetura

```
+--------------------------------------------------+
|                   FRONTEND                        |
|  Next.js 14 + Tailwind + Radix UI + Supabase RT  |
|  19 pages, 14 components, 1 hook, 5 lib files    |
+--------------------------------------------------+
|                    API LAYER                      |
|  Express + 25 routes + 41 controllers + 5 midw   |
|  JWT Auth + Tenant Guard + Plan Guard + Rate Limit|
+--------------------------------------------------+
|                 CORE / PIPELINE                   |
|  Orchestrator -> Pipeline -> 17 Modules (IModule) |
|  ProcessingContext (state) + JobManager           |
+--------------------------------------------------+
|                   DOMAIN                          |
|  64 entities + 8 interfaces + 2 policies          |
|  Value Objects (SourceType, Dimensions, etc.)     |
+--------------------------------------------------+
|               MODULES (55+ subdirs)               |
|  Asset Extraction, Correlation, Narrative,        |
|  Media, Blog, Landing Page, Branding, Scoring,    |
|  Billing, Campaigns, Analytics, Insights, ...     |
+--------------------------------------------------+
|                  ADAPTERS                         |
|  AI: Anthropic + OpenAI + Gemini                  |
|  PDF: Poppler + pdfjs-dist enhanced               |
|  TTS: OpenAI TTS + ElevenLabs                     |
|  Storage: Supabase + Local                        |
+--------------------------------------------------+
|                PERSISTENCE                        |
|  Supabase (Postgres + RLS + Auth)                 |
|  BullMQ + Redis (async job processing)            |
|  12 migrations                                    |
+--------------------------------------------------+
|               OBSERVABILITY                       |
|  Cost Tracker + Metrics + Queue Health            |
|  Growth Phase Detection                           |
+--------------------------------------------------+
```

### 2.3 Modulos do Pipeline Registrados (17)

| # | Modulo | Funcao | Status |
|---|--------|--------|--------|
| 1 | Ingestion | Recebe e valida input | Implementado |
| 2 | Book Compatibility Analysis | Analisa estrutura do PDF | Implementado |
| 3 | Book Reverse Engineering | Layout, margens, tipografia | Implementado |
| 4 | Asset Extraction | Extrai imagens + geometria PDF | Implementado + Enhanced |
| 5 | Branding | Paleta de cores, fontes, estilo | Implementado |
| 6 | Correlation | Texto-asset matching espacial | Implementado + Spatial |
| 7 | Source Intelligence | Ranqueia e deduplica fontes | Implementado |
| 8 | Narrative | Gera narrativa estruturada | Implementado |
| 9 | Output Selection | Decide formatos a gerar | Implementado |
| 10 | Media Generation | Storyboard + cenas + FFmpeg | Implementado |
| 11 | Blog | Plano de blog com SEO | Implementado |
| 12 | Landing Page | Estrutura de landing page | Implementado |
| 13 | Personalization | Personaliza por perfil | Implementado |
| 14 | Content Scoring | Avalia qualidade | Implementado |
| 15 | Render Export | Exporta em multiplos formatos | Implementado |
| 16 | Delivery | Entrega ao usuario | Stub |
| 17 | Performance | Monitora custos e latencia | Implementado |

### 2.4 Modulos de Suporte (38+ adicionais)

| Area | Arquivos | Funcao |
|------|----------|--------|
| Billing | 6 | Subscription, usage, limits, Hotmart, Kiwify providers |
| Campaigns | 8 | Builder, manager, execution, optimization |
| Analytics | 2 | KPIs, trend analysis |
| Insights | 3 | Recomendacoes acionaveis |
| Experiments | 3 | A/B testing, variant management |
| Knowledge Graph | 4 | Graph reasoning, relationships |
| Copilot | 3 | AI assistant, advisory |
| Governance | 3 | Compliance, quotas, policies |
| Recovery | 3 | Retry, fallback strategies |
| Explainability | 4 | Audit trail, trust score |
| Learning | 4 | Signal collection, rule engine |
| Memory | 3 | Tenant context, consolidation |
| Simulation | 3 | Impact estimation, scenarios |
| Decision Intelligence | 3 | Publish/iterate/archive decisions |
| Meta Optimization | 3 | System improvement proposals |
| Distribution | 2 | Multi-channel delivery |
| Partners | 2 | Revenue sharing |
| Integration Hub | 2 | Third-party management |
| Template Marketplace | 3 | Template catalog, styles |
| Tenant | 2 | Multi-tenant management |

### 2.5 API (62+ endpoints)

Principais rotas:

```
POST /api/v1/process                   — Iniciar processamento
GET  /api/v1/jobs                      — Listar jobs
GET  /api/v1/jobs/:jobId               — Detalhe do job
GET  /api/v1/jobs/:jobId/artifacts     — Artifacts do job
POST /api/v1/jobs/:jobId/approve       — Aprovar conteudo
POST /api/v1/jobs/:jobId/publish       — Publicar
POST /api/v1/leads/register            — Registrar lead
GET  /api/v1/dashboard/overview        — Dashboard overview
GET  /api/v1/dashboard/jobs            — Jobs do dashboard
GET  /api/v1/dashboard/analytics       — Analytics
GET  /api/v1/ops/dashboard             — Dashboard operacional
GET  /api/v1/ops/costs                 — Analise de custos
+ 50 endpoints adicionais (billing, campaigns, analytics,
  insights, experiments, governance, copilot, etc.)
```

### 2.6 Frontend (Next.js 14)

| Area | Paginas | Status |
|------|---------|--------|
| Landing Page | /, /landing, /planos | Implementado |
| Upload | /upload | Implementado |
| Pipeline Viz | /pipeline/[jobId] | Implementado |
| Outputs | /outputs/[jobId] | Implementado |
| Dashboard Home | /dashboard | Implementado |
| Jobs List | /dashboard/jobs | Implementado + Realtime |
| Job Detail | /dashboard/jobs/[jobId] | Implementado |
| Analytics | /dashboard/analytics | Implementado |
| Campaigns | /dashboard/campaigns | Implementado |
| Publications | /dashboard/publications | Implementado |
| Billing | /dashboard/billing | Implementado |
| Usage | /dashboard/usage | Implementado |
| Insights | /dashboard/insights | Implementado |

### 2.7 Banco de Dados (12 migrations)

```
000 — Schema consolidado (referencia)
001-007 — Core: jobs, artifacts, users, tenants, publications
008 — Webhook events (Hotmart/Kiwify)
009 — Planos starter/pro/agency
010 — Book editorial pipeline
011 — Book manuscript artifact types
012 — Asset geometry e fidelidade visual
```

---

## 3. O QUE JA FOI DESENVOLVIDO

### 3.1 Sprint 1 — Fundacao

- Pipeline de 17 estagios completo com orchestrator
- Extracao de assets basica via Poppler (pdftoppm + pdftocairo)
- Correlacao por pagina (heuristica page-proximity)
- Narrativa baseada em templates por topico
- Branding (extracao de cores dominantes via sharp)
- Blog, Landing Page, Media plan builders
- API REST completa (62+ endpoints)
- Dashboard frontend (10 paginas com KPIs, jobs, analytics)
- Billing (Hotmart + Kiwify webhooks)
- Multi-tenant (RLS + tenant guard + plan guard)
- BullMQ queue para processamento async
- Deploy Railway (backend) + Vercel (frontend)
- 98 testes base

### 3.2 Sprint 2 — Enhanced Pipeline (9 PRs merged)

**PR #1 — 13 modulos novos (+9938 linhas):**

Extracao Enhanced:
- geometry.ts — Tipos PDF coordinates (CTM, x, y, width, height, zIndex)
- pdfjs-enhanced.ts — Operator list parsing via pdfjs-dist
- color-manager.ts — CMYK->sRGB normalization com ICC profiles
- extractor.ts — Strategy 'enhanced-extraction' (feature flag)
- service.ts — ENHANCED_EXTRACTION=true wiring

Correlacao Espacial:
- proximity-calculator.ts — Collision/adjacent/contextual scoring
- page-correlator.ts — elevateBlocksWithSpatialMatch() (never downgrades)
- crop-logic.ts — VideoGeometry.calculateSafeCrop() (9:16 com POI)
- scene-composer-enhanced.ts — Z-Index ordering + motion profiles

Narrativa + Video:
- poi-detector.ts — Edge detection + color variance (heuristico)
- narrative-engine.ts — Semantic clustering (showcase/lifestyle/details/cta)
- storyboard-builder.ts — Frames + safe crop + timing (4s hook, 2-8s demais)
- ffmpeg-storyboard-renderer.ts — Ken Burns zoompan + concat filter

**PR #2 — Staging Validation (22 testes E2E)**
**PR #3 — Threshold Calibration (elevation 50% -> 100%)**
**PR #4 — Visual Validation (20 testes: crop, FFmpeg, storyboard)**
**PR #5 — Gemini Audit Phase 2 (documentacao completa)**
**PR #6 — Full FFmpeg Render + concat fix (bug fix real)**
**PR #7 — Supabase Realtime (dashboard live updates)**
**PR #8 — CLIP POI Detection (@huggingface/transformers)**
**PR #9 — Wire CLIP into Pipeline (feature flag POI_DETECTION_METHOD)**

### 3.3 Metricas de Qualidade Atuais

| Metrica | Valor |
|---------|-------|
| Testes totais | 160+ (18 suites) |
| Testes E2E | 62 (4 suites) |
| TypeScript errors | 0 |
| Build backend | Passing |
| Build frontend | Passing |
| FFmpeg render | Validado (H.264, 1080x1920, 30fps, 9.4s) |
| POI accuracy (heuristic) | ~70% estimado |
| POI accuracy (CLIP) | ~90%+ estimado (precisa ground truth) |
| Spatial elevation rate | 100% (com dados completos) |
| Ken Burns | Validado (zoompan com POI focus) |

---

## 4. O QUE FALTA SER IMPLEMENTADO

### 4.1 Prioridade ALTA (Bloqueadores para producao)

| Item | Descricao | Estimativa |
|------|-----------|------------|
| Private Beta Setup | Middleware auth, invite codes, waitlist page, email | 3-4h |
| Auth Integration | Supabase Auth no frontend (login/signup/session) | 4-6h |
| CLIP Ground Truth | 20+ imagens reais para validar >85% accuracy | 2-3h |
| Env Vars Producao | Configurar Railway + Vercel com todas env vars | 1-2h |
| Migrations Producao | Aplicar 010-012 no Supabase producao | 30min |

### 4.2 Prioridade MEDIA (MVP completo)

| Item | Descricao | Estimativa |
|------|-----------|------------|
| A/B Testing | Variants 50/50, metricas por variant | 2-3h |
| Sentry | Monitoramento de erros em producao | 1-2h |
| TTS Integration | Narracao via OpenAI TTS ou ElevenLabs | 3-4h |
| WhatsApp Funnel | Receber PDF via WhatsApp, retornar conteudo | 4-6h |
| Email Notifications | Notificar usuario quando job completa | 2-3h |
| Social Publishing | Meta Graph API real para IG/FB | 3-4h |

### 4.3 Prioridade BAIXA (Post-MVP)

| Item | Descricao | Estimativa |
|------|-----------|------------|
| LLM Narrative | Claude/Gemini para clustering semantico | 4-6h |
| Multi-format | 4:5, 1:1, 16:9 alem de 9:16 | 2-3h |
| Music Background | Selecao automatica de musica | 3-4h |
| Ken Burns Easing | Ease-in/ease-out no zoompan | 1-2h |
| Video Transitions | Fade/dissolve entre frames | 2-3h |
| Manual POI Override | UI para ajustar POI | 3-4h |
| AI Voiceover | ElevenLabs + Claude narracao | 4-6h |
| Template Marketplace | Marketplace de templates | 6-8h |
| Partner API | API para integradores | 4-6h |
| Podcast Output | Podcast a partir de narrativa | 4-6h |

### 4.4 Infraestrutura Pendente

| Item | Status | Acao |
|------|--------|------|
| Railway Backend | Deploy OK | Configurar env vars Sprint 2 |
| Vercel Frontend | Build OK | Configurar NEXT_PUBLIC_SUPABASE_* |
| Supabase | Projeto criado | Aplicar migrations 010-012 |
| Redis | Configurado | OK |
| CodeQL | Running | Revisar security findings |
| Sentry | Nao configurado | Criar projeto + DSN |
| Evolution API | Configurado | Testar WhatsApp E2E |

---

## 5. DECISOES TECNICAS IMPORTANTES

### 5.1 DDD Modular (55+ modulos)
Cada modulo pode ser testado isoladamente. Novos modulos adicionados sem tocar existentes. Pipeline configuravel. Facilita paralelismo futuro.

### 5.2 Feature Flags
- ENHANCED_EXTRACTION: rollback se extracao geometrica falhar
- POI_DETECTION_METHOD: CLIP experimental, fallback seguro
- SOCIAL_PUBLISH_MODE=mock: testa sem tocar Meta API
- Zero risk: novas features desligadas por default

### 5.3 CLIP ao inves de modelo customizado
Zero training (zero-shot classification). Roda em Node.js sem GPU. Prompts customizaveis para real estate. Modelo pre-treinado 350MB com cache. Accuracy esperada 90%+.

### 5.4 FFmpeg local ao inves de cloud
Zero custo de API. Controle total sobre filtros e qualidade. Ken Burns via zoompan com POI. Shotstack disponivel como fallback (adapter ja implementado).

### 5.5 Supabase Realtime
Dashboard atualiza em <1s sem polling. Postgres Changes (INSERT/UPDATE/DELETE). Fallback para polling 30s. Zero config adicional.

---

## 6. STACK TECNOLOGICA

| Camada | Tecnologia |
|--------|------------|
| Backend Runtime | Node.js 20 LTS |
| Backend Framework | Express 4.x |
| Language | TypeScript (strict mode) |
| Queue | BullMQ + Redis |
| Database | Supabase (PostgreSQL 15 + PostgREST + Auth + RLS) |
| AI Text | Anthropic Claude + OpenAI GPT-4 + Google Gemini |
| AI Vision | CLIP (Xenova/clip-vit-base-patch32) |
| TTS | OpenAI TTS + ElevenLabs |
| PDF | Poppler + pdfjs-dist |
| Image | Sharp |
| Video | FFmpeg (H.264, zoompan, concat) |
| Cloud Video | Shotstack API (fallback) |
| Storage | Supabase Storage + local |
| Frontend Framework | Next.js 14 (App Router) |
| Frontend Styling | Tailwind CSS 3.4 |
| Frontend Components | Radix UI |
| Frontend Realtime | @supabase/supabase-js |
| Deploy Backend | Railway (Docker) |
| Deploy Frontend | Vercel |
| Payments | Hotmart + Kiwify |
| WhatsApp | Evolution API |
| Social | Meta Graph API v19 |
| Automation | n8n |
| CI/CD | GitHub Actions (CodeQL + tests) |

---

## 7. COMO RODAR

```bash
# Backend
npm install && npm run dev          # Porta 3000

# Frontend
cd web && npm install && npm run dev  # Porta 3001

# Worker (async)
npm run worker

# Testes
npm test             # 160+ testes

# Build
npm run build        # Backend (tsc)
cd web && npm run build  # Frontend (Next.js)
```

---

## 8. PERGUNTAS PARA O ESPECIALISTA

1. O DDD modular com 55+ modulos e sustentavel? Como simplificar sem perder flexibilidade?
2. 17 estagios de pipeline — muito granular ou correto?
3. CLIP 3x3 grid e a melhor abordagem para POI em real estate?
4. FFmpeg local vs cloud rendering — qual escala melhor para SaaS B2B?
5. 160 testes mas muitos sinteticos. Qual estrategia de cobertura recomenda?
6. Hotmart/Kiwify vs Stripe para billing. Migrar agora ou depois?
7. RLS no Supabase e suficiente para multi-tenant ou precisa mais?
8. Prioridade: Beta -> CLIP validation -> A/B -> Production. Correto?
9. 446 arquivos TS em src/ — sinais de over-engineering? O que cortar?
10. Pipeline sincrono (17 modulos em serie) vs async (modulos paralelos) — quando mudar?

---

**9 PRs merged. 160+ testes. Pipeline E2E validado com FFmpeg real.**
**Proximo: Private Beta com 5-10 corretores reais.**
