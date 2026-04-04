# Parte 54 — Guia de Rollout Controlado

**Data:** 2026-04-04
**Fase:** Validação com usuários reais (3–10 usuários, controle total)

---

## Objetivo

Validar o sistema em uso real com volume baixo antes de escalar.
Não é escala — é aprendizado controlado.

---

## 1. Estratégia de Rollout

### Fase 0 — Pré-rollout (antes de liberar)

Checklist obrigatório antes de aceitar o primeiro usuário real:

- [ ] `scripts/health-check.sh` passou sem FAIL
- [ ] Variáveis de ambiente configuradas no Railway:
  - `META_ACCESS_TOKEN`
  - `META_INSTAGRAM_ACCOUNT_ID`
  - `META_FACEBOOK_PAGE_ID`
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - `N8N_WEBHOOK_BASE_URL`
  - `EVOLUTION_API_URL` + `EVOLUTION_API_KEY`
- [ ] Todos os 6 workflows n8n ativos (`active: true`)
- [ ] Envio manual de WhatsApp testado com PDF real
- [ ] Dashboard carrega jobs em `bookagent_jobs_dashboard`

### Fase 1 — Piloto interno (1–2 usuários)

**Perfil:** Você mesmo ou parceiro próximo que entende que é beta.
**Duração:** 1–2 semanas.
**Objetivo:** Validar o fluxo completo sem pressão externa.

### Fase 2 — Rollout controlado (3–10 usuários)

**Perfil ideal:**
- Corretores de imóveis parceiros (usuários do ImobCreator)
- Tolerantes a pequenos ajustes
- Dispostos a dar feedback via WhatsApp
- Com volume baixo (1–3 livros/semana)

**Critério de entrada:** Usuário cadastrado manualmente via Supabase.
**Canal de entrada:** WhatsApp (prioritário) + dashboard.

---

## 2. Onboarding de Usuário

### Cadastro manual (enquanto não há self-service)

```sql
-- Executar no Supabase dashboard (projeto xhfiyukhjzwhqbacuyxq)
INSERT INTO bookagent_job_meta (job_id, user_id, plan_type, source_channel, auto_publish, webhook_phone)
-- (será preenchido pelo n8n na primeira execução)
```

### Mensagem de onboarding (WhatsApp)

```
Olá [Nome]! 👋

Você foi selecionado para o piloto do BookAgent.

Para usar:
1. Envie o PDF do seu livro aqui no WhatsApp
2. Você vai receber as redes para revisão
3. Responda SIM para aprovar e publicar

Em caso de dúvida, responda AJUDA.
```

### Configurar webhook_phone no n8n

No Fluxo 1 (entrada WhatsApp), o telefone do usuário é capturado automaticamente do `$json.body.from`. Não requer configuração manual.

---

## 3. Monitoramento Ativo

### 3.1 Dashboard de jobs por usuário

```sql
-- Jobs do rollout — últimas 24h
SELECT
  jm.user_id,
  j.id AS job_id,
  jm.approval_status,
  j.status AS processing_status,
  j.created_at,
  j.updated_at
FROM bookagent_jobs j
JOIN bookagent_job_meta jm ON j.id = jm.job_id
WHERE j.created_at > NOW() - INTERVAL '24 hours'
ORDER BY j.created_at DESC;
```

### 3.2 Publicações por plataforma

```sql
-- Taxa de sucesso de publicação
SELECT
  platform,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'published') AS published,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  AVG(attempt_count) AS avg_attempts
FROM bookagent_publications
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY platform;
```

### 3.3 Jobs travados

```sql
-- Jobs que ficaram sem atualização por mais de 30min
SELECT id, status, created_at, updated_at
FROM bookagent_jobs
WHERE status IN ('processing', 'pending')
  AND updated_at < NOW() - INTERVAL '30 minutes';
```

### 3.4 Alertas manuais (provisório)

Enquanto não há sistema de alertas automáticos, verificar diariamente:

```bash
# Verificar jobs com falha de publicação
curl https://api.db8intelligence.com.br/api/v1/health

# Ver jobs recentes
curl https://api.db8intelligence.com.br/api/v1/jobs | jq '.[0:5]'
```

---

## 4. Coleta de Feedback

### Via WhatsApp (principal)

Após publicação bem-sucedida, n8n (Fluxo 4) envia automaticamente:

```
✅ Seu conteúdo foi publicado!

Como foi sua experiência?
1 - Ótimo
2 - Bom
3 - Precisa melhorar
```

Respostas são capturadas pelo n8n e podem ser salvas em `bookagent_comments` com `comment_type: 'feedback'`.

### Via Dashboard

Adicionar botão "Avaliar resultado" após publicação — abre modal com escala 1–5 e campo de texto livre. Salva via `POST /api/v1/jobs/:jobId/comment`.

### Registro estruturado de problemas

Quando usuário relata problema, registrar manualmente:

```sql
INSERT INTO bookagent_comments (job_id, user_id, comment, comment_type, source_channel, approval_round)
VALUES (
  '<job_id>',
  '<user_id>',
  'Descrição do problema relatado pelo usuário',
  'general',
  'whatsapp',
  1
);
```

---

## 5. Métricas Principais

| Métrica | Meta Fase 1 | Meta Fase 2 |
|---------|-------------|-------------|
| Tempo de processamento | < 5 min | < 3 min |
| Taxa de aprovação (1ª tentativa) | > 60% | > 75% |
| Taxa de publicação bem-sucedida | > 80% | > 90% |
| Taxa de erro geral | < 20% | < 10% |
| Satisfação (1–5) | > 3.5 | > 4.0 |

### Query de métricas

```sql
-- Resumo do rollout
SELECT
  COUNT(DISTINCT jm.user_id) AS usuarios_ativos,
  COUNT(j.id) AS total_jobs,
  COUNT(j.id) FILTER (WHERE j.status = 'completed') AS concluidos,
  COUNT(j.id) FILTER (WHERE j.status = 'failed') AS falhos,
  COUNT(p.id) FILTER (WHERE p.status = 'published') AS publicados,
  ROUND(
    100.0 * COUNT(p.id) FILTER (WHERE p.status = 'published') /
    NULLIF(COUNT(j.id) FILTER (WHERE j.status = 'completed'), 0),
    1
  ) AS taxa_publicacao_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) / 60
  ), 1) AS tempo_medio_min
FROM bookagent_jobs j
JOIN bookagent_job_meta jm ON j.id = jm.job_id
LEFT JOIN bookagent_publications p ON j.id = p.job_id;
```

---

## 6. Fallback Operacional

### Caso a automação falhe

**Sintoma:** Usuário enviou PDF mas não recebeu resposta em > 10 min.

**Passos de intervenção manual:**

1. Verificar status do job no Supabase ou via API:
   ```bash
   curl https://api.db8intelligence.com.br/api/v1/jobs/<job_id>
   ```

2. Se status `failed`, reprocessar manualmente:
   ```bash
   curl -X POST https://api.db8intelligence.com.br/api/v1/process \
     -H "Content-Type: application/json" \
     -d '{"file_url":"<url_do_pdf>","type":"pdf","user_context":{"name":"<nome>","whatsapp":"<fone>"}}'
   ```

3. Se publicação falhou (`publish_failed`), acionar Fluxo 6:
   ```bash
   curl -X POST https://automacao.db8intelligence.com.br/webhook/bookagent/publicar \
     -H "Content-Type: application/json" \
     -d '{"jobId":"<job_id>","userId":"<user_id>","platforms":["instagram","facebook"]}'
   ```

4. Se tudo falhar, enviar conteúdo manualmente ao usuário via WhatsApp.

---

## 7. Critérios para Avançar ao Próximo Nível

Após 2 semanas de rollout, avançar para escala (Parte 55) quando:

- [ ] ≥ 5 usuários ativos com pelo menos 1 job completo cada
- [ ] Taxa de erro < 15% nos últimos 3 dias
- [ ] Nenhum P0 (bug que trava fluxo) aberto
- [ ] Pelo menos 1 feedback positivo coletado por usuário
- [ ] Métricas de performance dentro da meta

---

## 8. O que NÃO fazer nesta fase

- Não abrir cadastro público (auto self-service)
- Não anunciar o produto
- Não aceitar > 10 usuários simultaneamente
- Não ignorar erros por "é só o piloto"
- Não escalar infra antes de validar comportamento

---

## Próximo Passo — Parte 55: Escala Controlada

Após validação completa do rollout:
- Self-service de cadastro
- Precificação e planos
- Dashboard de analytics para o operador
- SLA definido (uptime, tempo de resposta)
- Documentação pública do produto
