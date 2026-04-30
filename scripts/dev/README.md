# scripts/dev/

Scripts utilitários de desenvolvimento — diagnósticos, checks de conectividade,
inspeção rápida de infra. Não são executados em CI nem em produção.

## Pré-requisitos

Todos os scripts aqui usam **Application Default Credentials (ADC)** — nunca
arquivos `serviceAccountKey.json`. Antes de rodar pela primeira vez:

```bash
# Logar com sua conta Google (abre browser)
gcloud auth application-default login

# Setar o projeto ativo
gcloud config set project bookreel
```

A partir daí, qualquer SDK Google detecta automaticamente as credenciais
e o projectId.

---

## Scripts disponíveis

### check-firebase-connection.ts

Sanity check de conectividade Firestore via `firebase-admin`. Read-only.

**O que faz:**
- Inicializa `firebase-admin` com ADC.
- Detecta `projectId` via env vars (`GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT_ID` / `GCLOUD_PROJECT`).
- Lê `db.collection('profiles').limit(1).get()`.
- Imprime sucesso/falha + tempo de resposta em ms.

**O que NÃO faz:**
- Não escreve no Firestore.
- Não lê `serviceAccountKey.json`.
- Não cria nem manipula secrets.

**Como rodar:**

```bash
gcloud auth application-default login
gcloud config set project bookreel
npx tsx scripts/dev/check-firebase-connection.ts
```

**Saída esperada (sucesso):**

```
[check-firebase] Initializing firebase-admin with Application Default Credentials...
[check-firebase] projectId=bookreel
[check-firebase] Probing collection "profiles" with limit(1)...
[check-firebase] SUCCESS — read 1 doc(s) from "profiles" in 234ms
[check-firebase] sample doc id=<uid>
```

**Saída esperada (collection vazia mas conectividade OK):**

```
[check-firebase] SUCCESS — read 0 doc(s) from "profiles" in 198ms
[check-firebase] (collection "profiles" is empty — connectivity OK, no data yet)
```

**Falhas comuns:**

| Mensagem | Causa | Como resolver |
|---|---|---|
| `Could not load the default credentials` | ADC não configurado | `gcloud auth application-default login` |
| `... project ... not ...` | projectId não detectado | `gcloud config set project bookreel` |
| `PERMISSION_DENIED` | Sua conta não tem `roles/datastore.user` | Pedir ao admin do projeto pra adicionar a role |

---

## Adicionando novos scripts

Convenção:
- TypeScript (`.ts`) executado via `npx tsx`.
- Sempre ADC; nunca JSON keys.
- Read-only por default; escrita só com flag explícita (`--write`).
- Header de comentário descrevendo: o que faz, o que NÃO faz, como rodar.
- Não adicionar a `package.json` scripts — esses utilitários são pra dev local,
  não fazem parte do pipeline.
