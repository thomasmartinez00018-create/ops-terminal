-- Extend proveedores with tax/discount fields
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "descuento_pct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "aplica_iva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "aplica_percepcion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "impuesto_interno" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proveedores" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;

-- Create listas_precio table
CREATE TABLE IF NOT EXISTS "listas_precio" (
    "id" SERIAL NOT NULL,
    "organizacion_id" INTEGER NOT NULL DEFAULT 0,
    "codigo" TEXT NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "archivo_origen" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_precio_pkey" PRIMARY KEY ("id")
);

-- Create lista_precio_items table
CREATE TABLE IF NOT EXISTS "lista_precio_items" (
    "id" SERIAL NOT NULL,
    "lista_precio_id" INTEGER NOT NULL,
    "producto_original" TEXT NOT NULL,
    "presentacion_original" TEXT,
    "tipo_compra" TEXT NOT NULL DEFAULT 'UNIDAD',
    "unidades_por_caja" INTEGER NOT NULL DEFAULT 1,
    "cantidad_por_unidad" DOUBLE PRECISION,
    "unidad_medida" TEXT,
    "precio_informado" DOUBLE PRECISION NOT NULL,
    "precio_por_unidad" DOUBLE PRECISION,
    "precio_por_medida_base" DOUBLE PRECISION,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "proveedor_producto_id" INTEGER,
    "estado_match" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lista_precio_items_pkey" PRIMARY KEY ("id")
);

-- Unique constraint and indexes
CREATE UNIQUE INDEX IF NOT EXISTS "listas_precio_organizacion_id_codigo_key" ON "listas_precio"("organizacion_id", "codigo");
CREATE INDEX IF NOT EXISTS "listas_precio_organizacion_id_idx" ON "listas_precio"("organizacion_id");

-- Foreign keys for listas_precio
ALTER TABLE "listas_precio" ADD CONSTRAINT "listas_precio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listas_precio" ADD CONSTRAINT "listas_precio_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys for lista_precio_items
ALTER TABLE "lista_precio_items" ADD CONSTRAINT "lista_precio_items_lista_precio_id_fkey" FOREIGN KEY ("lista_precio_id") REFERENCES "listas_precio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lista_precio_items" ADD CONSTRAINT "lista_precio_items_proveedor_producto_id_fkey" FOREIGN KEY ("proveedor_producto_id") REFERENCES "proveedor_productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
