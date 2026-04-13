-- Sector en recetas y elaboraciones
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "sector" TEXT;
ALTER TABLE "elaboracion_lotes" ADD COLUMN IF NOT EXISTS "sector" TEXT;

-- Porcionado: 1 producto elaborado → N sub-productos
CREATE TABLE IF NOT EXISTS "porcionados" (
    "id" SERIAL PRIMARY KEY,
    "organizacion_id" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "elaboracion_lote_id" INTEGER,
    "producto_origen_id" INTEGER NOT NULL,
    "cantidad_origen" DOUBLE PRECISION NOT NULL,
    "unidad_origen" TEXT NOT NULL,
    "deposito_origen_id" INTEGER,
    "merma" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "porcionados_organizacion_id_codigo_key" UNIQUE ("organizacion_id", "codigo"),
    CONSTRAINT "porcionados_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT,
    CONSTRAINT "porcionados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
    CONSTRAINT "porcionados_elaboracion_lote_id_fkey" FOREIGN KEY ("elaboracion_lote_id") REFERENCES "elaboracion_lotes"("id") ON DELETE SET NULL,
    CONSTRAINT "porcionados_producto_origen_id_fkey" FOREIGN KEY ("producto_origen_id") REFERENCES "productos"("id") ON DELETE RESTRICT,
    CONSTRAINT "porcionados_deposito_origen_id_fkey" FOREIGN KEY ("deposito_origen_id") REFERENCES "depositos"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "porcionados_organizacion_id_idx" ON "porcionados"("organizacion_id");

-- Items del porcionado (sub-productos resultantes)
CREATE TABLE IF NOT EXISTS "porcionado_items" (
    "id" SERIAL PRIMARY KEY,
    "porcionado_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "peso_unidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,
    "deposito_destino_id" INTEGER,
    CONSTRAINT "porcionado_items_porcionado_id_fkey" FOREIGN KEY ("porcionado_id") REFERENCES "porcionados"("id") ON DELETE CASCADE,
    CONSTRAINT "porcionado_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT,
    CONSTRAINT "porcionado_items_deposito_destino_id_fkey" FOREIGN KEY ("deposito_destino_id") REFERENCES "depositos"("id") ON DELETE SET NULL
);

-- Vínculo movimiento → porcionado
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "porcionado_id" INTEGER;
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_porcionado_id_fkey"
    FOREIGN KEY ("porcionado_id") REFERENCES "porcionados"("id") ON DELETE SET NULL;
