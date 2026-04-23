import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

const router = Router();

// GET /api/movimientos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tipo, productoId, depositoId, fechaDesde, fechaHasta, limit } = req.query;
    const where: any = {};

    if (tipo) where.tipo = tipo;
    if (productoId) where.productoId = parseInt(productoId as string);
    if (depositoId) {
      where.OR = [
        { depositoOrigenId: parseInt(depositoId as string) },
        { depositoDestinoId: parseInt(depositoId as string) }
      ];
    }
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde;
      if (fechaHasta) where.fecha.lte = fechaHasta;
    }

    const movimientos = await prisma.movimiento.findMany({
      where,
      include: {
        usuario: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        producto: { select: { codigo: true, nombre: true, unidadUso: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      take: limit ? parseInt(limit as string) : 100
    });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

// POST /api/movimientos
router.post('/', async (req: Request, res: Response) => {
  try {
    const { tipo, productoId, cantidad, usuarioId } = req.body;
    const tiposValidos = ['ingreso', 'venta', 'elaboracion', 'merma', 'transferencia', 'ajuste', 'conteo', 'consumo_interno', 'devolucion'];

    if (!tipo || !tiposValidos.includes(tipo)) {
      res.status(400).json({ error: 'Tipo de movimiento inválido' });
      return;
    }
    if (!productoId || isNaN(Number(productoId))) {
      res.status(400).json({ error: 'Producto es requerido' });
      return;
    }
    if (!cantidad || !Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0) {
      res.status(400).json({ error: 'Cantidad debe ser un número mayor a 0' });
      return;
    }
    if (!usuarioId || !Number.isFinite(Number(usuarioId))) {
      res.status(400).json({ error: 'Usuario es requerido' });
      return;
    }

    // Helper: convierte string → número o null. Evita que un input malicioso
    // ("abc") se inserte como NaN en la DB (lo que después hace imposible
    // sumar o reportar ese movimiento).
    const toNumOrNull = (v: any): number | null => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const movimiento = await prisma.movimiento.create({
      data: {
        tipo: req.body.tipo,
        productoId: Number(req.body.productoId),
        cantidad: Number(req.body.cantidad),
        unidad: req.body.unidad || 'unidad',
        usuarioId: Number(req.body.usuarioId),
        fecha: req.body.fecha,
        hora: req.body.hora,
        depositoOrigenId: toNumOrNull(req.body.depositoOrigenId),
        depositoDestinoId: toNumOrNull(req.body.depositoDestinoId),
        lote: req.body.lote || null,
        motivo: req.body.motivo || null,
        // Categoría de merma — solo se persiste cuando el tipo es merma o
        // consumo_interno. Valores válidos: preparacion, vencimiento, rotura,
        // cortesia, staff_meal, sin_explicacion. Cualquier otro valor se
        // ignora para no ensuciar los reportes.
        categoriaMerma: ['merma', 'consumo_interno'].includes(req.body.tipo) &&
          ['preparacion', 'vencimiento', 'rotura', 'cortesia', 'staff_meal', 'sin_explicacion'].includes(String(req.body.categoriaMerma))
          ? req.body.categoriaMerma
          : null,
        costoUnitario: toNumOrNull(req.body.costoUnitario),
        proveedorId: toNumOrNull(req.body.proveedorId),
        documentoRef: req.body.documentoRef || null,
        observacion: req.body.observacion || null,
        responsableId: toNumOrNull(req.body.responsableId),
        recepcionId: toNumOrNull(req.body.recepcionId),
      },
      include: {
        usuario: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        producto: { select: { codigo: true, nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } }
      }
    });

    // Auto-crear tarea cuando hay responsable delegado
    if (req.body.responsableId && req.body.responsableId !== req.body.usuarioId) {
      const tipoLabel: Record<string, string> = {
        ingreso: 'Ingreso', transferencia: 'Transferencia', merma: 'Merma',
        elaboracion: 'Elaboracion', ajuste: 'Ajuste', consumo_interno: 'Consumo interno',
        devolucion: 'Devolucion', conteo: 'Conteo', venta: 'Venta',
      };
      const destino = movimiento.depositoDestino?.nombre || movimiento.depositoOrigen?.nombre || '';
      await prisma.tarea.create({
        data: {
          titulo: `${tipoLabel[req.body.tipo] || req.body.tipo}: ${movimiento.producto.nombre}`,
          descripcion: `${movimiento.cantidad} ${movimiento.unidad} — ${destino}. Registrado por ${movimiento.usuario.nombre}.`,
          tipo: req.body.tipo === 'ingreso' ? 'recibir_mercaderia' : 'general',
          prioridad: 'normal',
          fecha: req.body.fecha || new Date().toISOString().split('T')[0],
          asignadoAId: Number(req.body.responsableId),
          creadoPorId: Number(req.body.usuarioId),
        }
      });
    }

    res.status(201).json(movimiento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear movimiento' });
  }
});

// POST /api/movimientos/batch — Crear múltiples movimientos del mismo tipo a la vez
// Útil para transferencias o ingresos de varios productos simultáneamente
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { tipo, items, usuarioId, fecha, hora, depositoOrigenId, depositoDestinoId, observacion } = req.body;
    const tiposValidos = ['ingreso', 'venta', 'merma', 'transferencia', 'ajuste', 'consumo_interno', 'devolucion'];

    if (!tipo || !tiposValidos.includes(tipo)) {
      res.status(400).json({ error: 'Tipo de movimiento inválido' });
      return;
    }
    if (!items?.length) {
      res.status(400).json({ error: 'Se requiere al menos un item' });
      return;
    }
    if (!usuarioId) {
      res.status(400).json({ error: 'Usuario es requerido' });
      return;
    }

    const fechaFinal = fecha || new Date().toISOString().split('T')[0];
    const horaFinal = hora || new Date().toTimeString().slice(0, 5);

    const movimientos = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of items) {
        if (!item.productoId || !item.cantidad || Number(item.cantidad) <= 0) continue;
        const mov = await tx.movimiento.create({
          data: {
            tipo,
            productoId: Number(item.productoId),
            cantidad: Number(item.cantidad),
            unidad: item.unidad || 'unidad',
            usuarioId: Number(usuarioId),
            fecha: fechaFinal,
            hora: horaFinal,
            depositoOrigenId: item.depositoOrigenId ? Number(item.depositoOrigenId) : (depositoOrigenId ? Number(depositoOrigenId) : null),
            depositoDestinoId: item.depositoDestinoId ? Number(item.depositoDestinoId) : (depositoDestinoId ? Number(depositoDestinoId) : null),
            lote: item.lote || null,
            motivo: item.motivo || null,
            categoriaMerma: ['merma', 'consumo_interno'].includes(tipo) &&
              ['preparacion', 'vencimiento', 'rotura', 'cortesia', 'staff_meal', 'sin_explicacion'].includes(String(item.categoriaMerma))
              ? item.categoriaMerma
              : null,
            costoUnitario: item.costoUnitario ? Number(item.costoUnitario) : null,
            observacion: observacion || null,
          },
          include: {
            producto: { select: { codigo: true, nombre: true } },
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
          }
        });
        created.push(mov);
      }
      return created;
    });

    res.status(201).json({ ok: true, count: movimientos.length, movimientos });
  } catch (error: any) {
    console.error('[movimientos/batch]', error);
    res.status(500).json({ error: error.message || 'Error al crear movimientos batch' });
  }
});

// GET /api/movimientos/tipos - Tipos de movimiento disponibles
router.get('/tipos', (_req: Request, res: Response) => {
  res.json([
    { value: 'ingreso', label: 'Ingreso / Compra' },
    { value: 'venta', label: 'Venta' },
    { value: 'elaboracion', label: 'Elaboración' },
    { value: 'merma', label: 'Merma' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'ajuste', label: 'Ajuste' },
    { value: 'conteo', label: 'Conteo / Inventario' },
    { value: 'consumo_interno', label: 'Consumo interno' },
    { value: 'devolucion', label: 'Devolución' }
  ]);
});

// GET /api/movimientos/motivos/:tipo - Motivos por tipo
router.get('/motivos/:tipo', (req: Request, res: Response) => {
  const motivos: Record<string, string[]> = {
    merma: ['Vencimiento', 'Rotura', 'Deterioro', 'Error de elaboración', 'Derrame', 'Otro'],
    ajuste: ['Diferencia de inventario', 'Corrección de carga', 'Error de sistema', 'Otro'],
    consumo_interno: ['Comida de personal', 'Degustación', 'Cortesía', 'Otro'],
    devolucion: ['Producto en mal estado', 'Error de pedido', 'Otro'],
    venta: ['Venta al público', 'Venta mayorista', 'Delivery', 'Catering', 'Venta a empleado', 'Otro'],
  };
  res.json(motivos[req.params.tipo as string] || []);
});

// GET /api/movimientos/mermas-por-categoria - Reporte de mermas agrupadas por
// categoría. Es el endpoint clave para el dashboard anti-robo-hormiga: el
// dueño ve cuánto de su merma es "esperada" (preparación) vs cuánto es
// "oscura" (sin_explicacion, cortesía sin control, rotura sospechosa).
//
// Devuelve por categoría:
//   - cantidad de movimientos
//   - sumatoria de cantidades
//   - valorización aproximada (cant × costoUnitario)
// Filtros opcionales:
//   - desde, hasta: YYYY-MM-DD
router.get('/mermas-por-categoria', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = req.query;
    const { organizacionId } = getTenant();

    // ── Agregación en DB — anti-OOM ───────────────────────────────────────────
    // Versión anterior: findMany cargaba todas las filas de merma en Node.js y
    // calculaba la valorización en JS. Con muchos movimientos, agotaba el heap.
    // Versión actual: $queryRawUnsafe delega todo a PostgreSQL — Node recibe
    // solo el resumen por categoría (≤ 14 filas: 7 categorías × 2 tipos).
    // Los parámetros de fecha son positionales ($2, $3) para evitar inyección.
    const params: any[] = [organizacionId];
    let paramN = 2;
    const conditions: string[] = [];
    if (desde) { conditions.push(`fecha >= $${paramN++}`); params.push(desde); }
    if (hasta)  { conditions.push(`fecha <= $${paramN++}`); params.push(hasta); }
    const extraWhere = conditions.length ? ' AND ' + conditions.join(' AND ') : '';

    const rows = await prisma.$queryRawUnsafe<Array<{
      tipo: string;
      categoria: string;
      count: number;
      cantidad: number;
      valor: number;
    }>>(`
      SELECT
        tipo,
        COALESCE(categoria_merma, 'sin_categorizar') AS categoria,
        COUNT(*)::int                                 AS count,
        SUM(cantidad)::float                          AS cantidad,
        SUM(cantidad * COALESCE(costo_unitario, 0))::float AS valor
      FROM movimientos
      WHERE tipo IN ('merma', 'consumo_interno')
        AND organizacion_id = $1
        ${extraWhere}
      GROUP BY tipo, COALESCE(categoria_merma, 'sin_categorizar')
      ORDER BY SUM(cantidad * COALESCE(costo_unitario, 0)) DESC
    `, ...params);

    const totalValor        = rows.reduce((s, r) => s + r.valor, 0);
    const totalMovimientos  = rows.reduce((s, r) => s + r.count, 0);
    res.json({ totalValor, totalMovimientos, grupos: rows });
  } catch (error: any) {
    console.error('[movimientos/mermas-por-categoria]', error);
    res.status(500).json({ error: 'Error al obtener reporte de mermas' });
  }
});

export default router;
