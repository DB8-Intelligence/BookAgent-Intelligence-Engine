# ============================================================================
# BookAgent Intelligence Engine — Dockerfile (API Server)
# ============================================================================
# Multi-stage build: compile TypeScript → lightweight runtime with ffmpeg
# ============================================================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Runtime ---
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .

# Storage directories (created at runtime by StorageManager)
RUN mkdir -p storage/assets storage/outputs storage/temp

EXPOSE 3000

CMD ["node", "dist/index.js"]
