# Book Editorial Pipeline — Phase 1 Audit

> Auditoria técnica completa de DEV-1 a DEV-10. Escopo: aderência
> arquitetural, qualidade de modelagem, robustez do fluxo, tipagem,
> riscos arquiteturais remanescentes.

**Data:** 2026-04-15
**Status final:** ✅ Phase 1 pronta para integração opt-in via bootstrap.

---

## 1. Aderência à arquitetura real

### ✅ Acertos

- **Zero importação do runtime síncrono existente.** Nenhum arquivo em
  `src/modules/book-editorial/**`, `src/queue/book-editorial-*.ts`,
  `src/persistence/book-*.ts` ou `src/services/book-editorial-*.ts`
  importa `Orchestrator`, `IModule`, `ProcessingContext`, `Pipeline` ou
  `JobManager` do pipeline de conteúdo. Verificado com
  `grep -rn "Orchestrator\|ProcessingContext\|STAGE_ORDER" src/modules/book-editorial src/queue/book-editorial* src/persistence/book-* src/services/book-editorial-*`.

- **Padrão de persistência honrado.** Todos os 4 repositórios editoriais
  seguem exatamente a forma de `JobRepository`: row type snake_case
  interno, método mapper `rowToEntity`, `constructor(private client: SupabaseClient)`,
  métodos thin-wrapper. Zero abstração nova de persistência.

- **Padrão de adapter BullMQ honrado.** `book-editorial-queue.ts`,
  `book-editorial-worker.ts`, `book-editorial-processor.ts` espelham
  um para um `queue.ts`/`worker.ts`/`job-processor.ts` — mesmas event
  handlers, mesma `lockDuration`, mesma `defaultJobOptions` com retry
  exponencial, mesmo uso de `createRedisConnection` / `getSharedConnection`.

- **Padrão de controller/route honrado.** `bookEditorialController.ts`
  usa `sendSuccess`/`sendError` (envelope ApiResponse), DI via setter
  (`setBookEditorialDeps`), validação `zod`, exports nomeados por
  operação. Router usa `authMiddleware` + `requestRateLimiter` iguais
  a `process.ts`.

### ⚠️ Ajustes aplicados durante a auditoria

1. **Transição awaiting_approval → running ausente.**
   `setCurrentStep` só altera colunas de navegação, não toca `status`.
   Após approve (não-terminal) ou reject, o job ficava preso em
   `awaiting_approval` mesmo com step novo enfileirado.
   **Correção aplicada:** adicionado `BookJobRepository.resumeRunning()`
   que transiciona `status='awaiting_approval' → 'running'` sem tocar
   `started_at`. Chamado em `BookEditorialApprovalService.approveRound()`
   (path não-terminal) e `rejectRound()`.

2. **`loadAndValidateRound` no approval service lançava `Error` hardcoded.**
   Era um placeholder da primeira iteração de design aguardando
   `getRoundById` no repository.
   **Correção aplicada:** adicionado `BookApprovalRepository.getRoundById()`.
   O service agora carrega o round, valida decision==='pending', e rejeita
   rodadas já decididas.

3. **`BookArtifactKind` não incluía `manuscript`.**
   DEV-9 adicionou o kind mas a união TS precisa bater com o CHECK do SQL.
   **Correção aplicada:** migration 011 + expansão do tipo TS.

### ❌ Problemas encontrados

Nenhum remanescente após as correções acima.

---

## 2. Preservação de queue/worker/modules/domain/persistence

- `git diff` em todos os arquivos preservados (executado pós-DEV-10):
  ```
  src/core/orchestrator.ts          unchanged
  src/core/pipeline.ts              unchanged
  src/core/context.ts               unchanged
  src/core/job-manager.ts           unchanged
  src/queue/queue.ts                unchanged
  src/queue/worker.ts               unchanged
  src/queue/job-processor.ts        unchanged
  src/queue/connection.ts           unchanged
  src/persistence/job-repository.ts          unchanged
  src/persistence/artifact-repository.ts     unchanged
  src/persistence/persistent-orchestrator.ts unchanged
  src/domain/entities/job.ts        unchanged
  src/domain/interfaces/module.ts   unchanged
  src/worker.ts                     unchanged
  src/index.ts                      unchanged
  migrations 000–009                 unchanged
  ```

  ✅ Pipeline de conteúdo (17 stages, fila `bookagent-processing`) não
  foi tocado. Editorial é um bounded context paralelo com **infra
  compartilhada** (mesmo Redis, mesmo Supabase).

---

## 3. Qualidade da modelagem de jobs/steps/artifacts/approvals

| Critério | Status |
|---|---|
| Colunas normalizadas como fonte de verdade | ✅ `status`, `current_step`, `progress`, `step.status`, `round.decision` |
| JSONB usado apenas como payload | ✅ `metadata`, `input_ref`, `content`, `metrics` — nunca estado de controle |
| Reexecução sem destruir histórico | ✅ `book_job_steps` tem UNIQUE `(job_id, step_name, attempt)`; replay = nova linha |
| Versionamento por artefato | ✅ `book_artifacts.version`; `chapter_writing` incrementa por capítulo |
| Auditabilidade de decisões | ✅ `book_approval_rounds` guarda round, decision, decided_at, decided_by, comment |
| Rastreabilidade via timestamps | ✅ `started_at`/`completed_at`/`duration_ms` em job e steps |
| CHECK constraints alinhados com TS | ✅ migrations 010 + 011 refletem exatamente `BookStepName`, `BookJobStatus`, `BookArtifactKind` |

---

## 4. Separação contexto transitório vs estado persistido

- **Transitório:** `BookEditorialContext` (DTO `readonly`) — construído
  pelo processor a partir de leituras do banco, consumido pelo handler,
  descartado ao final da execução. Handlers não podem mutá-lo.
- **Persistido:** 4 tabelas normalizadas + cada step re-lê do banco
  antes de executar.

Nenhum `Map<jobId, state>`, nenhum singleton de estado, nenhum callback
wait-for-completion em memória. ✅

---

## 5. Robustez dos fluxos

### Criação
`POST /book-jobs` → pré-cria job (draft) → pré-cria step row (intake, attempt=1) → transiciona para queued → enfileira. Se o enqueue falhar a job fica em `queued` sem step na fila — recuperável via reenqueue manual. **Risco baixo, documentado.**

### Execução
Processor lê estado fresco → resolve handler (falha rápida se ausente) →
transiciona status → chama handler → persiste outputs → roteia outcome.
Todas as escritas são best-effort no sentido: erro no banco propaga a
exceção que aciona BullMQ retry, não corrompe estado parcial porque
cada escrita é idempotente por PK.

### QA
`EditorialQaStepHandler` retorna `awaiting_approval` SEMPRE (pass ou fail) —
a decisão de concluir ou reprovar é humana. O qa_report carrega status
por capítulo, incluindo `failedChapterNumbers[]` consumível pela API.

### Aprovação
`approveRound` → marca round `approved` → se era o último step
(`editorial_qa`), `completeJob`; se não, enfileira próximo step e
transiciona para `running`.

### Reprocessamento parcial
`rejectRound` com `category='reject_chapters'` + `onlyChapterNumbers` →
novo step row de `chapter_writing` com `attempt++` e `inputRef={onlyChapterNumbers}` →
enqueue. Handler lê `inputRef` e só escreve os capítulos pedidos.
Versões de capítulos não-listados permanecem intocadas. ✅

### Entrega
`POST /book-jobs/:id/deliver` → `BookEditorialDeliveryService` lê todos os
`chapter_draft` (versão mais alta por capítulo) + outline → gera markdown
consolidado → registra `manuscript` novo (versionado) → upload opcional
para Supabase Storage. Se upload falha, `manuscript` inline é preservado
(degradação graciosa).

---

## 6. Idempotência, retry e rastreabilidade

- ✅ **BullMQ jobId determinístico:** `${bookJobId}:${stepName}:${attempt}`
  torna duplo enqueue um no-op.
- ✅ **Retry do BullMQ:** 3 tentativas, backoff exponencial 5/10/20s.
  Esgotou retries → worker event handler `failed` marca
  `book_jobs.status='failed'`.
- ✅ **Chapter writing idempotente:** se todos os capítulos já têm
  draft e `onlyChapterNumbers` ausente → no-op + completed.
- ✅ **Step-level idempotência:** processor reusa row existente se
  `attempt` bate; só cria nova se precisa.
- ✅ **Manuscript versionado:** cada `/deliver` gera versão++ sem
  sobrescrever anteriores.
- ✅ **Trilha de auditoria:** `book_job_steps` (histórico de tentativas),
  `book_approval_rounds` (histórico de decisões), `book_artifacts` (histórico
  versionado de outputs) — três tabelas de história sem DELETE.

---

## 7. Tipagem e strict mode

- `npx tsc --noEmit` → **zero erros**.
- `grep -n ": any\b\|as any\b"` em todo o código novo → **zero matches**.
- 15 ocorrências de `as unknown as` — **intencional** para narrow seguro
  de `Record<string, unknown>` (JSONB content) para shapes tipados dos
  artefatos editoriais. Alternativa seria runtime validation com zod/io-ts,
  que é um upgrade da Phase 2.
- Todos os enums TS batem com os `CHECK` das migrations (verificado
  manualmente contra `010_book_editorial_pipeline.sql` e
  `011_book_manuscript_artifact_kind.sql`).

---

## 8. Riscos arquiteturais remanescentes para Phase 2

| Risco | Impacto | Mitigação proposta |
|---|---|---|
| Handlers placeholder sem LLM real | Médio — artefatos são esqueleto | Injetar `IAIAdapter` via construtor de cada handler; não muda schema |
| `src/worker.ts` não inicializa worker editorial | Alto (sem isso, fila não é consumida em produção) | Adicionar bloco opt-in guardado por `ENABLE_BOOK_EDITORIAL=true` em `src/worker.ts` |
| `src/index.ts` não monta `/book-jobs` | Alto (API não responde) | Adicionar `setBookEditorialDeps()` + `app.use('${prefix}/book-jobs', router)` |
| Validação runtime dos JSONB é manual (type casts) | Médio — um schema corrompido dispara erro só no runtime | Introduzir `zod.parse` nos parsers (`parseOutlineContent`, `parseChapterDraft`) |
| Sem per-tenant rate limit no pipeline editorial | Médio em multi-tenant | Reusar `planGuard` com tabela dedicada ou config por plano |
| Upload de manuscript não tem CDN/assinatura | Baixo | Padronizar via storage adapter quando houver consumo real |
| Round de aprovação não expira | Baixo | Cron que marca rounds pendentes há mais de N dias como `rejected` com decided_by='system-timeout' |
| `book_job_meta.approval_status` (tabela antiga) vs `book_approval_rounds.decision` | Baixo — são contextos diferentes | Documentar no dashboard que editorial usa `book_*` |

---

## 9. Arquivos para revisão futura

- `src/services/book-editorial-approval-service.ts` — reavaliar
  `computeNextAttempt` sob corrida (duas rejeições simultâneas do mesmo
  step podem gerar `attempt` idêntico antes do INSERT; o UNIQUE index
  protege, mas retornará erro de constraint ao invés de serialização
  limpa).
- `src/services/book-editorial-delivery-service.ts` — avaliar se
  manuscript deve ser criado automaticamente no approve do editorial_qa
  final (atualmente exige chamada explícita a `/deliver`).
- `src/modules/book-editorial/chapter-writing/index.ts` — o parse de
  `inputRef.onlyChapterNumbers` é tolerante a tipos; considerar zod para
  endurecer contra payloads corrompidos.
- `src/queue/book-editorial-processor.ts` — `buildTenantContextFromBullJob`
  retorna sempre null. Quando Phase 2 trouxer um `TenantRepository`,
  resolver via repo e injetar no contexto.

---

## 10. Proposta objetiva de Phase 2

**Objetivo:** tornar o pipeline editorial production-ready para 1 cliente
piloto, com LLM real e entrega consumível por dashboard.

### Blocos

1. **LLM integration** (3-5 dias)
   - Injetar `IAIAdapter` nos handlers placeholder (market_analysis,
     theme_validation, book_dna, outline, chapter_writing).
   - Prompts versionados em `src/modules/book-editorial/prompts/`.
   - Mesmo shape de artefato, sem mudança de schema.

2. **Bootstrap wiring** (1 dia)
   - Registrar rota `/book-jobs` em `src/index.ts` com `setBookEditorialDeps`.
   - Ativar `createBookEditorialWorker` em `src/worker.ts` condicional ao
     env var `ENABLE_BOOK_EDITORIAL`.

3. **Validação runtime** (1 dia)
   - Zod schemas para `OutlineContent`, `ChapterDraftContent`, `BookDnaContent`,
     `QaReportContent`, `ManuscriptContent`.
   - Parsers retornam `Result<T, ValidationError>`.

4. **Dashboard UI mínimo** (3 dias — frontend)
   - Lista de `book_jobs` por tenant.
   - Detalhe do job: steps, artefatos, rounds pendentes.
   - Botões approve/reject com seleção de capítulos.

5. **Production package** (2 dias)
   - Renderer markdown → epub via pandoc ou biblioteca equivalente.
   - Migration 012 para adicionar kinds `epub` / `pdf` se necessário.
   - Rota `/book-jobs/:id/package` que dispara job de package.

6. **Observabilidade avançada** (1 dia)
   - View Postgres `book_editorial_pipeline_status` juntando job + latest_step + latest_round.
   - Métricas agregadas para prometheus/telemetry existente.

**Total estimado:** 10-13 dias de trabalho focado.

---

## 11. Diff final (resumo)

```
 16 arquivos novos
  2 migrations novas
  0 arquivos legacy modificados
 ~3200 linhas adicionadas
  0 linhas removidas fora do próprio código novo
  0 erros de tipo
  0 usos de `any`
```

### Correções aplicadas nesta auditoria
```
 src/persistence/book-job-repository.ts        +13 lines (resumeRunning + updateMetadata)
 src/persistence/book-approval-repository.ts   +10 lines (getRoundById)
 src/services/book-editorial-approval-service.ts  ~30 lines (loadAndValidateRound real + 2x resumeRunning)
 src/domain/entities/book-editorial.ts         +1 line  (manuscript kind)
 supabase/migrations/011_*.sql                 new file (CHECK constraint update)
```

---

## 12. Resumo executivo

Phase 1 entrega um **pipeline editorial multi-step funcional end-to-end**
pronto para integração opt-in:

- Fluxo completo **intake → manuscript** orquestrado por BullMQ.
- **7 step handlers** executando o domínio editorial com persistência
  normalizada e reexecução parcial.
- **Taxonomia de rejeição** mapeando cada categoria ao escopo mínimo de
  replay — nenhum step desnecessário é reexecutado.
- **Delivery service** consolidando manuscript versionado com upload
  opcional.
- **API REST completa** (7 endpoints) atrás do `authMiddleware` +
  `requestRateLimiter` existentes.
- **Zero regressão** nos arquivos pré-existentes do content pipeline.
- **Zero `any`**, **zero erros** no strict mode.
- **Arquitetura paralela evitada**: tudo reutiliza SupabaseClient,
  BullMQ/Redis, padrão de repository, convenções de migration, logger,
  envelope ApiResponse, middlewares.

**Next step recomendado:** executar Phase 2 bloco 2 (bootstrap wiring) em
uma sessão curta dedicada para deixar o pipeline editorial acessível em
produção sob feature flag.
