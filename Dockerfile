# BookAgent Intelligence Engine — Railway runtime image
#
# Alpine Node 20 com:
#   - poppler-utils (pdftoppm + pdftocairo) para Module 04 (PNG 300dpi + SVG)
#   - ffmpeg + python3 para rendering/encoding de vídeo
#   - libc6-compat para prebuilt binaries do sharp

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# ---

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg python3 poppler-utils libc6-compat

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p storage/assets storage/outputs storage/temp musics

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
