#!/usr/bin/env bash
# Uso: ./run-agent.sh imob "Implemente o webhook Hotmart"
PROJECT="${1:-imob}"
TASK="${2:-Audite o projeto}"

case "$PROJECT" in
  imob)  AGENT="$IMOBCREATOR_AGENT_ID"; ENV="$IMOBCREATOR_ENV_ID" ;;
  book)  AGENT="$BOOKAGENT_AGENT_ID";   ENV="$BOOKAGENT_ENV_ID"   ;;
  video) AGENT="$VIDEOMNIX_AGENT_ID";   ENV="$VIDEOMNIX_ENV_ID"   ;;
  nexo)  AGENT="$NEXOOMNIX_AGENT_ID";   ENV="$NEXOOMNIX_ENV_ID"   ;;
  reel)  AGENT="$REELVIRAL_AGENT_ID";   ENV="$REELVIRAL_ENV_ID"   ;;
esac

H=(-H "x-api-key: $ANTHROPIC_API_KEY"
   -H "anthropic-version: 2023-06-01"
   -H "anthropic-beta: managed-agents-2026-04-01"
   -H "content-type: application/json")

SESSION=$(curl -sS https://api.anthropic.com/v1/sessions \
  "${H[@]}" -d "{\"agent\":\"$AGENT\",\"environment_id\":\"$ENV\",
  \"title\":\"$PROJECT\"}" | jq -r '.id')

curl -sS "https://api.anthropic.com/v1/sessions/$SESSION/events" \
  "${H[@]}" -d "{\"events\":[{\"type\":\"user.message\",
  \"content\":[{\"type\":\"text\",\"text\":\"$TASK\"}]}]}" > /dev/null

echo "Rodando: https://console.anthropic.com/sessions/$SESSION"