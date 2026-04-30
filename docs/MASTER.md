# BookAgent Intelligence Engine — Master Context

> Última atualização: 2026-04-25
> Identidade visual: **INTERMETRIX** — Arquitetos da Realidade
> Status: produção em Cloud Run, migração GCP-native concluída em 2026-04-22 → 25

---

## 1. Visão e Posicionamento

BookAgent é um **motor de inteligência editorial** que transforma materiais imobiliários brutos (PDFs de empreendimentos, vídeos, áudios, apresentações) num ecossistema completo de conteúdo de marketing — reels com narração TTS, carrosséis, stories, landing pages, blog posts SEO e podcast estilo NotebookLM — preservando a identidade visual e narrativa do corretor.

**Público:** corretores, imobiliárias e incorporadoras no Brasil.

**Posicionamento (landing pública):**
> "Envie o book. Receba o conteúdo. Aprove pelo WhatsApp. Distribua."
> Arquitetos da Realidade — paleta INTERMETRIX (Azul Profundo `#0A1E3F` + Dourado `#D4AF37` + Cream `#F9F6F0`), tipografia Playfair Display + Inter.

**Domínios:**
| URL | Papel |
|-----|-------|
| `bookreel.ai` | Landing pública (mesma página que `/`) |
| `bookreel.app` | Dashboard do cliente (`/dashboard`, `/upload`, `/pipeline`, `/outputs`) |

---

## 2. Arquitetura — Stack Google-Native (2026)

```
                      ┌─────────────────────────────────────┐
                      │         Cloud Run (unified)         │
                      │   Express + Next.js no mesmo proc   │
                      │   Porta 8080 — um container só      │
                      └─────────────────┬───────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
        ▼                               ▼                               ▼
┌──────────────┐              ┌──────────────────┐            ┌─────────────────┐
│ Firebase Auth│              │  Cloud Tasks     │            │  Vertex AI      │
│ (ID tokens)  │              │  bookagent-      │            │  (Gemini Ent.)  │
│              │              │  pipeline / video│            │  + multi-prov.  │
└──────┬───────┘              └────────┬─────────┘            └────────┬────────┘
       │                               │                               │
       ▼                               ▼                               ▼
┌──────────────┐              ┌──────────────────┐            ┌─────────────────┐
│  Firestore   │              │  Cloud Storage   │            │  FFmpeg local   │
│ profiles     │              │  (GCS public)    │            │  ultrafast      │
│ jobs         │              │  vídeos + assets │            │  (Shotstack     │
│ artifacts    │              │  servidos por URL│            │   opcional)     │
│ tenants      │              └──────────────────┘            └─────────────────┘
└──────────────┘
       │
       │ (bridge dual-write durante migração — ver §6)
       ▼
┌──────────────────────┐
│  Supabase (legado)   │   56 módulos ainda persistem aqui
│  bookagent_* tables  │   billing-legacy, analytics, admin, etc.
└──────────────────────┘
```

**Princípios operacionais:**
1. **Um processo, uma porta, um container.** Cloud Run faz autoscale; sem worker separado, sem Redis.
2. **Sync-mode default + Cloud Tasks async opt-in.** Se `CLOUD_TASKS_*` env vars estão setadas, jobs vão para fila; senão processa inline.
3. **Workload Identity em runtime** (sem `service-account.json` commitado). Em dev: `gcloud auth application-default login`.
4. **Secret Manager** para tudo que é secreto. Validação de presença em `/health`.
5. **SSE real-time** substituiu polling no dashboard.

---

## 3. Camadas e Responsabilidades

### Backend (`src/`)

| Camada | Diretório | Responsabilidade |
|--------|-----------|------------------|
| API | `src/api/routes/` | 44 route files Express. Autenticação Firebase + envelope `{ success, data?, error?, meta }` |
| Core | `src/core/` | `orchestrator.ts`, `pipeline.ts`, `task-orchestrator.ts`, `event-bus.ts`, `tenant-resolver.ts`, `context.ts` |
| Modules | `src/modules/` | 50+ bounded contexts DDD (ingestion, asset-extraction, branding, narrative, media, render-export, billing, …) |
| Adapters | `src/adapters/` | Vertex, Anthropic, OpenAI, Gemini, Poppler, FFmpeg, Shotstack, TTS, Storage |
| Persistence | `src/persistence/` | `google-persistence.ts` (Firestore), `supabase-client.ts` (legado), repositórios book-* (editorial) |
| Queue | `src/queue/` | `cloud-tasks.ts`, `queue.ts`, `job-processor.ts`, `video-queue.ts`, `video-processor.ts` |
| Generation | `src/generation/` | Orquestração de geração de conteúdo |
| Renderers | `src/renderers/` | HTML, JSON, Markdown, video spec-renderer |
| Config | `src/config/` | `secrets.ts` (Secret Manager bindings), env config |

### Frontend (`web/`)

| Rota | Função |
|------|--------|
| `/` | Landing luxury INTERMETRIX (Hero → Manifesto → Entrega → Processo → Planos → CTA) |
| `/landing` | Redirect para `/` (backward-compat) |
| `/login` `/register` | Firebase Auth (email + Google OAuth) |
| `/dashboard` | Painel inteligente: créditos + galeria de vídeos + status realtime via SSE |
| `/upload` | Upload de novo book (cria job) |
| `/pipeline` | Visualização do pipeline em tempo real (SSE) |
| `/outputs` | Artefatos gerados (reels, blog, LP, carrosséis, …) |
| `/planos` | Pricing (starter/pro/atelier) |
| `/admin` | Painel interno |

Stack frontend: Next.js 14 App Router, React 18, Tailwind, Radix UI. Servido **dentro do Express** no Cloud Run unified — sem Vercel.

---

## 4. Pipeline de Conteúdo (17 Estágios)

Pipeline síncrono executado em uma passada por `Orchestrator.process()`. `ProcessingContext` é mutável e transiente; estado final persiste em `jobs/{jobId}` (Firestore) + `artifacts/{artifactId}` (Firestore) + GCS para arquivos binários.

**Ordem (`STAGE_ORDER`):** ingestion → asset-extraction → branding → correlation → source-intelligence → narrative → output-selection → media → blog → landing-page → personalization → scoring → render-export → delivery → social-publishing → audio-subtitles → performance-monitoring.

**Renderização de vídeo:** FFmpeg ultrafast local é o caminho default. Shotstack permanece configurado como fallback cloud. Output MP4 sobe para GCS public bucket; URL pública é o canônico exposto pela galeria do dashboard.

---

## 5. Roadmap Editorial — Bounded Context Paralelo

Status: **em desenvolvimento ativo** (working tree, 2026-04-25, ainda uncommitted). Plano detalhado em `docs/book-production-integration-plan.md` + `docs/book-production-phase1-audit.md` + `docs/book-production-phase1-guide.md`.

### Por que separar do pipeline de 17 estágios

O orchestrator de conteúdo executa tudo numa única chamada. O fluxo editorial precisa **pausar por horas ou dias** entre steps para aprovação humana, **reexecutar** steps individuais (reescrever só um capítulo), e expor uma **state machine auditável** no banco. Forçar dentro do orchestrator quebraria os dois bounded contexts.

### Estratégia: bounded context novo, infra compartilhada

```
src/modules/book-editorial/      ── 7 step handlers
  ├── intake/
  ├── market-analysis/
  ├── theme-validation/
  ├── book-dna/
  ├── outline/
  ├── chapter-writing/
  └── editorial-qa/
src/modules/book-editorial/registry.ts  ── BookStepName → IBookStepHandler
src/persistence/book-*-repository.ts    ── 4 repos normalizados
src/services/visual-fidelity-validator.ts ── princípio "nenhum pixel sem rastreabilidade"
src/domain/entities/book-editorial*.ts
src/domain/entities/visual-fidelity.ts
src/domain/interfaces/book-step-handler.ts
```

### Fluxo

```
draft → queued → running → awaiting_approval ─┬─ approved (intermediário) → running (próximo step)
                                              ├─ approved (final) → completed
                                              ├─ rejected → cancelled
                                              └─ changes_requested → running (mesmo step, attempt+1)
```

Cada transição gera linha em `book_job_steps` (auditoria) ou `book_approval_rounds` (gates). Aprovação chega via WhatsApp/dashboard, decisão grava `decided_by` + `comment`.

### Modelagem (sem JSONB monolítico)

| Tabela | Papel | Por quê normalizada |
|--------|-------|---------------------|
| `book_jobs` | 1 linha por job editorial | `status`, `current_step`, `progress` queryable diretamente |
| `book_job_steps` | 1 linha por **tentativa** de cada step (UNIQUE `(job_id, step_name, attempt)`) | Re-execução parcial é first-class |
| `book_artifacts` | Outputs de cada step com `version` | Reescritas mantêm histórico |
| `book_approval_rounds` | Gates de aprovação humana | Filtrar `status='awaiting_approval' AND age > 24h` sem `jsonb_extract_path` |

JSONB existe apenas para payloads contínuos (`metadata` de input, `content` de artifact, `metrics` de step) — **nunca como estado de controle**.

### Próximos passos

1. Commit do bounded context (working tree atual)
2. Bridge para Firestore equivalente (decisão pendente: continuar Postgres-only ou migrar editorial para Firestore como o ecossistema principal)
3. UI de aprovação no dashboard + integração WhatsApp via n8n
4. Visual Fidelity Validator integrado ao pipeline de conteúdo (cross-context)

---

## 6. Tenants, Auth e Billing

### Modelo de identidade

Firebase Auth (ID token) é a fonte de verdade para o usuário final. Backend valida via Firebase Admin SDK (`google-persistence.ts`). Em Cloud Run, credentials chegam via Workload Identity — **nenhuma key file commitada**.

### Tenants

```
Firestore: tenants/{tenantId}
  ├── profile      ── nome, slug, branding, plan tier
  ├── credits       ── jobs e renders disponíveis (atômicos)
  └── members[]     ── uids autorizados (futuro: agência multi-usuário)
```

Para usuário solo, `tenantId === uid`. Para agência (Atelier), tenant agrupa múltiplos uids — preparado, não exposto ainda. Todo doc Firestore tem `tenantId` denormalizado; backend filtra `WHERE tenantId == authUser.tenantId` em todas as queries.

### Créditos atômicos

`firestore-billing.ts` faz check + consume numa única transação Firestore. Sem race condition entre dois jobs simultâneos. `checkJobAllowed(tenantId, count)` e `checkRenderAllowed(tenantId, count)` são as duas portas — se passa, decrementa; se não passa, retorna razão (saldo zerado, plano expirado, tier inválido).

### Webhooks de pagamento

Kiwify e Hotmart enviam webhooks que, hoje, fazem **dual-write**: gravam tanto Supabase legado quanto Firestore (`tenants/{tenantId}.credits`). Bridge intencional durante migração — Supabase será desligado quando os 56 módulos restantes migrarem ou forem desativados.

### Planos

| Tier | Preço | Books/mês | Outputs por book |
|------|-------|-----------|------------------|
| Starter | R$47 | 1 | 3 reels, podcast, 3 carrosséis, 3 stories, LP, blog |
| Pro | R$97 | 3 | idem + auto-publish + WhatsApp + prioridade |
| Atelier | R$247 | 10 | idem + API + SLA + customização de narrativa |

> "agency" foi renomeado para **Atelier** na landing (decisão de branding INTERMETRIX). O `PlanTier` interno ainda usa `agency` por compat.

---

## 7. Estado da Migração GCP

| Componente | Antes | Agora | Status |
|------------|-------|-------|--------|
| Deploy backend | Railway | Cloud Run unified | ✅ |
| Deploy frontend | Vercel | Cloud Run (Next dentro do Express) | ✅ |
| Auth | Supabase Auth | Firebase Auth | ✅ |
| Persistência (auth + jobs + artifacts) | Supabase Postgres | Firestore | ✅ |
| Persistência (outros 56 módulos) | Supabase Postgres | Supabase Postgres | ⏳ Legado mantido |
| Storage | Supabase Storage | GCS public bucket | ✅ |
| Queue | BullMQ + Redis | Cloud Tasks (+ sync fallback) | ✅ |
| AI default | Anthropic | Vertex AI (Gemini Enterprise) + multi-prov fallback | ✅ |
| Render vídeo default | Shotstack | FFmpeg ultrafast local | ✅ |
| Billing webhooks | Supabase only | Dual-write Supabase + Firestore | ⏳ Bridge |
| Real-time UI | Polling | SSE | ✅ |
| Secrets | Railway env | Secret Manager + Workload Identity | ✅ |
| Landing | Genérica | INTERMETRIX luxury "Arquitetos da Realidade" | ✅ |

**O que ainda precisa ser feito:**
- Migrar os 56 módulos restantes (billing-legacy, analytics, admin, governance, …) para Firestore — ou desativá-los se não forem usados.
- Cortar dual-write dos webhooks Kiwify/Hotmart.
- Decidir destino do bounded context editorial (Postgres normalizado vs Firestore documentos aninhados).
- UI de aprovação WhatsApp integrada ao pipeline editorial.
- Cleanup de imports/clientes Supabase em código de produção.

---

## 8. Comandos Operacionais

```bash
# Backend dev (porta 3000)
npm run dev

# Build e validate (typecheck + tests + sample run)
npm run build
npm run validate

# Frontend dev (porta 3001) — em ambiente local separado
cd web && npm run dev

# Pipeline sample (fixture sintético "Residencial Vista Verde")
npm run sample

# Deploy Cloud Run via Cloud Build
gcloud builds submit --config=cloudbuild.yaml .

# Health check
bash scripts/health-check.sh
```

---

## 9. Env Vars Críticas

```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT=
FIREBASE_PROJECT_ID=
GCS_BUCKET_PUBLIC=
GCS_BUCKET_PRIVATE=

# Cloud Tasks (opcional — sem, usa sync mode)
CLOUD_TASKS_QUEUE=
CLOUD_TASKS_LOCATION=
CLOUD_TASKS_SA_EMAIL=
CLOUD_TASKS_TARGET_URL=

# Frontend Firebase (NEXT_PUBLIC_ — inlineadas no bundle)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=

# AI Providers
VERTEX_AI_LOCATION=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Render
SHOTSTACK_API_KEY=
SHOTSTACK_ENV=

# Billing webhooks
KIWIFY_WEBHOOK_SECRET=
HOTMART_WEBHOOK_SECRET=

# Auth interno
BOOKAGENT_API_KEY=

# Legado Supabase (até cortar dual-write)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

**Removidos do ecossistema (não restaurar):**
`REDIS_URL`, qualquer `RAILWAY_*`, `BULLMQ_*`, Vercel deploy hooks. Estão proibidos.

---

## 10. Filosofia de Operação

> "Arquitetos da Realidade não improvisam. Cada pixel rastreado ao seu asset original. Cada decisão registrada como linha de banco. Cada estágio reproduzível, auditável, reescrevível."

**Princípios duros (não-negociáveis):**
1. **Visual Fidelity:** nenhum pixel no output sem rastro até o asset original do book. Validador formaliza isso (`src/services/visual-fidelity-validator.ts`).
2. **Estado no banco, não em memória:** `ProcessingContext` pode ser volátil; controle (`status`, `step`, `progress`, decisões de aprovação) é coluna indexável.
3. **Cada transição é uma linha:** auditoria por construção. Nenhum estado é apagado em-place enquanto uma versão histórica não for criada.
4. **Multi-tenant por design:** `tenantId` denormalizado em todo doc; backend filtra sempre.
5. **Um container, um processo:** Cloud Run unified. Sem orquestração frágil entre serviços.
6. **Secrets nunca em git:** Secret Manager + Workload Identity. `/health` audita presença.

**Princípios de marca (INTERMETRIX):**
- Tom editorial, sóbrio, sem hype. Ninguém é "a melhor IA do mercado".
- Tipografia serif para autoridade (Playfair Display), sans para clareza (Inter).
- Paleta restrita: Azul Profundo, Dourado, Cream. Tudo que foge disso precisa de motivo.
- A landing fala com o corretor que **trata marketing como infraestrutura de vendas**, não com quem está testando ferramentas.

---

## 11. Documentação Anexa

| Documento | Tópico |
|-----------|--------|
| `docs/book-production-integration-plan.md` | Plano arquitetural do bounded context editorial |
| `docs/book-production-phase1-audit.md` | Auditoria DEV-1 a DEV-10 da fase 1 editorial |
| `docs/book-production-phase1-guide.md` | Guia de uso e integração |
| `docs/visual-pipeline-audit.md` | Auditoria do pipeline visual (princípio de fidelidade) |
| `docs/AUDIT_REAL_BOOKS_EVIDENCE.md` | Evidência de processamento de books reais |
| `docs/DIAGNOSTICO_ESTRUTURAL.md` | Diagnóstico DEV-001 a DEV-005 + QA-001 (parcialmente superado pela migração GCP) |
| `docs/DIAGNOSTICO_ESTRUTURADO BOOKREEL.md` | Diagnóstico do produto BookReel |
| `docs/VISUAL_FIDELITY_PRINCIPLES.md` | Princípios de fidelidade visual |
| `docs/skills/` | Skills especializadas (backend, ui, db, integrations, ai-prompts, deploy, pipeline) |

---

**Última nota.** Este documento é a bússola. Quando uma decisão entrar em conflito com o que está aqui, ou este arquivo é atualizado primeiro, ou a decisão é revista. Não existe terceira opção.
