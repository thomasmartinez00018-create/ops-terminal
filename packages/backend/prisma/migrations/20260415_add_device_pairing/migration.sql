-- ============================================================================
-- Device Pairing Codes — vinculación de dispositivos sin compartir credenciales
-- ============================================================================
-- Permite que el admin genere un código de 6 dígitos en su dispositivo ya
-- autenticado, y que un empleado lo ingrese en su propio dispositivo para
-- quedar bindeado a la organización sin conocer el email/password del dueño.
--
-- El código canjeado emite un token stage 2 (org) — el empleado aún debe
-- hacer login staff con su código+PIN propio para operar.
--
-- Idempotente: CREATE ... IF NOT EXISTS en todos los statements.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "device_pairing_codes" (
    "id"                    SERIAL NOT NULL,
    "codigo"                TEXT NOT NULL,
    "organizacion_id"       INTEGER NOT NULL,
    "creado_por_cuenta_id"  INTEGER NOT NULL,
    "usado"                 BOOLEAN NOT NULL DEFAULT false,
    "expira_en"             TIMESTAMP(3) NOT NULL,
    "usado_en"              TIMESTAMP(3),
    "usado_desde_ip"        TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pairing_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_pairing_codes_codigo_key"
    ON "device_pairing_codes"("codigo");

CREATE INDEX IF NOT EXISTS "device_pairing_codes_organizacion_id_idx"
    ON "device_pairing_codes"("organizacion_id");

-- FK a organizaciones (cascade): si se elimina la org, se limpian los códigos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'device_pairing_codes_organizacion_id_fkey'
    ) THEN
        ALTER TABLE "device_pairing_codes"
            ADD CONSTRAINT "device_pairing_codes_organizacion_id_fkey"
            FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- FK a cuentas (set null si se elimina la cuenta creadora, pero conservamos el registro)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'device_pairing_codes_creado_por_cuenta_id_fkey'
    ) THEN
        ALTER TABLE "device_pairing_codes"
            ADD CONSTRAINT "device_pairing_codes_creado_por_cuenta_id_fkey"
            FOREIGN KEY ("creado_por_cuenta_id") REFERENCES "cuentas"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
