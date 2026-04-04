# BookAgent Intelligence Engine — Dashboard: Estados, Comentários e Aprovação

> Parte 50: Integração Dashboard com Estados, Comentários, Aprovações e Publicação
> Data: 2026-04-04 | Versão: 0.2.1

---

## Visão Geral

O dashboard é o canal visual e interativo da operação do BookAgent.
Ele coexiste com o WhatsApp: ambos podem aprovar, comentar e publicar,
e o estado é sempre sincronizado pelo Supabase (`bookagent_job_meta`).

```
Dashboard                  BookAgent API              n8n / Supabase
─────────────────────────────────────────────────────────────────────
Upload PDF            →    POST /process         →   Fluxo 2
                      ←    { jobId, status }

Polling status         →   GET /jobs/:jobId/dashboard
UI atualiza com estado ←   { approval_status, ... }

Clicar "Aprovar"       →   POST /jobs/:jobId/approve
                       →   n8n Fluxo 4 (webhook)
                       ←   { decision, status, n8nTriggered }

Ver comentários        →   GET /jobs/:jobId/comments
                       ←   [ { comment, source_channel, ... } ]

Publicar (Pro)         →   POST /jobs/:jobId/publish
                       →   n8n Fluxo 4 (forcePublish=true)
```

---

## Estados do Dashboard

### Mapa completo de estados (`approval_status`)

```
                ┌──────────────────────────────────────────────────────────────┐
                │                                                              │
  [Entrada]     │   pending → processing                                       │
                │                  │                                           │
                │          ┌───────┴───────────┐                              │
                │          │                   │                              │
  [Pipeline]    │  awaiting_intermediate  awaiting_final                       │
                │  _review             _review                                 │
                │       │                   │                                  │
                │   ┌───┴───┐           ┌───┴───┐                             │
                │   │       │           │       │                             │
  [Decisão]   inter_   inter_       final_   final_                           │
              approved rejected    approved rejected                           │
                │       │               │       │                             │
                │  (nova rodada)    ┌───┘  (nova rodada)                      │
                │       │           │           │                             │
                │       ↓           │           ↓                             │
                │  awaiting_final   │    awaiting_final                        │
                │  _review          │    _review                              │
                │                   │                                         │
  [Entrega]                     ┌───┴───────────┐                             │
                │           Pro/auto         Básico                           │
                │               │               │                             │
                │    ┌──────────┴────┐      download                          │
                │    │               │                                         │
                │ published   publish_failed → retry                          │
                └──────────────────────────────────────────────────────────────┘
                │
                └─ failed (falha no processamento BookAgent)
```

---

### Tabela de estados

| Estado | Label | Badge | Ação do usuário | Quem define |
|--------|-------|-------|-----------------|-------------|
| `pending` | Na fila | gray | — | n8n (ao criar job) |
| `processing` | Processando... | blue | — | n8n (ao confirmar worker) |
| `awaiting_intermediate_review` | Aguardando revisão intermediária | yellow | Aprovar / Reprovar / Comentar | n8n (Fluxo 3) |
| `intermediate_approved` | Prévia aprovada | green | — | Dashboard / WhatsApp |
| `intermediate_rejected` | Prévia reprovada | red | Enviar instrução | Dashboard / WhatsApp |
| `awaiting_final_review` | Aguardando aprovação final | yellow | Aprovar / Reprovar / Comentar | n8n (Fluxo 3) |
| `final_approved` | Aprovado | green | Publicar (Pro) | Dashboard / WhatsApp |
| `final_rejected` | Reprovado | red | Enviar instrução | Dashboard / WhatsApp |
| `published` | Publicado | purple | Ver publicações | n8n (Fluxo 4) |
| `publish_failed` | Falha na publicação | red | Tentar novamente | n8n (Fluxo 4) |
| `failed` | Falha no processamento | red | Reprocessar | BookAgent |

---

### Transições válidas

```typescript
pending                      → ['processing']
processing                   → ['awaiting_intermediate_review', 'awaiting_final_review', 'failed']
awaiting_intermediate_review → ['intermediate_approved', 'intermediate_rejected']
intermediate_approved        → ['awaiting_final_review']
intermediate_rejected        → ['awaiting_intermediate_review']       // nova rodada
awaiting_final_review        → ['final_approved', 'final_rejected']
final_approved               → ['published', 'publish_failed']        // plano Pro
final_rejected               → ['awaiting_final_review']              // nova rodada
published                    → []
publish_failed               → ['published']                          // retry
failed                       → []
```

---

## Modelo de Comentários

### Tabela `bookagent_comments`

```
job_id           → FK para bookagent_jobs
user_id          → ID do usuário
comment          → texto do comentário
comment_type     → 'general' | 'intermediate' | 'final'
source_channel   → 'whatsapp' | 'dashboard'
approval_round   → rodada de aprovação (1, 2, 3...)
created_at       → timestamp
```

### Tipos de comentário

| Tipo | Quando | Canal |
|------|--------|-------|
| `intermediate` | Durante revisão de prévia | Dashboard / WhatsApp |
| `final` | Durante revisão do pacote final | Dashboard / WhatsApp |
| `general` | Qualquer momento (feedback livre) | Dashboard / WhatsApp |

### Histórico por rodada

Cada ciclo de rejeição + revisão incrementa `approval_round`.
O histórico completo é mantido — nunca sobrescrito.

```
Rodada 1: usuário comenta "Falta mencionar o bairro"
  → decision: 'comment', approval_round: 1
Rodada 1: usuário reprova
  → decision: 'rejected', approval_round: 1
Rodada 2: usuário aprova
  → decision: 'approved', approval_round: 2
```

---

## Contratos de Aprovação

### POST /api/v1/jobs/:jobId/approve

```json
{
  "userId": "user_123",
  "comment": "Aprovado! Ficou ótimo.",
  "approvalType": "final",
  "approvalRound": 1,
  "forcePublish": false
}
```

**Resposta 202:**
```json
{
  "jobId": "550e8400-...",
  "decision": "approved",
  "status": "final_approved",
  "message": "Aprovação final registrada.",
  "n8nTriggered": true
}
```

### POST /api/v1/jobs/:jobId/reject

```json
{
  "userId": "user_123",
  "comment": "Precisa ajustar o título do blog",
  "approvalType": "final",
  "approvalRound": 1
}
```

**Resposta 202:**
```json
{
  "jobId": "550e8400-...",
  "decision": "rejected",
  "status": "final_rejected",
  "message": "Rejeição registrada. Aguardando instrução para revisão.",
  "n8nTriggered": true
}
```

### POST /api/v1/jobs/:jobId/comment

```json
{
  "userId": "user_123",
  "comment": "O título ficou muito longo, reduzir para 60 caracteres",
  "commentType": "final",
  "approvalRound": 1
}
```

**Resposta 201:**
```json
{
  "jobId": "550e8400-...",
  "decision": "comment",
  "status": "awaiting_final_review",
  "message": "Comentário registrado com sucesso.",
  "n8nTriggered": true
}
```

### GET /api/v1/jobs/:jobId/comments

**Resposta 200:**
```json
{
  "jobId": "550e8400-...",
  "comments": [
    {
      "id": "abc-1",
      "comment": "Ajustar o título",
      "comment_type": "final",
      "source_channel": "dashboard",
      "approval_round": 1,
      "created_at": "2026-04-04T15:00:00Z"
    }
  ],
  "total": 1
}
```

### POST /api/v1/jobs/:jobId/publish (Plano Pro — manual)

```json
{
  "userId": "user_123",
  "platforms": ["instagram", "facebook"]
}
```

**Resposta 202:**
```json
{
  "jobId": "550e8400-...",
  "decision": "approved",
  "status": "final_approved",
  "message": "Publicação iniciada para: instagram, facebook",
  "n8nTriggered": true
}
```

### GET /api/v1/jobs/:jobId/dashboard

**Resposta 200** (da view `bookagent_jobs_dashboard`):
```json
{
  "job_id": "550e8400-...",
  "processing_status": "completed",
  "input_type": "pdf",
  "artifacts_count": 13,
  "approval_status": "awaiting_final_review",
  "plan_type": "pro",
  "source_channel": "dashboard",
  "auto_publish": true,
  "latest_decision": "comment",
  "latest_comment": "Ajustar o título",
  "approval_round": 1,
  "published_count": 0,
  "total_comments": 2,
  "created_at": "2026-04-04T14:45:00Z",
  "completed_at": "2026-04-04T15:00:00Z"
}
```

---

## Polling do Dashboard

O dashboard deve consultar `GET /api/v1/jobs/:jobId/dashboard` periodicamente
para atualizar o estado da UI.

### Estratégia de polling recomendada

```
processing     → a cada 10s (pipeline em execução)
awaiting_*     → a cada 30s (aguardando ação do usuário)
final_approved → a cada 5s  (publicação em andamento)
published      → parar polling
failed         → parar polling, exibir mensagem de erro
```

### Alternativa: WebSocket / Realtime

Para eliminar polling, usar o **Supabase Realtime** para escutar mudanças em:
- `bookagent_job_meta` (campo `approval_status`)
- `bookagent_publications` (campo `status`)

Isso permite atualização instantânea da UI sem requisições periódicas.

---

## Experiência por Plano

### Plano Básico

```
Upload → Processamento → Aguardando aprovação final
            │
            └─ Aprova → Link de download disponível
                        Dashboard: botão "Baixar pacote"
                        WhatsApp: link enviado automaticamente
```

**O que aparece no dashboard:**
- Status do job
- Prévia dos artifacts
- Botões: "Aprovar", "Reprovar", "Comentar"
- Após aprovação: seção de download

### Plano Pro

```
Upload → Processamento → Aguardando aprovação final
            │
            ├─ auto_publish=true  → Aprovação → Publicação automática
            │                                   Dashboard: status "Publicado"
            │                                   WhatsApp: confirmação enviada
            │
            └─ auto_publish=false → Aprovação → Download + botão "Publicar agora"
                                                Dashboard: seção de publicação habilitada
```

**O que aparece no dashboard (além do básico):**
- Seção "Publicação automática": toggle on/off
- Após aprovação com auto_publish=false: botão "Publicar agora"
- Após publicação: links das publicações por plataforma
- Status por plataforma: `published` / `failed` / `pending`

---

## Coexistência Dashboard + WhatsApp

O estado é **sempre o mesmo** — ambos os canais leem e escrevem em `bookagent_job_meta`.

### Cenário: usuário aprova no WhatsApp, dashboard reflete

```
WhatsApp: usuário envia "APROVAR"
  → Fluxo 5 (Parser) detecta → Fluxo 4 executa
  → bookagent_job_meta.approval_status = 'final_approved'

Dashboard: próximo polling
  → GET /jobs/:jobId/dashboard
  ← approval_status: 'final_approved'
  → UI atualiza: "Aprovado ✓"
```

### Cenário: usuário aprova no Dashboard, WhatsApp recebe confirmação

```
Dashboard: usuário clica "Aprovar"
  → POST /jobs/:jobId/approve
  → n8n Fluxo 4 é triggerado
  → Fluxo 4: decision=approved → notifica WhatsApp (se webhook_phone configurado)

WhatsApp: usuário recebe
  "✅ Aprovado! Baixe seus arquivos em: https://..."
```

### Conflito de estado (dupla aprovação)

Se o usuário aprovar tanto pelo WhatsApp quanto pelo dashboard:
- A segunda chamada ao Fluxo 4 é idempotente para o estado `final_approved`
- A segunda chamada gera um registro duplicado em `bookagent_approvals`
- Não causa erro — apenas registra a segunda aprovação com o mesmo resultado

**Recomendação:** o dashboard deve desabilitar os botões de ação após receber
a resposta 202 e refletir o novo estado no próximo polling.

---

## Novas Rotas da API (Parte 50)

Registradas em `src/api/routes/approval.ts`:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/jobs/:jobId/dashboard` | Visão completa para o dashboard |
| `POST` | `/jobs/:jobId/approve` | Aprovar job (intermediário ou final) |
| `POST` | `/jobs/:jobId/reject` | Reprovar job (comentário obrigatório) |
| `POST` | `/jobs/:jobId/comment` | Adicionar comentário livre |
| `GET` | `/jobs/:jobId/comments` | Listar histórico de comentários |
| `POST` | `/jobs/:jobId/publish` | Solicitar publicação manual (Pro) |
| `GET` | `/jobs/:jobId/publications` | Status das publicações por plataforma |

---

## Próximos Passos (Parte 51+)

1. **Frontend Dashboard** — implementar as telas de:
   - Lista de jobs com status badge
   - Detalhe do job com preview dos artifacts
   - Formulário de aprovação/reprovação/comentário
   - Seção de publicação (plano Pro)

2. **Supabase Realtime** — substituir polling por eventos em tempo real

3. **Autenticação** — adicionar JWT/auth ao dashboard e à API de aprovação

4. **Evolution API real** — substituir placeholders pelos endpoints reais

5. **Aprovação intermediária** — o Fluxo 3 ainda usa apenas `awaiting_final_review`;
   adaptar para suportar fluxo de revisão intermediária quando o pipeline gerar
   prévias parciais em múltiplos estágios

6. **Retry de publicação** — endpoint `POST /jobs/:jobId/retry-publish`
   para quando `publish_failed`
