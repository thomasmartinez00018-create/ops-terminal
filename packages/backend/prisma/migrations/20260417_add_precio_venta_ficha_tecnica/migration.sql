-- ============================================================================
-- Receta: precio de venta + margen objetivo + ficha técnica
-- ============================================================================
-- Agrega campos opcionales a `recetas`:
--   - precio_venta: cuánto cobra el restaurante por porción al cliente.
--   - margen_objetivo: % de margen bruto considerado sano (default 70).
--   - metodo_preparacion / tiempo_preparacion / notas_chef / imagen_base64:
--     convierten la receta en una ficha técnica completa imprimible.
--
-- Todos nullable salvo margen_objetivo (que tiene default 70). La app
-- degrada a la vista actual si vienen en null — compat total con recetas
-- existentes.
--
-- Idempotente: IF NOT EXISTS permite re-correr sin error.
-- ============================================================================

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "precio_venta" DOUBLE PRECISION;

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "margen_objetivo" DOUBLE PRECISION DEFAULT 70;

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "metodo_preparacion" TEXT;

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "tiempo_preparacion" INTEGER;

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "notas_chef" TEXT;

ALTER TABLE "recetas"
  ADD COLUMN IF NOT EXISTS "imagen_base64" TEXT;
