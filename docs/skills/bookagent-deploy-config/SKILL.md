# Skill: BookAgent Deploy Config

> Contexto especializado para deploy, infraestrutura e configuração de ambiente.
> **Status:** Cloud Run-only desde a migração GCP (2026-04-22 → 25). Vercel desativado em Sprint 3.1.

## Ambiente único — Google Cloud Run

BookAgent roda como **um serviço unificado** no Cloud Run:

- **Backend Express + Frontend Next.js** no mesmo processo, mesma porta, um único container.
- Sem worker separado, sem Redis, sem Vercel, sem Railway.
- Autoscale 0 → N gerenciado pelo Cloud Run.

| Componente | Tecnologia | Notas |
|---|---|---|
| Compute | Cloud Run (`bookagent-intelligence-engine`) | região `us-central1`, `--allow-unauthenticated` |
| Image registry | Artifact Registry (`us-central1-docker.pkg.dev/bookreel/bookagent/api`) | tags `:latest` e `:${SHORT_SHA}` |
| Auth | Firebase Auth (ID tokens) + Workload Identity para SDKs Google | sem JSON key |
| Service Account runtime | `bookagent-runtime@bookreel.iam.gserviceaccount.com` | roles: `aiplatform.user`, `storage.objectAdmin`, `secretmanager.secretAccessor`, `datastore.user`, `firebaseauth.admin`, `cloudtasks.enqueuer` |
| Persistência primária | Firestore Native (`profiles`, `jobs`, `artifacts`, `tenants`, `tasks`) | região `us-central1` |
| Persistência legado | Supabase Postgres | escopo `legacy-modules-only` (~56 módulos não migrados) |
| Storage | GCS public bucket | vídeos + assets servidos por URL pública |
| Fila async | Cloud Tasks (`bookagent-pipeline`, `bookagent-video`) | OIDC auth nas tasks; sync-mode é o fallback |
| AI default | Vertex AI (Gemini Enterprise) + multi-provider fallback | Anthropic / OpenAI / Gemini |
| Render vídeo | FFmpeg ultrafast local (Shotstack opcional) | binário no container |
| Secrets | Secret Manager + Workload Identity | mapeados via `--set-secrets` no `cloudbuild.yaml` |
| CI/CD | Cloud Build (`cloudbuild.yaml`) disparado por commit em `main` | imagem única → push → deploy Cloud Run |

## Fluxo de deploy

Build + push + deploy disparado **manualmente** ou via Cloud Build trigger:

```bash
gcloud builds submit --config=cloudbuild.yaml .
```

Etapas executadas pelo `cloudbuild.yaml`:

1. `fetch-next-public-envs` — pega `NEXT_PUBLIC_FIREBASE_*` do Secret Manager para inlinear no bundle Next.
2. `build-api` — `docker build` da imagem unificada com `--build-arg` Firebase.
3. `push-api` — push para Artifact Registry com tags `:${SHORT_SHA}` e `:latest`.
4. `deploy-api` — `gcloud run deploy` com `--set-env-vars` + `--set-secrets`.

Sem etapa Vercel. Sem deploy de worker separado (Cloud Tasks chama `/internal/execute-pipeline` no próprio container).

## Domínios

| Domínio | Destino | Uso |
|---|---|---|
| `bookreel.ai` | Cloud Run domain mapping | Landing pública |
| `bookreel.app` | Cloud Run domain mapping | Dashboard do cliente |
| `bookagent.db8intelligence.com.br` | Cloud Run domain mapping | URL alternativa |

Verificar mappings ativos:

```bash
gcloud run domain-mappings list --region=us-central1
```

Frontend é servido **dentro do Express** — não há proxy externo, não há rewrite Vercel.

## Env vars críticas

Ver `.env.example` (raiz) para a lista completa. Em produção, todas vêm de Secret Manager via Workload Identity:

```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT=bookreel
GOOGLE_CLOUD_LOCATION=us-central1
FIREBASE_PROJECT_ID=bookreel
GCS_ENABLED=true

# Cloud Tasks (opcional — sem, usa sync mode)
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_SA_EMAIL=bookagent-runtime@bookreel.iam.gserviceaccount.com
CLOUD_TASKS_PIPELINE_QUEUE=bookagent-pipeline
CLOUD_TASKS_VIDEO_QUEUE=bookagent-video
CLOUD_TASKS_TARGET_URL=         # URL do próprio Cloud Run (self-webhook)

# AI
AI_PROVIDER=vertex
ANTHROPIC_API_KEY=              # Secret Manager: anthropic-key
OPENAI_API_KEY=                 # opcional — fallback
GEMINI_API_KEY=                 # opcional — fallback

# Frontend Firebase (NEXT_PUBLIC_ — inlineadas no bundle no build)
NEXT_PUBLIC_FIREBASE_API_KEY=         # Secret Manager: firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=     # Secret Manager: firebase-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bookreel

# Render
VIDEO_RENDERER=ffmpeg
SHOTSTACK_API_KEY=              # opcional — fallback cloud

# Billing webhooks
KIWIFY_WEBHOOK_SECRET=
HOTMART_WEBHOOK_SECRET=

# Legado Supabase (até cortar dual-write nos 56 módulos)
SUPABASE_URL=                   # Secret Manager: supabase-url
SUPABASE_SERVICE_ROLE_KEY=      # Secret Manager: supabase-service-role
```

**Proibidos** (não restaurar): `REDIS_URL`, qualquer `RAILWAY_*`, `BULLMQ_*`, `VERCEL_TOKEN`, `VERCEL_TEAM_ID`. Vercel deploy hooks foram desativados em Sprint 3.1.

## Build & Start

### Backend (mesmo processo do frontend em prod)

```bash
npm run build        # tsc → dist/
npm run start        # node dist/index.js
```

### Frontend dev local

```bash
cd web
npm run dev          # next dev na porta 3001
```

Em prod o `web/` é servido pelo Express (`src/index.ts` faz `bootstrapNext()` e monta o handler do Next como catch-all não-API).

## Comandos operacionais

```bash
# Deploy Cloud Run via Cloud Build
gcloud builds submit --config=cloudbuild.yaml .

# Logs do Cloud Run
gcloud run services logs read bookagent-intelligence-engine --region=us-central1

# Listar revisões
gcloud run revisions list --service=bookagent-intelligence-engine --region=us-central1

# Health check (requer DNS apontando pro Cloud Run)
curl https://bookreel.app/health
curl https://bookagent.db8intelligence.com.br/health

# Sanity check Firestore (ADC)
npx tsx scripts/dev/check-firebase-connection.ts
```

## Arquivos de config

| Arquivo | Função |
|---|---|
| `cloudbuild.yaml` | Pipeline Cloud Build (build → push → deploy) |
| `Dockerfile` | Imagem unificada Express + Next.js |
| `.dockerignore` | Exclui artefatos de build, transformers cache, `.vercel/` defensivo |
| `.gcloudignore` | Exclui de upload pro Cloud Build (storage, dist, output, etc.) |
| `package.json` | Scripts backend + dependências Node |
| `web/package.json` | Scripts frontend Next + Firebase client |
| `tsconfig.json` | TypeScript backend |
| `.env.example` | Template de env vars |
| `firestore.indexes.json` | Índices compostos Firestore |

**Não existem:** `vercel.json`, `railway.toml`, `procfile`. Cloud Build é a única pipeline ativa.

## Monitoramento

- **Cloud Run logs** — `gcloud run services logs` ou Cloud Logging UI
- **Cloud Tasks** — Cloud Console → Cloud Tasks → queues `bookagent-pipeline` / `bookagent-video`
- **Firestore** — Cloud Console → Firestore → coleções `jobs`, `tasks`, `artifacts`, `profiles`
- **`/health`** — endpoint expõe status de providers, persistence mode, queue mode, secrets audit, role
- **`src/observability/`** — módulo interno de logging/metrics

## Histórico (referência)

Stack anterior (deprecated, desativado):

- **Railway** (backend) → substituído por Cloud Run.
- **Vercel** (frontend) → substituído por Next.js dentro do Express. Workflow GitHub Actions desativado em Sprint 3.1 (`.github/workflows/deploy-web.yml.disabled`).
- **BullMQ + Redis** → substituído por Cloud Tasks.
- **Supabase Auth** → substituído por Firebase Auth.

Ver `docs/MASTER.md` §7 (Estado da Migração GCP) para a tabela completa.
