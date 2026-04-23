# =============================================================================
# BookAgent Intelligence Engine — Dockerfile
# =============================================================================
# Multi-stage build otimizado para Google Cloud Run.
#
# Target: Cloud Run / GKE (ou qualquer container orchestrator)
#
# Features:
#   - Multi-stage: build em node:20 completo, runtime em node:20-slim
#   - ffmpeg + poppler-utils + python3 (dependências do pipeline)
#   - Usuário não-root (security best practice do Cloud Run)
#   - Honra a env var PORT (convenção Cloud Run, default 3000)
#   - HEALTHCHECK em /health
#   - Layer cache otimizada (package.json antes do código)
# =============================================================================

# --- Stage 1: Build ----------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Install build deps (sharp, canvas, etc. precisam de gcc/python)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Dep install first for layer caching
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies for leaner runtime
RUN npm prune --production --no-audit --no-fund

# --- Stage 2: Runtime --------------------------------------------------------
FROM node:20-slim

# Runtime deps for the pipeline:
#   ffmpeg       — video rendering fallback + audio processing
#   poppler-utils — PDF rendering (pdftoppm, pdftotext)
#   python3      — pdfjs enhanced extraction (optional)
#   fonts-liberation — fallback fonts for PDF text rendering
#   libvips42 (sharp runtime) — image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    poppler-utils \
    python3 \
    fonts-liberation \
    libvips42 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system bookagent --gid 1001 \
    && useradd --system --uid 1001 --gid bookagent bookagent

WORKDIR /app

# Copy built app from builder stage
COPY --from=builder --chown=bookagent:bookagent /app/dist ./dist
COPY --from=builder --chown=bookagent:bookagent /app/node_modules ./node_modules
COPY --from=builder --chown=bookagent:bookagent /app/package.json ./

# Static assets required at runtime (music catalog, video templates)
COPY --chown=bookagent:bookagent video/ ./video/
COPY --chown=bookagent:bookagent musics/ ./musics/

# Writable runtime directories (asset extraction, temp files)
RUN mkdir -p storage/assets storage/outputs storage/temp \
    && chown -R bookagent:bookagent storage

# Drop privileges for runtime
USER bookagent

# Cloud Run sets PORT env var (default 8080) and expects the server to honor it.
# Our server already reads from process.env.PORT (src/config/index.ts).
ENV PORT=8080
EXPOSE 8080

# Healthcheck — used by orchestrator for zero-downtime restarts
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD curl -fs http://localhost:${PORT}/health || exit 1

# For Cloud Run, the container must listen on $PORT (not hardcoded)
CMD ["node", "dist/index.js"]
