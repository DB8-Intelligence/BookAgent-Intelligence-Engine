# BookAgent Intelligence Engine — Setup Local e Validação do Baseline

> Guia para sincronizar, instalar e validar o projeto no ambiente local oficial.
> Data do baseline: 2026-04-04 | Branch: `claude/bookagent-product-vision-e5FVg`

---

## Pré-requisitos

| Requisito | Versão mínima | Como verificar |
|-----------|---------------|----------------|
| Node.js | 20.0.0 | `node --version` |
| npm | 9.0.0 | `npm --version` |
| Git | 2.30+ | `git --version` |

**Nota sobre Sharp**: O projeto usa `sharp` para análise de branding (cores, luminância). Em Windows, a instalação é automática via npm. Se falhar, o core continua funcionando — o módulo de branding retorna branding vazio e o pipeline segue normalmente.

---

## 1. Sincronização com o GitHub

### Se o repositório já está clonado

```bash
cd C:\Users\Douglas\BookAgent-Intelligence-Engine

# Verificar remote
git remote -v
# Deve mostrar: origin https://github.com/DB8-Intelligence/BookAgent-Intelligence-Engine

# Buscar todas as branches
git fetch origin

# Mudar para a branch do baseline
git checkout claude/bookagent-product-vision-e5FVg

# Puxar últimas alterações
git pull origin claude/bookagent-product-vision-e5FVg

# Verificar que está no commit correto
git log --oneline -5
# Primeiro commit deve ser: 30ff1ea feat: finalize core...
```

### Se o repositório NÃO está clonado

```bash
cd C:\Users\Douglas

git clone https://github.com/DB8-Intelligence/BookAgent-Intelligence-Engine.git
cd BookAgent-Intelligence-Engine

git checkout claude/bookagent-product-vision-e5FVg
```

---

## 2. Instalação de Dependências

```bash
npm install
```

Resultado esperado:
- `node_modules/` criado com todas as dependências
- Sem erros de compilação de pacotes nativos (sharp pode demorar)
- Se sharp falhar no Windows: `npm install --ignore-scripts` e depois `npm rebuild sharp`

---

## 3. Configuração do Ambiente

```bash
# Copiar template de variáveis de ambiente
copy .env.example .env
```

**Nenhuma variável é obrigatória para rodar o core.** O sistema funciona sem API keys, usando lógica local e stubs. As variáveis de AI/TTS só são necessárias quando você ativar adapters reais na fase de integração.

---

## 4. Validação do Build

```bash
# Verificar tipos (sem gerar output)
npx tsc --noEmit

# Build completo (gera dist/)
npm run build
```

Resultado esperado:
- Zero erros de TypeScript
- Diretório `dist/` criado com:
  - `dist/index.js` (entry point)
  - `dist/core/` (pipeline, orchestrator, context)
  - `dist/modules/` (16 diretórios — 15 pipeline + audio)
  - `dist/domain/` (entities, interfaces, policies, value-objects)
  - `dist/adapters/` (AI, PDF, storage, TTS)
  - `dist/api/` (controllers, routes, middleware)

---

## 5. Validação dos Testes

```bash
npm test
```

Resultado esperado:
```
Test Files  13 passed (13)
     Tests  89 passed (89)
```

Arquivos de teste:
- `tests/core/pipeline.test.ts` — 6 testes
- `tests/core/pipeline-stages.test.ts` — 5 testes (ordem dos 15 estágios)
- `tests/core/orchestrator.test.ts` — 4 testes
- `tests/core/context.test.ts` — 5 testes
- `tests/modules/source-intelligence.test.ts` — 16 testes
- `tests/modules/narrative.test.ts` — 8 testes
- `tests/modules/output-selection.test.ts` — 7 testes
- `tests/modules/personalization.test.ts` — 13 testes
- `tests/modules/asset-immutability.test.ts` — 10 testes
- `tests/modules/blog.test.ts` — 4 testes
- `tests/modules/branding.test.ts` — 3 testes
- `tests/modules/correlation.test.ts` — 4 testes
- `tests/modules/delivery.test.ts` — 4 testes

---

## 6. Validação do Sample Run

```bash
npm run sample
```

Resultado esperado:
- Pipeline executa 15 estágios em ~50ms
- 10 correlações, 10 sources, 10 narrativas, 7 outputs aprovados
- 4 media plans, 1 blog plan, 1 landing page plan
- 13 export artifacts gerados (~68KB)
- Delivery status: `ready`
- Arquivos salvos em `storage/sample-run/`

Para inspecionar os resultados:
```bash
# Resumo do pipeline
type storage\sample-run\result-summary.json

# Blog gerado
type storage\sample-run\rendered\blog--*.html

# Landing page gerada
type storage\sample-run\rendered\lp--*.html
```

---

## 7. Executando o Servidor (API)

```bash
# Modo desenvolvimento (com watch)
npm run dev

# Modo produção (requer build antes)
npm run build
npm start
```

Verificar:
```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{"status":"ok","engine":"bookagent-intelligence-engine","version":"0.1.0"}
```

---

## Checklist de Validação do Baseline

Use este checklist para confirmar que o baseline está correto:

```
[ ] Git: branch claude/bookagent-product-vision-e5FVg ativa
[ ] Git: commit 30ff1ea no topo do log
[ ] Git: working tree clean (sem arquivos modificados)
[ ] npm install: sem erros
[ ] npx tsc --noEmit: zero erros
[ ] npm run build: dist/ gerado corretamente
[ ] npm test: 13 arquivos, 89 testes, todos passando
[ ] npm run sample: pipeline completo, delivery=ready
[ ] .env copiado de .env.example (se necessário)
[ ] storage/ com subdiretórios assets/, outputs/, temp/
```

---

## Estrutura de Diretórios Esperada

```
BookAgent-Intelligence-Engine/
├── .env.example          ← Template de variáveis
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── docs/                 ← Documentação técnica
│   ├── CORE_TECHNICAL_REFERENCE.md
│   ├── LOCAL_SETUP.md    ← Este arquivo
│   └── ...
├── scripts/              ← Scripts de validação
│   ├── sample-run.ts
│   ├── sample-fixture.ts
│   ├── full-pipeline-validation.ts
│   └── multi-book-validation.ts
├── src/                  ← Código-fonte
│   ├── index.ts          ← Entry point (Express + 15 módulos)
│   ├── core/             ← Pipeline, Orchestrator, Context
│   ├── domain/           ← Entities, Interfaces, Policies
│   ├── modules/          ← 16 módulos (15 pipeline + audio)
│   ├── adapters/         ← AI, PDF, Storage, TTS
│   ├── api/              ← Controllers, Routes
│   ├── renderers/        ← Blog, LP, Media, Video
│   ├── generation/       ← Text generators
│   ├── product/          ← SaaS plans, MCP, API spec
│   └── config/           ← Configuração
├── tests/                ← 13 arquivos de teste
│   ├── core/
│   ├── modules/
│   └── fixtures.ts
├── storage/              ← Dados locais (gitignored)
│   ├── assets/.gitkeep
│   ├── outputs/.gitkeep
│   └── temp/.gitkeep
└── dist/                 ← Build output (gitignored)
```

---

## Próximos Passos (Fase de Integração)

Após validar o baseline, a fase de integração seguirá esta ordem:

1. **Variáveis de ambiente reais** — preencher `.env` com API keys
2. **Teste de adapters AI** — executar com Anthropic/OpenAI reais
3. **Storage externo** — configurar Supabase para persistência
4. **Deploy** — Railway/Docker para produção
5. **Queue** — n8n ou Bull para processamento assíncrono
6. **MCP Server** — expor tools para ecossistema

**Nenhuma dessas integrações deve ser iniciada até que este baseline esteja validado localmente.**

---

## Troubleshooting

### Sharp não instala no Windows
```bash
npm install --ignore-scripts
npm rebuild sharp --platform=win32
```
Se continuar falhando, o core funciona sem Sharp — o módulo de branding retorna valores padrão.

### Porta 3000 já em uso
```bash
# Windows
set PORT=4000
npm run dev
```

### Tests com timeout
```bash
npx vitest run --reporter=verbose
```

### Build falha com import errors
Verifique que `"type": "module"` está no package.json e que todas as importações usam `.js` extension.
