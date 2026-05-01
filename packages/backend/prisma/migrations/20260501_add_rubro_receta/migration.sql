-- AddColumn: rubro libre en recetas (Pescados, Carnes, Pastas, etc.)
ALTER TABLE "recetas" ADD COLUMN IF NOT EXISTS "rubro" TEXT;
