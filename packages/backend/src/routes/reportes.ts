import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';
import { calcularStockPorProducto, calcularStockTeorico } from '../utils/stockCalculator';

const router = Router();

// GET /api/reportes/dashboard - KPIs principales + tendencias + actividad equipo
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const ayer = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hace14dias = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const inicioMes = hoy.substring(0, 7) + '-01'; // YYYY-MM-01
    // Mes anterior
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const inicioMesAnt = d.toISOString().split('T')[0].substring(0, 7) + '-01';
    const finMesAnt = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0];

    // Conteos básicos + comparativos
    const [
      productosActivos, depositos,
      movimientosHoy, movimientosAyer,
      movimientosSemana, movimientosSemanaAnt,
      inventariosAbiertos
    ] = await Promise.all([
      prisma.producto.count({ where: { activo: true } }),
      prisma.deposito.count({ where: { activo: true } }),
      prisma.movimiento.count({ where: { fecha: hoy } }),
      prisma.movimiento.count({ where: { fecha: ayer } }),
      prisma.movimiento.count({ where: { fecha: { gte: hace7dias } } }),
      prisma.movimiento.count({ where: { fecha: { gte: hace14dias, lt: hace7dias } } }),
      prisma.inventario.count({ where: { estado: 'abierto' } })
    ]);

    // Bajos de mínimo
    const stockMap = await calcularStockPorProducto();
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, stockMinimo: true }
    });

    let bajosDeMinimo = 0;
    for (const prod of productos) {
      const stock = stockMap.get(prod.id) || 0;
      if (stock < prod.stockMinimo) bajosDeMinimo++;
    }

    // Mermas + ingresos: mes actual y anterior
    const [mermasDelMes, mermasMesAnt, ingresosDelMes, ingresosMesAnt] = await Promise.all([
      prisma.movimiento.aggregate({ where: { tipo: 'merma', fecha: { gte: inicioMes } }, _sum: { cantidad: true } }),
      prisma.movimiento.aggregate({ where: { tipo: 'merma', fecha: { gte: inicioMesAnt, lte: finMesAnt } }, _sum: { cantidad: true } }),
      prisma.movimiento.aggregate({ where: { tipo: 'ingreso', fecha: { gte: inicioMes } }, _sum: { cantidad: true } }),
      prisma.movimiento.aggregate({ where: { tipo: 'ingreso', fecha: { gte: inicioMesAnt, lte: finMesAnt } }, _sum: { cantidad: true } }),
    ]);

    // Últimos 10 movimientos
    const ultimosMovimientos = await prisma.movimiento.findMany({
      include: {
        producto: { select: { codigo: true, nombre: true } },
        usuario: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } }
      },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      take: 10
    });

    // Actividad del equipo hoy: movimientos agrupados por usuario + tipo.
    // OOM-safe: groupBy agrega en PostgreSQL y devuelve 1 fila por (usuario, tipo)
    // — típicamente 20-40 filas por día, no miles como hacía el findMany.
    const actividadAgg = await prisma.movimiento.groupBy({
      by: ['usuarioId', 'tipo'],
      where: { fecha: hoy },
      _count: { id: true },
    });

    const usuarioIds = Array.from(new Set(actividadAgg.map(a => a.usuarioId)));
    const usuariosInfo = usuarioIds.length > 0
      ? await prisma.usuario.findMany({
          where: { id: { in: usuarioIds } },
          select: { id: true, nombre: true, rol: true },
        })
      : [];
    const usuarioById = new Map(usuariosInfo.map(u => [u.id, u]));

    const equipoMap = new Map<number, { id: number; nombre: string; rol: string; total: number; tipos: Record<string, number> }>();
    for (const agg of actividadAgg) {
      const uid = agg.usuarioId;
      const info = usuarioById.get(uid);
      if (!info) continue;
      if (!equipoMap.has(uid)) {
        equipoMap.set(uid, { id: uid, nombre: info.nombre, rol: info.rol, total: 0, tipos: {} });
      }
      const entry = equipoMap.get(uid)!;
      const count = agg._count.id;
      entry.total += count;
      entry.tipos[agg.tipo] = (entry.tipos[agg.tipo] || 0) + count;
    }
    const actividadEquipo = Array.from(equipoMap.values()).sort((a, b) => b.total - a.total);

    res.json({
      productosActivos,
      depositos,
      movimientosHoy,
      movimientosAyer,
      movimientosSemana,
      movimientosSemanaAnt,
      bajosDeMinimo,
      mermasDelMes: mermasDelMes._sum.cantidad || 0,
      mermasMesAnt: mermasMesAnt._sum.cantidad || 0,
      ingresosDelMes: ingresosDelMes._sum.cantidad || 0,
      ingresosMesAnt: ingresosMesAnt._sum.cantidad || 0,
      inventariosAbiertos,
      ultimosMovimientos,
      actividadEquipo
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// GET /api/reportes/movimientos-por-tipo
router.get('/movimientos-por-tipo', async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const where: any = {};

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }

    const movimientos = await prisma.movimiento.groupBy({
      by: ['tipo'],
      where,
      _count: { id: true },
      _sum: { cantidad: true }
    });

    const resultado = movimientos.map(m => ({
      tipo: m.tipo,
      cantidad: m._count.id,
      totalUnidades: m._sum.cantidad || 0
    }));

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener movimientos por tipo' });
  }
});

// GET /api/reportes/mermas
// OOM-safe: el resumen (totalItems, totalCantidad, porMotivo) se calcula
// siempre en PostgreSQL vía groupBy para no depender del detalle. El detalle
// se acota con `take` (default 500) — el cliente puede paginar o extender con
// ?limit. Antes cargaba TODO el histórico en el heap de Node.
router.get('/mermas', async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta, depositoId, limit } = req.query;
    const where: any = { tipo: 'merma' };

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }
    if (depositoId) {
      where.depositoOrigenId = parseInt(depositoId as string);
    }

    const takeN = Math.min(Math.max(parseInt(limit as string) || 500, 1), 2000);

    // Resumen agregado en DB — 1 fila por motivo.
    const [resumenAgg, detalle] = await Promise.all([
      prisma.movimiento.groupBy({
        by: ['motivo'],
        where,
        _count: { id: true },
        _sum: { cantidad: true },
      }),
      prisma.movimiento.findMany({
        where,
        include: {
          producto: { select: { codigo: true, nombre: true, unidadUso: true } },
          usuario: { select: { nombre: true } },
          depositoOrigen: { select: { nombre: true } },
          depositoDestino: { select: { nombre: true } },
          proveedor: { select: { nombre: true } }
        },
        orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
        take: takeN,
      }),
    ]);

    let totalItems = 0;
    let totalCantidad = 0;
    const porMotivo: Record<string, number> = {};
    for (const r of resumenAgg) {
      const motivo = r.motivo || 'Sin motivo';
      const count = r._count.id;
      totalItems += count;
      totalCantidad += Number(r._sum.cantidad) || 0;
      porMotivo[motivo] = (porMotivo[motivo] || 0) + count;
    }

    res.json({
      detalle,
      resumen: {
        totalItems,
        totalCantidad: Math.round(totalCantidad * 100) / 100,
        porMotivo,
      },
      detalleTruncated: detalle.length >= takeN,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener mermas' });
  }
});

// GET /api/reportes/stock-valorizado
router.get('/stock-valorizado', async (_req: Request, res: Response) => {
  try {
    const stockMap = await calcularStockPorProducto();

    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: {
        id: true, codigo: true, nombre: true, rubro: true, unidadUso: true,
        proveedorProductos: {
          select: { proveedor: { select: { id: true, nombre: true } } }
        }
      }
    });

    // Último costo unitario por producto — DISTINCT ON en lugar de findMany+loop
    // La versión anterior cargaba TODOS los ingresos ordenados en Node.js.
    // Con DISTINCT ON (producto_id) PostgreSQL devuelve solo 1 fila por producto.
    const { organizacionId } = getTenant();
    const ultimosCostos = await prisma.$queryRaw<Array<{
      producto_id: bigint;
      costo_unitario: number | null;
    }>>`
      SELECT DISTINCT ON (producto_id)
        producto_id,
        costo_unitario
      FROM movimientos
      WHERE tipo = 'ingreso'
        AND costo_unitario IS NOT NULL
        AND organizacion_id = ${organizacionId}
      ORDER BY producto_id, fecha DESC, hora DESC
    `;

    const costoMap = new Map<number, number>();
    for (const row of ultimosCostos) {
      if (row.costo_unitario !== null) {
        costoMap.set(Number(row.producto_id), Number(row.costo_unitario));
      }
    }

    let granTotal = 0;
    const resultado = [];

    for (const prod of productos) {
      const stockTotal = Math.round((stockMap.get(prod.id) || 0) * 100) / 100;
      const costoUnitario = costoMap.get(prod.id) || 0;
      const valorTotal = Math.round(stockTotal * costoUnitario * 100) / 100;
      granTotal += valorTotal;

      const proveedores = (prod.proveedorProductos || [])
        .map(pp => pp.proveedor)
        .filter((p): p is { id: number; nombre: string } => !!p);

      resultado.push({
        producto: {
          id: prod.id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          rubro: prod.rubro,
          unidadUso: prod.unidadUso,
        },
        rubro: prod.rubro,
        proveedores,
        stockTotal,
        costoUnitario,
        valorTotal
      });
    }

    res.json({
      items: resultado,
      granTotal: Math.round(granTotal * 100) / 100
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener stock valorizado' });
  }
});

// GET /api/reportes/movimientos-por-producto/:productoId
// OOM-safe: hard cap de 1000 movimientos. Un producto muy transaccionado
// puede tener miles de filas — cargarlas todas con 4 joins incluidos es un
// camino directo al OOM.
router.get('/movimientos-por-producto/:productoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);
    const { fechaDesde, fechaHasta, limit } = req.query;
    const where: any = { productoId };

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }

    const takeN = Math.min(Math.max(parseInt(limit as string) || 500, 1), 1000);

    const movimientos = await prisma.movimiento.findMany({
      where,
      include: {
        producto: { select: { codigo: true, nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
      take: takeN,
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }]
    });

    res.json(movimientos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener movimientos del producto' });
  }
});

// GET /api/reportes/comparar-periodos
router.get('/comparar-periodos', async (req: Request, res: Response) => {
  try {
    const { periodo1Desde, periodo1Hasta, periodo2Desde, periodo2Hasta } = req.query;

    if (!periodo1Desde || !periodo1Hasta || !periodo2Desde || !periodo2Hasta) {
      res.status(400).json({ error: 'Se requieren los 4 parámetros de período' });
      return;
    }

    const [periodo1, periodo2] = await Promise.all([
      prisma.movimiento.groupBy({
        by: ['tipo'],
        where: {
          fecha: {
            gte: periodo1Desde as string,
            lte: periodo1Hasta as string
          }
        },
        _count: { id: true }
      }),
      prisma.movimiento.groupBy({
        by: ['tipo'],
        where: {
          fecha: {
            gte: periodo2Desde as string,
            lte: periodo2Hasta as string
          }
        },
        _count: { id: true }
      })
    ]);

    res.json({
      periodo1: {
        desde: periodo1Desde,
        hasta: periodo1Hasta,
        movimientosPorTipo: periodo1.map(m => ({ tipo: m.tipo, cantidad: m._count.id }))
      },
      periodo2: {
        desde: periodo2Desde,
        hasta: periodo2Hasta,
        movimientosPorTipo: periodo2.map(m => ({ tipo: m.tipo, cantidad: m._count.id }))
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al comparar períodos' });
  }
});

// GET /api/reportes/discrepancias - Discrepancias por depósito
router.get('/discrepancias', async (_req: Request, res: Response) => {
  try {

    const depositos = await prisma.deposito.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, tipo: true }
    });

    const resultado = [];

    for (const dep of depositos) {
      // Último inventario cerrado de este depósito
      const ultimoInventario = await prisma.inventario.findFirst({
        where: { depositoId: dep.id, estado: 'cerrado' },
        orderBy: { createdAt: 'desc' },
        include: {
          usuario: { select: { nombre: true } },
          detalles: {
            include: {
              // id is required so "Ver movimientos" can query trazabilidad by product
              producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } }
            }
          }
        }
      });

      if (!ultimoInventario) {
        resultado.push({
          deposito: dep,
          estado: 'sin_inventario',
          color: 'gris',
          ultimoInventario: null,
          discrepancias: [],
          responsable: null
        });
        continue;
      }

      // Stock por producto en este depósito — agregado en PostgreSQL
      // (antes: findMany de TODOS los movimientos del depósito → potencial OOM)
      const depOrgId = getTenant().organizacionId;
      const depId = dep.id;
      const stockDepRows = await prisma.$queryRaw<Array<{
        producto_id: bigint;
        stock: string;
      }>>`
        SELECT sub.producto_id, ROUND(SUM(sub.delta)::numeric, 4) AS stock
        FROM (
          SELECT producto_id, cantidad AS delta
          FROM movimientos
          WHERE tipo IN ('ingreso', 'elaboracion', 'devolucion')
            AND deposito_destino_id = ${depId}
            AND organizacion_id = ${depOrgId}
          UNION ALL
          SELECT producto_id, -cantidad AS delta
          FROM movimientos
          WHERE tipo IN ('merma', 'consumo_interno', 'venta')
            AND deposito_origen_id = ${depId}
            AND organizacion_id = ${depOrgId}
          UNION ALL
          SELECT producto_id, cantidad AS delta
          FROM movimientos
          WHERE tipo = 'ajuste'
            AND deposito_destino_id = ${depId}
            AND organizacion_id = ${depOrgId}
          UNION ALL
          SELECT producto_id, cantidad AS delta
          FROM movimientos
          WHERE tipo = 'transferencia'
            AND deposito_destino_id = ${depId}
            AND organizacion_id = ${depOrgId}
          UNION ALL
          SELECT producto_id, -cantidad AS delta
          FROM movimientos
          WHERE tipo = 'transferencia'
            AND deposito_origen_id = ${depId}
            AND organizacion_id = ${depOrgId}
        ) sub
        GROUP BY sub.producto_id
      `;

      const stockDepMap = new Map<number, number>();
      for (const row of stockDepRows) {
        stockDepMap.set(Number(row.producto_id), parseFloat(row.stock));
      }

      const discrepancias = ultimoInventario.detalles
        .filter(d => d.diferencia && d.diferencia !== 0)
        .map(d => {
          const stockActual = Math.round((stockDepMap.get(d.productoId) || 0) * 100) / 100;
          return {
            producto: d.producto,
            cantidadFisica: d.cantidadFisica,
            stockTeorico: d.stockTeorico,
            diferencia: d.diferencia,
            stockActual,
            observacion: d.observacion
          };
        });

      let color: 'verde' | 'amarillo' | 'rojo' = 'verde';
      if (discrepancias.length > 0) {
        const hayGrandes = discrepancias.some(d => Math.abs(d.diferencia || 0) > 2);
        color = hayGrandes ? 'rojo' : 'amarillo';
      }

      resultado.push({
        deposito: dep,
        estado: discrepancias.length === 0 ? 'ok' : 'con_discrepancias',
        color,
        ultimoInventario: {
          id: ultimoInventario.id,
          fecha: ultimoInventario.fecha,
          usuario: ultimoInventario.usuario.nombre
        },
        discrepancias,
        responsable: ultimoInventario.usuario.nombre
      });
    }

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener discrepancias' });
  }
});

// GET /api/reportes/trazabilidad/:productoId/:depositoId - Timeline de movimientos
// OOM-safe: hard cap de 1000 filas. La trazabilidad muestra el historial
// ordenado desc — sin límite un (producto, depósito) muy activo satura el heap.
router.get('/trazabilidad/:productoId/:depositoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);
    const depositoId = parseInt(req.params.depositoId as string);
    const { limit } = req.query;
    const takeN = Math.min(Math.max(parseInt(limit as string) || 500, 1), 1000);

    const movimientos = await prisma.movimiento.findMany({
      where: {
        productoId,
        OR: [
          { depositoOrigenId: depositoId },
          { depositoDestinoId: depositoId }
        ]
      },
      include: {
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
      take: takeN,
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }]
    });

    const stockActual = await calcularStockTeorico(productoId, depositoId);

    res.json({ movimientos, stockActual });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener trazabilidad' });
  }
});

export default router;
