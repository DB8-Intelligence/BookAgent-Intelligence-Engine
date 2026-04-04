# BookAgent Intelligence Engine — Piloto Controlado

> Parte 52: Primeiro Fluxo Completo em Produção Controlada
> Data: 2026-04-04

---

## Objetivo do Piloto

Executar um ciclo completo do BookAgent em ambiente real, com um job real monitorado
ponta a ponta, validando cada transição de estado, tempo por etapa e comportamento
das integrações.

**Não é teste de carga. É validação operacional.**

---

## Pré-condições Obrigatórias

Antes de iniciar o piloto, confirme cada item:

### Infraestrutura

- [ ] **BookAgent API rodando** em Railway: `GET https://api.db8intelligence.com.br/health` → `{ status: "ok" }`
- [ ] **Supabase configurado**: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no Railway
- [ ] **Redis configurado** (ou sync mode OK): `REDIS_URL` no Railway
- [ ] **AI Provider configurado**: `OPENAI_API_KEY` ou `ANTHROPIC_API_KEY` no Railway
- [ ] **n8n rodando**: `https://automacao.db8intelligence.com.br`

### Supabase (migrations)

- [ ] Migration 001 aplicada (`bookagent_jobs`, `bookagent_job_artifacts`, `bookagent_job_events`)
- [ ] Migration 002 aplicada (`bookagent_job_meta`, `bookagent_approvals`, `bookagent_publications`, `bookagent_comments`, view `bookagent_jobs_dashboard`)
- [ ] Migration 003 aplicada (`bookagent_publications.payload`, `.response_metadata`, `.attempt_count`; `bookagent_job_artifacts.content_url`, `.content`)

### n8n Workflows

- [ ] Fluxo 1 (`fGqegfeCD8tL0dYt`) — ativo e credenciais configuradas
- [ ] Fluxo 2 (`2qvWRHgNsF87QhK6`) — ativo e credenciais configuradas
- [ ] Fluxo 3 (`OTngDjKCxPs0gzPT`) — ativo e credenciais configuradas
- [ ] Fluxo 4 (`66e8qpwkHcBFLUP7`) — ativo e credenciais configuradas
- [ ] Fluxo 5 (`vSYcdCpvGrCSEQBe`) — ativo e credenciais configuradas
- [ ] Fluxo 6 (`FsMA0okYCQ2hAjGB`) — ativo e credenciais configuradas
- [ ] Credencial `Supabase BookAgent` configurada em todos os fluxos
- [ ] Credencial `BookAgent API Key` configurada (header auth)
- [ ] URLs da Evolution API substituídas nos placeholder nodes

### PDF de teste

- [ ] PDF disponível (livro real ou amostra de pelo menos 20 páginas)
- [ ] URL pública do PDF (ou upload direto via dashboard)

---

## Fluxo do Piloto

### Cenário A: Entrada via Dashboard (recomendado para primeira execução)

```
Dashboard/API
  → POST /api/v1/process  (ou Fluxo 2 webhook)
  → Job criado (status: pending → processing)
  → Pipeline executado (15 módulos)
  → Fluxo 3 notificado (status: awaiting_final_review)
  → Aprovação via dashboard ou API
  → Fluxo 4 executado
  → Download (básico) ou publicação (pro)
```

### Cenário B: Entrada via WhatsApp (depois do Cenário A funcionar)

```
WhatsApp → Evolution API → n8n Fluxo 1 → BookAgent → Fluxo 3 → Aprovação → Fluxo 4
```

---

## Checklist Passo a Passo

### Etapa 1 — Health Check

```bash
curl https://api.db8intelligence.com.br/health
```

Esperar:
```json
{
  "status": "ok",
  "persistence": { "mode": "supabase", "supabase": true },
  "queue": { "mode": "bullmq" | "sync" },
  "providers": { "ai": { "available": true } }
}
```

- [ ] `status: "ok"`
- [ ] `persistence.supabase: true`
- [ ] `providers.ai.available: true`

---

### Etapa 2 — Criar Job

**Via API direta (sem n8n):**

```bash
curl -X POST https://api.db8intelligence.com.br/api/v1/process \
  -H "Content-Type: application/json" \
  -d '{
    "file_url": "https://url-do-pdf.com/livro.pdf",
    "type": "pdf",
    "user_context": {
      "name": "Teste Piloto",
      "region": "São Paulo"
    }
  }'
```

Esperar:
```json
{ "success": true, "data": { "jobId": "uuid-gerado", "status": "pending" } }
```

- [ ] `jobId` recebido — **anotar: `JOB_ID=...`**
- [ ] Status inicial: `pending`

---

### Etapa 3 — Monitorar Processamento

Polling a cada 10s enquanto status = `processing`:

```bash
JOB_ID="cole-o-uuid-aqui"
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID
```

Registrar:
- [ ] `status: processing` → início do pipeline
- [ ] Timestamp de início: `_______________`
- [ ] `status: completed` → pipeline finalizado
- [ ] Timestamp de conclusão: `_______________`
- [ ] Duração: `_______________` ms
- [ ] `artifacts_count`: `_______________`
- [ ] Algum erro no campo `error`?: Sim / Não

**Se status = `failed`:** ver [Seção de Diagnóstico de Falhas](#diagnóstico-de-falhas)

---

### Etapa 4 — Verificar Artifacts

```bash
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID/artifacts
```

Registrar:
- [ ] Total de artifacts: `_______________`
- [ ] Artifact `blog-article` presente?: Sim / Não
- [ ] Artifact `landing-page` presente?: Sim / Não
- [ ] Artifact `media-metadata` presente?: Sim / Não
- [ ] Artifact `media-render-spec` presente?: Sim / Não
- [ ] Artifacts com `status: "valid"`: `_______________`
- [ ] Artifacts com `status: "partial"`: `_______________`
- [ ] Artifacts com `status: "invalid"`: `_______________`

---

### Etapa 5 — Verificar Estado de Aprovação

Via dashboard view:
```bash
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID/dashboard
```

Registrar:
- [ ] `approval_status`: `_______________`
- [ ] Esperado: `awaiting_final_review`
- [ ] `plan_type`: `_______________`
- [ ] `auto_publish`: `_______________`
- [ ] Registro em `bookagent_job_meta` criado pelo n8n: Sim / Não

> **Se `bookagent_job_meta` não existe para o job:** o Fluxo 2 não foi executado.
> Use o endpoint Fluxo 2 manualmente ou execute via API direto com `setJobMeta`.

---

### Etapa 6 — Aprovar o Job

```bash
curl -X POST https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID/approve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "piloto_user_1",
    "approvalType": "final",
    "comment": "Aprovado no piloto controlado"
  }'
```

Registrar:
- [ ] Response `decision: "approved"`
- [ ] Response `status: "final_approved"`
- [ ] `n8nTriggered: true` (Fluxo 4 foi chamado)
- [ ] Timestamp da aprovação: `_______________`

---

### Etapa 7 — Verificar Pós-Aprovação

```bash
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID/dashboard
```

Para plano **basic**:
- [ ] `approval_status: "final_approved"`
- [ ] Link de download disponível

Para plano **pro** com `auto_publish=true`:
- [ ] `approval_status: "published"` (após Fluxo 4 executar)
- [ ] Publicações em `bookagent_publications`

```bash
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID/publications
```

- [ ] Registro para Instagram: Sim / Não
- [ ] Registro para Facebook: Sim / Não
- [ ] Status da publicação: `published` / `failed` / `skipped`

---

### Etapa 8 — Verificar Rastreabilidade Completa

Confirmar no Supabase (SQL Editor):

```sql
-- Timeline completa do job
SELECT stage, module_name, status, duration_ms, error
FROM bookagent_job_events
WHERE job_id = 'COLE-JOB-ID-AQUI'
ORDER BY started_at;

-- Decisões de aprovação
SELECT decision, comment, approval_round, source_channel, created_at
FROM bookagent_approvals
WHERE job_id = 'COLE-JOB-ID-AQUI';

-- Publicações
SELECT platform, status, platform_post_id, error, attempt_count
FROM bookagent_publications
WHERE job_id = 'COLE-JOB-ID-AQUI';
```

- [ ] Todos os 15 módulos presentes em `bookagent_job_events`
- [ ] Aprovação registrada em `bookagent_approvals`
- [ ] Publicações registradas em `bookagent_publications` (se pro)

---

## Métricas do Piloto

Registre ao final:

| Métrica | Valor |
|---------|-------|
| Tempo total (submit → completed) | |
| Tempo de processamento (ms) | |
| Total de artifacts gerados | |
| Artifacts válidos | |
| Artifacts parciais | |
| Tempo até notificação (n8n Fluxo 3) | |
| Tempo até aprovação | |
| Publicação Instagram: sucesso/falha/skipped | |
| Publicação Facebook: sucesso/falha/skipped | |
| Erros encontrados | |
| Retries necessários | |

---

## Diagnóstico de Falhas

### status = "failed" no job

```bash
# Ver detalhes do erro
curl https://api.db8intelligence.com.br/api/v1/jobs/$JOB_ID

# Ver qual módulo falhou
SELECT stage, module_name, error FROM bookagent_job_events
WHERE job_id = 'JOB_ID' AND status = 'failed';
```

### n8nTriggered = false

O Fluxo 4 não foi chamado. Causas comuns:
1. Fluxo 4 não está ativo no n8n → ativar
2. Webhook URL errada no `N8N_WEBHOOK_BASE_URL` env var
3. Timeout de rede → verificar logs do BookAgent no Railway

### approval_status não atualiza

O n8n não está escrevendo no Supabase. Verificar:
1. Credencial `Supabase BookAgent` configurada no n8n
2. Executar o fluxo manualmente no n8n com teste
3. Verificar logs de execução do n8n

### Publicação falha com "Invalid OAuth access token"

1. Token expirou → gerar novo no Meta Developer Portal
2. Escopos insuficientes → verificar `instagram_content_publish`, `pages_manage_posts`
3. Conta não é Business → converter no Instagram ou Facebook

---

## Repetindo o Piloto

Para repetir com um novo PDF:
1. Use um `jobId` diferente (cada POST /process cria um novo)
2. Registre as métricas em uma tabela comparativa
3. Execute pelo menos 3 ciclos antes de concluir a validação

---

## Critérios de Aprovação do Piloto

O piloto é considerado **bem-sucedido** quando:

- [ ] Pipeline completa sem `status: "failed"` para um PDF real
- [ ] Todos os 15 módulos executam (mesmo com resultados parciais)
- [ ] Fluxo 3 é notificado e atualiza `approval_status` corretamente
- [ ] Aprovação via API funciona e aciona Fluxo 4
- [ ] Pelo menos UMA plataforma social publica com sucesso (plano Pro)
  OU o link de download é gerado (plano Basic)
- [ ] Rastreabilidade completa no Supabase (events + approvals + publications)

---

## Melhorias Pré-Escala (baseadas no piloto)

Registrar aqui após executar o piloto:

| Problema encontrado | Severidade | Solução proposta |
|--------------------|-----------|-----------------|
| | | |
| | | |
| | | |
