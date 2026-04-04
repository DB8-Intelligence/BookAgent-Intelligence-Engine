# BookAgent Intelligence Engine — Fila Assíncrona (BullMQ + Redis)

> Parte 47: Queue Assíncrona
> Data: 2026-04-04 | Versão: 0.2.0

---

## Visão Geral

A fila transforma o `POST /process` de uma operação bloqueante (podendo levar minutos) em uma operação imediata que retorna em milissegundos.

| Modo | Quando | Comportamento |
|------|--------|--------------|
| **Sync** | `REDIS_URL` não configurado | `POST /process` bloqueia até completar. Retorna job concluído. |
| **Queue** | `REDIS_URL` configurado | `POST /process` retorna `{ jobId, status: "pending" }` imediatamente. Worker processa em background. |

O sistema sempre funciona — Redis é puramente aditivo.

---

## Arquitetura

```
POST /process
    │
    ├─ [Queue Mode] ──────────────────────────────────────────────────────┐
    │   ├─ Gerar jobId (UUID)                                             │
    │   ├─ enqueueJob({ jobId, fileUrl, type, userContext, webhookUrl })  │
    │   └─ Retornar 202 { jobId, status: "pending" }                      │
    │                                                                      │
    └─ [Sync Mode] ─────────────────────────────────────────────────────  │
        ├─ orchestrator.process(input)  (bloqueante)                       │
        └─ Retornar 202 com resultado                                      │
                                                                           │
                              Redis "bookagent-processing" ←───────────────┘
                                         │
                                         ▼
                                   BullMQ Worker
                                         │
                              ┌──────────┴──────────────────┐
                              │  processBookAgentJob()       │
                              │                              │
                              │  1. JobRepo: status=pending  │
                              │  2. JobRepo: status=processing│
                              │  3. orchestrator.process()   │
                              │  4. JobRepo: completeJob()   │
                              │  5. ArtifactRepo: save()     │
                              │  6. StorageManager: save()   │
                              │  7. sendWebhook() se config  │
                              └──────────────────────────────┘
                                         │
                                   GET /jobs/:jobId
                                   (polling pelo n8n)
```

---

## Configuração

### Railway (recomendado)

1. Adicionar serviço Redis no Railway
2. Copiar a variável `REDIS_URL` do serviço Redis
3. Configurar nos serviços `api` e `worker`:

```env
REDIS_URL=redis://:senha@host.railway.internal:6379
QUEUE_CONCURRENCY=2
```

### Docker local

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=               # vazio se sem senha
QUEUE_CONCURRENCY=2
```

### Variáveis de ambiente

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `REDIS_URL` | Sim (queue mode) | — | URL completa do Redis (Railway) |
| `REDIS_HOST` | Alternativa | — | Host Redis (Docker local) |
| `REDIS_PORT` | Não | 6379 | Porta Redis |
| `REDIS_PASSWORD` | Não | — | Senha Redis |
| `QUEUE_CONCURRENCY` | Não | 2 | Jobs em paralelo por worker |

---

## Executando o Worker

O worker é um processo separado do API server:

```bash
# Desenvolvimento (com hot reload via tsx)
npm run worker

# Produção (após build)
npm run build && npm run worker:prod
```

### Railway — dois serviços separados

**Serviço 1: API** (`npm start`)
```
Expõe: POST /process, GET /jobs/:id
```

**Serviço 2: Worker** (`npm run worker:prod`)
```
Consome: fila "bookagent-processing"
Não expõe HTTP
```

Ambos compartilham as mesmas variáveis de ambiente (REDIS_URL, SUPABASE_URL, AI keys).

---

## Fluxo Completo

### 1. Submeter job

```bash
curl -X POST http://localhost:3000/api/v1/process \
  -H 'Content-Type: application/json' \
  -d '{
    "file_url": "https://example.com/material.pdf",
    "type": "pdf",
    "user_context": { "name": "Vista Verde", "region": "São Paulo" },
    "webhook_url": "https://automacao.db8intelligence.com.br/webhook/bookagent"
  }'
```

**Resposta imediata (202):**
```json
{
  "success": true,
  "data": {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "message": "Job adicionado à fila. Você receberá notificação em https://..."
  }
}
```

### 2. Polling de status

```bash
curl http://localhost:3000/api/v1/jobs/550e8400-e29b-41d4-a716-446655440000
```

**Durante processamento:**
```json
{
  "data": { "job_id": "...", "status": "processing", "has_result": false }
}
```

**Após conclusão:**
```json
{
  "data": {
    "job_id": "...",
    "status": "completed",
    "has_result": true,
    "output_summary": { "artifacts": 13, "sources_count": 5 }
  }
}
```

### 3. Webhook (notificação ao finalizar)

O worker faz `POST webhookUrl` com:

```json
{
  "source": "bookagent",
  "timestamp": "2026-04-04T15:00:00.000Z",
  "jobId": "550e8400-...",
  "status": "completed",
  "artifacts_count": 13,
  "duration_ms": 45230
}
```

Em caso de falha:
```json
{
  "source": "bookagent",
  "timestamp": "2026-04-04T15:00:00.000Z",
  "jobId": "550e8400-...",
  "status": "failed",
  "error": "Mensagem de erro"
}
```

---

## Retry Automático

Jobs com falha são reprocessados automaticamente pelo BullMQ:

| Tentativa | Delay | Comportamento |
|-----------|-------|--------------|
| 1ª | 0s | Processamento imediato |
| 2ª | 5s | Backoff exponencial |
| 3ª | 10s | Backoff exponencial |
| Após 3ª | — | Marcado como `failed` no Supabase, webhook enviado |

Configuração em [src/queue/queue.ts](../src/queue/queue.ts):
```typescript
defaultJobOptions: {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
}
```

---

## Integração com n8n

### Fluxo recomendado no n8n

```
[Webhook Trigger] ← recebe solicitação externa
    │
    ▼
[HTTP Request] POST /api/v1/process
    { file_url, type, user_context, webhook_url: "url-do-webhook-n8n" }
    │
    ▼
[Responde ao trigger com jobId]

Paralelo:
[Webhook Node] ← aguarda POST do BookAgent ao finalizar
    │
    ▼
[Switch] status == "completed" → distribuir artifacts
         status == "failed"    → notificar erro / retry
    │
    ▼
[WhatsApp / Email / Slack] → entregar conteúdo gerado
```

### Por que NÃO usar polling no n8n

Polling (n8n checa `GET /jobs/:id` a cada X segundos) funciona, mas:
- Gera requests desnecessários
- Delay variável entre verificações
- Webhook é sempre superior: notifica imediatamente, sem polling

Use `webhook_url` no payload do `POST /process` apontando para um Webhook Node do n8n.

---

## Health Check

```bash
curl http://localhost:3000/health
```

Com Redis configurado:
```json
{
  "status": "ok",
  "queue": { "mode": "bullmq", "enabled": true },
  "persistence": { "mode": "supabase", "supabase": true }
}
```

Sem Redis:
```json
{
  "status": "ok",
  "queue": { "mode": "sync", "enabled": false }
}
```

---

## Logs do Worker

```
[Worker] Started — queue="bookagent-processing", concurrency=2
[Worker] Job active: 550e8400-... (BullMQ id=550e8400-...)
[JobProcessor] Starting job 550e8400-... (type=pdf, attempt=1/3)
[JobProcessor] ✓ Completed job 550e8400-...: 13 artifacts, 42350ms
[JobProcessor] Webhook delivered → https://automacao.../webhook/bookagent (200)
[Worker] Job completed: 550e8400-... (BullMQ id=550e8400-...)
```

---

## Desenvolvimento Local com Redis

### Docker Compose

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --save "" --appendonly no
```

```bash
docker-compose up -d redis

# Terminal 1: API
npm run dev

# Terminal 2: Worker
npm run worker
```

### Verificar fila (BullMQ Board — opcional)

```bash
npx @bull-board/cli --redis redis://localhost:6379
# Acesse http://localhost:3000/ui
```

---

## Próximo Passo (Parte 48+)

Com fila assíncrona implementada, o próximo passo natural é:

1. **Bull Board** — dashboard para monitorar jobs em tempo real
2. **Dead Letter Queue** — jobs que falharam 3x vão para fila separada para reprocessamento manual
3. **Job Priority** — clientes premium com jobs priorizados
4. **Agendamento** — processar materiais num horário específico (`queue.add(data, { delay: ms })`)
