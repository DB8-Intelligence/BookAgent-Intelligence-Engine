# Parte 55 — Escala Técnica

**Data:** 2026-04-04

---

## Estado Atual vs. Capacidade

| Dimensão | Estado Atual | Capacidade Estimada |
|----------|-------------|---------------------|
| Jobs simultâneos | 2 workers (QUEUE_CONCURRENCY=2) | ~50/hora com Railway Hobby |
| Usuários simultâneos | Sem limite explícito | Rate limiting: 20–200 req/min |
| Storage de artifacts | Railway local + Supabase | ~10 GB antes de precisar CDN |
| DB (Supabase) | Free tier → Pro | Free: 500 MB, Pro: 8 GB |
| Redis (BullMQ) | Railway Redis | 25 MB free → ilimitado pago |

**Conclusão:** a arquitetura atual suporta confortavelmente até **50–100 usuários ativos** sem mudança de infra.

---

## Multi-Tenant: Isolamento Implementado

O isolamento por usuário já está arquitetado:

- **Dados:** todas as tabelas têm `user_id` — as queries do Supabase filtram por usuário
- **Fila:** cada job tem `userId` no payload — o worker processa mas os resultados são isolados por `job_id`
- **Limites:** `planGuard` verifica jobs do mês **por user_id** — sem compartilhamento de cota
- **Rate limit:** `SlidingWindowCounter` chaveado por `user_id` — limites independentes por usuário

**O que falta para multi-tenant completo:**
- Row Level Security (RLS) no Supabase para que usuários não acessem dados uns dos outros via API REST direta (relevante se expor Supabase ao frontend)
- Namespace de storage separado por `user_id/` no diretório de artifacts

---

## Rate Limiting — Arquitetura Atual

### Implementação (Parte 55)

```
POST /process
  → requestRateLimiter  (sliding window, 1 min, por user_id/IP)
  → planGuard           (limite mensal + jobs simultâneos)
  → jobRateLimiter      (sliding window, 1 hora, por user_id)
  → createProcess
```

### Limites por plano

| Plano | Requests/min | Jobs/hora | Jobs simultâneos |
|-------|-------------|----------|-----------------|
| basic | 20 | 3 | 1 |
| pro | 60 | 10 | 3 |
| business | 200 | 50 | 10 |

### Evolução para escala horizontal

O rate limiter atual é **in-memory por instância**. Para múltiplas instâncias do BookAgent em paralelo (Railway horizontal scaling):

```typescript
// Substituir SlidingWindowCounter por:
// ioredis.incr() + ioredis.expire() — atomic sliding window no Redis
// Implementação disponível em: src/api/middleware/rate-limiter-redis.ts (Parte 56+)
```

---

## Observabilidade — O Que Foi Implementado

### Logs estruturados (`src/utils/logger.ts`)

```
[INFO]  2026-04-04T10:00:00Z [Bootstrap] Persistence mode: Supabase
[WARN]  2026-04-04T10:00:01Z [PlanGuard] Limite mensal atingido user=5511999... plan=basic (10/10)
[ERROR] 2026-04-04T10:00:02Z [approvalController] Falha ao acionar n8n para job abc123: timeout
```

### Métricas de uso (`src/observability/metrics.ts`)

Eventos rastreados em `bookagent_usage_metrics`:
- `job_started` — com `user_id`, `plan_tier`, `job_id`
- `job_completed` — com `duration_ms`
- `job_failed` — com `error_code`
- `publish_attempt` — com `platform`, `success`
- `approval_action` — com `decision`

Buffer de 50 eventos com flush automático a cada 30s para o Supabase.

### Views de analytics (`bookagent_monthly_usage`, `bookagent_revenue_estimate`)

```sql
-- Uso atual por usuário
SELECT * FROM bookagent_monthly_usage ORDER BY jobs_started DESC;

-- Estimativa de receita e custo por plano
SELECT
  plan_tier,
  active_users,
  total_jobs,
  ROUND(gross_revenue_brl_cents / 100.0, 2) AS receita_bruta_brl,
  ROUND(estimated_cost_brl_cents / 100.0, 2) AS custo_estimado_brl,
  ROUND((gross_revenue_brl_cents - estimated_cost_brl_cents) / 100.0, 2) AS margem_brl
FROM bookagent_revenue_estimate;
```

---

## Plano de Escala por Fase

### Fase 1: 5–50 usuários (agora → Parte 57)

**Sem mudança de infra necessária.** O que monitorar:
- Railway CPU/memória do worker (alerta se > 80%)
- Supabase DB size (free: 500 MB)
- Redis memory (free: 25 MB)

**Ações:**
- Aumentar `QUEUE_CONCURRENCY` de 2 → 4 se CPU permitir
- Upgrade Supabase para Pro se DB > 400 MB

### Fase 2: 50–500 usuários

**Mudanças necessárias:**
- Redis: upgrade para plano pago (ou Railway Redis com memória dedicada)
- Supabase: Pro plan (necessário antes de 500 usuários)
- Worker: escalar horizontalmente (2 instâncias Railway)
- Rate limiter: migrar para Redis-backed (evitar divergência entre instâncias)

**Custo estimado adicional:** R$ 200–500/mês

### Fase 3: 500+ usuários

**Mudanças necessárias:**
- Separar API server e Worker em serviços Railway independentes
- CDN para artifacts (Cloudflare R2 ou Supabase Storage com CDN)
- Cache de outputs de IA por fingerprint de PDF
- Monitoramento externo (Sentry, Datadog ou similar)
- SLA formal para plano Business

**Custo estimado adicional:** R$ 1.000–3.000/mês

---

## Checklist de Prontidão para Escala

### Já implementado ✓
- [x] Processamento assíncrono (BullMQ)
- [x] Persistência no Supabase (jobs, artifacts, métricas)
- [x] Multi-tenant via `user_id` em todas as tabelas
- [x] Rate limiting por usuário e por plano
- [x] Limites mensais e de concorrência por plano
- [x] Métricas de uso com flush automático
- [x] Views de analytics e estimativa de receita
- [x] Logs com nível e contexto

### Ainda não implementado (Parte 56+)
- [ ] RLS (Row Level Security) no Supabase
- [ ] Rate limiter Redis-backed para múltiplas instâncias
- [ ] Cache de outputs de IA
- [ ] CDN para artifacts
- [ ] Seleção automática de provider por custo
- [ ] Alertas automáticos (job preso > 30min, falha > 20%)
- [ ] Self-service de cadastro e pagamento
