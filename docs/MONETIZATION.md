# Parte 55 — Modelo de Negócio e Monetização

**Data:** 2026-04-04

---

## 1. Modelo de Negócio — Três Camadas

### Camada 1: Produto Standalone

**BookAgent direto ao corretor de imóveis.**

- Acesso via WhatsApp (canal principal) + dashboard
- Assinatura mensal por usuário
- Foco: corretor individual que lança 1–10 livros/ano e precisa de conteúdo recorrente

**Por que funciona:** o corretor já tem o livro (ou o PDF de apresentação do imóvel). O BookAgent transforma isso em conteúdo de marketing sem esforço técnico.

---

### Camada 2: Feature Premium no ImobCreator

**BookAgent como módulo do ImobCreator (plataforma existente).**

- BookAgent ativado como feature do plano Pro/Enterprise do ImobCreator
- Aumenta o ticket médio sem mudar o canal de distribuição
- O ImobCreator já tem a base de usuários — BookAgent é o upsell natural

**Por que funciona:** usuário do ImobCreator já está no contexto de criação de conteúdo imobiliário. A adição do BookAgent é uma extensão óbvia, não uma venda separada.

---

### Camada 3: API / White-Label — NexoOmnix

**BookAgent como infraestrutura para outros SaaS (Nexoomnix / B2B).**

- Outros produtos da NexoOmnix (ou parceiros) consomem o BookAgent via API
- Plano Business com rate limits maiores, SLA definido, suporte dedicado
- Possibilidade de white-label: o parceiro expõe como funcionalidade própria

**Por que funciona:** o core (pipeline de 15 estágios + integrações com IA) é reutilizável para qualquer mercado com PDFs ricos em conteúdo (educação, saúde, jurídico, etc.).

---

## 2. Planos e Pricing

### Tabela de Planos

| Dimensão | Básico | Pro | Business |
|----------|--------|-----|----------|
| **Preço/mês** | R$ 97 | R$ 247 | R$ 997 |
| Jobs/mês | 10 | 50 | 500 |
| Jobs simultâneos | 1 | 3 | 10 |
| Prioridade na fila | Baixa | Média | Máxima |
| Publicação automática | ✗ | ✓ | ✓ |
| Aprovação intermediária | ✗ | ✓ | ✓ |
| Plataformas de publicação | 0 | 2 | 4 |
| Arquivo máximo | 50 MB | 100 MB | 200 MB |
| Webhook ao finalizar | ✗ | ✓ | ✓ |
| Acesso à API | ✗ | ✗ | ✓ |
| Requests/min | 20 | 60 | 200 |
| Jobs/hora | 3 | 10 | 50 |

### Justificativa de Pricing

**Básico (R$ 97):** âncora de entrada. Custo operacional estimado por job: R$ 8,50.
Com 10 jobs/mês: custo ≈ R$ 85 → margem bruta ≈ R$ 12 (12%).
Objetivo: converter para Pro após primeiros resultados.

**Pro (R$ 247):** produto principal. Custo estimado por job: R$ 12.
Com 50 jobs/mês (uso pleno): custo ≈ R$ 600 → margem bruta ≈ R$ 247 (50%).
Na prática, a maioria dos usuários usa 15–25 jobs/mês → margem real > 70%.

**Business (R$ 997):** parceiros e integradores. Custo estimado por job: R$ 15.
Com 500 jobs/mês (uso pleno): custo ≈ R$ 7.500 → custo > receita.
Mas na prática: 50–150 jobs/mês → margem > 85%. Viável com contrato anual.

---

## 3. Análise de Custo Operacional por Job

### Componentes de custo

| Componente | Custo Estimado | Notas |
|-----------|----------------|-------|
| IA (OpenAI/Claude) | R$ 4–8 | Depende do tamanho do PDF e número de outputs |
| Storage (Supabase + Railway) | R$ 0,50 | ~10 MB de artifacts por job |
| Worker (Railway) | R$ 1,50 | Tempo de CPU para processamento de PDF + pipeline |
| Redis (fila) | R$ 0,30 | Amortizado por volume |
| Meta API (publicação) | R$ 0 | Grátis — custo é só de tempo de worker |
| Overhead (logs, DB queries) | R$ 0,20 | |
| **Total estimado** | **R$ 6,50–10** | Varia com PDF complexo e múltiplos outputs |

### Otimizações de custo implementadas / planejadas

**Implementadas:**
- `publishToPlatforms` paralelo → reduz tempo de worker por job com publicação
- `JobManager` capped em 500 → sem crescimento ilimitado de RAM
- Retry com backoff → reduz chamadas redundantes à Meta API

**Planejadas (Parte 56+):**
- Cache de outputs de IA por fingerprint do PDF (PDFs idênticos = zero custo de IA)
- Seleção inteligente de provider por custo: usar Gemini (mais barato) para etapas de análise, Claude/GPT apenas para geração final de copy
- Compressão de artifacts antes de storage
- Desativar estágios não usados pelo plano Básico (ex: não gerar media plan se auto_publish=false)

---

## 4. Estratégia de Aquisição

### Fase 1 — Orgânico (0 a 3 meses)
- 3–10 usuários selecionados manualmente (piloto — Parte 52)
- Aquisição via relacionamento direto
- Sem anúncios pagos

### Fase 2 — Conteúdo (3 a 6 meses)
- Demonstração do produto via conteúdo (antes/depois de PDF → post)
- WhatsApp grupos de corretores
- Instagram com exemplos reais de output

### Fase 3 — Integração ImobCreator (6 a 12 meses)
- BookAgent como feature do ImobCreator
- Base de usuários existente como canal de distribuição
- Sem custo de aquisição incremental

### Fluxo de conversão ideal

```
Corretor vê exemplo de output (Instagram/WhatsApp)
  ↓
Entra em contato → recebe link para teste
  ↓
Envia PDF via WhatsApp → recebe conteúdo em minutos
  ↓
Aprova e vê publicação acontecer
  ↓
Converte para plano pago
```

**Tempo do ciclo:** < 30 minutos do primeiro contato até ver o resultado.

---

## 5. Onboarding sem Fricção

### Fluxo mínimo

```
1. Usuário envia PDF pelo WhatsApp
2. BookAgent processa (< 5 min)
3. Usuário recebe prévia pelo WhatsApp
4. Usuário responde SIM
5. Conteúdo publicado automaticamente
```

**Zero instalação. Zero login. Zero configuração.**
O usuário só precisa ter WhatsApp e um PDF.

### Self-service (Parte 56)

- Cadastro via landing page (email + telefone)
- Webhook phone configurado automaticamente
- Plano básico ativado com 3 jobs de trial grátis
- Upgrade via PIX/cartão integrado

---

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Meta API muda escopo de permissões | Média | Alto | Fallback: entrega local sem publicação |
| Custo de IA aumenta | Alta | Médio | Provider routing + cache de outputs |
| Usuário abusa dos jobs (farming) | Baixa | Alto | planGuard + jobRateLimiter (já implementados) |
| Concorrência de ferramentas genéricas | Alta | Médio | Especialização no nicho imobiliário |
| Churn alto no plano Básico | Média | Médio | Converter para Pro com trial de automação |

---

## 7. Métricas de Sucesso (KPIs)

| KPI | Meta Mês 1 | Meta Mês 6 |
|-----|-----------|-----------|
| Usuários ativos | 5 | 50 |
| MRR (Receita Recorrente Mensal) | R$ 500 | R$ 8.000 |
| Taxa de conversão trial → pago | — | > 30% |
| Churn mensal | < 20% | < 10% |
| Margem bruta | > 40% | > 60% |
| NPS | > 30 | > 50 |

---

## Próximo Passo — Parte 56: Self-Service e Automação de Cobrança

- Landing page com cadastro self-service
- Integração de pagamento (Stripe ou PagBank)
- 3 jobs de trial grátis automaticamente
- Upgrade automático ao atingir limite
- Dashboard de uso para o próprio usuário
