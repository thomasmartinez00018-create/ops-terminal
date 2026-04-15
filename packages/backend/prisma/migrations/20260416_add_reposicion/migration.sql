-- ============================================================================
-- Reposición encadenada (staged replenishment)
-- ============================================================================
-- Agrega soporte para:
--   1. Jerarquía de depósitos (depositoPadreId) — chain Garage → Gamuza → Barra
--      o cualquier cadena de N niveles, no hardcoded.
--   2. Parámetros de reposición por producto × depósito (stock_parametros):
--      mínimo, objetivo y punto de reposición específicos. Si no existe fila,
--      se usa como fallback Producto.stock_minimo / Producto.stock_ideal.
--   3. Órdenes de reposición internas (ordenes_reposicion + items): el motor
--      las SUGIERE cuando un depósito baja del punto de reposición. Un humano
--      las confirma y ajusta; al ejecutar se crea un Movimiento de
--      transferencia por cada item. Stock sigue calculándose on-demand desde
--      la tabla movimientos — no hay stock persistido.
--
-- Idempotente: todos los CREATE con IF NOT EXISTS; columnas y FKs bajo
-- guards DO $$ IF NOT EXISTS. Re-correr la migración es no-op.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Jerarquía en depósitos
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'depositos' AND column_name = 'deposito_padre_id'
    ) THEN
        ALTER TABLE "depositos" ADD COLUMN "deposito_padre_id" INTEGER;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "depositos_deposito_padre_id_idx"
    ON "depositos"("deposito_padre_id");

-- Self-FK: si se elimina el padre, el hijo queda huérfano (set null, no cascade
-- — borrar un depósito padre no debería eliminar los depósitos hijos).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'depositos_deposito_padre_id_fkey'
    ) THEN
        ALTER TABLE "depositos"
            ADD CONSTRAINT "depositos_deposito_padre_id_fkey"
            FOREIGN KEY ("deposito_padre_id") REFERENCES "depositos"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Parámetros de reposición (producto × depósito)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "stock_parametros" (
    "id"                SERIAL NOT NULL,
    "organizacion_id"   INTEGER NOT NULL DEFAULT 0,
    "producto_id"       INTEGER NOT NULL,
    "deposito_id"       INTEGER NOT NULL,
    "stock_minimo"      DOUBLE PRECISION,
    "stock_objetivo"    DOUBLE PRECISION,
    "punto_reposicion"  DOUBLE PRECISION,
    "activo"            BOOLEAN NOT NULL DEFAULT true,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_parametros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_parametros_org_producto_deposito_key"
    ON "stock_parametros"("organizacion_id", "producto_id", "deposito_id");

CREATE INDEX IF NOT EXISTS "stock_parametros_organizacion_id_idx"
    ON "stock_parametros"("organizacion_id");

CREATE INDEX IF NOT EXISTS "stock_parametros_deposito_id_idx"
    ON "stock_parametros"("deposito_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_parametros_organizacion_id_fkey'
    ) THEN
        ALTER TABLE "stock_parametros"
            ADD CONSTRAINT "stock_parametros_organizacion_id_fkey"
            FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_parametros_producto_id_fkey'
    ) THEN
        ALTER TABLE "stock_parametros"
            ADD CONSTRAINT "stock_parametros_producto_id_fkey"
            FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_parametros_deposito_id_fkey'
    ) THEN
        ALTER TABLE "stock_parametros"
            ADD CONSTRAINT "stock_parametros_deposito_id_fkey"
            FOREIGN KEY ("deposito_id") REFERENCES "depositos"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Órdenes de reposición internas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ordenes_reposicion" (
    "id"                    SERIAL NOT NULL,
    "organizacion_id"       INTEGER NOT NULL DEFAULT 0,
    "codigo"                TEXT NOT NULL,
    "fecha"                 TEXT NOT NULL,
    "estado"                TEXT NOT NULL DEFAULT 'sugerida',
    "deposito_origen_id"    INTEGER NOT NULL,
    "deposito_destino_id"   INTEGER NOT NULL,
    "motivo"                TEXT,
    "creado_por_id"         INTEGER NOT NULL,
    "asignado_a_id"         INTEGER,
    "ejecutado_por_id"      INTEGER,
    "fecha_ejecucion"       TEXT,
    "observacion"           TEXT,
    "generado_auto"         BOOLEAN NOT NULL DEFAULT false,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_reposicion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ordenes_reposicion_org_codigo_key"
    ON "ordenes_reposicion"("organizacion_id", "codigo");

CREATE INDEX IF NOT EXISTS "ordenes_reposicion_organizacion_id_idx"
    ON "ordenes_reposicion"("organizacion_id");

CREATE INDEX IF NOT EXISTS "ordenes_reposicion_org_estado_idx"
    ON "ordenes_reposicion"("organizacion_id", "estado");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_organizacion_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_organizacion_id_fkey"
            FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_deposito_origen_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_deposito_origen_id_fkey"
            FOREIGN KEY ("deposito_origen_id") REFERENCES "depositos"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_deposito_destino_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_deposito_destino_id_fkey"
            FOREIGN KEY ("deposito_destino_id") REFERENCES "depositos"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_creado_por_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_creado_por_id_fkey"
            FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_asignado_a_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_asignado_a_id_fkey"
            FOREIGN KEY ("asignado_a_id") REFERENCES "usuarios"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_reposicion_ejecutado_por_id_fkey'
    ) THEN
        ALTER TABLE "ordenes_reposicion"
            ADD CONSTRAINT "ordenes_reposicion_ejecutado_por_id_fkey"
            FOREIGN KEY ("ejecutado_por_id") REFERENCES "usuarios"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Items de órdenes de reposición
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "orden_reposicion_items" (
    "id"                        SERIAL NOT NULL,
    "orden_reposicion_id"       INTEGER NOT NULL,
    "producto_id"               INTEGER NOT NULL,
    "cantidad_sugerida"         DOUBLE PRECISION NOT NULL,
    "cantidad_confirmada"       DOUBLE PRECISION,
    "unidad"                    TEXT NOT NULL,
    "stock_origen_snapshot"     DOUBLE PRECISION,
    "stock_destino_snapshot"    DOUBLE PRECISION,
    "observacion"               TEXT,

    CONSTRAINT "orden_reposicion_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "orden_reposicion_items_orden_idx"
    ON "orden_reposicion_items"("orden_reposicion_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orden_reposicion_items_orden_id_fkey'
    ) THEN
        ALTER TABLE "orden_reposicion_items"
            ADD CONSTRAINT "orden_reposicion_items_orden_id_fkey"
            FOREIGN KEY ("orden_reposicion_id") REFERENCES "ordenes_reposicion"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orden_reposicion_items_producto_id_fkey'
    ) THEN
        ALTER TABLE "orden_reposicion_items"
            ADD CONSTRAINT "orden_reposicion_items_producto_id_fkey"
            FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
