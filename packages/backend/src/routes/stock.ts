import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

const router = Router();

// GET /api/stock — Stock actual por producto y depósito
//
// ─── OPTIMIZACIÓN ANTI-OOM ───────────────────────────────────────────────────
// Versión anterior: cargaba TODOS los movimientos en Node.js y calculaba el
// stock allí con un loop JS. Con miles de movimientos, el heap de Node (768MB
// en Railway) explotaba → "FATAL ERROR: Reached heap limit" → Killed.
//
// Versión actual: la agregación se delega a PostgreSQL con UNION ALL + GROUP BY.
// Node.js recibe solo las filas ya sumadas (1 por producto+depósito con stock ≠ 0),
// no el historial completo. Mismo resultado, fracción de la memoria.
//
// Tipos de retorno de $queryRaw con PostgreSQL:
//   - IDs (integer / bigint) → bigint en JS → convertir con Number()
//   - ROUND(…::numeric, N)  → string en JS → convertir con parseFloat()
router.get('/', async (req: Request, res: Response) => {
  try {
    const { depositoId, rubro, soloConStock, bajosDeMinimo } = req.query;
    const { organizacionId } = getTenant();

    // ── Paso 1: stock agregado en DB ─────────────────────────────────────────
    const stockRows = await prisma.$queryRaw<Array<{
      producto_id: bigint;
      deposito_id: bigint;
      stock: string; // ROUND devuelve numeric → Prisma lo serializa como string
    }>>`
      SELECT
        sub.producto_id,
        sub.deposito_id,
        ROUND(SUM(sub.delta)::numeric, 4) AS stock
      FROM (
        -- Entradas → depósito destino
        SELECT producto_id, deposito_destino_id AS deposito_id, cantidad AS delta
        FROM movimientos
        WHERE tipo IN ('ingreso', 'elaboracion', 'devolucion')
          AND deposito_destino_id IS NOT NULL
          AND organizacion_id = ${organizacionId}
        UNION ALL
        -- Salidas → depósito origen (resta)
        SELECT producto_id, deposito_origen_id AS deposito_id, -cantidad AS delta
        FROM movimientos
        WHERE tipo IN ('merma', 'consumo_interno', 'venta')
          AND deposito_origen_id IS NOT NULL
          AND organizacion_id = ${organizacionId}
        UNION ALL
        -- Ajuste → depósito destino (puede ser correctivo positivo o negativo)
        SELECT producto_id, deposito_destino_id AS deposito_id, cantidad AS delta
        FROM movimientos
        WHERE tipo = 'ajuste'
          AND deposito_destino_id IS NOT NULL
          AND organizacion_id = ${organizacionId}
        UNION ALL
        -- Transferencia: suma en destino
        SELECT producto_id, deposito_destino_id AS deposito_id, cantidad AS delta
        FROM movimientos
        WHERE tipo = 'transferencia'
          AND deposito_destino_id IS NOT NULL
          AND organizacion_id = ${organizacionId}
        UNION ALL
        -- Transferencia: resta en origen
        SELECT producto_id, deposito_origen_id AS deposito_id, -cantidad AS delta
        FROM movimientos
        WHERE tipo = 'transferencia'
          AND deposito_origen_id IS NOT NULL
          AND organizacion_id = ${organizacionId}
      ) sub
      GROUP BY sub.producto_id, sub.deposito_id
    `;

    // Mapa en memoria: solo las filas sumadas (mucho menos que el historial completo)
    const stockMap = new Map<string, number>();
    for (const row of stockRows) {
      stockMap.set(
        `${Number(row.producto_id)}-${Number(row.deposito_id)}`,
        parseFloat(row.stock)
      );
    }

    // ── Paso 2: info de productos y depósitos ─────────────────────────────────
    const productosWhere: any = { activo: true };
    if (rubro) productosWhere.rubro = rubro;

    const productos = await prisma.producto.findMany({
      where: productosWhere,
      select: {
        id: true, codigo: true, nombre: true, rubro: true,
        tipo: true, unidadUso: true, stockMinimo: true, stockIdeal: true
      }
    });

    const depositos = await prisma.deposito.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true }
    });

    // ── Paso 3: armar resultado ───────────────────────────────────────────────
    const resultado = [];
    for (const prod of productos) {
      let stockTotal = 0;
      const porDeposito = [];

      for (const dep of depositos) {
        const key = `${prod.id}-${dep.id}`;
        const cant = stockMap.get(key) || 0;
        if (cant !== 0 || !soloConStock) {
          porDeposito.push({
            depositoId: dep.id,
            depositoCodigo: dep.codigo,
            depositoNombre: dep.nombre,
            cantidad: Math.round(cant * 100) / 100
          });
        }
        stockTotal += cant;
      }

      stockTotal = Math.round(stockTotal * 100) / 100;

      if (soloConStock === 'true' && stockTotal === 0) continue;
      if (depositoId) {
        const depStock = porDeposito.find(d => d.depositoId === parseInt(depositoId as string));
        if (!depStock || depStock.cantidad === 0) continue;
      }
      if (bajosDeMinimo === 'true' && stockTotal >= prod.stockMinimo) continue;

      resultado.push({
        productoId: prod.id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        rubro: prod.rubro,
        tipo: prod.tipo,
        unidad: prod.unidadUso,
        stockTotal,
        stockMinimo: prod.stockMinimo,
        stockIdeal: prod.stockIdeal,
        bajoMinimo: stockTotal < prod.stockMinimo,
        porDeposito: depositoId
          ? porDeposito.filter(d => d.depositoId === parseInt(depositoId as string))
          : porDeposito.filter(d => d.cantidad !== 0)
      });
    }

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al calcular stock' });
  }
});

export default router;
