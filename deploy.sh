#!/usr/bin/env bash
# =============================================================================
# BookAgent — Deploy para Google Cloud Run
# =============================================================================
# Script one-shot para:
#   1. Verificar pré-requisitos (gcloud, APIs habilitadas, auth)
#   2. Dispara Cloud Build (usa cloudbuild.yaml)
#   3. Mostra URL do serviço deployado
#
# Uso:
#   ./deploy.sh                           # usa defaults (project atual)
#   PROJECT_ID=bookagent-ent ./deploy.sh  # project específico
#   REGION=southamerica-east1 ./deploy.sh # region específica
#
# Pré-requisitos (rodar UMA VEZ antes do primeiro deploy):
#   gcloud services enable run.googleapis.com \
#                         cloudbuild.googleapis.com \
#                         artifactregistry.googleapis.com \
#                         aiplatform.googleapis.com \
#                         storage.googleapis.com
#
#   gcloud artifacts repositories create bookagent \
#     --repository-format=docker --location=us-central1
#
#   gcloud iam service-accounts create bookagent-runtime \
#     --display-name="BookAgent Runtime"
#
#   gcloud projects add-iam-policy-binding $PROJECT_ID \
#     --member=serviceAccount:bookagent-runtime@$PROJECT_ID.iam.gserviceaccount.com \
#     --role=roles/aiplatform.user
#
#   gcloud projects add-iam-policy-binding $PROJECT_ID \
#     --member=serviceAccount:bookagent-runtime@$PROJECT_ID.iam.gserviceaccount.com \
#     --role=roles/storage.objectAdmin
# =============================================================================

set -euo pipefail

# --- Config (override via env) -----------------------------------------------
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-bookagent}"
API_SERVICE="${API_SERVICE:-bookagent-api}"
WORKER_SERVICE="${WORKER_SERVICE:-bookagent-worker}"
SA_NAME="${SA_NAME:-bookagent-runtime}"

# --- Colors ------------------------------------------------------------------
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
cyan()   { printf "\033[36m%s\033[0m\n" "$*"; }

# --- Preflight ---------------------------------------------------------------
if [[ -z "$PROJECT_ID" ]]; then
  red "ERRO: PROJECT_ID não setado. Rode: gcloud config set project <id>"
  exit 1
fi

if ! command -v gcloud &>/dev/null; then
  red "ERRO: gcloud CLI não instalado. Veja https://cloud.google.com/sdk/docs/install"
  exit 1
fi

cyan "═══════════════════════════════════════════════════════════════"
cyan " BookAgent — Deploy to Cloud Run"
cyan "═══════════════════════════════════════════════════════════════"
yellow "Project:     $PROJECT_ID"
yellow "Region:      $REGION"
yellow "Repo:        $REPO"
yellow "API service: $API_SERVICE"
yellow "Worker:      $WORKER_SERVICE"
echo

# --- Verifica APIs -----------------------------------------------------------
cyan "[1/4] Verificando APIs habilitadas..."
required_apis=(
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "aiplatform.googleapis.com"
  "storage.googleapis.com"
)
for api in "${required_apis[@]}"; do
  if ! gcloud services list --enabled --filter="name:$api" --format="value(name)" 2>/dev/null | grep -q "$api"; then
    red "  API $api não habilitada. Habilitando..."
    gcloud services enable "$api"
  else
    green "  ✓ $api"
  fi
done
echo

# --- Verifica Service Account ------------------------------------------------
cyan "[2/4] Verificando Service Account..."
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SA_EMAIL" &>/dev/null; then
  yellow "  Service Account $SA_EMAIL não existe. Criando..."
  gcloud iam service-accounts create "$SA_NAME" --display-name="BookAgent Runtime"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role=roles/aiplatform.user --condition=None >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role=roles/storage.objectAdmin --condition=None >/dev/null
fi
green "  ✓ $SA_EMAIL"
echo

# --- Verifica Artifact Registry ----------------------------------------------
cyan "[3/4] Verificando Artifact Registry..."
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" &>/dev/null; then
  yellow "  Repo $REPO não existe. Criando..."
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker --location="$REGION" \
    --description="BookAgent container images"
fi
green "  ✓ $REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
echo

# --- Dispara Cloud Build -----------------------------------------------------
cyan "[4/4] Disparando Cloud Build..."
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_REPO=$REPO,_API_SERVICE=$API_SERVICE,_WORKER_SERVICE=$WORKER_SERVICE,_SA_EMAIL=$SA_EMAIL" \
  .

echo
cyan "═══════════════════════════════════════════════════════════════"
green " ✓ Deploy concluído!"
cyan "═══════════════════════════════════════════════════════════════"

# --- URLs dos serviços -------------------------------------------------------
API_URL=$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "(não encontrado)")
echo
yellow "API URL:    $API_URL"
yellow "Worker:     Cloud Run (private, trigged via Redis queue)"
echo
cyan "Health check:"
echo "  curl $API_URL/health"
echo
cyan "Próximos passos:"
echo "  1. Atualizar NEXT_PUBLIC_API_URL no Vercel para $API_URL"
echo "  2. Configurar Redis (Memorystore ou Upstash) — env REDIS_URL"
echo "  3. Criar bucket GCS: gsutil mb gs://\${PROJECT_ID}-uploads"
echo "  4. Testar um upload end-to-end"
