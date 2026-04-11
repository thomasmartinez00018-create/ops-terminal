-- ============================================================================
-- Migration: Multi-tenant foundation
-- ----------------------------------------------------------------------------
-- Agrega:
--   1. Tablas nuevas: cuentas, organizaciones, miembros
--   2. Columna organizacion_id en 14 tablas existentes (con FK + índice)
--   3. Backfill: toda la data existente queda asignada a la org #1 ("Default")
--   4. Reemplazo de UNIQUE(codigo) por UNIQUE(organizacion_id, codigo)
--      en productos, depositos, usuarios, proveedores, recetas,
--      elaboracion_lotes, ordenes_compra, facturas
-- ============================================================================

-- ── 1. Tablas nuevas ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cuentas" (
  "id"               SERIAL PRIMARY KEY,
  "email"            TEXT NOT NULL,
  "password_hash"    TEXT NOT NULL,
  "nombre"           TEXT NOT NULL,
  "email_verificado" BOOLEAN NOT NULL DEFAULT false,
  "ultimo_login"     TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cuentas_email_key" ON "cuentas"("email");

CREATE TABLE IF NOT EXISTS "organizaciones" (
  "id"                      SERIAL PRIMARY KEY,
  "nombre"                  TEXT NOT NULL,
  "slug"                    TEXT NOT NULL,
  "plan"                    TEXT NOT NULL DEFAULT 'trial',
  "estado_suscripcion"      TEXT NOT NULL DEFAULT 'trialing',
  "trial_hasta"             TIMESTAMP(3),
  "stripe_customer_id"      TEXT,
  "stripe_subscription_id"  TEXT,
  "limite_usuarios"         INTEGER NOT NULL DEFAULT 999,
  "limite_productos"        INTEGER NOT NULL DEFAULT 99999,
  "limite_depositos"        INTEGER NOT NULL DEFAULT 99,
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizaciones_slug_key" ON "organizaciones"("slug");

CREATE TABLE IF NOT EXISTS "miembros" (
  "id"              SERIAL PRIMARY KEY,
  "cuenta_id"       INTEGER NOT NULL REFERENCES "cuentas"("id") ON DELETE CASCADE,
  "organizacion_id" INTEGER NOT NULL REFERENCES "organizaciones"("id") ON DELETE CASCADE,
  "rol"             TEXT NOT NULL DEFAULT 'owner',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "miembros_cuenta_id_organizacion_id_key"
  ON "miembros"("cuenta_id", "organizacion_id");

-- ── 2. Crear org "Default" con id=1 para el backfill ────────────────────────

INSERT INTO "organizaciones" ("id", "nombre", "slug", "plan", "estado_suscripcion", "trial_hasta", "created_at", "updated_at")
VALUES (
  1,
  'Más Orgánicos',
  'mas-organicos',
  'pro',
  'active',
  CURRENT_TIMESTAMP + INTERVAL '365 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Forzar que la secuencia arranque en 2 para próximas orgs
SELECT setval('organizaciones_id_seq', GREATEST((SELECT MAX(id) FROM organizaciones), 1));

-- ── 3. Agregar organizacion_id a tablas existentes ─────────────────────────
-- Uso: ADD COLUMN con DEFAULT 1 → backfill automático → DROP DEFAULT → SET NOT NULL

-- Helper macro (inline para cada tabla porque PostgreSQL no tiene macros reales)

-- productos
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "productos" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "productos" ADD CONSTRAINT "productos_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "productos_organizacion_id_idx" ON "productos"("organizacion_id");

-- depositos
ALTER TABLE "depositos" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "depositos" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "depositos" ADD CONSTRAINT "depositos_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "depositos_organizacion_id_idx" ON "depositos"("organizacion_id");

-- usuarios
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "usuarios" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "usuarios_organizacion_id_idx" ON "usuarios"("organizacion_id");

-- movimientos
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "movimientos" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "movimientos_organizacion_id_idx" ON "movimientos"("organizacion_id");
CREATE INDEX IF NOT EXISTS "movimientos_organizacion_id_fecha_idx" ON "movimientos"("organizacion_id", "fecha");

-- proveedores
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "proveedores" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "proveedores_organizacion_id_idx" ON "proveedores"("organizacion_id");

-- proveedor_productos
ALTER TABLE "proveedor_productos" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "proveedor_productos" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "proveedor_productos" ADD CONSTRAINT "proveedor_productos_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "proveedor_productos_organizacion_id_idx" ON "proveedor_productos"("organizacion_id");

-- recetas
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "recetas" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "recetas" ADD CONSTRAINT "recetas_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "recetas_organizacion_id_idx" ON "recetas"("organizacion_id");

-- elaboracion_lotes
ALTER TABLE "elaboracion_lotes" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "elaboracion_lotes" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "elaboracion_lotes" ADD CONSTRAINT "elaboracion_lotes_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "elaboracion_lotes_organizacion_id_idx" ON "elaboracion_lotes"("organizacion_id");

-- inventarios
ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inventarios" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "inventarios_organizacion_id_idx" ON "inventarios"("organizacion_id");

-- ordenes_compra
ALTER TABLE "ordenes_compra" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ordenes_compra" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "ordenes_compra_organizacion_id_idx" ON "ordenes_compra"("organizacion_id");

-- recepciones
ALTER TABLE "recepciones" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "recepciones" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "recepciones" ADD CONSTRAINT "recepciones_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "recepciones_organizacion_id_idx" ON "recepciones"("organizacion_id");

-- tareas
ALTER TABLE "tareas" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tareas" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "tareas" ADD CONSTRAINT "tareas_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "tareas_organizacion_id_idx" ON "tareas"("organizacion_id");

-- facturas
ALTER TABLE "facturas" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "facturas" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "facturas" ADD CONSTRAINT "facturas_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "facturas_organizacion_id_idx" ON "facturas"("organizacion_id");

-- pagos
ALTER TABLE "pagos" ADD COLUMN IF NOT EXISTS "organizacion_id" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "pagos" ALTER COLUMN "organizacion_id" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "pagos" ADD CONSTRAINT "pagos_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "pagos_organizacion_id_idx" ON "pagos"("organizacion_id");

-- ── 4. Reemplazar UNIQUE(codigo) por UNIQUE(organizacion_id, codigo) ────────
-- En las 8 tablas que tienen un "codigo" único.

-- productos
ALTER TABLE "productos" DROP CONSTRAINT IF EXISTS "productos_codigo_key";
DROP INDEX IF EXISTS "productos_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "productos_organizacion_id_codigo_key"
  ON "productos"("organizacion_id", "codigo");

-- depositos
ALTER TABLE "depositos" DROP CONSTRAINT IF EXISTS "depositos_codigo_key";
DROP INDEX IF EXISTS "depositos_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "depositos_organizacion_id_codigo_key"
  ON "depositos"("organizacion_id", "codigo");

-- usuarios
ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "usuarios_codigo_key";
DROP INDEX IF EXISTS "usuarios_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_organizacion_id_codigo_key"
  ON "usuarios"("organizacion_id", "codigo");

-- proveedores
ALTER TABLE "proveedores" DROP CONSTRAINT IF EXISTS "proveedores_codigo_key";
DROP INDEX IF EXISTS "proveedores_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "proveedores_organizacion_id_codigo_key"
  ON "proveedores"("organizacion_id", "codigo");

-- recetas
ALTER TABLE "recetas" DROP CONSTRAINT IF EXISTS "recetas_codigo_key";
DROP INDEX IF EXISTS "recetas_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "recetas_organizacion_id_codigo_key"
  ON "recetas"("organizacion_id", "codigo");

-- elaboracion_lotes
ALTER TABLE "elaboracion_lotes" DROP CONSTRAINT IF EXISTS "elaboracion_lotes_codigo_key";
DROP INDEX IF EXISTS "elaboracion_lotes_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "elaboracion_lotes_organizacion_id_codigo_key"
  ON "elaboracion_lotes"("organizacion_id", "codigo");

-- ordenes_compra
ALTER TABLE "ordenes_compra" DROP CONSTRAINT IF EXISTS "ordenes_compra_codigo_key";
DROP INDEX IF EXISTS "ordenes_compra_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ordenes_compra_organizacion_id_codigo_key"
  ON "ordenes_compra"("organizacion_id", "codigo");

-- facturas
ALTER TABLE "facturas" DROP CONSTRAINT IF EXISTS "facturas_codigo_key";
DROP INDEX IF EXISTS "facturas_codigo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "facturas_organizacion_id_codigo_key"
  ON "facturas"("organizacion_id", "codigo");
