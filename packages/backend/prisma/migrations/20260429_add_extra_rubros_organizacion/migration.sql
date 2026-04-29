-- Agrega extra_rubros a organizaciones: JSON array de rubros creados manualmente
-- por el usuario que aún no tienen productos asociados. Permite "anclar" rubros
-- antes de cargar insumos (ej: definir la estructura de rubros al arranque).
-- NULL por defecto — no rompe datos existentes.
ALTER TABLE "organizaciones" ADD COLUMN IF NOT EXISTS "extra_rubros" TEXT;
