-- ============================================================================
-- ALERTAS DE PRECIO — detección automática de variaciones al cargar facturas
-- ============================================================================
-- Cada vez que se confirma una factura (escaneada o manual), el backend
-- compara cada item con el precio histórico (ProveedorProducto.ultimo_precio
-- y/o el último FacturaItem anterior del mismo producto × proveedor) y
-- genera una alerta si hay variación. Esta tabla persiste esas alertas para
-- que el usuario las revise y las apruebe o descarte.
-- ============================================================================
-- Migration idempotente: usa IF NOT EXISTS y DO blocks para los FKs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "alertas_precio" (
  "id"               SERIAL PRIMARY KEY,
  "organizacion_id"  INTEGER NOT NULL DEFAULT 0,
  "producto_id"      INTEGER NOT NULL,
  "proveedor_id"     INTEGER,
  "factura_id"       INTEGER,
  "factura_item_id"  INTEGER,
  "precio_anterior"  DOUBLE PRECISION NOT NULL,
  "precio_nuevo"     DOUBLE PRECISION NOT NULL,
  "variacion_pct"    DOUBLE PRECISION NOT NULL,
  "severidad"        TEXT NOT NULL DEFAULT 'leve',
  "direccion"        TEXT NOT NULL DEFAULT 'sube',
  "unidad"           TEXT,
  "fuente_anterior"  TEXT,
  "fecha_anterior"   TEXT,
  "estado"           TEXT NOT NULL DEFAULT 'pendiente',
  "revisado_por_id"  INTEGER,
  "fecha_revision"   TIMESTAMP(3),
  "observacion"      TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS "alertas_precio_organizacion_id_idx"
  ON "alertas_precio"("organizacion_id");

CREATE INDEX IF NOT EXISTS "alertas_precio_estado_idx"
  ON "alertas_precio"("estado");

CREATE INDEX IF NOT EXISTS "alertas_precio_producto_id_idx"
  ON "alertas_precio"("producto_id");

-- Foreign keys (idempotentes con DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_precio_organizacion_id_fkey'
  ) THEN
    ALTER TABLE "alertas_precio"
      ADD CONSTRAINT "alertas_precio_organizacion_id_fkey"
      FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_precio_producto_id_fkey'
  ) THEN
    ALTER TABLE "alertas_precio"
      ADD CONSTRAINT "alertas_precio_producto_id_fkey"
      FOREIGN KEY ("producto_id") REFERENCES "productos"("id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_precio_proveedor_id_fkey'
  ) THEN
    ALTER TABLE "alertas_precio"
      ADD CONSTRAINT "alertas_precio_proveedor_id_fkey"
      FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_precio_factura_id_fkey'
  ) THEN
    ALTER TABLE "alertas_precio"
      ADD CONSTRAINT "alertas_precio_factura_id_fkey"
      FOREIGN KEY ("factura_id") REFERENCES "facturas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alertas_precio_revisado_por_id_fkey'
  ) THEN
    ALTER TABLE "alertas_precio"
      ADD CONSTRAINT "alertas_precio_revisado_por_id_fkey"
      FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
