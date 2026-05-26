-- Password recovery columns on cuentas
ALTER TABLE "cuentas"
  ADD COLUMN IF NOT EXISTS "reset_token_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "reset_token_expires_at" TIMESTAMP(3);

-- Index para lookup por hash (login flow no lo usa, sólo reset)
CREATE INDEX IF NOT EXISTS "cuentas_reset_token_hash_idx" ON "cuentas"("reset_token_hash");
