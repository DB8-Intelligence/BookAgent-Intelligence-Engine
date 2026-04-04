# Parte 56 — Funil de Vendas Completo

**Data:** 2026-04-04
**Canal principal:** WhatsApp
**Público:** Corretores de imóveis

---

## Visão Geral do Funil

```
Instagram (conteúdo)
    ↓
WhatsApp (entrada)
    ↓
BookAgent (demo automática com PDF real)
    ↓
Resultado entregue (valor percebido)
    ↓
Oferta do plano (conversão)
    ↓
Assinatura (receita)
    ↓
Uso recorrente (retenção)
```

**Diferencial:** o produto se vende durante a demonstração. O corretor experimenta o valor antes de qualquer pitch de venda.

---

## Camada 1 — Topo do Funil (Aquisição)

### Objetivo
Gerar atenção qualificada de corretores que lançam imóveis regularmente.

### Canal principal: Instagram Reels

**Tipo de conteúdo que funciona:**

| Formato | Descrição | CTA |
|---------|-----------|-----|
| Antes/Depois | "Isso era um PDF de apartamento. Isso é o conteúdo que o BookAgent gerou em 3 minutos" | "Manda seu book no link da bio" |
| Prova social | Screenshot de aprovação do corretor no WhatsApp | "Qual seu próximo lançamento?" |
| Processo em 60s | Tela: enviar PDF → receber post pronto | "Testa grátis hoje" |
| Comparação | "Quanto você gasta em conteúdo? E quanto tempo?" | "Link na bio" |

**Frequência recomendada:** 3–5 Reels/semana nos primeiros 3 meses.

### Canal secundário: Grupos de WhatsApp de corretores

Mensagem direta para grupos relevantes com exemplo de output real.

### Entrada no funil

**CTA único:** "Manda o PDF do seu lançamento aqui no WhatsApp."

Número WhatsApp vinculado ao n8n (Evolution API) recebe a mensagem e aciona o Fluxo 7.

---

## Camada 2 — Meio do Funil (Engajamento / Demo)

### Objetivo
Mostrar o valor do produto com o próprio material do corretor — sem pitch.

### Fluxo após entrada no WhatsApp

```
1. Corretor envia mensagem inicial (qualquer texto)
   → Fluxo 7 n8n: resposta automática com instruções

2. Corretor envia PDF do lançamento
   → Fluxo 1 n8n: inicia processamento BookAgent

3. BookAgent processa (< 5 min)
   → Gera: post para Instagram, legenda, hashtags, sugestão de Stories

4. Fluxo 3 n8n: entrega resultado pelo WhatsApp
   → Corretor recebe conteúdo pronto para publicar

5. Corretor responde com feedback
   → Aprovação → publicação automática (Pro) ou entrega manual (Básico)
```

### O que é entregue na demo

- Post para Instagram (imagem + legenda com hashtags)
- Sugestão de texto para Stories (3 variações)
- Legenda para Facebook
- Chamada para ação específica do imóvel

**Custo da demo para o operador:** ~R$ 8,50 (básico).
**Valor percebido pelo corretor:** economiza 2–3h de trabalho + custo de criativo.

---

## Camada 3 — Fundo do Funil (Conversão)

### Objetivo
Transformar a experiência positiva da demo em assinatura.

### Timing da oferta

A oferta é enviada **automaticamente** pelo Fluxo 8 do n8n:
- **3 horas** após entrega do resultado: primeira mensagem de conversão
- **24 horas** após (se sem resposta): follow-up com prova social
- **72 horas** após (se sem resposta): última mensagem com escassez leve

### Proposta de valor na conversão

**Frase-chave:**
> "Você acabou de ver o que o BookAgent faz com 1 book. Imagine automatizar isso para todos os seus lançamentos."

**Oferta:**
- Plano Pro: R$ 247/mês — 50 jobs, publicação automática no Instagram e Facebook
- Plano Básico: R$ 97/mês — 10 jobs, entrega manual

**Ação esperada:**
Corretor clica no link de assinatura (Stripe/PagBank — Parte 57).

### Objeção mais comum e resposta

| Objeção | Resposta |
|---------|----------|
| "Tá caro" | "Quanto você paga por post? Aqui são R$ 5 por post completo." |
| "Vou pensar" | Enviar outro exemplo com book diferente em 48h |
| "Já tenho agência" | "Sua agência entrega em 3 minutos?" |
| "Não uso muito Instagram" | "O Book Agent também gera texto para WhatsApp e email" |

---

## Camada 4 — Pós-Venda (Retenção)

### Objetivo
Manter o corretor ativo e aumentar o valor percebido ao longo do tempo.

### Estratégia de retenção

**Semana 1:** onboarding guiado — 3 jobs com acompanhamento manual.

**Semana 2–4:** uso autônomo com suporte via WhatsApp.

**Mês 2+:** incentivo ao upgrade para Pro se ainda no Básico.

### Momentos críticos de churn

| Momento | Sinal | Ação |
|---------|-------|------|
| Usuário não usa em 10 dias | Nenhum job no período | Mensagem de reativação com novo exemplo |
| Job gerou resultado ruim | Feedback negativo | Contato manual + reprocessamento gratuito |
| Limite mensal atingido | API retorna 402 | Oferta de upgrade automática pelo WhatsApp |

### Régua de mensagens pós-compra

```
Dia 1:  Boas-vindas + tutorial de 1 passo
Dia 3:  Dica de uso (ex: como melhorar os resultados enviando PDF com imagens)
Dia 7:  Case de resultado (outro corretor com permissão)
Dia 14: Lembrete de jobs disponíveis no mês
Dia 30: Resumo do mês (jobs usados, conteúdo gerado)
```

---

## Pontos de Automação via n8n

### Fluxo 7 — Lead Entry & Demo Trigger

**Trigger:** `POST /webhook/bookagent/lead`
Evolution API envia qualquer mensagem recebida.

**Lógica:**
```
Recebeu PDF? → Fluxo 1 (processamento)
Recebeu texto?
  → Primeiro contato? → Saudação + instruções + registrar lead
  → Já é usuário? → Saudação de retorno
```

**Nós:**
1. Webhook trigger
2. Detectar tipo de mensagem (PDF vs texto)
3. Verificar se lead já existe no Supabase
4. Se novo: salvar lead + enviar mensagem de boas-vindas
5. Se retorno: enviar mensagem de reconhecimento

### Fluxo 8 — Conversion Follow-up

**Trigger:** `POST /webhook/bookagent/resultado-entregue`
Chamado pelo Fluxo 3 após entrega do resultado.

**Lógica:**
```
3h após entrega → primeira mensagem de conversão
24h (sem resposta) → follow-up
72h (sem resposta) → última mensagem
Respondeu SIM? → enviar link de pagamento
Respondeu NÃO? → registrar como perdido + agendar recontato em 30 dias
```

**Nós:**
1. Webhook trigger (recebe jobId + phone + planStatus)
2. Aguardar 3h (n8n wait node)
3. Verificar se já converteu (Supabase)
4. Enviar mensagem de conversão
5. Aguardar 21h
6. Verificar resposta
7. Follow-up ou encerrar

---

## Métricas do Funil

### KPIs por etapa

| Etapa | Métrica | Meta Mês 1 | Meta Mês 6 |
|-------|---------|-----------|-----------|
| Topo | Leads que entram no WhatsApp | 20/mês | 200/mês |
| Meio | Leads que enviam PDF (demo) | > 60% | > 70% |
| Fundo | Demo → Assinatura | > 20% | > 35% |
| Retenção | Churn mensal | < 20% | < 10% |
| Expansão | Básico → Pro upgrade | — | > 30%/trimestre |

### Queries de monitoramento

```sql
-- Leads por etapa (mês corrente)
SELECT
  stage,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE converted_at IS NOT NULL) AS converted
FROM bookagent_leads
WHERE created_at >= DATE_TRUNC('month', NOW())
GROUP BY stage;

-- Tempo médio entre demo e conversão
SELECT
  ROUND(AVG(
    EXTRACT(EPOCH FROM (converted_at - demo_at)) / 3600
  ), 1) AS avg_hours_to_convert
FROM bookagent_leads
WHERE converted_at IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days';
```

---

## Integração com a Arquitetura BookAgent

### Como o funil usa o sistema existente

```
bookagent_leads (novo) ← Fluxo 7 registra lead
bookagent_job_meta     ← Fluxo 1 associa job ao lead via user_id (phone)
bookagent_usage_metrics ← rastreia evento 'job_started' para o lead
bookagent_plan_overrides ← usado para ativar trial (3 jobs grátis)
```

### Trial gratuito (3 jobs)

Quando lead é registrado pela primeira vez:
1. Fluxo 7 chama `POST /api/v1/leads/register` (novo endpoint)
2. BookAgent insere em `bookagent_plan_overrides` com `plan_tier='basic'` e `valid_until = NOW() + 30 days`
3. `bookagent_usage_metrics` rastreia o uso
4. Ao atingir 3 jobs: `planGuard` retorna 402 com mensagem de upgrade

---

## Próximo Passo — Parte 57: Pagamento e Self-Service

- Landing page de cadastro (sem necessidade de contato manual)
- Integração Stripe ou PagBank para assinatura
- Ativação automática do plano após pagamento
- Dashboard do corretor: ver jobs, downloads, histórico
