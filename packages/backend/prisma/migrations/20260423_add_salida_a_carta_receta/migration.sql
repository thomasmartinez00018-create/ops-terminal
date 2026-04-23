-- Agrega flag `salida_a_carta` a recetas.
-- Default false para preservar semántica: las recetas existentes no se
-- asumen platos de carta hasta que el chef las marque explícitamente.
-- El cliente puede revisar en bulk desde la pestaña de recetas.

ALTER TABLE "recetas"
  ADD COLUMN "salida_a_carta" BOOLEAN NOT NULL DEFAULT false;
