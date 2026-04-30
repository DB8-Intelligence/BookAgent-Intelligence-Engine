# Book Production Pipeline — Integration Plan

> Plano técnico para integrar o **pipeline editorial multi-step** (intake → market-analysis → theme-validation → book-dna → outline → chapter-writing → editorial-qa) dentro da arquitetura real do BookAgent Intelligence Engine, **sem criar runtime paralelo** e **sem substituir** nenhum componente existente.

## 1. Contexto

O repositório `BookAgent-Intelligence-Engine` já possui um pipeline de **content generation** maduro:

- `src/core/orchestrator.ts` — executa 17 estágios fixos (`INGESTION` → `PERFORMANCE_MONITORING`) via `IModule.run(context)`.
- `src/core/pipeline.ts` — `STAGE_ORDER` hardcoded, `ProcessingContext` enriquecido por cada módulo.
- `src/core/job-manager.ts` — JobManager **in-memory** (não persistido), usado apenas como cache.
- `src/persistence/persistent-orchestrator.ts` — wrapper que persiste job + artifacts em `bookagent_jobs` / `bookagent_job_artifacts` / `bookagent_job_events`.
- `src/queue/job-processor.ts` + `src/queue/worker.ts` — BullMQ consumindo a fila `bookagent-processing`, executando o orchestrator existente.

O pipeline editorial é um **fluxo diferente**: multi-step, sequencial mas com gates de aprovação humana entre etapas, podendo aguardar horas ou dias entre steps. Ele **não cabe no modelo síncrono** do orchestrator de 17 estágios (que executa tudo em uma única passada sem pausas).

## 2. Arquitetura atual (síntese de descoberta)

### Execução
- **Motor oficial:** BullMQ (`bookagent-processing`) com worker e processor dedicados.
- **Contexto de execução:** `ProcessingContext` (transiente, construído por step, nunca persistido integralmente).
- **Interface de step:** `IModule { stage, name, run(context) }` — imutável, stage-oriented.

### Persistência
- Cliente único: `SupabaseClient` via PostgREST (sem SDK), com `fromEnv()` / `tryFromEnv()`.
- Repositórios no padrão `*-repository.ts` com `ColRow` interface (snake_case) + métodos async.
- Tabela `bookagent_jobs` guarda 1 linha por job, com `status` normalizado, `user_context JSONB`, `tenant_id`.
- Tabela `bookagent_job_events` guarda o timeline de execução (1 linha por stage).
- Tabela `bookagent_job_artifacts` guarda outputs.
- Workflow de aprovação **já existe** em `bookagent_job_meta` + `bookagent_approvals`, mas é acoplado ao pipeline de 17 estágios.

### Multitenancy
- `TenantContext` leve em `src/domain/entities/tenant.ts`.
- `tenantGuard` middleware + `tenant_id` nullable em `bookagent_jobs`.
- RLS ativo com `service_role` bypass.

### Convenções de código
- Tables: `snake_case`, prefixo `bookagent_` para conteúdo gerado.
- TS: strict, sem `any` explícito.
- Arquivos de migration: header `-- ====` + data + `IF NOT EXISTS` em tudo.
- Trigger de `updated_at`: função reutilizável `bookagent_update_timestamp()`.

## 3. Por que **não** estender o pipeline existente

O orchestrator de 17 estágios executa tudo de ponta a ponta em uma única chamada de `orchestrator.process(input)`. Os módulos compartilham um `ProcessingContext` mutável dentro do processo. Isso não é compatível com:

1. **Pausas de horas/dias** entre steps para aprovação humana (`awaiting_approval`).
2. **Reexecução parcial** de um step específico (ex: reescrever só o outline).
3. **State machine auditável** onde cada transição é uma linha de banco.
4. **Estado verdadeiro no banco** (o `ProcessingContext` é volátil; o orchestrator só persiste o resultado final).

Forçar o editorial dentro do orchestrator exigiria:
- Reescrever `Orchestrator.process()` para suportar retomada.
- Serializar `ProcessingContext` em JSONB — violando a regra "não JSONB monolítico".
- Acoplar features do editorial (aprovação intermediária) ao pipeline de conteúdo.

## 4. Estratégia: **bounded context paralelo, infra compartilhada**

Criar um novo bounded context **"book-editorial"** que:

- ✅ **Reutiliza** `SupabaseClient`, `redis connection`, padrão de repositório, convenções de coluna, `tenantContext`.
- ✅ **Reutiliza** a infra BullMQ mas com **fila própria** (`bookagent-book-editorial`) e **processor próprio** — BullMQ permite múltiplas filas no mesmo Redis.
- ❌ **Não importa** `Orchestrator`, `IModule`, `ProcessingContext`, `STAGE_ORDER`.
- ❌ **Não duplica** `JobManager` — estado vive no banco, não em memória.
- ❌ **Não cria** um novo `BookPipeline` genérico — o "pipeline" editorial é uma sequência declarada em um registry; a execução é dirigida por eventos da fila.

### Separação lógica

```
src/core/            ── pipeline de conteúdo (17 stages, ProcessingContext) [preservado]
src/queue/           ── infra BullMQ compartilhada [preservado]
  ├── queue.ts       ── fila bookagent-processing [preservado]
  ├── worker.ts      ── worker content pipeline [preservado]
  ├── job-processor  ── processor content pipeline [preservado]
  └── book-editorial-*  ── NOVO: fila + worker + processor editoriais
src/modules/
  ├── ingestion/ etc    ── módulos do pipeline de conteúdo [preservado]
  └── book-editorial/   ── NOVO: step handlers editoriais (intake, market-analysis, ...)
src/persistence/
  ├── job-repository   ── bookagent_jobs [preservado]
  ├── artifact-         ── bookagent_job_artifacts [preservado]
  └── book-*-repository ── NOVO: book_jobs, book_job_steps, book_artifacts, book_approval_rounds
src/domain/entities/
  ├── job.ts           ── Job (pipeline de conteúdo) [preservado]
  └── book-editorial.ts ── NOVO: BookJob, BookJobStep, BookApprovalRound, enums
src/domain/interfaces/
  ├── module.ts        ── IModule (pipeline de conteúdo) [preservado]
  └── book-step-handler.ts ── NOVO: IBookStepHandler
```

## 5. Modelagem de dados (normalizada, sem JSONB monolítico)

Novas tabelas com prefixo `book_` (para distinguir do bounded context `bookagent_*`):

### `book_jobs` — 1 linha por job editorial
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID nullable | multi-tenant |
| `user_id` | TEXT nullable | |
| `title` | TEXT NOT NULL | título do livro |
| `brief` | TEXT | briefing inicial curto |
| `status` | TEXT CHECK | `draft\|queued\|running\|awaiting_approval\|approved\|rejected\|completed\|failed\|cancelled` |
| `current_step` | TEXT nullable | nome do step corrente |
| `progress` | INTEGER 0-100 | |
| `total_steps` | INTEGER | |
| `completed_steps` | INTEGER | |
| `metadata` | JSONB | **payload de input APENAS**, não estado |
| `error` | TEXT | |
| `created_at` / `updated_at` / `started_at` / `completed_at` | TIMESTAMPTZ | |

### `book_job_steps` — 1 linha por tentativa de execução de cada step
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `job_id` | UUID FK | |
| `step_name` | TEXT CHECK | enum dos steps |
| `step_index` | INTEGER | ordem de execução |
| `attempt` | INTEGER | para reexecução — vários rows por step_name |
| `status` | TEXT CHECK | `pending\|running\|completed\|failed\|skipped` |
| `started_at` / `completed_at` | TIMESTAMPTZ | |
| `duration_ms` | INTEGER | |
| `error` | TEXT | |
| `input_ref` | JSONB | ponteiros para artefatos de entrada (ids) — **não é o payload** |
| `metrics` | JSONB | métricas da execução |

Índices: `(job_id, step_name, attempt)` único, `(job_id, step_index)`, `(status)`.

### `book_artifacts` — outputs de cada step
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `job_id` | UUID FK | |
| `step_id` | UUID FK nullable | vincula ao `book_job_steps.id` |
| `step_name` | TEXT | denormalizado para query rápida |
| `kind` | TEXT CHECK | `intake_brief\|market_report\|theme_decision\|book_dna\|outline\|chapter_draft\|qa_report` |
| `version` | INTEGER | para reescritas |
| `title` | TEXT | |
| `content` | JSONB | payload estruturado do artefato |
| `content_url` | TEXT nullable | se for arquivo externo |
| `created_at` | TIMESTAMPTZ | |

### `book_approval_rounds` — gates de aprovação humana
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `job_id` | UUID FK | |
| `step_name` | TEXT | step que está sendo aprovado |
| `round` | INTEGER | 1, 2, 3... |
| `kind` | TEXT CHECK | `intermediate\|final` |
| `decision` | TEXT CHECK | `pending\|approved\|rejected\|changes_requested` |
| `requested_at` / `decided_at` | TIMESTAMPTZ | |
| `decided_by` | TEXT | user_id ou channel |
| `comment` | TEXT | |
| `artifact_ref` | UUID nullable | aponta para `book_artifacts.id` submetido à aprovação |

### Por que **não** um único `context JSONB`
- Cada coluna normalizada (`status`, `current_step`, `progress`, `step.status`) é **fonte de verdade** indexável e queryable.
- JSONB existe apenas para **payloads contínuos** (metadata de input, content de artifact, metrics de step) — nunca como estado de controle.
- Permite queries como `SELECT ... WHERE status='awaiting_approval' AND updated_at < NOW() - INTERVAL '24h'` sem `jsonb_extract_path`.
- Auditoria: cada transição de estado gera um novo `book_job_steps` ou `book_approval_rounds` row.

## 6. Contrato do Step Handler

```typescript
interface IBookStepHandler {
  readonly step: BookStepName;
  readonly name: string;
  run(ctx: BookEditorialContext): Promise<BookStepResult>;
}

interface BookStepResult {
  status: 'completed' | 'failed' | 'awaiting_approval';
  artifacts: BookArtifactInput[];
  metrics?: Record<string, number>;
  error?: string;
  nextStep?: BookStepName;   // se null, pipeline decide pelo registry
}
```

`BookEditorialContext` é um **DTO transiente** montado pelo processor a cada execução:
- `job: BookJobRow`
- `currentStep: BookJobStepRow`
- `priorArtifacts: BookArtifactRow[]` (lidos do banco)
- `tenant: TenantContext | null`

Ele **não** é persistido. É descartado ao final de cada step.

## 7. Integração com BullMQ

- Nova fila: `bookagent-book-editorial` (constante em `src/queue/book-editorial-queue.ts`).
- Job data: `BookEditorialJobData { bookJobId, stepName, attempt, tenantContext? }`.
- Worker: `createBookEditorialWorker(deps)` em `src/queue/book-editorial-worker.ts` — espelha o padrão de `src/queue/worker.ts`.
- Processor: `processBookEditorialStep` em `src/queue/book-editorial-processor.ts`:
  1. Lê `book_jobs` + `book_job_steps` pelo id.
  2. Atualiza status do step para `running`.
  3. Monta `BookEditorialContext`.
  4. Busca handler no registry por `step_name`.
  5. Executa `handler.run(ctx)`.
  6. Persiste artifacts e marca step como `completed` / `failed` / `awaiting_approval`.
  7. Se `completed` e há próximo step: enfileira novo job com `stepName = next`.
  8. Se `awaiting_approval`: cria `book_approval_rounds` pendente e **não** enfileira próximo.
  9. Se `failed`: BullMQ aplica retry com backoff exponencial (padrão do projeto).

Isso garante:
- Retry via BullMQ (sem loops em memória).
- Estado no banco (sem `Map` de controle).
- Reprocessamento parcial possível: `enqueueBookEditorialStep(jobId, stepName, newAttempt)`.

## 8. Sequência inicial dos steps

Implementar agora os 3 primeiros handlers (intake, market-analysis, theme-validation) e estubar os demais (book-dna, outline, chapter-writing, editorial-qa) para o registry conhecer a sequência.

```typescript
const BOOK_EDITORIAL_SEQUENCE: BookStepName[] = [
  'intake',
  'market_analysis',
  'theme_validation',
  'book_dna',
  'outline',
  'chapter_writing',
  'editorial_qa',
];
```

- **intake** — valida briefing, cria artefato `intake_brief`.
- **market_analysis** — análise de mercado/audiência, cria `market_report`.
- **theme_validation** — cruza brief + market, decide tema, cria `theme_decision` (gate de aprovação intermediária opcional).
- Próximos (stub registry, handlers a serem implementados em dev-6+).

## 9. Arquivos a preservar (não tocar)

- `src/core/orchestrator.ts`, `src/core/pipeline.ts`, `src/core/context.ts`, `src/core/job-manager.ts`
- `src/queue/queue.ts`, `src/queue/worker.ts`, `src/queue/job-processor.ts`, `src/queue/connection.ts`
- `src/persistence/job-repository.ts`, `src/persistence/artifact-repository.ts`, `src/persistence/persistent-orchestrator.ts`
- `src/domain/entities/job.ts`, `src/domain/interfaces/module.ts`
- Qualquer módulo em `src/modules/` diferente de `book-editorial/`
- Todas as migrations `000`–`009`

## 10. Arquivos a criar

| Camada | Arquivo | Propósito |
|---|---|---|
| Migration | `supabase/migrations/010_book_editorial_pipeline.sql` | tabelas, triggers, RLS |
| Domain | `src/domain/entities/book-editorial.ts` | enums + entidades persistidas |
| Domain | `src/domain/entities/book-editorial-context.ts` | DTO transiente |
| Domain | `src/domain/interfaces/book-step-handler.ts` | contrato `IBookStepHandler` |
| Persistence | `src/persistence/book-job-repository.ts` | CRUD `book_jobs` |
| Persistence | `src/persistence/book-job-step-repository.ts` | CRUD `book_job_steps` |
| Persistence | `src/persistence/book-approval-repository.ts` | CRUD `book_approval_rounds` |
| Persistence | `src/persistence/book-editorial-artifact-repository.ts` | CRUD `book_artifacts` |
| Queue | `src/queue/book-editorial-queue.ts` | fila + enqueue helper |
| Queue | `src/queue/book-editorial-worker.ts` | factory do worker |
| Queue | `src/queue/book-editorial-processor.ts` | processor dos steps |
| Modules | `src/modules/book-editorial/registry.ts` | sequência + lookup de handler |
| Modules | `src/modules/book-editorial/intake/index.ts` | handler intake |
| Modules | `src/modules/book-editorial/market-analysis/index.ts` | handler market-analysis |
| Modules | `src/modules/book-editorial/theme-validation/index.ts` | handler theme-validation |
| Modules | `src/modules/book-editorial/index.ts` | barrel exports |

## 11. O que do prompt anterior é **incompatível**

Da descrição inicial da feature ("BookPipeline", "BookOrchestrator", "JobManager" centralizado), **não vamos adotar**:
- ❌ `BookPipeline` como classe orquestradora genérica — usamos BullMQ + registry em vez disso.
- ❌ `BookOrchestrator` paralelo a `Orchestrator` — criaria duplicação conceitual.
- ❌ `JobManager` substituto do atual — o editorial usa repositório direto ao banco, o content pipeline continua com seu JobManager em memória.
- ❌ `context JSONB` único como estado — violaria a regra de normalização.
- ❌ Callbacks wait-for-completion em memória — tudo roda por eventos de fila.

## 12. Como isso conversa com o resto

- **API** (`src/api/routes/`) pode expor um `POST /api/v1/book-jobs` que cria o row em `book_jobs` + enfileira o step `intake` — fora do escopo desta sessão, mas o repositório já dá suporte.
- **Worker** (`src/worker.ts`) pode opcionalmente inicializar o editorial worker em paralelo ao existente (feature flag `ENABLE_BOOK_EDITORIAL=true`) — **não tocamos** `src/worker.ts` nesta entrega para não regredir o content pipeline.
- **Dashboard** lê direto de `book_jobs` / `book_job_steps` — nada de reimplementar joins em memória.
