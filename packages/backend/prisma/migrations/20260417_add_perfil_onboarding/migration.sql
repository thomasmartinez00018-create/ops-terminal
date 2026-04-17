-- ============================================================================
-- Perfil de onboarding por workspace
-- ============================================================================
-- Agrega una columna JSON (TEXT stringificado) a `organizaciones` para
-- guardar las respuestas del wizard post-signup: tamaño del equipo, dolor
-- principal del negocio y frecuencia de uso esperada. Alimenta el contexto
-- del asistente IA y las recomendaciones personalizadas del Dashboard.
--
-- Idempotente: IF NOT EXISTS permite re-correr la migración sin error.
-- ============================================================================

ALTER TABLE "organizaciones"
  ADD COLUMN IF NOT EXISTS "perfil_onboarding" TEXT;
