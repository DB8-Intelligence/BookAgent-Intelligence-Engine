# BookAgent Intelligence Engine — Orquestração Operacional via n8n

> Parte 48.1: Orquestração Operacional Completa
> Data: 2026-04-04 | Versão: 0.2.1

---

## Visão Geral

O BookAgent opera em dois planos distintos:

| Componente | Responsabilidade |
|------------|-----------------|
| **BookAgent** | Inteligência: extrai, analisa, gera conteúdo, persiste artifacts |
| **n8n** | Operação: recebe, roteia, notifica, aguarda aprovação, publica |

```
Usuário (WhatsApp / Dashboard)
         │
         ▼
       n8n                          ← orquestra a jornada do usuário
         │
         ├─► POST /api/v1/process   ← BookAgent processa o material
         │         │
         │         ▼
         │   Pipeline (15 estágios) + Supabase
         │         │
         │         └─► POST webhook_url  → n8n recebe conclusão
         │
         ├─► Notificar usuário (WhatsApp / Dashboard)
         ├─► Aguardar aprovação
         ├─► Registrar decisão
         └─► [Plano Pro] Publicar automaticamente
```

---

## Separação de Responsabilidades

### O que o BookAgent faz

- Recebe `POST /api/v1/process` com `{ file_url, type, user_context, webhook_url }`
- Executa pipeline de 15 estágios (extração, análise, geração)
- Persiste jobs, artifacts e eventos no Supabase
- Salva arquivos em `storage/outputs/`
- Notifica n8n via `POST webhook_url` ao finalizar

### O que o n8n faz

- Recebe material do usuário (WhatsApp ou upload no dashboard)
- Registra metadados do job (canal, usuário, plano)
- Chama o BookAgent
- Aguarda webhook de conclusão
- Busca artifacts gerados
- Envia prévias para aprovação (WhatsApp ou dashboard)
- Registra aprovação/rejeição/comentários
- [Plano Pro] Direciona para publicação automática

### O que o n8n NÃO faz

- NÃO armazena estado principal do job (isso fica no Supabase via BookAgent)
- NÃO processa o conteúdo (isso é função do BookAgent)
- NÃO gera artifacts (geração = BookAgent, distribuição = n8n)

---

## Canais de Interação

### Canal WhatsApp

| Momento | Ação |
|---------|------|
| Entrada | Usuário envia PDF/link pelo WhatsApp |
| Confirmação | n8n responde: "Recebi! Processando..." |
| Prévia | n8n envia links dos artifacts para aprovação |
| Aprovação | Usuário responde "APROVAR", "REPROVAR" ou comentário |
| Entrega final | n8n envia pacote final ou confirma publicação |

**Integração recomendada:** Evolution API ou WhatsApp Business API oficial

### Canal Dashboard

| Momento | Ação |
|---------|------|
| Entrada | Usuário faz upload no dashboard + inicia job |
| Status | Dashboard consulta `GET /api/v1/jobs/:jobId` |
| Prévia | Dashboard renderiza artifacts inline |
| Aprovação | Usuário clica em "Aprovar" ou adiciona comentário |
| Entrega final | Dashboard disponibiliza download ou publica |

**Integração:** Dashboard chama n8n via webhook em `POST /webhook/bookagent/dashboard/entrada`

---

## Planos

| Feature | Plano Básico | Plano Pro |
|---------|-------------|-----------|
| Processamento via WhatsApp | ✓ | ✓ |
| Processamento via dashboard | ✓ | ✓ |
| Aprovação por WhatsApp | ✓ | ✓ |
| Aprovação pelo dashboard | ✓ | ✓ |
| Download de artifacts | ✓ | ✓ |
| Publicação manual | ✓ | ✓ |
| Publicação automática ao aprovar | ✗ | ✓ |
| Integração com redes sociais | ✗ | ✓ |
| Integração com outros SaaS | ✗ | ✓ |

---

## Workflows n8n (Implementados)

| # | Nome | ID | URL | Trigger |
|---|------|----|-----|---------|
| 1 | Entrada via WhatsApp | `fGqegfeCD8tL0dYt` | [abrir](https://automacao.db8intelligence.com.br/workflow/fGqegfeCD8tL0dYt) | `POST /webhook/bookagent/whatsapp/entrada` |
| 2 | Entrada via Dashboard | `2qvWRHgNsF87QhK6` | [abrir](https://automacao.db8intelligence.com.br/workflow/2qvWRHgNsF87QhK6) | `POST /webhook/bookagent/dashboard/entrada` |
| 3 | Conclusão e Aprovação | `OTngDjKCxPs0gzPT` | [abrir](https://automacao.db8intelligence.com.br/workflow/OTngDjKCxPs0gzPT) | `POST /webhook/bookagent/concluido` |
| 4 | Aprovação, Entrega e Pro | `66e8qpwkHcBFLUP7` | [abrir](https://automacao.db8intelligence.com.br/workflow/66e8qpwkHcBFLUP7) | `POST /webhook/bookagent/aprovacao` |

---

## Fluxos Operacionais

### Fluxo 1 — Entrada via WhatsApp

**Workflow:** `fGqegfeCD8tL0dYt`

```
Evolution API → POST /webhook/bookagent/whatsapp/entrada
  payload: { phone, mediaUrl, userId, planType, userContext }
    │
    ▼
[Extrair Dados do Payload]
  phone, mediaUrl, userId, planType, sourceChannel='whatsapp'
    │
    ▼
[POST /api/v1/process] → BookAgent
  { file_url, type, user_context,
    webhook_url: ".../webhook/bookagent/concluido" }
    │
    ▼ { job_id, status: "pending" }
    │
    ├─► [Salvar Meta no Supabase: bookagent_job_meta]
    │     { job_id, user_id, plan_type, source_channel="whatsapp",
    │       auto_publish, webhook_phone }
    │
    ├─► [Notificar Usuário WhatsApp]
    │     "✅ Material recebido! Processando... ID: {jobId}"
    │
    └─► [Responder 200 ao Evolution API]
```

**Dados de entrada (payload para o webhook):**
```json
{
  "phone": "5511999999999",
  "mediaUrl": "https://storage.example.com/material.pdf",
  "userId": "user_123",
  "planType": "pro",
  "userContext": {
    "name": "Residencial Vista Verde",
    "region": "São Paulo",
    "whatsapp": "5511999999999",
    "instagram": "@vistaverde",
    "site": "https://vistaverde.com.br"
  }
}
```

---

### Fluxo 2 — Entrada via Dashboard

**Workflow:** `2qvWRHgNsF87QhK6`

```
Dashboard → POST /webhook/bookagent/dashboard/entrada
  payload: { fileUrl, fileType, userId, planType, autoPublish, userContext }
    │
    ▼
[Extrair Dados do Dashboard]
  fileUrl, fileType, userId, planType, autoPublish, sourceChannel='dashboard'
    │
    ▼
[POST /api/v1/process] → BookAgent
    │
    ▼ { job_id, status: "pending" }
    │
    ├─► [Salvar Meta no Supabase: bookagent_job_meta]
    │     { job_id, user_id, plan_type, source_channel="dashboard", auto_publish }
    │
    └─► [Retornar 202 ao Dashboard]
          { success: true, jobId, status: "processing" }
```

**Dashboard deve fazer polling após receber jobId:**
```
GET https://api.db8intelligence.com.br/api/v1/jobs/{jobId}
```

**Dados de entrada:**
```json
{
  "fileUrl": "https://storage.supabase.co/bucket/arquivo.pdf",
  "fileType": "pdf",
  "userId": "user_456",
  "planType": "pro",
  "autoPublish": true,
  "userContext": {
    "name": "Lançamento Aurora",
    "region": "Curitiba - PR",
    "logoUrl": "https://storage.supabase.co/logos/aurora.png"
  }
}
```

---

### Fluxo 3 — Conclusão e Gate de Aprovação

**Workflow:** `OTngDjKCxPs0gzPT`

```
BookAgent → POST /webhook/bookagent/concluido
  payload: { source, jobId, status, artifacts_count, duration_ms }
    │
    ▼
[Extrair Dados da Conclusão]
    │
    ▼
[Buscar Meta do Job — Supabase: bookagent_job_meta]
  → user_id, plan_type, source_channel, webhook_phone
    │
    ▼
[Normalizar Metadados]  ← combina dados do webhook + Supabase
    │
    ▼
[Switch: status]
    │
    ├─ "completed" ──────────────────────────────────────┐
    │   ├─► [GET /api/v1/jobs/:jobId/artifacts]           │
    │   ├─► [Registrar pending_review: bookagent_approvals]│
    │   └─► [Switch: source_channel]                      │
    │         ├─ "whatsapp" → Enviar prévia + instruções  │
    │         └─ "dashboard" → Update status='awaiting'   │
    │                                                      │
    └─ "failed" ─────────────────────────────────────────┘
        └─► [Switch: source_channel]
              ├─ "whatsapp" → Notificar erro
              └─ "dashboard" → Update status='failed'
```

**Webhook recebido do BookAgent:**
```json
{
  "source": "bookagent",
  "timestamp": "2026-04-04T15:00:00.000Z",
  "jobId": "550e8400-...",
  "status": "completed",
  "artifacts_count": 13,
  "duration_ms": 42350
}
```

---

### Fluxo 4 — Aprovação, Entrega e Publicação Pro

**Workflow:** `66e8qpwkHcBFLUP7`

```
WhatsApp reply ou Dashboard → POST /webhook/bookagent/aprovacao
  payload: { jobId, userId, decision, comment?, sourceChannel }
    │
    ▼
[Extrair Decisão do Usuário]
    │
    ▼
[Buscar Meta — Supabase: bookagent_job_meta]
  → plan_type, auto_publish, webhook_phone
    │
    ▼
[Normalizar Dados de Aprovação]
    │
    ▼
[Salvar Decisão — Supabase: bookagent_approvals]
    │
    ▼
[Switch: decision]
    │
    ├─ "approved" ─────────────────────────────────────────────────┐
    │   [Switch: plan_type]                                         │
    │     │                                                         │
    │     ├─ "basic" → Notificar download + Atualizar status       │
    │     │                                                         │
    │     └─ "pro"                                                  │
    │           [If: auto_publish == true]                          │
    │             │                                                 │
    │             ├─ true  → Publicar Instagram (stub)             │
    │             │          → Publicar Facebook (stub)            │
    │             │          → Registrar bookagent_publications     │
    │             │          → Confirmar publicação WhatsApp       │
    │             │                                                 │
    │             └─ false → Oferecer publicação manual            │
    │                                                               │
    ├─ "rejected" → Notificar rejeição + Update status='rejected'  │
    │                                                               │
    └─ "comment"  → Salvar comentário + Confirmar recebimento     ─┘
```

**Payload de decisão (de WhatsApp ou Dashboard):**
```json
{
  "jobId": "550e8400-...",
  "userId": "user_123",
  "decision": "approved",
  "comment": "",
  "sourceChannel": "whatsapp",
  "approvalRound": 1
}
```

**Decisões válidas:** `approved` | `rejected` | `comment`

---

## Estado de Aprovação por Job

O campo `approval_status` em `bookagent_job_meta` evolui assim:

```
[criado] → pending_review → awaiting_approval
                                │
                    ┌───────────┼───────────┐
                    │           │           │
                 approved    rejected   comment_pending
                    │           │           │
              ┌─────┴─────┐     │     (loop de revisão)
              │           │     │
           basic:      pro:     │
          downloaded  published  reprovado→revisão
```

---

## Contratos de API entre n8n e BookAgent

### 1. Submeter job

```http
POST /api/v1/process
Content-Type: application/json

{
  "file_url": "https://storage.supabase.co/bucket/arquivo.pdf",
  "type": "pdf",
  "user_context": {
    "name": "Residencial Vista Verde",
    "region": "São Paulo - SP",
    "whatsapp": "5511999999999",
    "instagram": "@vistaverde",
    "site": "https://vistaverde.com.br"
  },
  "webhook_url": "https://automacao.db8intelligence.com.br/webhook/bookagent/concluido"
}

→ 202 { job_id, status: "pending", message }
```

### 2. Consultar status

```http
GET /api/v1/jobs/{jobId}

→ 200 {
  job_id, status, has_result,
  output_summary: { artifacts, sources_count, ... },
  created_at, updated_at
}
```

### 3. Listar artifacts

```http
GET /api/v1/jobs/{jobId}/artifacts?type=blog-article&format=html

→ 200 [{ id, artifact_type, export_format, title, size_bytes, status }]
```

### 4. Webhook do BookAgent → n8n

```http
POST https://automacao.db8intelligence.com.br/webhook/bookagent/concluido
Content-Type: application/json

{
  "source": "bookagent",
  "timestamp": "2026-04-04T15:00:00.000Z",
  "jobId": "550e8400-...",
  "status": "completed",
  "artifacts_count": 13,
  "duration_ms": 42350
}
```

---

## Tabelas Supabase

### `bookagent_job_meta`

```sql
CREATE TABLE IF NOT EXISTS bookagent_job_meta (
  job_id           UUID PRIMARY KEY REFERENCES bookagent_jobs(id),
  user_id          TEXT NOT NULL,
  plan_type        TEXT NOT NULL DEFAULT 'basic'
                     CHECK (plan_type IN ('basic', 'pro')),
  source_channel   TEXT NOT NULL DEFAULT 'api'
                     CHECK (source_channel IN ('whatsapp', 'dashboard', 'api')),
  auto_publish     BOOLEAN NOT NULL DEFAULT false,
  webhook_phone    TEXT,
  approval_status  TEXT DEFAULT 'pending_review'
                     CHECK (approval_status IN (
                       'pending_review', 'awaiting_approval', 'approved',
                       'rejected', 'comment_pending', 'published', 'failed'
                     )),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `bookagent_approvals`

```sql
CREATE TABLE IF NOT EXISTS bookagent_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  decision         TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'comment', 'pending_review')),
  comment          TEXT,
  approval_round   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX bookagent_approvals_job_id_idx ON bookagent_approvals (job_id);
CREATE INDEX bookagent_approvals_user_id_idx ON bookagent_approvals (user_id);
```

### `bookagent_publications`

```sql
CREATE TABLE IF NOT EXISTS bookagent_publications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES bookagent_jobs(id),
  user_id          TEXT NOT NULL,
  platform         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('published', 'failed', 'scheduled')),
  platform_post_id TEXT,
  platform_url     TEXT,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Credenciais n8n Necessárias

| Credencial | Tipo | Uso |
|------------|------|-----|
| `BookAgent API Key` | HTTP Header Auth | Chamadas à API do BookAgent |
| `Supabase BookAgent` | Supabase API | Leitura/escrita de metadados |
| `Evolution API Key` | HTTP Header Auth | Envio de mensagens WhatsApp |
| `Instagram Graph API` | HTTP Header Auth | Publicação Instagram (Parte 49) |
| `Facebook Graph API` | HTTP Header Auth | Publicação Facebook (Parte 49) |

---

## Variáveis de Ambiente

### No BookAgent (Railway)

```env
# URL base do n8n — usada no webhook_url de cada job
N8N_WEBHOOK_BASE_URL=https://automacao.db8intelligence.com.br
```

### No .env.example do BookAgent

O `webhook_url` no payload de `POST /process` deve apontar para:
```
https://automacao.db8intelligence.com.br/webhook/bookagent/concluido
```

---

## Diagrama de Estado Completo

```
                    ┌─────────────┐
  Usuário submete   │   pending   │ Job na fila / aguardando worker
  ─────────────────►│             │
                    └──────┬──────┘
                           │ Worker inicia
                    ┌──────▼──────┐
                    │ processing  │ Pipeline executando
                    └──────┬──────┘
                           │
               ┌───────────┴───────────┐
               │                       │
        ┌──────▼──────┐         ┌──────▼──────┐
        │  completed  │         │   failed    │
        └──────┬──────┘         └──────┬──────┘
               │ Fluxo 3               │ Fluxo 3
               │                       │ notifica erro
        ┌──────▼──────┐
        │  awaiting   │ n8n enviou prévia, aguarda resposta
        │  approval   │
        └──────┬──────┘
               │
       ┌───────┼────────────┐
       │       │            │
   approved  rejected    comment
       │       │            │
       │   ┌───▼───┐   ┌────▼──────┐
       │   │revisa │   │loop review│
       │   └───────┘   └───────────┘
       │
  ┌────▼──────────┐
  │  basic: approved   │  → download
  │  pro + auto: true  │  → Instagram + Facebook (stub)
  │  pro + auto: false │  → oferecer publicação manual
  └───────────────┘
```

---

## Como o Usuário Interage

### Via WhatsApp

1. **Envia o PDF** → Evolution API captura → Fluxo 1 é acionado
2. **Recebe confirmação** → "✅ Material recebido! ID: abc-123"
3. **Aguarda processamento** (~5-15 min dependendo do material)
4. **Recebe prévia** → "🎉 Seu material foi processado! 13 peças geradas. Acesse: [link] — Responda: APROVAR, REPROVAR ou comentário"
5. **Responde "APROVAR"** → Dashboard/webhook chama Fluxo 4
6. **Recebe download ou confirmação de publicação**

### Via Dashboard

1. **Faz upload** → Dashboard chama Fluxo 2
2. **Recebe jobId** → UI mostra "Processando..."
3. **Dashboard faz polling** em `GET /api/v1/jobs/:jobId`
4. **Job conclui** → Fluxo 3 atualiza Supabase → Dashboard reage
5. **UI mostra artifacts** → Usuário clica "Aprovar"
6. **Dashboard chama Fluxo 4** com `{ jobId, decision: "approved" }`
7. **Plano Pro com auto_publish** → publicação automática iniciada

---

## Como o Plano Pro Muda a Jornada

| Etapa | Plano Basic | Plano Pro |
|-------|------------|-----------|
| Processamento | ✓ idêntico | ✓ idêntico |
| Notificação de conclusão | ✓ idêntico | ✓ idêntico |
| Aprovação | ✓ idêntico | ✓ idêntico |
| Entrega após aprovação | Link de download | Download + opção de publicar |
| Publicação automática | ✗ | ✓ se `auto_publish=true` |
| Plataformas | — | Instagram, Facebook (+ futuras) |
| Confirmação de publicação | — | "🚀 Publicado em: Instagram, Facebook" |

---

## Próximos Passos (Parte 49+)

1. **Migration Supabase** — criar tabelas `bookagent_job_meta`, `bookagent_approvals`, `bookagent_publications` via MCP Supabase
2. **Evolution API real** — substituir placeholders pela URL da instância Evolution
3. **Instagram Graph API** — implementar publicação real (Fluxo 4, stubs prontos)
4. **Facebook Graph API** — implementar publicação real (Fluxo 4, stubs prontos)
5. **Dashboard** — Frontend para visualização, aprovação e controle de jobs
6. **Parser WhatsApp** — Interpretar respostas textuais ("APROVAR", "REPROVAR") e normalizar para `{ decision }` antes de chamar o Fluxo 4
7. **Bull Board** — Dashboard para monitorar fila BullMQ em tempo real
8. **Integração CMS/Blog** — Publicação via webhook em site próprio do cliente
