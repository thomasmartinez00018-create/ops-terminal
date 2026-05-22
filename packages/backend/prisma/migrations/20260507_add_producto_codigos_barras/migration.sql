-- Multi-pack barcodes: 1 producto puede tener N códigos (botella, caja x6, etc.)
CREATE TABLE IF NOT EXISTS "producto_codigos_barras" (
  "id"              SERIAL PRIMARY KEY,
  "organizacion_id" INTEGER NOT NULL DEFAULT 0,
  "producto_id"     INTEGER NOT NULL,
  "codigo"          TEXT NOT NULL,
  "factor"          DOUBLE PRECISION NOT NULL DEFAULT 1,
  "descripcion"     TEXT,
  "activo"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "producto_codigos_barras_org_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "producto_codigos_barras_producto_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "producto_codigos_barras_org_codigo_key"
  ON "producto_codigos_barras"("organizacion_id", "codigo");
CREATE INDEX IF NOT EXISTS "producto_codigos_barras_producto_id_idx"
  ON "producto_codigos_barras"("producto_id");

-- Backfill: migrar los códigos de barras existentes (Producto.codigoBarras)
-- como primer registro de cada producto con factor=1 ("Unidad"). No
-- destructivo: el campo Producto.codigoBarras se mantiene como compat.
-- Solo migramos los que no estén vacíos y evitamos duplicados.
INSERT INTO "producto_codigos_barras" ("organizacion_id", "producto_id", "codigo", "factor", "descripcion", "activo")
SELECT p."organizacion_id", p."id", p."codigo_barras", 1, 'Unidad', true
  FROM "productos" p
 WHERE p."codigo_barras" IS NOT NULL
   AND TRIM(p."codigo_barras") <> ''
ON CONFLICT ("organizacion_id", "codigo") DO NOTHING;
