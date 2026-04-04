# BookAgent Intelligence Engine — Backend Operacional e Persistência

> Parte 46: Persistência com Supabase / Storage / Jobs
> Data: 2026-04-04 | Versão: 0.2.0

---

## Visão Geral

O BookAgent opera em dois modos:

| Modo | Quando | Comportamento |
|------|--------|--------------|
| **In-memory** | `SUPABASE_URL` não configurado | Jobs e artifacts existem apenas na sessão atual. Restart perde tudo. |
| **Supabase** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` configurados | Jobs, artifacts e eventos persistidos. Histórico completo. |

---

## O que vai para onde

### Banco de dados (Supabase/Postgres)

| Dado | Tabela | O que é salvo |
|------|--------|--------------|
| Jobs | `bookagent_jobs` | ID, status, input, timestamps, contagens, duration |
| Eventos de pipeline | `bookagent_job_events` | Stage, módulo, timing, métricas por estágio |
| Artifacts | `bookagent_job_artifacts` | Tipo, formato, título, filePath, size, status |

**Nunca é salvo no banco:** conteúdo dos artifacts (HTML, MD, JSON, MP3) — apenas metadados e caminhos.

### Storage de arquivos

| Tipo | Caminho | Quando é criado |
|------|---------|-----------------|
| Assets extraídos | `storage/assets/{jobId}/` | Durante Ingestion + Extraction |
| Artigos de blog | `storage/outputs/blog/{slug}.html` | Após Render Export |
| Markdowns | `storage/outputs/blog/{slug}.md` | Após Render Export |
| Landing Pages | `storage/outputs/landing-page/{slug}.html` | Após Render Export |
| JSONs de planos | `storage/outputs/blog/{slug}.json` | Após Render Export |
| Render Specs | — (em memória para uso do render engine) | — |
| Narrações MP3 | `storage/outputs/audio/{planId}/seg-*.mp3` | Com `TTS_SYNTHESIS_ENABLED=true` |
| Temporários | `storage/temp/{jobId}/` | Durante processamento |

---

## Ativação

### 1. Criar projeto Supabase

Acesse [supabase.com](https://supabase.com), crie um projeto e copie:
- **URL do projeto**: `https://{ref}.supabase.co`
- **service_role key**: nas configurações de API

### 2. Aplicar o schema

No SQL Editor do Supabase, execute o conteúdo de:
```
supabase/migrations/001_initial_schema.sql
```

Ou via Supabase CLI:
```bash
supabase db push
```

### 3. Configurar variáveis de ambiente

```env
SUPABASE_URL=https://spjnymdizezgmzwoskoj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Verificar

Ao iniciar o servidor:
```
[Bootstrap] Persistence mode: Supabase (jobs + artifacts will be persisted)
```

Após processar um job:
```
[PersistentOrchestrator] Job abc-123 persisted (status=completed, 13 artifacts, 43ms)
[StorageManager] 4 files saved, 9 skipped, 0 failed
```

---

## Arquitetura de Persistência

```
API Request
    │
    ▼
PersistentOrchestrator.process(input)
    │
    ├─► Orchestrator.process(input)  ← Core (não modificado)
    │       │
    │       ├─► JobManager.createJob() → in-memory
    │       ├─► Pipeline.execute()    → 15 estágios
    │       └─► JobManager.markCompleted()
    │
    ├─► JobRepository.createJob()    → Supabase bookagent_jobs
    ├─► JobRepository.completeJob()  → Supabase bookagent_jobs UPDATE
    ├─► ArtifactRepository.saveArtifacts() → Supabase bookagent_job_artifacts
    └─► StorageManager.saveArtifactFiles() → Disco (storage/outputs/)
```

---

## Fallback Gracioso

Todas as operações de persistência são **best-effort**: falhas são logadas mas não interrompem o pipeline.

```
[PersistentOrchestrator] Persistence failed [persist job]: connection timeout.
Job result is preserved in memory.
```

Isso garante que o BookAgent continua operacional mesmo que o Supabase esteja indisponível.

---

## Schema do Banco

### `bookagent_jobs`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | ID único do job |
| `status` | TEXT | pending/processing/completed/failed |
| `input_file_url` | TEXT | URL do PDF processado |
| `input_type` | TEXT | pdf/url/text |
| `user_context` | JSONB | Contexto do usuário (projeto, região, etc.) |
| `created_at` | TIMESTAMPTZ | Quando o job foi criado |
| `updated_at` | TIMESTAMPTZ | Última atualização (auto) |
| `completed_at` | TIMESTAMPTZ | Quando terminou |
| `error` | TEXT | Mensagem de erro se falhou |
| `delivery_status` | TEXT | ready/partial/pending_upload/delivered |
| `sources_count` | INT | Quantidade de fontes geradas |
| `narratives_count` | INT | Quantidade de narrativas |
| `artifacts_count` | INT | Quantidade de artifacts |
| `pipeline_duration_ms` | INT | Tempo total do pipeline |

### `bookagent_job_events`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Auto-gerado |
| `job_id` | UUID | FK para bookagent_jobs |
| `stage` | TEXT | ingestion/book_analysis/etc. |
| `module_name` | TEXT | Nome do módulo |
| `status` | TEXT | completed/failed/skipped |
| `started_at` | TIMESTAMPTZ | Início do estágio |
| `completed_at` | TIMESTAMPTZ | Fim do estágio |
| `duration_ms` | INT | Duração |
| `metrics` | JSONB | itemsProcessed, itemsCreated, etc. |

### `bookagent_job_artifacts`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | ID do artifact |
| `job_id` | UUID | FK para bookagent_jobs |
| `artifact_type` | TEXT | BLOG_ARTICLE/LANDING_PAGE/MEDIA_RENDER_SPEC/etc. |
| `export_format` | TEXT | HTML/MARKDOWN/JSON/RENDER_SPEC |
| `title` | TEXT | Título legível |
| `file_path` | TEXT | Caminho do arquivo em storage/outputs/ |
| `size_bytes` | INT | Tamanho em bytes |
| `status` | TEXT | valid/partial/invalid |
| `warnings` | JSONB | Array de warnings |
| `referenced_asset_ids` | JSONB | IDs dos assets referenciados |

---

## Papel do n8n nesta arquitetura

| Responsabilidade | Sistema |
|-----------------|---------|
| Geração de conteúdo | BookAgent (core) |
| Persistência de jobs/artifacts | Supabase (via BookAgent) |
| Orquestração de fluxos de negócio | n8n |
| Triggers e webhooks externos | n8n |
| Retry e reprocessamento | n8n |
| Distribuição para canais (WhatsApp, email) | n8n |
| Dashboard e histórico | Supabase + aplicação |

O BookAgent é o **engine** — gera, persiste e entrega os artifacts.
O n8n é o **orquestrador externo** — decide quando rodar o BookAgent, o que fazer com os outputs, e como notificar os usuários.

O n8n **não deve** ser o repositório de estado do BookAgent. O estado fica no Supabase.

---

## Preparação para Railway

O sistema está pronto para deploy no Railway:

1. **Storage**: em Railway, configurar um volume persistente e apontar as vars:
   ```env
   ASSETS_DIR=/data/storage/assets
   OUTPUTS_DIR=/data/storage/outputs
   TEMP_DIR=/data/storage/temp
   ```

2. **Supabase**: o mesmo projeto Supabase pode ser acessado de qualquer ambiente. As variáveis de ambiente são suficientes.

3. **Sem dependência de estado local**: com Supabase configurado, o BookAgent pode ser escalado horizontalmente (múltiplas instâncias, cada uma sem estado).

4. **Healthcheck**:
   ```
   GET /health
   → { status: "ok", persistence: { mode: "supabase" }, providers: {...} }
   ```

---

## Próximos Passos (Parte 47+)

1. **Fila de Jobs Assíncrona** — Bull/BullMQ + Redis para processamento em background
2. **Webhooks** — Delivery module notifica n8n após conclusão do job
3. **Supabase Storage** para assets grandes (ao invés de disco local)
4. **Dashboard** — Leitura do Supabase para visualizar jobs e artifacts em tempo real
5. **Multi-tenant** — user_id nas tabelas + RLS por usuário
