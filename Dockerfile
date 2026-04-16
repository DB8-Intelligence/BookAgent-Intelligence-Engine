# ============================================================================
# BookAgent Intelligence Engine — Dockerfile (API Server)
# ============================================================================
# Multi-stage build: compile TypeScript → lightweight runtime with ffmpeg
# ============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
FROM node:20-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip poppler-utils libc6-compat \
    && mkdir -p /tmp/videos

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

# Video generation: Python modules + music files
COPY video/ ./video/
COPY musics/ ./musics/

# Storage directories (created at runtime by StorageManager)
RUN mkdir -p storage/assets storage/outputs storage/temp

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
