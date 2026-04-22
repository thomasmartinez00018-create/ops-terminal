-- Categoría del movimiento cuando tipo='merma' o 'consumo_interno'.
-- Sin este campo, toda merma era un único balde que escondía robo hormiga
-- detrás de merma de preparación. Separando preparacion / vencimiento /
-- rotura / cortesia / staff_meal / sin_explicacion, el dueño ve el origen
-- real de la pérdida.
ALTER TABLE "movimientos" ADD COLUMN IF NOT EXISTS "categoria_merma" TEXT;
CREATE INDEX IF NOT EXISTS "movimientos_tipo_categoria_merma_idx" ON "movimientos" ("tipo", "categoria_merma");
