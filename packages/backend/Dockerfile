# ─── OPS Terminal Backend — Railway Dockerfile ───────────────────────────────
# Multi-stage para imagen final chica. Node 20 + OpenSSL 3 para Prisma.
# El monorepo usa workspaces, así que copiamos desde la raíz y buildeamos
# solo el backend.

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Copiar manifiestos del workspace
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/backend/prisma ./packages/backend/prisma/

# Instalar deps del workspace (incluye dev, necesarias para tsc)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm ci --include=dev

# Generar Prisma Client
RUN cd packages/backend && npx prisma generate

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/src ./packages/backend/src/

RUN cd packages/backend && npm run build

# ── Stage 3: runtime (imagen final) ──────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ops

# Copiar solo lo necesario para correr
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=deps  /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/backend/prisma ./packages/backend/prisma
COPY package.json ./

USER ops

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Healthcheck: Railway también pega a /api/health pero tener esto acá
# ayuda para debug local con docker run.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Entrypoint: correr migrate deploy ANTES de arrancar el server.
# - `prisma migrate deploy` es idempotente y seguro en CI/CD
# - Si la DB está vacía, aplica todas las migraciones en orden
# - Si ya está al día, no hace nada
# - Si hay migraciones pendientes, las aplica
# - Si una migración falla, exit code ≠ 0 → Railway retry
WORKDIR /app/packages/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
