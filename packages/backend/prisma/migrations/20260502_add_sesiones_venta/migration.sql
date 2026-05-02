-- Productos: agregar campos de venta directa
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_venta" DOUBLE PRECISION;
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "vendible_directo" BOOLEAN NOT NULL DEFAULT false;

-- Sesiones de venta
CREATE TABLE IF NOT EXISTS "sesiones_venta" (
  "id"              SERIAL PRIMARY KEY,
  "organizacion_id" INTEGER NOT NULL DEFAULT 0,
  "deposito_id"     INTEGER NOT NULL,
  "operador_id"     INTEGER NOT NULL,
  "abierta_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cerrada_at"      TIMESTAMP(3),
  "estado"          TEXT NOT NULL DEFAULT 'abierta',
  "observaciones"   TEXT,
  "total_ventas"    DOUBLE PRECISION,
  "total_cobros"    DOUBLE PRECISION,
  CONSTRAINT "sesiones_venta_org_fkey"      FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "sesiones_venta_deposito_fkey" FOREIGN KEY ("deposito_id")     REFERENCES "depositos"("id")      ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "sesiones_venta_operador_fkey" FOREIGN KEY ("operador_id")     REFERENCES "usuarios"("id")       ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "sesiones_venta_organizacion_id_idx" ON "sesiones_venta"("organizacion_id");
CREATE INDEX IF NOT EXISTS "sesiones_venta_deposito_estado_idx" ON "sesiones_venta"("deposito_id","estado");
CREATE INDEX IF NOT EXISTS "sesiones_venta_operador_id_idx"     ON "sesiones_venta"("operador_id");

-- Items vendidos en una sesión
CREATE TABLE IF NOT EXISTS "venta_items" (
  "id"              SERIAL PRIMARY KEY,
  "sesion_id"       INTEGER NOT NULL,
  "producto_id"     INTEGER NOT NULL,
  "cantidad"        DOUBLE PRECISION NOT NULL,
  "precio_unitario" DOUBLE PRECISION NOT NULL,
  "subtotal"        DOUBLE PRECISION NOT NULL,
  "registrado_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cliente_uuid"    TEXT,
  CONSTRAINT "venta_items_sesion_fkey"   FOREIGN KEY ("sesion_id")   REFERENCES "sesiones_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "venta_items_producto_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id")      ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "venta_items_cliente_uuid_key" ON "venta_items"("cliente_uuid");
CREATE INDEX IF NOT EXISTS "venta_items_sesion_id_idx"   ON "venta_items"("sesion_id");
CREATE INDEX IF NOT EXISTS "venta_items_producto_id_idx" ON "venta_items"("producto_id");

-- Cobros de una sesión (puede haber múltiples medios)
CREATE TABLE IF NOT EXISTS "cobros" (
  "id"            SERIAL PRIMARY KEY,
  "sesion_id"     INTEGER NOT NULL,
  "medio"         TEXT NOT NULL,
  "monto"         DOUBLE PRECISION NOT NULL,
  "registrado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "observacion"   TEXT,
  CONSTRAINT "cobros_sesion_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesiones_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "cobros_sesion_id_idx" ON "cobros"("sesion_id");

-- Conteos de cierre (esperado vs real → diferencia/sobrante/faltante)
CREATE TABLE IF NOT EXISTS "conteos_cierre" (
  "sesion_id"   INTEGER NOT NULL,
  "producto_id" INTEGER NOT NULL,
  "esperado"    DOUBLE PRECISION NOT NULL,
  "real"        DOUBLE PRECISION NOT NULL,
  "diferencia"  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY ("sesion_id","producto_id"),
  CONSTRAINT "conteos_cierre_sesion_fkey"   FOREIGN KEY ("sesion_id")   REFERENCES "sesiones_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conteos_cierre_producto_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id")      ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "conteos_cierre_producto_id_idx" ON "conteos_cierre"("producto_id");
