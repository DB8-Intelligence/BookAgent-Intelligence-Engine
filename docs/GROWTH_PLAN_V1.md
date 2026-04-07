# 🚀 Plano de Crescimento Escalável — BookAgent Intelligence Engine

Este documento detalha a estratégia técnica para evoluir o sistema da fase de validação (100 usuários) até a escala massiva (10.000 usuários), garantindo estabilidade, performance e margem financeira.

---

## 1. Fases de Crescimento

### 🟢 Fase 1: Fundação (Até 100 usuários)
*   **Objetivo:** Validação do Product-Market Fit e estabilidade técnica inicial.
*   **Arquitetura:**
    *   Instância única (vertical scaling).
    *   Fila BullMQ com Redis local/compartilhado.
    *   Persistência: Supabase (Tier gratuito/básico).
*   **Riscos:** Gargalos pontuais em módulos de processamento pesado (Vídeo/IA).
*   **Ação:** Implementação de logs estruturados e monitoramento básico de erros.

### 🟡 Fase 2: Escala Operacional (100 a 1.000 usuários)
*   **Objetivo:** Alta disponibilidade e automação de processos.
*   **Arquitetura:**
    *   Separação de **API** e **Workers** em containers distintos.
    *   Auto-scaling horizontal de workers baseado no tamanho da fila.
    *   Redis Gerenciado (Upstash ou MemoryStore).
    *   Supabase Pro (com réplicas de leitura para Dashboard).
*   **Mudança Técnica:** Substituir Rate Limiter in-memory por Redis-backed.
*   **Riscos:** Concorrência de banco de dados (Connection limits) e custos crescentes de IA.

### 🔴 Fase 3: Escala Massiva (1.000 a 10.000 usuários)
*   **Objetivo:** Otimização de margem e resiliência regional.
*   **Arquitetura:**
    *   Multi-region deployment (Latência global).
    *   Fallback inteligente entre provedores de IA (OpenAI ↔ Anthropic ↔ Gemini).
    *   Caching semântico de respostas de IA para conteúdos similares (redução de custo).
    *   Dashboard analítico avançado para controle de CAC/LTV e margem bruta por job.
*   **Riscos:** Margem negativa se a eficiência de IA não for otimizada. Latência em uploads de grandes books.

---

## 2. Diagnóstico da Arquitetura Atual

| Componente | Limitação Atual | Solução de Escala |
| :--- | :--- | :--- |
| **API** | Monolito Express | Separação em Microservices ou Serverless (Cloud Run). |
| **Fila** | Memória do Redis | Cluster de Redis + Sharding de jobs por prioridade. |
| **Render** | CPU-bound no worker | Cluster dedicado de renderização (FFmpeg/GPU). |
| **Rate Limit** | In-memory (per instance) | Redis Sliding Window (Global). |
| **Metrics** | Buffer simples (30s) | Pipeline de dados (Kinesis/Kafka) para Data Warehouse. |

---

## 3. Implementações Prioritárias (Parte 57)

### 3.1 Multi-tenant 2.0 (Planejamento)
*   Adição de `tenant_id` para usuários Business que gerenciam múltiplas imobiliárias.
*   Rigorosa separação de Storage (buckets por tenant).

### 3.2 Observabilidade de Custo (Execução)
*   Cada estágio do pipeline deve reportar: `tokens_used`, `chars_processed`, `seconds_rendered`.
*   O sistema deve calcular o custo real consolidado por Job para auditoria financeira.

### 3.3 Rate Limiting Global (Planejamento)
*   Migração da lógica de `SlidingWindowCounter` para comandos `ATOMIC` do Redis (INCR + EXPIRE).

---

## 4. Métricas Principais (KPIs)

*   **Vazão:** Jobs processados/dia e Throughput de conteúdo/minuto.
*   **Eficiência:** Tempo médio de ponta a ponta (Meta: < 120s).
*   **Margem:** Revenue per Job - (Provider IA Cost + Infra Cost).
*   **Qualidade:** Taxa de retenção (Corretor volta para processar o 2º book).

---

## 5. Riscos Críticos e Mitigação

1.  **Rate Limit de Provedores:** Exceder limites de tokens da OpenAI/Google.
    *   *Mitigação:* Fila com escalonamento (Priority Queue) e rotação de chaves/provedores.
2.  **Custo de Vídeo:** Renderização de Reels é cara.
    *   *Mitigação:* Usar templates otimizados e renderização serverless por demanda.
3.  **Fricção no Signup:** Funil de WhatsApp pode travar com muitas mensagens.
    *   *Mitigação:* Sistema de redundância em n8n e fallbacks de mensagens.
