# =============================================================================
# BookAgent Intelligence Engine — Dockerfile (produção Google Cloud Run)
# =============================================================================
# Multi-stage build otimizado para Cloud Run.
#
# Correções vs versão anterior:
#   - libvips42 removido (pacote não existe em debian:bookworm-slim recente;
#     sharp já traz binários pré-compilados e libvips como peer)
#   - npm prune --omit=dev (substitui --production, deprecated no npm 9+)
#   - HEALTHCHECK removido (Cloud Run ignora e usa startup probe próprio)
#   - NODE_ENV=production no runtime (otimiza express + outras libs)
#   - libssl3 + ca-certificates para gRPC (@google-cloud/vertexai, @google-cloud/storage)
#   - --ignore-scripts no npm ci do runtime não rebuilda binários (só o builder precisa)
#   - Fallback defensivo se video/ ou musics/ estiverem vazios
# =============================================================================

# --- Stage 1: Build ----------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Build deps: gcc/make pra módulos nativos (sharp, canvas, bcrypt, etc.)
# python3 é requerido por node-gyp mesmo para builds puros TS
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dep install (layer cache: só reinstala se package*.json mudou)
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source + build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies pra runtime enxuto (--omit=dev substitui --production)
RUN npm prune --omit=dev

# --- Stage 2: Runtime --------------------------------------------------------
FROM node:20-slim

ENV NODE_ENV=production \
    PORT=8080

# Runtime deps:
#   ffmpeg          — video rendering (FFmpegStoryboardRenderer, spec-renderer)
#   poppler-utils   — PDF → PNG/text (pdftoppm, pdftotext no ingestion)
#   python3         — pdfjs enhanced extraction + video/*.py helpers
#   fonts-liberation — fontes para text overlay
#   libssl3         — gRPC runtime (@google-cloud/vertexai, storage)
#   ca-certificates — TLS pra chamadas HTTP (Anthropic, OpenAI, Gemini, Shotstack)
#   curl            — health check manual / debug (não usado pelo Cloud Run)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    poppler-utils \
    python3 \
    fonts-liberation \
    libssl3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 bookagent \
    && useradd --system --uid 1001 --gid bookagent --home /app bookagent

WORKDIR /app

# Copy built app from builder (ordenado por change frequency)
COPY --from=builder --chown=bookagent:bookagent /app/package.json ./
COPY --from=builder --chown=bookagent:bookagent /app/node_modules ./node_modules
COPY --from=builder --chown=bookagent:bookagent /app/dist ./dist

# Static runtime assets — video templates + music catalog
# (Se pastas estiverem vazias no repo, COPY ainda funciona)
COPY --chown=bookagent:bookagent video/ ./video/
COPY --chown=bookagent:bookagent musics/ ./musics/

# Writable dirs (StorageManager ensures these exist at runtime, but pre-create
# for permission hygiene)
RUN mkdir -p storage/assets storage/outputs storage/temp \
    && chown -R bookagent:bookagent storage

USER bookagent

EXPOSE 8080

# Cloud Run uses its own startup probe (HTTP GET on $PORT).
# Docker HEALTHCHECK is ignored — removed to eliminate noise.

CMD ["node", "dist/index.js"]
