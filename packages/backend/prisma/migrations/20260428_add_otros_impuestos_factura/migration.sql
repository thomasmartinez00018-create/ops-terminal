-- Agrega campo otros_impuestos a facturas para capturar Impuesto Interno,
-- percepciones de IIBB, y cualquier otro gravamen adicional al IVA que
-- aparece en facturas de proveedores argentinos (ej: Quilmes/Pepsi).
-- DEFAULT 0 — sin impacto sobre datos existentes.
ALTER TABLE "facturas" ADD COLUMN IF NOT EXISTS "otros_impuestos" DOUBLE PRECISION NOT NULL DEFAULT 0;
