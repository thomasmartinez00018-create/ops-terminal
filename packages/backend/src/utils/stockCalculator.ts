import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

// ============================================================================
// stockCalculator — Helpers de cálculo de stock
// ============================================================================
// IMPORTANTE: todas las funciones usan $queryRaw para delegar la agregación
// a PostgreSQL. La versión anterior usaba findMany + loop JS, lo que cargaba
// TODOS los movimientos en el heap de Node → OOM con volúmenes grandes.
//
// Con SQL UNION ALL + GROUP BY, Node recibe solo las filas sumadas
// (1 por producto ó 1 por producto+depósito), no el historial completo.
//
// Tipos de retorno de $queryRaw (PostgreSQL → Node.js):
//   integer / bigint → bigint en JS  → convertir con Number()
//   ROUND(…::numeric) → string en JS → convertir con parseFloat()
//   SUM(float8) → number en JS
// ============================================================================

/**
 * Calcula el stock teórico de un producto en un depósito específico.
 * Agrega en PostgreSQL — no carga filas individuales en Node.js.
 */
export async function calcularStockTeorico(productoId: number, depositoId: number): Promise<number> {
  const { organizacionId } = getTenant();

  const rows = await prisma.$queryRaw<Array<{ stock: string | null }>>`
    SELECT ROUND(SUM(sub.delta)::numeric, 4) AS stock
    FROM (
      -- Entradas → depósito destino
      SELECT cantidad AS delta
      FROM movimientos
      WHERE tipo IN ('ingreso', 'elaboracion', 'devolucion')
        AND deposito_destino_id = ${depositoId}
        AND producto_id        = ${productoId}
        AND organizacion_id    = ${organizacionId}
      UNION ALL
      -- Salidas → depósito origen
      SELECT -cantidad AS delta
      FROM movimientos
      WHERE tipo IN ('merma', 'consumo_interno', 'venta')
        AND deposito_origen_id = ${depositoId}
        AND producto_id        = ${productoId}
        AND organizacion_id    = ${organizacionId}
      UNION ALL
      -- Ajuste → depósito destino
      SELECT cantidad AS delta
      FROM movimientos
      WHERE tipo = 'ajuste'
        AND deposito_destino_id = ${depositoId}
        AND producto_id         = ${productoId}
        AND organizacion_id     = ${organizacionId}
      UNION ALL
      -- Transferencia: suma en destino
      SELECT cantidad AS delta
      FROM movimientos
      WHERE tipo = 'transferencia'
        AND deposito_destino_id = ${depositoId}
        AND producto_id         = ${productoId}
        AND organizacion_id     = ${organizacionId}
      UNION ALL
      -- Transferencia: resta en origen
      SELECT -cantidad AS delta
      FROM movimientos
      WHERE tipo = 'transferencia'
        AND deposito_origen_id = ${depositoId}
        AND producto_id        = ${productoId}
        AND organizacion_id    = ${organizacionId}
    ) sub
  `;

  const raw = rows[0]?.stock;
  const stock = raw ? parseFloat(raw) : 0;
  return Math.round((Number.isFinite(stock) ? stock : 0) * 100) / 100;
}

/**
 * Calcula el stock total por producto (global, todos los depósitos).
 * Retorna un Map<productoId, stockTotal>.
 * Agrega en PostgreSQL — no carga filas individuales en Node.js.
 */
export async function calcularStockPorProducto(): Promise<Map<number, number>> {
  const { organizacionId } = getTenant();

  const rows = await prisma.$queryRaw<Array<{
    producto_id: bigint;
    stock: string;
  }>>`
    SELECT
      sub.producto_id,
      ROUND(SUM(sub.delta)::numeric, 4) AS stock
    FROM (
      -- Entradas (suman al stock total del producto)
      SELECT producto_id, cantidad AS delta
      FROM movimientos
      WHERE tipo IN ('ingreso', 'elaboracion', 'devolucion')
        AND organizacion_id = ${organizacionId}
      UNION ALL
      -- Salidas (restan)
      SELECT producto_id, -cantidad AS delta
      FROM movimientos
      WHERE tipo IN ('merma', 'consumo_interno', 'venta')
        AND organizacion_id = ${organizacionId}
      UNION ALL
      -- Ajuste → depósito destino (correctivo positivo o negativo)
      SELECT producto_id, cantidad AS delta
      FROM movimientos
      WHERE tipo = 'ajuste'
        AND deposito_destino_id IS NOT NULL
        AND organizacion_id = ${organizacionId}
      -- Transferencia: neutral en el stock total global (solo cambia entre depósitos)
    ) sub
    GROUP BY sub.producto_id
  `;

  const stockMap = new Map<number, number>();
  for (const row of rows) {
    const stock = parseFloat(row.stock);
    if (Number.isFinite(stock)) {
      stockMap.set(Number(row.producto_id), stock);
    }
  }
  return stockMap;
}
