# BookAgent — Book Production Pipeline (Phase 1) — Technical Guide

> Guia técnico consolidado do pipeline editorial multi-step (phase 1).
> Cobre do `intake` ao `manuscript` consolidado. Phase 2 trata audiobook,
> cover e production package — fora de escopo aqui.

## 1. Mapa do bounded context

```
 API (src/api/routes/book-editorial.ts)
   │
   ▼
 BookEditorialController (src/api/controllers/bookEditorialController.ts)
   │
   ├── BookJobRepository        ─┐
   ├── BookJobStepRepository    ─┤   src/persistence/
   ├── BookApprovalRepository   ─┤
   ├── BookEditorialArtifactRepo ┘
   │
   ├── BookEditorialApprovalService  (src/services/book-editorial-approval-service.ts)
   └── BookEditorialDeliveryService  (src/services/book-editorial-delivery-service.ts)

 Fila BullMQ bookagent-book-editorial
   │
   ▼
 BookEditorialWorker (src/queue/book-editorial-worker.ts)
   │
   ▼
 BookEditorialProcessor (src/queue/book-editorial-processor.ts)
   │
   ▼
 BookEditorialHandlerRegistry (src/modules/book-editorial/registry.ts)
   │
   ▼
 7 step handlers
   intake → market_analysis → theme_validation → book_dna →
   outline → chapter_writing → editorial_qa
```

## 2. Tabelas

| Tabela | Migration | Propósito |
|---|---|---|
| `book_jobs` | 010 | 1 linha por job editorial — status/progress/current_step |
| `book_job_steps` | 010 | 1 linha por tentativa de step (suporta reexecução) |
| `book_artifacts` | 010 + 011 | outputs estruturados (intake_brief → manuscript) |
| `book_approval_rounds` | 010 | gates de aprovação humana |

**JSONB é payload**, não estado: `metadata`, `input_ref`, `content`, `metrics`
carregam dados estruturados; status/progress/decision ficam em colunas normais.

## 3. Sequência canônica

`BOOK_EDITORIAL_SEQUENCE` em `src/domain/entities/book-editorial.ts`:

1. **intake** — valida briefing, normaliza metadata (`intake_brief`)
2. **market_analysis** — análise de mercado (`market_report`) — placeholder LLM-ready
3. **theme_validation** — escolhe tema (`theme_decision`) — gate `intermediate`
4. **book_dna** — gênero/tom/voz/persona/pilares (`book_dna`)
5. **outline** — lista estruturada de capítulos (`outline`)
6. **chapter_writing** — N drafts (`chapter_draft`) — suporta reexecução parcial
7. **editorial_qa** — lint per-capítulo (`qa_report`) — gate `final`

## 4. Fluxos expostos pela API

### Criar job editorial
`POST /book-jobs`
```json
{
  "title": "Meu livro",
  "brief": "Sobre criatividade aplicada",
  "metadata": { "locale": "pt-BR" }
}
```
→ 201 `{ jobId, status: "queued", firstStep: "intake" }` + `intake` enfileirado.

### Consultar status / progresso
`GET /book-jobs/:id`
→ `{ job, steps, approvalRounds, artifactsSummary: { total, byKind } }`

Fonte de verdade: banco. Reflete imediatamente transições do worker.

### Listar artefatos completos
`GET /book-jobs/:id/artifacts`

### Submeter input complementar
`POST /book-jobs/:id/input`
```json
{ "patch": { "targetAudience": "jovens adultos" } }
```
Merge superficial com `book_jobs.metadata`. Não altera status.

### Aprovar rodada
`POST /book-jobs/:id/rounds/:roundId/approve`
```json
{ "decidedBy": "dmbbonanza", "comment": "aprovado" }
```
Se o round era do último step (`editorial_qa` final) → job passa para `completed`.
Caso contrário → próximo step é enfileirado com `attempt=1`.

### Rejeitar rodada (replay parcial)
`POST /book-jobs/:id/rounds/:roundId/reject`
```json
{
  "decidedBy": "dmbbonanza",
  "category": "reject_chapters",
  "onlyChapterNumbers": [3, 7],
  "comment": "capítulos 3 e 7 rasos"
}
```
Categorias e seus escopos de replay:

| `category` | Step replayado | Reexecuta |
|---|---|---|
| `reject_chapters` | `chapter_writing` | só os capítulos listados |
| `reject_outline` | `outline` | outline inteiro (drafts antigos ficam como histórico) |
| `reject_dna` | `book_dna` | DNA + tudo depois |
| `reject_qa` | `editorial_qa` | só reaplica QA |
| `reject_theme` | `theme_validation` | tema (força novo gate intermediário) |

Em todos os casos, um novo row de `book_job_steps` é criado com `attempt = latest + 1` e `input_ref` com o contexto da rejeição.

### Consolidar manuscrito
`POST /book-jobs/:id/deliver`
Cria um novo artefato `manuscript` versionado. Se `SupabaseStorageUploader` estiver injetado, também faz upload do markdown consolidado para `book-editorial/{jobId}/manuscript-v{N}.md` e devolve `manuscriptUrl` público.

## 5. Reexecução parcial — como funciona tecnicamente

O processador (`processBookEditorialStep`) já suporta qualquer `(jobId, stepName, attempt)`. O caminho canônico de replay parcial é:

```ts
const attempt = (await stepRepo.getLatestAttempt(jobId, 'chapter_writing'))!.attempt + 1;
await stepRepo.createStep({
  jobId,
  stepName: 'chapter_writing',
  stepIndex: bookStepIndex('chapter_writing'),
  attempt,
  inputRef: { onlyChapterNumbers: [3, 7] },
});
await enqueueBookEditorialStep({ bookJobId: jobId, stepName: 'chapter_writing', attempt });
```

O handler `ChapterWritingStepHandler` lê `ctx.currentStep.inputRef.onlyChapterNumbers` e **só escreve esses capítulos**. O versionamento é por capítulo: cada capítulo N mantém seu histórico em `book_artifacts` com `version = 1, 2, 3, ...`. A agregação (QA, manuscript) sempre consome a última versão.

## 6. Observabilidade

Cada step transition gera log estruturado no logger central do projeto:

- `[BookEditorialProcessor] Dispatching {step} (bookJob={id}, attempt={n})`
- `[BookEditorialProcessor] {step} completed; next={next} (duration={ms}ms)`
- `[BookEditorialProcessor] Step {step} awaiting approval (round={n})`
- `[BookEditorialWorker] Step active / completed / failed / stalled`
- `[BookEditorialApprovalService] Round {id} approved / rejected ...`

Persistência normalizada dos tempos:

- `book_job_steps.started_at`, `completed_at`, `duration_ms`, `metrics JSONB`
- `book_jobs.started_at`, `completed_at`
- `book_approval_rounds.requested_at`, `decided_at`

Para análise post-mortem basta `SELECT` — zero estado fora do banco.

## 7. Idempotência / retry

- **Idempotência no enqueue**: `bullJobId = ${bookJobId}:${stepName}:${attempt}`. Dois pushes da mesma tripla viram o mesmo job BullMQ.
- **Retry**: `defaultJobOptions.attempts = 3`, backoff exponencial 5s/10s/20s. Esgotou retries → event handler `failed` do worker marca `book_jobs.status = failed`.
- **Reexecução deliberada**: `attempt++` é SEMPRE uma nova linha. Nada é sobrescrito destrutivamente.

## 8. Checklist da Phase 1 — Pronto ✅

- [x] Migrations 010 + 011 normalizadas (sem JSONB monolítico)
- [x] 4 repositórios seguindo o padrão do projeto
- [x] 7 step handlers implementados e registrados
- [x] Fila + worker + processor dedicados (BullMQ, Redis compartilhado)
- [x] Chapter_writing com reexecução parcial por capítulo
- [x] Editorial_qa produzindo qa_report per-capítulo
- [x] Approval service com taxonomia de rejeição → escopo de replay
- [x] Delivery service consolidando manuscript com versionamento
- [x] API REST completa (create / status / artifacts / input / approve / reject / deliver)
- [x] Rotas opt-in (não registradas em `src/index.ts` automaticamente)
- [x] Type-check `tsc --noEmit` zero errors, zero `any`

## 9. Checklist da Phase 2 — Pendente ⏳

- [ ] Integração real com LLM (`IAIAdapter`) nos handlers placeholder (market_analysis, theme_validation, book_dna, outline, chapter_writing)
- [ ] Audiobook (TTS + concatenação)
- [ ] Cover generation (Flux Pro via fal.ai)
- [ ] Metadata KDP (ISBN, keywords, categorias, descrição SEO)
- [ ] Production package (epub, mobi, pdf)
- [ ] Registro da rota `book-editorial` em `src/index.ts` + wiring do worker inline
- [ ] Testes automatizados dos step handlers
- [ ] Dashboard UI para listagem de `book_jobs` e aprovação de rounds
- [ ] Webhook de notificação ao concluir (seguindo pattern de `WebhookPayload` existente)
- [ ] Per-tenant rate limit dedicado para o pipeline editorial
- [ ] Retomada automática de jobs `awaiting_approval` com timeout configurável

## 10. Arquivos da Phase 1 (inventário)

| Camada | Arquivo |
|---|---|
| Plan | `docs/book-production-integration-plan.md` |
| Guide | `docs/book-production-phase1-guide.md` |
| Audit | `docs/book-production-phase1-audit.md` |
| Migration | `supabase/migrations/010_book_editorial_pipeline.sql` |
| Migration | `supabase/migrations/011_book_manuscript_artifact_kind.sql` |
| Domain | `src/domain/entities/book-editorial.ts` |
| Domain | `src/domain/entities/book-editorial-context.ts` |
| Domain | `src/domain/interfaces/book-step-handler.ts` |
| Persistence | `src/persistence/book-job-repository.ts` |
| Persistence | `src/persistence/book-job-step-repository.ts` |
| Persistence | `src/persistence/book-approval-repository.ts` |
| Persistence | `src/persistence/book-editorial-artifact-repository.ts` |
| Queue | `src/queue/book-editorial-queue.ts` |
| Queue | `src/queue/book-editorial-processor.ts` |
| Queue | `src/queue/book-editorial-worker.ts` |
| Services | `src/services/book-editorial-approval-service.ts` |
| Services | `src/services/book-editorial-delivery-service.ts` |
| Modules | `src/modules/book-editorial/registry.ts` |
| Modules | `src/modules/book-editorial/index.ts` |
| Handlers | `src/modules/book-editorial/intake/index.ts` |
| Handlers | `src/modules/book-editorial/market-analysis/index.ts` |
| Handlers | `src/modules/book-editorial/theme-validation/index.ts` |
| Handlers | `src/modules/book-editorial/book-dna/index.ts` |
| Handlers | `src/modules/book-editorial/outline/index.ts` |
| Handlers | `src/modules/book-editorial/chapter-writing/index.ts` |
| Handlers | `src/modules/book-editorial/editorial-qa/index.ts` |
| API | `src/api/controllers/bookEditorialController.ts` |
| API | `src/api/routes/book-editorial.ts` |
