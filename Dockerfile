# =============================================================================
# BookAgent Intelligence Engine — Dockerfile (Cloud Run unified)
# =============================================================================
# Multi-stage build que empacota backend Express + frontend Next.js num único
# container. Express roda na porta 8080 e serve o Next.js via custom server
# (ver src/index.ts → bootstrapNext).
#
# Stages:
#   1. web-builder — npm ci + next build em web/
#   2. api-builder — npm ci + tsc + prune dev deps em /
#   3. runtime     — copia artefatos, instala ffmpeg/poppler/python3, roda
#
# Sem Vercel. Sem worker separado. Sem Redis. Um processo, uma porta, um
# container.
# =============================================================================

# --- Stage 1: Frontend builder ----------------------------------------------
# Variáveis NEXT_PUBLIC_* são inlineadas no bundle em build-time pelo Next,
# então precisam chegar aqui como build args (cloudbuild.yaml passa via
# --build-arg). Em runtime, o middleware do Next lê process.env direto
# das env vars do Cloud Run — sem problema.
FROM node:20-slim AS web-builder

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NODE_ENV=production

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build

# --- Stage 2: API builder ---------------------------------------------------
FROM node:20-slim AS api-builder

WORKDIR /app

# Build deps pra módulos nativos (sharp, canvas, bcrypt).
# python3 requerido por node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies pra runtime enxuto
RUN npm prune --omit=dev

# --- Stage 3: Runtime -------------------------------------------------------
FROM node:20-slim

ENV NODE_ENV=production \
    PORT=8080

# Runtime deps:
#   ffmpeg          — video rendering (FFmpegStoryboardRenderer, spec-renderer)
#   poppler-utils   — PDF → PNG/text (pdftoppm, pdftotext)
#   python3         — pdfjs enhanced extraction + video/*.py helpers
#   fonts-liberation — fontes para text overlay
#   libssl3         — gRPC runtime (@google-cloud/vertexai, storage, tasks)
#   ca-certificates — TLS pra chamadas externas
#   curl            — debug / manual health check
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

# Backend runtime
COPY --from=api-builder --chown=bookagent:bookagent /app/package.json ./
COPY --from=api-builder --chown=bookagent:bookagent /app/node_modules ./node_modules
COPY --from=api-builder --chown=bookagent:bookagent /app/dist ./dist

# Frontend runtime — Next.js serve a partir de web/ via custom server
# (ver src/index.ts → bootstrapNext usa createRequire(web/package.json))
COPY --from=web-builder --chown=bookagent:bookagent /app/web/.next ./web/.next
COPY --from=web-builder --chown=bookagent:bookagent /app/web/public ./web/public
COPY --from=web-builder --chown=bookagent:bookagent /app/web/package.json ./web/package.json
COPY --from=web-builder --chown=bookagent:bookagent /app/web/next.config.js ./web/next.config.js
COPY --from=web-builder --chown=bookagent:bookagent /app/web/node_modules ./web/node_modules

# Static runtime assets — video templates + music catalog
COPY --chown=bookagent:bookagent video/ ./video/
COPY --chown=bookagent:bookagent musics/ ./musics/

# Writable dirs (StorageManager cria em runtime, mas pre-create pra permissão)
RUN mkdir -p storage/assets storage/outputs storage/temp \
    && chown -R bookagent:bookagent storage

USER bookagent

EXPOSE 8080

# Cloud Run usa startup probe próprio (HTTP GET em $PORT).
# Docker HEALTHCHECK é ignorado — sem ruído.

CMD ["node", "dist/index.js"]
