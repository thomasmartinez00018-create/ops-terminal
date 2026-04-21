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

# Copiar solo lo necesario para correr.
# npm workspaces hoistea TODO a /app/node_modules (no existe
# /app/packages/backend/node_modules — por eso no lo copiamos).
COPY --from=deps  /app/node_modules ./node_modules
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
# start-period ampliado a 60s para darle tiempo al retry loop de migrate.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Entrypoint: correr migrate deploy ANTES de arrancar el server.
# Usamos el binario de prisma directo (no npx) porque en monorepos con
# workspaces npx a veces descarga una copia fresca en vez de usar la
# hoisteada, lo que hace que tarde mucho o falle.
#
# Retry loop: Neon puede estar en "cold start" (autosuspendido) cuando el
# container arranca. El primer intento de conexión despierta el compute
# (~1-5 seg). Reintentamos hasta 8 veces con 5 seg de espera entre cada
# intento (total máx ~40 seg) antes de rendirnos. Esto evita que Railway
# marque el deploy como fallido por un cold start transitorio.
WORKDIR /app
CMD ["sh", "-c", "\
  PRISMA=/app/node_modules/prisma/build/index.js; \
  SCHEMA=/app/packages/backend/prisma/schema.prisma; \
  n=0; MAX=8; WAIT=5; \
  until node $PRISMA migrate deploy --schema=$SCHEMA; do \
    n=$((n+1)); \
    if [ $n -ge $MAX ]; then \
      echo \"[entrypoint] ERROR: migrate deploy falló $MAX veces. Verificá que Neon esté activo.\"; \
      exit 1; \
    fi; \
    echo \"[entrypoint] intento $n/$MAX falló (Neon cold start?) — reintentando en ${WAIT}s...\"; \
    sleep $WAIT; \
  done && \
  echo '[entrypoint] migraciones ok, arrancando server...' && \
  node /app/packages/backend/dist/server.js \
"]
