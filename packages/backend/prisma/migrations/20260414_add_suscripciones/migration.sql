-- ============================================================================
-- Suscripciones (Mercado Pago) + campos fiscales para ARCA
-- ============================================================================
-- Agrega dos tablas (suscripciones, pagos_suscripcion) y 4 columnas fiscales
-- opcionales en organizaciones. Idempotente: todos los ADD son "IF NOT EXISTS"
-- para no romper si la DB ya tiene alguna parte aplicada a mano.
-- ============================================================================

-- ── Campos fiscales en organizaciones (ARCA WSFEv1 futuro) ──────────────────
ALTER TABLE "organizaciones" ADD COLUMN IF NOT EXISTS "razon_social"     TEXT;
ALTER TABLE "organizaciones" ADD COLUMN IF NOT EXISTS "cuit"             TEXT;
ALTER TABLE "organizaciones" ADD COLUMN IF NOT EXISTS "condicion_iva"    TEXT;
ALTER TABLE "organizaciones" ADD COLUMN IF NOT EXISTS "domicilio_fiscal" TEXT;

-- ── Tabla suscripciones (1:1 con organizaciones) ────────────────────────────
CREATE TABLE IF NOT EXISTS "suscripciones" (
    "id"                       SERIAL NOT NULL,
    "organizacion_id"          INTEGER NOT NULL,
    "proveedor"                TEXT NOT NULL DEFAULT 'mercadopago',
    "plan"                     TEXT NOT NULL,
    "estado"                   TEXT NOT NULL,
    "precio_mensual"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moneda"                   TEXT NOT NULL DEFAULT 'ARS',
    "frecuencia"               TEXT NOT NULL DEFAULT 'mensual',

    "mp_preapproval_plan_id"   TEXT,
    "mp_preapproval_id"        TEXT,
    "mp_payer_id"              TEXT,
    "mp_payer_email"           TEXT,
    "mp_init_point"            TEXT,

    "trial_inicio"             TIMESTAMP(3),
    "trial_fin"                TIMESTAMP(3),
    "periodo_actual_inicio"    TIMESTAMP(3),
    "periodo_actual_fin"       TIMESTAMP(3),
    "proximo_cobro_en"         TIMESTAMP(3),
    "cancelada_en"             TIMESTAMP(3),
    "motivo_cancelacion"       TEXT,

    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suscripciones_organizacion_id_key"
    ON "suscripciones"("organizacion_id");

CREATE INDEX IF NOT EXISTS "suscripciones_mp_preapproval_id_idx"
    ON "suscripciones"("mp_preapproval_id");

-- FK a organizaciones (on delete cascade)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'suscripciones_organizacion_id_fkey'
    ) THEN
        ALTER TABLE "suscripciones"
            ADD CONSTRAINT "suscripciones_organizacion_id_fkey"
            FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Tabla pagos_suscripcion (historial de cobros) ───────────────────────────
CREATE TABLE IF NOT EXISTS "pagos_suscripcion" (
    "id"              SERIAL NOT NULL,
    "suscripcion_id"  INTEGER NOT NULL,
    "mp_payment_id"   TEXT,
    "monto"           DOUBLE PRECISION NOT NULL,
    "moneda"          TEXT NOT NULL DEFAULT 'ARS',
    "estado"          TEXT NOT NULL,
    "metodo_pago"     TEXT,
    "ultimos_4"       TEXT,
    "marca"           TEXT,
    "referencia"      TEXT,
    "fecha_pago"      TIMESTAMP(3),
    "periodo_desde"   TIMESTAMP(3),
    "periodo_hasta"   TIMESTAMP(3),

    "facturado"       BOOLEAN NOT NULL DEFAULT false,
    "cae"             TEXT,
    "cae_vence"       TIMESTAMP(3),
    "factura_numero"  TEXT,
    "factura_pdf_url" TEXT,

    "rawPayload"      TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_suscripcion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pagos_suscripcion_mp_payment_id_key"
    ON "pagos_suscripcion"("mp_payment_id");

CREATE INDEX IF NOT EXISTS "pagos_suscripcion_suscripcion_id_idx"
    ON "pagos_suscripcion"("suscripcion_id");

-- FK a suscripciones (on delete cascade)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pagos_suscripcion_suscripcion_id_fkey'
    ) THEN
        ALTER TABLE "pagos_suscripcion"
            ADD CONSTRAINT "pagos_suscripcion_suscripcion_id_fkey"
            FOREIGN KEY ("suscripcion_id") REFERENCES "suscripciones"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
