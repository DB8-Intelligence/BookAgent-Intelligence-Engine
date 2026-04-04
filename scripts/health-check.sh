#!/usr/bin/env bash
# =============================================================================
# BookAgent Intelligence Engine — Health Check Script
# Parte 52: Validação pré-piloto
#
# Uso:
#   chmod +x scripts/health-check.sh
#   ./scripts/health-check.sh [BASE_URL]
#
# Exemplos:
#   ./scripts/health-check.sh                          # usa localhost:3000
#   ./scripts/health-check.sh https://api.db8intelligence.com.br
# =============================================================================

BASE_URL="${1:-http://localhost:3000}"
API="${BASE_URL}/api/v1"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0
WARN=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ok() {
  echo -e "  ${GREEN}✓${RESET} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "  ${RED}✗${RESET} $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "  ${YELLOW}⚠${RESET} $1"
  WARN=$((WARN + 1))
}

header() {
  echo ""
  echo -e "${CYAN}${BOLD}$1${RESET}"
  echo -e "${CYAN}$(printf '─%.0s' $(seq 1 60))${RESET}"
}

check_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local actual

  actual=$(echo "$json" | grep -o "\"$field\":[^,}]*" | head -1 | sed 's/.*: *//;s/[",]//g;s/ //g')

  if [ "$actual" = "$expected" ]; then
    return 0
  else
    return 1
  fi
}

# ---------------------------------------------------------------------------
# 1. Health Endpoint
# ---------------------------------------------------------------------------

header "1. HEALTH CHECK — ${BASE_URL}"

HEALTH_RESPONSE=$(curl -sf --max-time 10 "${BASE_URL}/health" 2>/dev/null)
HEALTH_CODE=$?

if [ $HEALTH_CODE -ne 0 ]; then
  fail "Servidor não responde em ${BASE_URL}/health"
  echo ""
  echo -e "${RED}ABORTANDO: servidor inacessível${RESET}"
  exit 1
fi

ok "Servidor respondendo"

# Check status field
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
  ok "status = ok"
else
  fail "status != ok"
fi

# Check persistence
if echo "$HEALTH_RESPONSE" | grep -q '"supabase":true'; then
  ok "Persistência Supabase ativa"
elif echo "$HEALTH_RESPONSE" | grep -q '"mode":"memory"'; then
  warn "Persistência em memória (configure SUPABASE_URL para persistir)"
else
  warn "Modo de persistência desconhecido"
fi

# Check AI provider
if echo "$HEALTH_RESPONSE" | grep -q '"available":true'; then
  ok "AI provider configurado"
else
  warn "AI provider sem chave — modo local (outputs podem ser placeholders)"
fi

# Check queue
if echo "$HEALTH_RESPONSE" | grep -q '"mode":"bullmq"'; then
  ok "Queue BullMQ ativo (processamento assíncrono)"
elif echo "$HEALTH_RESPONSE" | grep -q '"mode":"sync"'; then
  warn "Queue em modo sync (configure REDIS_URL para assíncrono)"
fi

# ---------------------------------------------------------------------------
# 2. API Endpoints
# ---------------------------------------------------------------------------

header "2. API ENDPOINTS"

# Test process endpoint exists (OPTIONS or just check 400 vs 404)
PROCESS_CODE=$(curl -so /dev/null -w "%{http_code}" --max-time 5 \
  -X POST "${API}/process" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null)

if [ "$PROCESS_CODE" = "400" ] || [ "$PROCESS_CODE" = "422" ]; then
  ok "POST /process acessível (retorna 4xx para payload vazio)"
elif [ "$PROCESS_CODE" = "200" ] || [ "$PROCESS_CODE" = "202" ]; then
  warn "POST /process retornou sucesso com payload vazio"
elif [ "$PROCESS_CODE" = "404" ]; then
  fail "POST /process retornou 404"
else
  warn "POST /process retornou HTTP $PROCESS_CODE"
fi

# Test jobs listing
JOBS_CODE=$(curl -so /dev/null -w "%{http_code}" --max-time 5 "${API}/jobs" 2>/dev/null)
if [ "$JOBS_CODE" = "200" ]; then
  ok "GET /jobs acessível"
else
  fail "GET /jobs retornou HTTP $JOBS_CODE"
fi

# ---------------------------------------------------------------------------
# 3. Criar Job de Teste
# ---------------------------------------------------------------------------

header "3. JOB DE TESTE (PDF público)"

TEST_PDF_URL="https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1.pdf"

echo -e "  ${YELLOW}→ Submetendo PDF de teste...${RESET}"

JOB_RESPONSE=$(curl -sf --max-time 30 \
  -X POST "${API}/process" \
  -H "Content-Type: application/json" \
  -d "{
    \"file_url\": \"${TEST_PDF_URL}\",
    \"type\": \"pdf\",
    \"user_context\": { \"name\": \"HealthCheck\", \"region\": \"Test\" }
  }" 2>/dev/null)

JOB_CREATE_CODE=$?

if [ $JOB_CREATE_CODE -ne 0 ]; then
  fail "Falha ao criar job de teste"
  JOB_ID=""
else
  JOB_ID=$(echo "$JOB_RESPONSE" | grep -o '"jobId":"[^"]*"' | head -1 | sed 's/"jobId":"//;s/"//')

  if [ -n "$JOB_ID" ]; then
    ok "Job criado: $JOB_ID"
  else
    fail "jobId não encontrado na resposta"
    echo "  Resposta: $(echo "$JOB_RESPONSE" | head -c 200)"
    JOB_ID=""
  fi
fi

# ---------------------------------------------------------------------------
# 4. Verificar Job Status
# ---------------------------------------------------------------------------

if [ -n "$JOB_ID" ]; then
  header "4. STATUS DO JOB ($JOB_ID)"

  echo -e "  ${YELLOW}→ Aguardando processamento (até 120s)...${RESET}"

  FINAL_STATUS=""
  for i in $(seq 1 12); do
    sleep 10
    JOB_STATUS_RESPONSE=$(curl -sf --max-time 10 "${API}/jobs/${JOB_ID}" 2>/dev/null)
    CURRENT_STATUS=$(echo "$JOB_STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | sed 's/"status":"//;s/"//')

    echo -e "  [${i}0s] status: ${CURRENT_STATUS}"

    if [ "$CURRENT_STATUS" = "completed" ] || [ "$CURRENT_STATUS" = "failed" ]; then
      FINAL_STATUS="$CURRENT_STATUS"
      break
    fi
  done

  if [ "$FINAL_STATUS" = "completed" ]; then
    ok "Job completado com sucesso"

    ARTIFACTS=$(echo "$JOB_STATUS_RESPONSE" | grep -o '"artifacts_count":[0-9]*' | sed 's/"artifacts_count"://')
    if [ -n "$ARTIFACTS" ] && [ "$ARTIFACTS" -gt 0 ]; then
      ok "Artifacts gerados: $ARTIFACTS"
    else
      warn "Nenhum artifact gerado (verifique o AI provider)"
    fi

  elif [ "$FINAL_STATUS" = "failed" ]; then
    fail "Job falhou — verifique logs do Railway"
    ERROR=$(echo "$JOB_STATUS_RESPONSE" | grep -o '"error":"[^"]*"' | head -1)
    echo "  Erro: $ERROR"
  else
    warn "Job ainda em processamento após 120s — pipeline pode estar lento"
  fi
else
  warn "Etapa 4 pulada (job não criado)"
fi

# ---------------------------------------------------------------------------
# 5. Verificar Supabase (via dashboard endpoint)
# ---------------------------------------------------------------------------

if [ -n "$JOB_ID" ] && [ "$FINAL_STATUS" = "completed" ]; then
  header "5. PERSISTÊNCIA SUPABASE"

  DASH_CODE=$(curl -so /dev/null -w "%{http_code}" --max-time 5 \
    "${API}/jobs/${JOB_ID}/dashboard" 2>/dev/null)

  if [ "$DASH_CODE" = "200" ]; then
    ok "Dashboard view acessível (Supabase operacional)"
  elif [ "$DASH_CODE" = "503" ]; then
    warn "Supabase não configurado — dashboard indisponível"
  elif [ "$DASH_CODE" = "404" ]; then
    warn "Job não encontrado no Supabase — bookagent_job_meta não populado (n8n Fluxo 2 necessário)"
  else
    warn "Dashboard retornou HTTP $DASH_CODE"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Resultado
# ---------------------------------------------------------------------------

header "RESULTADO"

TOTAL=$((PASS + FAIL + WARN))
echo -e "  Total de verificações: ${TOTAL}"
echo -e "  ${GREEN}✓ Passou: ${PASS}${RESET}"
echo -e "  ${RED}✗ Falhou: ${FAIL}${RESET}"
echo -e "  ${YELLOW}⚠ Avisos: ${WARN}${RESET}"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ SISTEMA PRONTO PARA PILOTO${RESET}"
  exit 0
elif [ $FAIL -eq 0 ]; then
  echo -e "${YELLOW}${BOLD}⚠ SISTEMA PARCIALMENTE PRONTO — revisar avisos antes do piloto${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ SISTEMA NÃO ESTÁ PRONTO — corrigir falhas antes do piloto${RESET}"
  exit 1
fi
