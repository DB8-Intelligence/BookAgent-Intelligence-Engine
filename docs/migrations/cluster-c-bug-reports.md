# Migration — Supabase `bookagent_bug_reports` → Firestore `bug_reports`

**Status:** Sprint 3.2 — dual-write ativo, leitura ainda Supabase, backfill manual.

Primeira tabela do Cluster C a migrar (escolhida por baixo risco/volume).
Esta migração é o template para as próximas (reviews, revisions, leads, ...).

---

## Schema Firestore

Coleção `bug_reports/{id}`. O `id` (UUID) é o mesmo da row Supabase para
permitir backfill idempotente e correlação cross-store durante o soak.

| Campo | Tipo | Origem |
|---|---|---|
| `id` | string (UUID) | Supabase `id` |
| `type` | string | Default `"bug"`. Reservado para futura categorização |
| `severity` | `'blocker' \| 'bug' \| 'suggestion'` | Supabase `severity` |
| `title` | string | Supabase `title` |
| `description` | string \| null | Supabase `description` |
| `email` | string \| null | `req.authUser.email` em escritas novas; null em backfill |
| `userId` | string (UUID) | Supabase `user_id` |
| `tenantId` | string | `req.tenantContext.tenantId` em escritas novas; fallback para `userId` em backfill (modelo solo-tenant) |
| `source` | string | `"in-app"` em escritas novas; `"legacy-supabase"` em backfill |
| `metadata` | object | Supabase `context` |
| `status` | `'new' \| 'investigating' \| 'fixed' \| 'wont_fix'` | Supabase `status`, default `"new"` |
| `adminNotes` | string \| null | Supabase `admin_notes` |
| `createdAt` | string (ISO) | Supabase `created_at` (preservado em backfill) |
| `updatedAt` | string (ISO) | Supabase `updated_at` ou `created_at` |

Índices Firestore necessários (compostos):
- `userId` ASC + `createdAt` DESC — query de `GET /bugs/mine`
- `severity` ASC + `createdAt` DESC — filtro admin por severity
- `status` ASC + `createdAt` DESC — filtro admin por status
- `tenantId` ASC + `createdAt` DESC — listagem futura por tenant

Estes índices serão adicionados a `firestore.indexes.json` em sprint
posterior, junto com o cutover de leituras (Sprint 3.3+).

---

## Estratégia dual-write

**Hoje (pós-Sprint 3.2):**

```
POST /bugs
  ├─ supabase.insert('bookagent_bug_reports', ...)   ← primário, source of truth
  └─ createBugReportInFirestore({ ... })             ← paralelo, best-effort
                                                       (falha não derruba request)

GET  /bugs/mine    ← ainda Supabase
GET  /bugs         ← ainda Supabase (admin)
PATCH /bugs/:id    ← ainda Supabase only (sem dual-write em PATCH neste sprint)
```

**Razões pelo design:**

- Dual-write só no POST: minimiza superfície de risco. Updates de status
  pelo admin são raros e podem ficar Supabase-only até cutover; backfill
  re-roda e sincroniza estado se necessário.
- Best-effort no Firestore: usa `.catch()` ao invés de `await` na promise
  para não bloquear a response do POST. Erros logam com `[Bugs] Firestore
  dual-write failed for ${id}: ${err}`.
- Doc id = Supabase id: backfill idempotente; permite spot-check
  cruzado nos dois stores.

**Próximas fases (NÃO neste sprint):**

- Sprint 3.3: shadow-read (ler dos dois e comparar; logs de mismatch).
- Sprint 3.4: cutover de leitura (Firestore primário; Supabase fallback).
- Sprint 3.5: desligar dual-write Supabase; coleção legada read-only.

---

## Comandos

### Pré-requisitos (uma vez)

```bash
gcloud auth application-default login
gcloud config set project bookreel
```

### Validar conectividade Firestore

```bash
npx tsx scripts/dev/check-firebase-connection.ts
```

Esperado: `[check-firebase] SUCCESS — read N doc(s) from "profiles" in Xms`.

### Backfill — DRY-RUN (default)

Inspeciona Supabase e simula escritas, sem tocar Firestore:

```bash
npx tsx scripts/migration/backfill-bug-reports.ts
```

Saída esperada:

```
[backfill-bug-reports] DRY-RUN — no writes
[backfill-bug-reports] chunk size: 200
[backfill-bug-reports] chunk: read=N cursor=<initial> → next=2024-...
[dry-run] would upsert id=... severity=bug title="..."
...
[backfill-bug-reports] ─── SUMMARY ───
  mode:          DRY-RUN
  total read:    N
  total written: 0
  total skipped: N (dry-run)
  total errors:  0
  elapsed:       Xms
```

### Backfill — WRITE (executa de fato)

⚠️ Sobrescreve docs Firestore com mesmo `id`. Idempotente, mas reflete o
estado **mais recente** do Supabase a cada execução.

```bash
npx tsx scripts/migration/backfill-bug-reports.ts --write
```

Chunk size customizado (default 200):

```bash
npx tsx scripts/migration/backfill-bug-reports.ts --write --chunk=500
```

---

## Plano de validação

1. **Smoke test pós-backfill** (após `--write`):
   - Comparar contagens:
     - Supabase: `SELECT count(*) FROM bookagent_bug_reports`
     - Firestore: contar via `firestore().collection('bug_reports').count().get()`
       ou inspecionar Cloud Console.
   - Diferença esperada: 0 (ou ≤ rows novas durante a janela do backfill).

2. **Spot-check (5–10 amostras)**:
   - Escolher rows aleatórias do Supabase.
   - Buscar doc Firestore via id idêntico.
   - Validar campos críticos (title, severity, userId, createdAt) coincidem.

3. **Smoke do dual-write live**:
   - `POST /bugs` com payload de teste.
   - Verificar:
     - Row criada em Supabase (status 201 com id).
     - Doc criado em Firestore com mesmo id (`firestore().collection('bug_reports').doc(<id>).get()`).
     - Campos `email`, `tenantId`, `source='in-app'` populados corretamente.

4. **Monitor de logs**:
   - Buscar `[Bugs] Firestore dual-write failed` em Cloud Logging.
   - Threshold: 0 esperado em modo normal; alertar acima de 1% das writes.

---

## Rollback

| Etapa | Como reverter |
|---|---|
| Dual-write no POST | Comentar a chamada `createBugReportInFirestore(...).catch(...)` em `src/api/routes/bugs.ts`. Supabase continua funcionando isolado. |
| Backfill | Coleção `bug_reports` pode ser drop pelo Cloud Console (Firestore → Data → delete collection). Re-rodar backfill recria. |
| Repo Firestore | Manter — não tem efeito sem callers. |

Em todos os cenários, **Supabase continua sendo source of truth** durante
Sprint 3.2 — rollback do dual-write não causa data loss.

---

## Out of scope (sprints posteriores)

- Cutover de leituras (`GET /bugs/mine`, `GET /bugs`, `PATCH /bugs/:id`).
- Firestore Security Rules para `bug_reports` (hoje só backend escreve).
- Sincronização de `status` e `admin_notes` no PATCH (hoje sem dual-write).
- Drop da tabela `bookagent_bug_reports` no Postgres.
- Índices compostos definidos em `firestore.indexes.json`.

Cada item acima vira ticket próprio quando o soak desta fase confirmar
estabilidade do dual-write.
