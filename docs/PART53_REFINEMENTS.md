# Parte 53 — Refinamentos Pós-Análise

**Data:** 2026-04-04
**Escopo:** Correções técnicas baseadas em análise estática do código (pré-piloto real)

---

## Problemas Identificados e Corrigidos

### P0 — Críticos

#### 1. Instagram postUrl incorreta
**Arquivo:** `src/services/social-publisher.ts`
**Problema:** O endpoint `media_publish` retorna um numeric media ID (`17896...`), não um shortcode. A URL `https://www.instagram.com/p/{numeric_id}/` é inválida — Instagram URLs usam shortcodes alfanuméricos.
**Correção:** Adicionado Step 3: `GET /{media-id}?fields=permalink` para buscar o permalink real. Se a chamada falhar, `postUrl` fica `undefined` (sem URL quebrada).

#### 2. attempt_count sempre 1 em retries
**Arquivo:** `src/api/controllers/approvalController.ts`
**Problema:** O endpoint `/social-publish` sempre inseria `attempt_count: 1`, mesmo quando o Fluxo 6 chamava novamente (retry). Resultado: histórico de tentativas incorreto.
**Correção:** Antes de inserir, o controller verifica se já existe um registro para `(job_id, platform)`. Se existe: atualiza com `attempt_count + 1`. Se não: insere com `attempt_count: 1`.

#### 3. Falhas do n8n sem log
**Arquivo:** `src/api/controllers/approvalController.ts`
**Problema:** `triggerN8nApproval` retornava `false` em silêncio tanto para HTTP não-ok quanto para erros de rede. Impossível distinguir "n8n fora" de "n8n respondeu 4xx" no log.
**Correção:** Adicionado `logger.warn` para status HTTP não-ok e `logger.error` para erros de rede, com `jobId` e mensagem de erro.

---

### P1 — Importantes

#### 4. publishToPlatforms sequencial
**Arquivo:** `src/services/social-publisher.ts`
**Problema:** As chamadas para Instagram e Facebook eram executadas em sequência (`for...of`). Com timeout de 30s por plataforma, 2 plataformas = até 60s de espera.
**Correção:** Substituído por `Promise.all(tasks)` — Instagram e Facebook são publicados em paralelo.

#### 5. Sem retry para erros transientes da Meta API
**Arquivo:** `src/services/social-publisher.ts`
**Problema:** Erros 429 (rate limit), 500/502/503/504 (Meta instável) e erros de rede falhavam permanentemente sem retry.
**Correção:** Adicionado `fetchMetaWithRetry` — 1 retry automático após 2s para status `RETRYABLE_STATUS = {429, 500, 502, 503, 504}` e erros de rede. Não aplica retry para erros de validação (4xx não-429).

#### 6. Transições de estado não validadas
**Arquivo:** `src/api/controllers/approvalController.ts`
**Problema:** Os endpoints `/approve` e `/reject` não verificavam o estado atual do job. Era possível aprovar um job já publicado ou reprovar um job em processamento.
**Correção:** Adicionado `isValidTransition(currentStatus, nextStatus)` usando `VALID_TRANSITIONS` de `dashboard.ts`. Retorna 409 se a transição for inválida.

---

### P2 — Melhorias

#### 7. Logger com ruído de string vazia
**Arquivo:** `src/utils/logger.ts`
**Problema:** Todos os logs terminavam com `''` quando `data` era `undefined` (o operador `?? ''`).
**Correção:** Substituído por `formatData(data)` — retorna string vazia se `data` é `undefined/null`, formatado JSON se objeto, string direta se string. Adicionado nível `fatal`.

#### 8. Error handler perde stack trace
**Arquivo:** `src/api/middleware/error-handler.ts`
**Problema:** Apenas `err.message` era logado. Em desenvolvimento, o stack trace era perdido.
**Correção:** Em `NODE_ENV=development`, loga `err.stack` e retorna `{ message, stack }` no response.

#### 9. JobManager sem limite de memória
**Arquivo:** `src/core/job-manager.ts`
**Problema:** O `Map<string, Job>` crescia ilimitadamente. Em produção com volume, causaria memory leak.
**Correção:** Limite de `MAX_IN_MEMORY_JOBS = 500`. Quando atingido, o job mais antigo é removido (FIFO). Jobs persistidos no Supabase continuam acessíveis via `jobRepository`.

#### 10. Falha silenciosa ao persistir comentário
**Arquivo:** `src/api/controllers/approvalController.ts`
**Problema:** Erros no `insert` de `bookagent_comments` eram descartados sem log.
**Correção:** Adicionado `logger.warn` com jobId e mensagem de erro.

---

## Ganhos Obtidos

| Dimensão | Antes | Depois |
|----------|-------|--------|
| Latência de publicação (2 plataformas) | ~30-60s sequencial | ~30s paralelo |
| URL do Instagram | Inválida (numeric ID) | Permalink real via API |
| Retry transiente Meta API | Nenhum | 1 retry automático após 2s |
| Rastreabilidade de retries | Sempre attempt_count=1 | Incremento correto |
| Observabilidade de falhas n8n | Silencioso | Logged com level e jobId |
| Integridade de estados | Qualquer transição | VALID_TRANSITIONS enforced |
| Memory safety | Map ilimitado | Cap em 500 jobs |
| Logs | Ruído de '' em todos | Limpo, sem sufixo vazio |

---

## Estado do Build

```
npx tsc --noEmit → 0 errors
```
