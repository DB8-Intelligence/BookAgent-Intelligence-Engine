#!/usr/bin/env bash
# ============================================================================
# DEPRECATED: Vercel deployment removido.
# Usar Cloud Run via Cloud Build.
#
#   gcloud builds submit --config=cloudbuild.yaml .
#
# Este script é mantido como referência histórica (Sprint 3.1 Vercel disconnect).
# Não executar — invocações do `vercel` CLI abaixo apontam pra um projeto
# Vercel que será desativado.
# ============================================================================
# BookAgent Intelligence Engine — Deploy Script (legado Vercel)
# Executa no seu terminal local (não no container Claude)
#
# Pré-requisitos:
#   - Node.js 20+
#   - npm install -g vercel
#   - git configurado com acesso ao repositório
#
# Uso:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
# ============================================================================

set -e

TEAM_ID="team_T2S42j3Uj2hWvjnw6b1OVrKK"
API_URL="https://api-bookagent.db8intelligence.com.br"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$REPO_ROOT/web"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     BookAgent Intelligence Engine — Deploy Vercel        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Push do commit de fix para o GitHub ────────────────────────────────
echo "▶ [1/4] Push para GitHub..."
cd "$REPO_ROOT"
git push origin claude/bookagent-product-vision-e5FVg
echo "  ✅ Push OK"

# ── 2. Build local de verificação ────────────────────────────────────────
echo ""
echo "▶ [2/4] Build de verificação (Next.js)..."
cd "$WEB_DIR"
npm install --silent
npm run build
echo "  ✅ Build OK"

# ── 3. Deploy no Vercel ──────────────────────────────────────────────────
echo ""
echo "▶ [3/4] Deploy no Vercel..."
cd "$WEB_DIR"

# Verifica se já está linkado
if [ ! -f ".vercel/project.json" ]; then
  echo "  Projeto não linkado — criando novo projeto Vercel..."
  vercel --yes \
    --scope "$TEAM_ID" \
    --name "bookagent-web" \
    -e NEXT_PUBLIC_API_URL="$API_URL"
else
  echo "  Projeto já linkado — fazendo deploy..."
  vercel --yes \
    --scope "$TEAM_ID" \
    -e NEXT_PUBLIC_API_URL="$API_URL"
fi

# ── 4. Promove para produção ─────────────────────────────────────────────
echo ""
echo "▶ [4/4] Promovendo para produção..."
cd "$WEB_DIR"
vercel --prod \
  --scope "$TEAM_ID" \
  -e NEXT_PUBLIC_API_URL="$API_URL"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  Deploy concluído!                                    ║"
echo "║                                                           ║"
echo "║  Frontend: https://bookagent-web.vercel.app               ║"
echo "║  API:      https://api-bookagent.db8intelligence.com.br   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Próximos passos:"
echo "  1. Adicionar domínio customizado no painel Vercel:"
echo "     bookagent.db8intelligence.com.br → bookagent-web.vercel.app"
echo "  2. No n8n: criar credenciais BookAgent API Key + Evolution API Key"
echo "  3. Teste end-to-end com PDF real"
