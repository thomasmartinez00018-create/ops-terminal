-- Añade el código original extraído de la lista del proveedor (columna
-- CODIGO/SKU/ART del XLSX). Se usa para auto-match por código:
-- si el código que viene en la lista coincide con Producto.codigo
-- interno (ej: MAX-344) o con ProveedorProducto.codigoProveedor de
-- una carga anterior, matcheamos automáticamente sin preguntarle al
-- usuario ni a la IA.
ALTER TABLE "lista_precio_items" ADD COLUMN IF NOT EXISTS "codigo_original" TEXT;
CREATE INDEX IF NOT EXISTS "lista_precio_items_codigo_original_idx" ON "lista_precio_items" ("codigo_original");
