import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Tipos que suman stock a un depósito destino
const TIPOS_ENTRADA = ['ingreso', 'elaboracion', 'devolucion'];
// Tipos que restan stock de un depósito origen
const TIPOS_SALIDA = ['merma', 'consumo_interno'];

// Helper: calcular stock total por producto desde movimientos
async function calcularStockPorProducto(): Promise<Map<number, number>> {
  const movimientos = await prisma.movimiento.findMany({
    select: {
      tipo: true,
      productoId: true,
      depositoOrigenId: true,
      depositoDestinoId: true,
      cantidad: true
    }
  });

  const stockMap = new Map<number, number>();

  for (const mov of movimientos) {
    const { tipo, productoId, depositoOrigenId, depositoDestinoId, cantidad } = mov;

    if (tipo === 'transferencia') {
      // Transferencia no cambia stock total del producto, solo redistribuye
      // No afecta el total global por producto
    } else if (tipo === 'ajuste') {
      if (depositoDestinoId) {
        stockMap.set(productoId, (stockMap.get(productoId) || 0) + cantidad);
      }
    } else if (TIPOS_ENTRADA.includes(tipo)) {
      stockMap.set(productoId, (stockMap.get(productoId) || 0) + cantidad);
    } else if (TIPOS_SALIDA.includes(tipo)) {
      stockMap.set(productoId, (stockMap.get(productoId) || 0) - cantidad);
    }
  }

  return stockMap;
}

// GET /api/reportes/dashboard - KPIs principales
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const hoy = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const inicioMes = hoy.substring(0, 7) + '-01'; // YYYY-MM-01

    // Conteos básicos
    const [productosActivos, depositos, movimientosHoy, movimientosSemana, inventariosAbiertos] =
      await Promise.all([
        prisma.producto.count({ where: { activo: true } }),
        prisma.deposito.count({ where: { activo: true } }),
        prisma.movimiento.count({ where: { fecha: hoy } }),
        prisma.movimiento.count({ where: { fecha: { gte: hace7dias } } }),
        prisma.inventario.count({ where: { estado: 'abierto' } })
      ]);

    // Bajos de mínimo: calcular stock y comparar
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

    // Mermas del mes
    const mermasDelMes = await prisma.movimiento.aggregate({
      where: { tipo: 'merma', fecha: { gte: inicioMes } },
      _sum: { cantidad: true }
    });

    // Ingresos del mes
    const ingresosDelMes = await prisma.movimiento.aggregate({
      where: { tipo: 'ingreso', fecha: { gte: inicioMes } },
      _sum: { cantidad: true }
    });

    // Últimos 10 movimientos
    const ultimosMovimientos = await prisma.movimiento.findMany({
      include: {
        producto: { select: { codigo: true, nombre: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } }
      },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      take: 10
    });

    res.json({
      productosActivos,
      depositos,
      movimientosHoy,
      movimientosSemana,
      bajosDeMinimo,
      mermasDelMes: mermasDelMes._sum.cantidad || 0,
      ingresosDelMes: ingresosDelMes._sum.cantidad || 0,
      inventariosAbiertos,
      ultimosMovimientos
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
router.get('/mermas', async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta, depositoId } = req.query;
    const where: any = { tipo: 'merma' };

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }
    if (depositoId) {
      where.depositoOrigenId = parseInt(depositoId as string);
    }

    const detalle = await prisma.movimiento.findMany({
      where,
      include: {
        producto: { select: { codigo: true, nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }]
    });

    // Resumen
    const totalItems = detalle.length;
    let totalCantidad = 0;
    const porMotivo: Record<string, number> = {};

    for (const mov of detalle) {
      totalCantidad += mov.cantidad;
      const motivo = mov.motivo || 'Sin motivo';
      porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
    }

    res.json({
      detalle,
      resumen: {
        totalItems,
        totalCantidad: Math.round(totalCantidad * 100) / 100,
        porMotivo
      }
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
      select: { id: true, codigo: true, nombre: true, rubro: true, unidadUso: true }
    });

    // Obtener último costo unitario de cada producto (último ingreso)
    const ultimosIngresos = await prisma.movimiento.findMany({
      where: { tipo: 'ingreso' },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      select: { productoId: true, costoUnitario: true }
    });

    const costoMap = new Map<number, number>();
    for (const ing of ultimosIngresos) {
      if (!costoMap.has(ing.productoId) && ing.costoUnitario !== null) {
        costoMap.set(ing.productoId, ing.costoUnitario);
      }
    }

    let granTotal = 0;
    const resultado = [];

    for (const prod of productos) {
      const stockTotal = Math.round((stockMap.get(prod.id) || 0) * 100) / 100;
      const costoUnitario = costoMap.get(prod.id) || 0;
      const valorTotal = Math.round(stockTotal * costoUnitario * 100) / 100;
      granTotal += valorTotal;

      resultado.push({
        producto: prod,
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
router.get('/movimientos-por-producto/:productoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);
    const { fechaDesde, fechaHasta } = req.query;
    const where: any = { productoId };

    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }

    const movimientos = await prisma.movimiento.findMany({
      where,
      include: {
        producto: { select: { codigo: true, nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
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

export default router;
