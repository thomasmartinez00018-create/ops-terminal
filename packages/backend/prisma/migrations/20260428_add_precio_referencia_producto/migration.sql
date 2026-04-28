-- Agrega precio_referencia a productos: precio estimado del producto
-- cuando no hay compras/movimientos registrados aún. Sirve como fallback
-- para cálculos de recetas y stock valorizado.
-- NULL por defecto — no rompe datos existentes.
ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "precio_referencia" DOUBLE PRECISION;
