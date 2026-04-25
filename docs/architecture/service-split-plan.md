# Service Split Plan — bookagent-api / bookagent-worker / bookagent-renderer

**Status:** Sprint 2 (logical separation done) → Sprint 3+ (physical deploy split, TBD)

Este documento descreve a separação de responsabilidades implementada em Sprint 2 e o caminho previsto pro split físico em 3 serviços Cloud Run.

---

## Estado atual (Sprint 2)

- 1 serviço Cloud Run: `bookagent-intelligence-engine`
- 1 entrypoint físico: `src/index.ts`
- 1 imagem Docker
- Composition layer em `src/services/{api,worker,renderer}/` define ownership lógico
- Variável `SERVICE_ROLE` (default `"all"`) controla quais rotas são montadas
- Entrypoints dedicados em `src/entrypoints/{api,worker,renderer}.ts` existem mas **não são invocados** — preparação pra Sprint 3
- Comportamento de produção idêntico ao monolito anterior (em `SERVICE_ROLE=all`)

## Estado-alvo (Sprint 3+)

- 3 serviços Cloud Run: `bookagent-api`, `bookagent-worker`, `bookagent-renderer`
- 3 entrypoints físicos (já criados em sprint 2)
- 3 imagens Docker (talvez 1 base + 1 com FFmpeg pro renderer)
- Cloud Tasks queues apontam pro serviço correto via URLs separadas
- Frontend (Next.js) servido apenas pelo `bookagent-api`

---

## Responsabilidades por serviço

### bookagent-api

**Owns:**
- Rotas HTTP públicas (`/api/v1/*`, `/webhooks/*`, `/generate-video`, `/api/public/v1`)
- Frontend Next.js (`web/`)
- Auth chain: `firebaseAuthMiddleware`, `autoProvisionMiddleware`, `tenantGuard`
- Criação de jobs (enqueue → Cloud Tasks)
- Approval flow (enqueue publication → Cloud Tasks)
- Webhooks externos (Kiwify, Hotmart)
- Public API (key auth)

**NÃO owns:**
- Execução de pipeline (delegada ao worker via Cloud Tasks)
- Render de vídeo (delegado ao renderer)
- Handlers `/tasks/*`

**Endpoints expostos:**
```
GET  /health
GET  /api/v1/jobs
POST /api/v1/process
POST /api/v1/jobs/:id/approve | /reject | /comment | /publish
POST /api/v1/uploads
... (~30 prefixos — ver src/services/api/composition.ts)
POST /webhooks/*
POST /generate-video
GET  /api/public/v1/*
*    Next.js SSR (catch-all não-API)
```

**Dependências runtime:**
- Firebase Auth (verificação de ID tokens)
- Firestore (profiles, jobs, artifacts, tenants)
- Supabase (módulos legados ainda não migrados)
- Cloud Tasks (enqueue)
- GCS (storage de assets/outputs)

### bookagent-worker

**Owns:**
- Handler `/tasks/pipeline` — executa os 17 estágios via `Orchestrator.process()`
- Handler `/tasks/editorial` — book-editorial bounded context (phase 1)
- Handler `/tasks/publication` — chama webhook n8n
- Handler `/tasks/cleanup` — framework de cleanup (no-op por enquanto)
- Aliases deprecated `/internal/execute-pipeline`
- Todos os 17 módulos do pipeline (registrados no `Orchestrator`)
- `book-editorial` registry e handlers
- `task-execution-store` (idempotência via Firestore `tasks/{taskId}`)

**NÃO owns:**
- Render de vídeo (delegado ao renderer)
- Rotas HTTP públicas
- Auth Firebase

**Endpoints expostos:**
```
GET  /health
POST /tasks/pipeline       (cloudTasksAuth via OIDC)
POST /tasks/editorial      (cloudTasksAuth)
POST /tasks/publication    (cloudTasksAuth)
POST /tasks/cleanup        (cloudTasksAuth)
POST /internal/execute-pipeline   (DEPRECATED alias)
```

**Dependências runtime:**
- Firestore (jobs, artifacts, task-execution-store)
- Supabase (legacy reads/writes)
- Vertex AI / Anthropic / OpenAI (LLM providers)
- Cloud Tasks (enqueue de video → renderer)
- GCS

### bookagent-renderer

**Owns:**
- Handler `/tasks/video` — `processVideoRenderJob` (FFmpeg + thumbnails + audio mix)
- Alias deprecated `/internal/execute-video-render`
- Binário FFmpeg
- Render specs → MP4

**NÃO owns:**
- Pipeline geral
- Rotas HTTP públicas
- Auth Firebase

**Endpoints expostos:**
```
GET  /health
POST /tasks/video                  (cloudTasksAuth via OIDC)
POST /internal/execute-video-render (DEPRECATED alias)
```

**Dependências runtime:**
- FFmpeg (binário no container)
- Firestore (task-execution-store, status updates)
- GCS (assets in/out)
- Supabase (job_meta updates pra UI poll)

---

## Mapping arquivo → serviço

| Localização | Owner |
|---|---|
| `src/api/middleware/{firebase-auth,auto-provision,tenant-guard,plan-guard}.ts` | api |
| `src/api/middleware/{cloud-tasks-auth,error-handler}.ts` | shared |
| `src/api/controllers/*` (30+) | api |
| `src/api/routes/*` (exceto tasks/internal) | api |
| `src/api/routes/{tasks,internal}.ts` | DEPRECATED stubs (delegam pra worker+renderer) |
| `src/services/api/*` | api composition layer |
| `src/services/worker/*` | worker composition layer |
| `src/services/renderer/*` | renderer composition layer |
| `src/services/shared/{deps,health}.ts` | shared |
| `src/queue/cloud-tasks.ts` | shared (enqueue helpers usados pelo api) |
| `src/queue/queue.ts` | shared |
| `src/queue/task-handlers.ts` | shared (fonte de todos os handlers; re-exportado por worker e renderer) |
| `src/queue/{job-processor,video-processor,video-queue}.ts` | worker (job-processor) + renderer (video-processor, video-queue) |
| `src/persistence/task-execution-store.ts` | shared |
| `src/persistence/google-persistence.ts` | shared |
| `src/persistence/{job,artifact}-repository.ts` | shared |
| `src/modules/*` (50+) | worker (consumidos via Orchestrator) |
| `src/modules/book-editorial/*` | worker |
| `src/core/orchestrator.ts` | worker |
| `src/adapters/*` | shared (storage, AI providers) |
| `src/domain/*` | shared |
| `src/utils/*` | shared |
| `web/*` | api (Next.js frontend) |
| `src/entrypoints/{api,worker,renderer}.ts` | dedicated entrypoints (preparação) |
| `src/index.ts` | composition root + monolith entrypoint |

---

## SERVICE_ROLE dispatch (Sprint 2)

`src/index.ts` lê `process.env.SERVICE_ROLE` (default `"all"`):

| Role | Mounts |
|---|---|
| `all` (default) | API routes + worker tasks + renderer tasks + Next.js + /health |
| `api` | API routes + Next.js + /health (sem /tasks, sem /internal) |
| `worker` | worker /tasks/{pipeline,editorial,publication,cleanup} + /internal/execute-pipeline + /health |
| `renderer` | renderer /tasks/video + /internal/execute-video-render + /health |

`/health` é montado em **todos** os roles — Cloud Run depende disso pro startup probe.

Auth chain Firebase só é montado em api/all (worker e renderer usam apenas cloudTasksAuth dentro dos sub-routers).

---

## Plano de deploy futuro (Sprint 3+)

### Pré-requisitos antes de splittar

1. **Confirmar tasks Cloud Tasks pendentes**: a queue não pode ter tasks no caminho deprecated `/internal/*` antes de remover os aliases. Inspecionar via `gcloud tasks queues describe`.

2. **Configurar URLs separadas em env**:
   ```bash
   CLOUD_TASKS_TARGET_URL_PIPELINE=https://bookagent-worker-<num>.us-central1.run.app
   CLOUD_TASKS_TARGET_URL_VIDEO=https://bookagent-renderer-<num>.us-central1.run.app
   CLOUD_TASKS_TARGET_URL_EDITORIAL=https://bookagent-worker-<num>.us-central1.run.app
   CLOUD_TASKS_TARGET_URL_PUBLICATION=https://bookagent-worker-<num>.us-central1.run.app
   CLOUD_TASKS_TARGET_URL_CLEANUP=https://bookagent-worker-<num>.us-central1.run.app
   ```
   E refatorar `enqueuePipelineTask`/`enqueueVideoRenderTask`/etc em `cloud-tasks.ts` pra usar a URL do destino certo.

3. **Refatorar entrypoints** pra serem **lean** (não importarem `src/index.ts` inteiro):
   - `entrypoints/api.ts`: bootstrap mínimo (sem Orchestrator, sem registro de modules)
   - `entrypoints/worker.ts`: sem Next.js, sem auth chain Firebase
   - `entrypoints/renderer.ts`: só FFmpeg deps + storage

4. **Dockerfiles separados** (ou multi-stage com argumento ROLE):
   - `Dockerfile.api` — Node 20 slim, copia `dist/` + `web/`
   - `Dockerfile.worker` — Node 20 slim, copia `dist/`, sem `web/`
   - `Dockerfile.renderer` — Node 20 com FFmpeg instalado

### cloudbuild.yaml futuro

```yaml
steps:
  - id: build-api
    name: docker
    args: [build, -f, Dockerfile.api, -t, ...api:${SHORT_SHA}, .]

  - id: build-worker
    name: docker
    args: [build, -f, Dockerfile.worker, -t, ...worker:${SHORT_SHA}, .]

  - id: build-renderer
    name: docker
    args: [build, -f, Dockerfile.renderer, -t, ...renderer:${SHORT_SHA}, .]

  - id: deploy-api
    name: gcloud
    args:
      - run
      - deploy
      - bookagent-api
      - --image=...api:${SHORT_SHA}
      - --allow-unauthenticated  # exposto publicamente
      - --memory=2Gi --cpu=2

  - id: deploy-worker
    name: gcloud
    args:
      - run
      - deploy
      - bookagent-worker
      - --image=...worker:${SHORT_SHA}
      - --no-allow-unauthenticated  # só Cloud Tasks via OIDC
      - --memory=4Gi --cpu=2 --max-instances=20

  - id: deploy-renderer
    name: gcloud
    args:
      - run
      - deploy
      - bookagent-renderer
      - --image=...renderer:${SHORT_SHA}
      - --no-allow-unauthenticated
      - --memory=8Gi --cpu=4 --max-instances=10
```

### Cloud Tasks queues

```bash
# Já existem:
gcloud tasks queues create bookagent-pipeline --location=us-central1
gcloud tasks queues create bookagent-video --location=us-central1

# A criar:
gcloud tasks queues create bookagent-editorial --location=us-central1
gcloud tasks queues create bookagent-publication --location=us-central1
gcloud tasks queues create bookagent-cleanup --location=us-central1
```

### Migration order (Sprint 3+)

1. Deploy `bookagent-worker` e `bookagent-renderer` em paralelo ao monolito existente (sem desligar nada).
2. Atualizar variáveis Cloud Tasks (`CLOUD_TASKS_TARGET_URL_*`) pra apontar pros novos serviços.
3. Verificar logs no Cloud Logging (`role=worker`, `role=renderer` no /health response).
4. Renomear monolito atual `bookagent-intelligence-engine` → `bookagent-api` (ou criar novo `bookagent-api` e migrar tráfego DNS).
5. Decommissionar monolito após 1 semana de soak.
6. Remover aliases `/internal/*` quando confirmar que Cloud Tasks não tem mais tasks pendentes.
7. Deletar `src/api/routes/{tasks,internal}.ts` stubs.

---

## Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Splitar antes de Cloud Tasks queue estar drenada → tasks órfãs apontando pra URL antiga | Alto | Manter aliases `/internal/*` por 2 sprints; checar queue depth antes de decommissionar |
| Cold start do worker afeta latência de jobs | Médio | min-instances=1 no Cloud Run pro worker durante horário comercial |
| Renderer com FFmpeg cresce a imagem Docker (>500MB) | Baixo | Usar imagem base com FFmpeg pré-instalado (`jrottenberg/ffmpeg`) |
| Auth Firebase bloqueia requests no worker | Médio | Worker entrypoint pula auth chain Firebase (já implementado em sprint 2) |
| Logs misturados entre roles | Baixo | Field `role` adicionado ao /health; structured logger pode incluir role no contexto |
| Custo de 3 serviços vs 1 monolito | Médio | Cloud Run scale-to-zero — só paga quando usado. min-instances=0 nos serviços de baixa demanda |

---

## Diagnóstico de conectividade Firestore

Antes de qualquer mudança que envolva Firestore (deploys, debugging de auth,
inspeção de credenciais ADC), validar que a conta local tem acesso de leitura
ao projeto. Existe um script dedicado para isso:

```bash
gcloud auth application-default login
gcloud config set project bookreel
npx tsx scripts/dev/check-firebase-connection.ts
```

Saída esperada inclui `projectId=bookreel` e tempo de leitura em ms na
collection `profiles`. Read-only — não modifica nada.

Detalhes em [scripts/dev/README.md](../../scripts/dev/README.md).

Esta verificação é especialmente útil:
- Antes de cada deploy do `bookagent-worker` (que usa Firestore intensivamente
  via `task-execution-store` e `google-persistence`).
- Quando houver suspeita de credenciais ADC expiradas ou permissão IAM
  incorreta na conta de runtime (`bookagent-runtime@bookreel.iam.gserviceaccount.com`).
- Em onboarding de novos devs no projeto.

---

## Referências

- `src/services/shared/deps.ts` — `resolveServiceRole()` + `shouldMount()`
- `src/services/api/composition.ts` — `mountApiRoutes(app, prefix)` + `API_PATHS`
- `src/services/worker/composition.ts` — `mountWorkerRoutes(app, deps)`
- `src/services/renderer/composition.ts` — `mountRendererRoutes(app, deps)`
- `src/services/shared/health.ts` — `mountHealthRoute(app, snapshot)`
- `src/index.ts` — composition root atual
- `scripts/dev/check-firebase-connection.ts` — sanity check Firestore (ADC)
- `scripts/dev/README.md` — convenções de scripts de desenvolvimento
