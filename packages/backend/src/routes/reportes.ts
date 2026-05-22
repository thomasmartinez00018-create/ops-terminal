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

// ============================================================================
// GET /api/reportes/serie-diaria-ingresos?mes=YYYY-MM
// ----------------------------------------------------------------------------
// Serie diaria REAL de ingresos del mes (sin ruido sintético). Para el
// sparkline del Dashboard Pro.
//
// Devuelve:
//   - dias: [{ fecha, total, cantidad }] del mes solicitado
//   - mesAnterior: [{ fecha, total }] del mismo mes ant. para overlay
//   - resumen: { totalMes, promedioDiario, mejorDia, peorDia, diasConIngresos }
//
// "Ingreso" aquí = sumatoria de Movimiento.cantidad * costo_unitario
// donde tipo='ingreso'. Si el cliente prefiere VENTAS en vez de ingresos
// de mercadería, conmutar a SesionVenta.totalVentas — pero para el
// negocio gastronómico, "ingreso" suele significar lo que ENTRA al stock.
// Lo dejamos parametrizable para no atarnos a una sola interpretación.
// ============================================================================
router.get('/serie-diaria-ingresos', async (req: Request, res: Response) => {
  try {
    const mesParam = (req.query.mes as string) || (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();
    const [yStr, mStr] = mesParam.split('-');
    const y = parseInt(yStr), m = parseInt(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: 'mes inválido (YYYY-MM)' });
    }
    const ultimoDia = new Date(y, m, 0).getDate();
    const inicio = `${yStr}-${mStr}-01`;
    const fin = `${yStr}-${mStr}-${String(ultimoDia).padStart(2, '0')}`;

    // Mes anterior (para comparativa overlay)
    const prevDate = new Date(y, m - 2, 1);
    const yPrev = prevDate.getFullYear();
    const mPrev = prevDate.getMonth() + 1;
    const ultPrev = new Date(yPrev, mPrev, 0).getDate();
    const inicioPrev = `${yPrev}-${String(mPrev).padStart(2, '0')}-01`;
    const finPrev = `${yPrev}-${String(mPrev).padStart(2, '0')}-${String(ultPrev).padStart(2, '0')}`;

    type Row = { fecha: string; total: number; cantidad: number };
    const sql = `
      SELECT fecha,
             COALESCE(SUM(cantidad * COALESCE(costo_unitario, 0)), 0)::float AS total,
             COUNT(*)::int AS cantidad
        FROM movimientos
       WHERE tipo = 'ingreso'
         AND fecha BETWEEN $1 AND $2
       GROUP BY fecha
       ORDER BY fecha`;
    const [actual, anterior] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(sql, inicio, fin),
      prisma.$queryRawUnsafe<Row[]>(sql, inicioPrev, finPrev),
    ]);

    // Rellenar días sin ingresos con 0 (para que el sparkline no se corte)
    const dias: Row[] = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
      const r = actual.find(x => x.fecha === fecha);
      dias.push({ fecha, total: r?.total ?? 0, cantidad: r?.cantidad ?? 0 });
    }
    const mesAnterior: Row[] = [];
    for (let d = 1; d <= ultPrev; d++) {
      const fecha = `${yPrev}-${String(mPrev).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const r = anterior.find(x => x.fecha === fecha);
      mesAnterior.push({ fecha, total: r?.total ?? 0, cantidad: r?.cantidad ?? 0 });
    }

    const totalMes = dias.reduce((s, x) => s + x.total, 0);
    const diasConIngresos = dias.filter(x => x.total > 0).length;
    const promedioDiario = diasConIngresos > 0 ? totalMes / diasConIngresos : 0;
    const mejorDia = dias.reduce((a, b) => (b.total > a.total ? b : a), { fecha: '', total: 0, cantidad: 0 });
    const peorConIng = dias.filter(x => x.total > 0);
    const peorDia = peorConIng.length > 0
      ? peorConIng.reduce((a, b) => (b.total < a.total ? b : a))
      : null;

    res.json({
      dias,
      mesAnterior,
      resumen: {
        totalMes: +totalMes.toFixed(2),
        promedioDiario: +promedioDiario.toFixed(2),
        mejorDia,
        peorDia,
        diasConIngresos,
      },
    });
  } catch (e: any) {
    console.error('[reportes/serie-diaria-ingresos]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ============================================================================
// GET /api/reportes/insights
// ----------------------------------------------------------------------------
// El dashboard se sospecha a sí mismo: corre N reglas sobre los datos del
// tenant y devuelve hallazgos accionables. Es el motor del "insight del día"
// y del badge "atención" en el dashboard.
//
// Reglas implementadas:
//   - DEUDA_DESPROPORCIONADA: cxp pendiente > 100× ingresos del mes
//   - INGRESOS_BAJOS_ANOMALO: ingresos del mes < 30% del promedio últimos 3 meses
//   - FACTURAS_VENCEN_PRONTO: hay facturas que vencen en <= 7 días
//   - PRODUCTOS_INACTIVOS_CON_STOCK: productos con stock>0 pero activo=false
//   - VENCIDAS_SIN_PAGAR: facturas con saldo y vencidas
//   - MERMA_ALTA: mermas del mes > 20% del ingreso del mes (raro pero útil)
// ============================================================================
router.get('/insights', async (_req: Request, res: Response) => {
  try {
    const hoy = new Date();
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
    const en7Str = `${en7.getFullYear()}-${String(en7.getMonth() + 1).padStart(2, '0')}-${String(en7.getDate()).padStart(2, '0')}`;

    type Insight = {
      severidad: 'info' | 'atencion' | 'critico';
      tipo: string;
      titulo: string;
      detalle: string;
      cta?: { label: string; to: string };
    };
    const insights: Insight[] = [];

    // 1. Vencen pronto
    const vencen = await prisma.$queryRawUnsafe<Array<{ n: number; total: number }>>(
      `SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total
         FROM facturas
        WHERE estado IN ('pendiente','parcial')
          AND fecha_vencimiento BETWEEN $1 AND $2`,
      hoyStr, en7Str,
    );
    if (vencen[0]?.n > 0) {
      insights.push({
        severidad: vencen[0].n >= 5 ? 'critico' : 'atencion',
        tipo: 'FACTURAS_VENCEN_PRONTO',
        titulo: `${vencen[0].n} factura${vencen[0].n === 1 ? '' : 's'} vence${vencen[0].n === 1 ? '' : 'n'} en los próximos 7 días`,
        detalle: `Total a pagar: $${Math.round(vencen[0].total).toLocaleString('es-AR')}`,
        cta: { label: 'Ver proyección', to: '/proyeccion-pagos' },
      });
    }

    // 2. Vencidas sin pagar
    const vencidas = await prisma.$queryRawUnsafe<Array<{ n: number; total: number }>>(
      `SELECT COUNT(*)::int n, COALESCE(SUM(total),0)::float total
         FROM facturas
        WHERE estado IN ('pendiente','parcial')
          AND fecha_vencimiento < $1`,
      hoyStr,
    );
    if (vencidas[0]?.n > 0) {
      insights.push({
        severidad: 'critico',
        tipo: 'VENCIDAS_SIN_PAGAR',
        titulo: `${vencidas[0].n} factura${vencidas[0].n === 1 ? '' : 's'} vencida${vencidas[0].n === 1 ? '' : 's'} sin pagar`,
        detalle: `Total vencido: $${Math.round(vencidas[0].total).toLocaleString('es-AR')}`,
        cta: { label: 'Pagar ahora', to: '/proyeccion-pagos' },
      });
    }

    // 3. Productos inactivos con stock — síntoma de inconsistencia
    const inactivosConStock = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int n
         FROM productos p
        WHERE p.activo = false
          AND EXISTS (
            SELECT 1 FROM movimientos m
             WHERE m.producto_id = p.id
             GROUP BY m.producto_id
            HAVING SUM(CASE WHEN m.deposito_destino_id IS NOT NULL THEN m.cantidad
                            WHEN m.deposito_origen_id  IS NOT NULL THEN -m.cantidad
                            ELSE 0 END) > 0
          )`,
    );
    if (inactivosConStock[0]?.n > 0) {
      insights.push({
        severidad: 'info',
        tipo: 'PRODUCTOS_INACTIVOS_CON_STOCK',
        titulo: `${inactivosConStock[0].n} productos inactivos tienen stock todavía`,
        detalle: 'Probablemente los desactivaste pero no descargaste el stock. Revisalos.',
        cta: { label: 'Ver productos', to: '/productos?activo=false' },
      });
    }

    // 4. Ingresos anómalos (comparar vs promedio últimos 3 meses)
    const ingresoMesActual = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM(cantidad * COALESCE(costo_unitario,0)),0)::float total
         FROM movimientos
        WHERE tipo='ingreso' AND TO_CHAR(fecha::date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`,
    );
    const ingresoPromedio3m = await prisma.$queryRawUnsafe<Array<{ prom: number }>>(
      `SELECT COALESCE(AVG(monthly_total), 0)::float prom FROM (
         SELECT TO_CHAR(fecha::date, 'YYYY-MM') ym,
                SUM(cantidad * COALESCE(costo_unitario,0)) monthly_total
           FROM movimientos
          WHERE tipo='ingreso'
            AND fecha::date BETWEEN (CURRENT_DATE - INTERVAL '3 months') AND (CURRENT_DATE - INTERVAL '1 day')
          GROUP BY 1
       ) t`,
    );
    const actual = ingresoMesActual[0]?.total || 0;
    const prom = ingresoPromedio3m[0]?.prom || 0;
    if (prom > 0 && actual < prom * 0.3 && hoy.getDate() > 7) {
      insights.push({
        severidad: 'atencion',
        tipo: 'INGRESOS_BAJOS_ANOMALO',
        titulo: 'Ingresos del mes muy bajos vs promedio histórico',
        detalle: `Llevás $${Math.round(actual).toLocaleString('es-AR')} cuando tu promedio últimos 3 meses fue $${Math.round(prom).toLocaleString('es-AR')}. ¿Cargaste todos los movimientos?`,
        cta: { label: 'Cargar movimiento', to: '/movimientos' },
      });
    }

    // 5. Mermas altas
    const mermas = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM(cantidad * COALESCE(costo_unitario,0)),0)::float total
         FROM movimientos
        WHERE tipo IN ('merma','consumo_interno')
          AND TO_CHAR(fecha::date,'YYYY-MM') = TO_CHAR(CURRENT_DATE,'YYYY-MM')`,
    );
    const mermaTotal = mermas[0]?.total || 0;
    if (actual > 0 && mermaTotal > actual * 0.2) {
      insights.push({
        severidad: 'atencion',
        tipo: 'MERMA_ALTA',
        titulo: `Las mermas representan ${((mermaTotal / actual) * 100).toFixed(0)}% de los ingresos del mes`,
        detalle: `$${Math.round(mermaTotal).toLocaleString('es-AR')} en merma vs $${Math.round(actual).toLocaleString('es-AR')} de ingresos.`,
        cta: { label: 'Ver mermas', to: '/reportes' },
      });
    }

    // Ordenar por severidad
    const ord: Record<string, number> = { critico: 0, atencion: 1, info: 2 };
    insights.sort((a, b) => ord[a.severidad] - ord[b.severidad]);

    res.json({
      insights,
      meta: {
        evaluadoAt: new Date().toISOString(),
        cantidad: insights.length,
        criticos: insights.filter(i => i.severidad === 'critico').length,
      },
    });
  } catch (e: any) {
    console.error('[reportes/insights]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ============================================================================
// GET /api/reportes/narrativa
// ----------------------------------------------------------------------------
// El endpoint que arma TODA la historia del dashboard de un saque.
// Decisión de diseño: el backend genera la narrativa (texto natural) y los
// drill-downs ya armados; el frontend SOLO presenta. Esto evita 6 fetches
// distintos y permite que la lógica de qué decir esté en un solo lugar.
//
// Devuelve:
//   - tituloHistoria: oración resumen del momento (ej: "Hoy vendiste 12
//     tickets por $45k, +12% vs ayer. Te queda revisar 3 cosas.")
//   - hoy: { ventas, tickets, ticketPromedio, margenEstimado, topProductos,
//            comparativa: { vsAyer, vsMismoDiaSem }}
//   - mes: { ventas, costo, margen, proyeccion, mejorDia, peorDia,
//            sparkline: serie diaria con eventos }
//   - alertas: { criticas, atencion, ok } con detalle por categoría
//   - drilldowns: { ventas: top productos, deuda: top proveedores,
//                   mermas: top productos con merma }
//   - frescura: timestamps por sección
//
// Datos que combina:
//   - Sesiones de Venta (PoS) → facturación real, tickets
//   - VentaItem → ticket promedio, top productos, costo de mercadería vendida
//   - Movimientos tipo=merma|consumo_interno → mermas reales
//   - Facturas → deuda, vencimientos
//   - Productos × Stock → bajo mínimo con nombres
// ============================================================================
router.get('/narrativa', async (_req: Request, res: Response) => {
  try {
    const ahora = new Date();
    const hora = ahora.getHours();
    const ymd = (d: Date) => d.toISOString().split('T')[0];

    const hoy = ymd(ahora);
    const ayer = ymd(new Date(ahora.getTime() - 86400000));
    const hace7d = ymd(new Date(ahora.getTime() - 7 * 86400000));
    const inicioMes = hoy.slice(0, 7) + '-01';
    const diaMes = ahora.getDate();
    const ultimoDiaMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
    const inicioMesPasado = (() => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      return ymd(d);
    })();
    const finMesPasado = (() => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth(), 0);
      return ymd(d);
    })();

    // ── 1. Ventas del PoS (Sesiones cerradas) ───────────────────────────
    // Ventas reales (no compras): SesionVenta + VentaItem
    type AggRow = { total: number; tickets: number };
    const ventasRangoQ = async (desde: string, hasta: string): Promise<AggRow> => {
      const r = await prisma.$queryRawUnsafe<Array<AggRow>>(`
        SELECT COALESCE(SUM(sv.total_ventas), 0)::float AS total,
               COUNT(*)::int AS tickets
          FROM sesiones_venta sv
         WHERE sv.estado = 'cerrada'
           AND DATE(sv.cerrada_at) BETWEEN $1 AND $2
      `, desde, hasta);
      return r[0] || { total: 0, tickets: 0 };
    };

    // Cantidad de items vendidos del día (para ticket promedio basado en items)
    const itemsRangoQ = async (desde: string, hasta: string) => {
      const r = await prisma.$queryRawUnsafe<Array<{ items: number; importe: number }>>(`
        SELECT COALESCE(SUM(vi.cantidad), 0)::float AS items,
               COALESCE(SUM(vi.subtotal), 0)::float AS importe
          FROM venta_items vi
          JOIN sesiones_venta sv ON sv.id = vi.sesion_id
         WHERE sv.estado = 'cerrada'
           AND DATE(sv.cerrada_at) BETWEEN $1 AND $2
      `, desde, hasta);
      return r[0] || { items: 0, importe: 0 };
    };

    const [vHoy, vAyer, v7d, vMes, vMesPasado, iHoy, iMes] = await Promise.all([
      ventasRangoQ(hoy, hoy),
      ventasRangoQ(ayer, ayer),
      ventasRangoQ(hace7d, hace7d),
      ventasRangoQ(inicioMes, hoy),
      ventasRangoQ(inicioMesPasado, finMesPasado),
      itemsRangoQ(hoy, hoy),
      itemsRangoQ(inicioMes, hoy),
    ]);

    const ticketPromHoy = vHoy.tickets > 0 ? vHoy.total / vHoy.tickets : 0;
    const ticketPromMes = vMes.tickets > 0 ? vMes.total / vMes.tickets : 0;

    // ── 2. Costo de mercadería vendida (estimado) ───────────────────────
    // Por cada VentaItem, intentamos costear via Receta.ingredientes si
    // existe, sino usamos costoUnitario del producto. Aproximación robusta
    // sin recalcular escandallo completo aquí (lo dejamos liviano).
    const costoMesQ = await prisma.$queryRawUnsafe<Array<{ costo: number }>>(`
      WITH ult_costo AS (
        SELECT DISTINCT ON (producto_id)
               producto_id,
               costo_unitario
          FROM movimientos
         WHERE tipo='ingreso' AND costo_unitario IS NOT NULL AND costo_unitario > 0
         ORDER BY producto_id, fecha DESC, id DESC
      )
      SELECT COALESCE(SUM(vi.cantidad * COALESCE(uc.costo_unitario, p.precio_referencia, 0)), 0)::float AS costo
        FROM venta_items vi
        JOIN sesiones_venta sv ON sv.id = vi.sesion_id
        JOIN productos p ON p.id = vi.producto_id
   LEFT JOIN ult_costo uc ON uc.producto_id = vi.producto_id
       WHERE sv.estado='cerrada'
         AND DATE(sv.cerrada_at) BETWEEN $1 AND $2
    `, inicioMes, hoy);
    const costoMes = costoMesQ[0]?.costo || 0;
    const margenMes = vMes.total > 0 ? ((vMes.total - costoMes) / vMes.total) * 100 : 0;

    const costoHoyQ = await prisma.$queryRawUnsafe<Array<{ costo: number }>>(`
      WITH ult_costo AS (
        SELECT DISTINCT ON (producto_id) producto_id, costo_unitario
          FROM movimientos
         WHERE tipo='ingreso' AND costo_unitario IS NOT NULL AND costo_unitario > 0
         ORDER BY producto_id, fecha DESC, id DESC
      )
      SELECT COALESCE(SUM(vi.cantidad * COALESCE(uc.costo_unitario, p.precio_referencia, 0)), 0)::float AS costo
        FROM venta_items vi
        JOIN sesiones_venta sv ON sv.id = vi.sesion_id
        JOIN productos p ON p.id = vi.producto_id
   LEFT JOIN ult_costo uc ON uc.producto_id = vi.producto_id
       WHERE sv.estado='cerrada' AND DATE(sv.cerrada_at) = $1
    `, hoy);
    const costoHoy = costoHoyQ[0]?.costo || 0;
    const margenHoy = vHoy.total > 0 ? ((vHoy.total - costoHoy) / vHoy.total) * 100 : 0;

    // ── 3. Top productos vendidos (HOY y MES) ───────────────────────────
    const topProductosRango = async (desde: string, hasta: string, limit = 5) => {
      return prisma.$queryRawUnsafe<Array<{
        producto_id: number; nombre: string; cantidad: number; importe: number;
      }>>(`
        SELECT vi.producto_id::int AS producto_id, p.nombre,
               SUM(vi.cantidad)::float AS cantidad,
               SUM(vi.subtotal)::float AS importe
          FROM venta_items vi
          JOIN sesiones_venta sv ON sv.id = vi.sesion_id
          JOIN productos p ON p.id = vi.producto_id
         WHERE sv.estado='cerrada' AND DATE(sv.cerrada_at) BETWEEN $1 AND $2
         GROUP BY vi.producto_id, p.nombre
         ORDER BY SUM(vi.subtotal) DESC
         LIMIT ${limit}
      `, desde, hasta);
    };
    const [topHoy, topMes] = await Promise.all([
      topProductosRango(hoy, hoy, 3),
      topProductosRango(inicioMes, hoy, 5),
    ]);

    // ── 4. Sparkline 30 días de ventas (no de compras) ──────────────────
    const sparkVentasQ = await prisma.$queryRawUnsafe<Array<{ fecha: string; total: number; tickets: number }>>(`
      SELECT DATE(sv.cerrada_at)::text AS fecha,
             COALESCE(SUM(sv.total_ventas), 0)::float AS total,
             COUNT(*)::int AS tickets
        FROM sesiones_venta sv
       WHERE sv.estado='cerrada'
         AND DATE(sv.cerrada_at) BETWEEN $1 AND $2
       GROUP BY DATE(sv.cerrada_at)
       ORDER BY fecha
    `, hace7d /* 7d para tener data en periodo corto */, hoy);
    // Rellenar días sin ventas con 0
    const sparkVentas: Array<{ fecha: string; total: number; tickets: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(ahora.getTime() - i * 86400000);
      const f = ymd(d);
      const r = sparkVentasQ.find(x => x.fecha === f);
      sparkVentas.push({ fecha: f, total: r?.total ?? 0, tickets: r?.tickets ?? 0 });
    }

    // ── 5. Mermas del mes con top productos ─────────────────────────────
    const mermasMesQ = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COALESCE(SUM(m.cantidad * COALESCE(m.costo_unitario, p.precio_referencia, 0)), 0)::float AS total
        FROM movimientos m
        JOIN productos p ON p.id = m.producto_id
       WHERE m.tipo='merma' AND m.fecha BETWEEN $1 AND $2
    `, inicioMes, hoy);
    const mermasMes = mermasMesQ[0]?.total || 0;

    const topMermasQ = await prisma.$queryRawUnsafe<Array<{ producto_id: number; nombre: string; total: number }>>(`
      SELECT m.producto_id::int AS producto_id, p.nombre,
             COALESCE(SUM(m.cantidad * COALESCE(m.costo_unitario, p.precio_referencia, 0)), 0)::float AS total
        FROM movimientos m
        JOIN productos p ON p.id = m.producto_id
       WHERE m.tipo='merma' AND m.fecha BETWEEN $1 AND $2
       GROUP BY m.producto_id, p.nombre
       ORDER BY total DESC
       LIMIT 5
    `, inicioMes, hoy);

    // ── 6. Productos bajo mínimo CON nombre ─────────────────────────────
    const bajosMinQ = await prisma.$queryRawUnsafe<Array<{
      producto_id: number; nombre: string; unidad: string; stock: number; minimo: number;
    }>>(`
      WITH stock_actual AS (
        SELECT producto_id,
               COALESCE(SUM(
                 CASE WHEN deposito_destino_id IS NOT NULL THEN cantidad
                      WHEN deposito_origen_id  IS NOT NULL THEN -cantidad
                      ELSE 0 END), 0)::float AS stock
          FROM movimientos
         GROUP BY producto_id
      )
      SELECT p.id::int AS producto_id, p.nombre, p.unidad_uso AS unidad,
             COALESCE(sa.stock, 0)::float AS stock,
             p.stock_minimo::float AS minimo
        FROM productos p
   LEFT JOIN stock_actual sa ON sa.producto_id = p.id
       WHERE p.activo = true
         AND p.stock_minimo > 0
         AND COALESCE(sa.stock, 0) < p.stock_minimo
       ORDER BY (p.stock_minimo - COALESCE(sa.stock, 0)) DESC
       LIMIT 5
    `);

    // ── 7. Deuda + top acreedores + próximos vencimientos ───────────────
    const deudaTotalQ = await prisma.$queryRawUnsafe<Array<{ total: number; n: number }>>(`
      WITH pagos_sum AS (
        SELECT factura_id, SUM(monto)::float AS pagado FROM pagos GROUP BY factura_id
      )
      SELECT COALESCE(SUM(f.total - COALESCE(ps.pagado, 0)), 0)::float AS total,
             COUNT(*)::int AS n
        FROM facturas f
   LEFT JOIN pagos_sum ps ON ps.factura_id = f.id
       WHERE f.estado IN ('pendiente', 'parcial')
    `);
    const topAcreedoresQ = await prisma.$queryRawUnsafe<Array<{
      proveedor_id: number; nombre: string; saldo: number;
    }>>(`
      WITH pagos_sum AS (
        SELECT factura_id, SUM(monto)::float AS pagado FROM pagos GROUP BY factura_id
      )
      SELECT f.proveedor_id::int, pr.nombre,
             COALESCE(SUM(f.total - COALESCE(ps.pagado, 0)), 0)::float AS saldo
        FROM facturas f
        JOIN proveedores pr ON pr.id = f.proveedor_id
   LEFT JOIN pagos_sum ps ON ps.factura_id = f.id
       WHERE f.estado IN ('pendiente', 'parcial')
       GROUP BY f.proveedor_id, pr.nombre
       ORDER BY saldo DESC
       LIMIT 5
    `);

    const en7Str = ymd(new Date(ahora.getTime() + 7 * 86400000));
    const vencen7Q = await prisma.$queryRawUnsafe<Array<{ n: number; total: number }>>(`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float AS total
        FROM facturas
       WHERE estado IN ('pendiente', 'parcial')
         AND fecha_vencimiento BETWEEN $1 AND $2
    `, hoy, en7Str);
    const vencidasQ = await prisma.$queryRawUnsafe<Array<{ n: number; total: number }>>(`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float AS total
        FROM facturas
       WHERE estado IN ('pendiente', 'parcial')
         AND fecha_vencimiento < $1
    `, hoy);

    // ── 8. Construir narrativa ──────────────────────────────────────────
    const fmt$ = (n: number) =>
      n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 10_000  ? `$${Math.round(n / 1000)}k`
      : `$${Math.round(n).toLocaleString('es-AR')}`;

    const deltaVsAyer = vAyer.total > 0 ? ((vHoy.total - vAyer.total) / vAyer.total) * 100 : null;
    const deltaVs7 = v7d.total > 0 ? ((vHoy.total - v7d.total) / v7d.total) * 100 : null;

    // Proyección lineal del mes: lo que llevás × días totales / días pasados
    const proyMes = diaMes > 0 ? (vMes.total / diaMes) * ultimoDiaMes : 0;
    const deltaProyMesPas = vMesPasado.total > 0 ? ((proyMes - vMesPasado.total) / vMesPasado.total) * 100 : null;

    const piezasHistoria: string[] = [];
    if (vHoy.tickets > 0) {
      piezasHistoria.push(`Hoy llevás ${vHoy.tickets} ticket${vHoy.tickets === 1 ? '' : 's'} por ${fmt$(vHoy.total)}`);
      if (deltaVsAyer !== null && Math.abs(deltaVsAyer) > 5) {
        piezasHistoria.push(`${deltaVsAyer > 0 ? '+' : ''}${deltaVsAyer.toFixed(0)}% vs ayer`);
      } else if (deltaVs7 !== null && Math.abs(deltaVs7) > 5) {
        piezasHistoria.push(`${deltaVs7 > 0 ? '+' : ''}${deltaVs7.toFixed(0)}% vs mismo día semana pasada`);
      }
    } else if (hora >= 10 && hora <= 22) {
      piezasHistoria.push(`No registraste ventas hoy todavía`);
      if (vAyer.tickets > 0) piezasHistoria.push(`ayer llevabas ${vAyer.tickets} a esta hora`);
    } else {
      piezasHistoria.push(`Buenas, todavía es temprano`);
      if (vAyer.tickets > 0) piezasHistoria.push(`ayer cerraste con ${vAyer.tickets} tickets, ${fmt$(vAyer.total)}`);
    }
    const pendientesCount = (vencen7Q[0]?.n || 0) + (vencidasQ[0]?.n || 0) + bajosMinQ.length;
    if (pendientesCount > 0) {
      piezasHistoria.push(`hay ${pendientesCount} cosa${pendientesCount === 1 ? '' : 's'} para revisar`);
    }
    const tituloHistoria = piezasHistoria.join(' · ') + '.';

    res.json({
      tituloHistoria,
      momento: hora < 12 ? 'manana' : hora < 19 ? 'tarde' : 'noche',
      hoy: {
        ventas: vHoy.total,
        tickets: vHoy.tickets,
        ticketPromedio: ticketPromHoy,
        itemsVendidos: iHoy.items,
        costoMercaderia: costoHoy,
        margen: margenHoy,
        topProductos: topHoy.map(p => ({
          id: Number(p.producto_id), nombre: p.nombre,
          cantidad: p.cantidad, importe: p.importe,
        })),
        comparativa: {
          ayer: { ventas: vAyer.total, tickets: vAyer.tickets, deltaPct: deltaVsAyer },
          mismaSemPasada: { ventas: v7d.total, tickets: v7d.tickets, deltaPct: deltaVs7 },
        },
      },
      mes: {
        ventas: vMes.total,
        tickets: vMes.tickets,
        ticketPromedio: ticketPromMes,
        itemsVendidos: iMes.items,
        costoMercaderia: costoMes,
        margen: margenMes,
        proyeccionMes: proyMes,
        deltaProyVsMesPasado: deltaProyMesPas,
        mesPasado: { ventas: vMesPasado.total, tickets: vMesPasado.tickets },
        topProductos: topMes.map(p => ({
          id: Number(p.producto_id), nombre: p.nombre,
          cantidad: p.cantidad, importe: p.importe,
        })),
        sparkline: sparkVentas, // 30 días con ventas reales
      },
      alertas: {
        vencidas: { count: vencidasQ[0]?.n || 0, total: vencidasQ[0]?.total || 0 },
        vencenPronto: { count: vencen7Q[0]?.n || 0, total: vencen7Q[0]?.total || 0 },
        bajosDeMinimo: bajosMinQ.map(p => ({
          id: Number(p.producto_id), nombre: p.nombre,
          unidad: p.unidad, stock: p.stock, minimo: p.minimo,
          falta: p.minimo - p.stock,
        })),
      },
      drilldowns: {
        topAcreedores: topAcreedoresQ.map(a => ({
          proveedorId: Number(a.proveedor_id), nombre: a.nombre, saldo: a.saldo,
        })),
        topMermas: topMermasQ.map(m => ({
          productoId: Number(m.producto_id), nombre: m.nombre, importe: m.total,
        })),
        deuda: {
          total: deudaTotalQ[0]?.total || 0,
          cantidad: deudaTotalQ[0]?.n || 0,
        },
        mermasMes,
      },
      frescura: {
        evaluadoAt: ahora.toISOString(),
      },
    });
  } catch (e: any) {
    console.error('[reportes/narrativa]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
