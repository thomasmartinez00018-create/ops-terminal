import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';
import { detectarVariaciones, persistirAlertas, type VariacionDetectada } from '../lib/alertasPrecio';

const router = Router();

// ── GET /api/contabilidad/facturas ─────────────────────────────────────────
// OOM-safe: paginación obligatoria + rango fecha default últimos 90 días si
// no viene `desde`. La versión previa cargaba TODAS las facturas históricas
// con `include: items + pagos + _count` — con cientos de facturas y sus
// pagos inlineados, la response a /facturas mataba el contenedor Railway
// en cuanto el cliente entraba a esa pantalla.
//
// Además: el totalPagado se calcula en SQL con un subquery agregado, no
// cargando todos los pagos a Node.
router.get('/facturas', async (req: Request, res: Response) => {
  try {
    const { proveedorId, estado, tipo, limit, offset } = req.query;
    let { desde, hasta } = req.query as { desde?: string; hasta?: string };
    const where: any = {};

    if (proveedorId) {
      const pid = parseInt(proveedorId as string);
      if (Number.isFinite(pid)) where.proveedorId = pid;
    }
    if (estado) where.estado = estado;
    if (tipo) where.tipoComprobante = tipo;
    if (!desde && !hasta) {
      // Default: últimos 90 días. El usuario puede pasar desde="" para forzar
      // ver todo, pero ese camino requiere confirmar que el volumen es sano.
      desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = desde;
      if (hasta) where.fecha.lte = hasta;
    }

    const takeN = Math.min(Math.max(parseInt(limit as string) || 100, 1), 500);
    const skipN = Math.max(parseInt(offset as string) || 0, 0);

    const [facturas, total] = await Promise.all([
      prisma.factura.findMany({
        where,
        select: {
          id: true, codigo: true, tipoComprobante: true, numero: true,
          fecha: true, fechaVencimiento: true, proveedorId: true,
          subtotal: true, iva: true, total: true, estado: true,
          observacion: true, createdAt: true,
          proveedor: { select: { nombre: true } },
          creadoPor: { select: { nombre: true } },
          _count: { select: { items: true, pagos: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: takeN,
        skip: skipN,
      }),
      prisma.factura.count({ where }),
    ]);

    // Agregar totalPagado de cada factura con un solo groupBy en DB,
    // no cargando todos los pagos a Node.
    const facturaIds = facturas.map(f => f.id);
    const pagosAgg = facturaIds.length
      ? await prisma.pago.groupBy({
          by: ['facturaId'],
          where: { facturaId: { in: facturaIds } },
          _sum: { monto: true },
        })
      : [];
    const pagadoMap = new Map<number, number>();
    for (const p of pagosAgg) {
      pagadoMap.set(p.facturaId, Number(p._sum.monto) || 0);
    }

    const result = facturas.map(f => {
      const totalPagado = pagadoMap.get(f.id) || 0;
      return {
        ...f,
        totalPagado,
        saldoPendiente: f.total - totalPagado,
      };
    });

    res.json({ facturas: result, total, limit: takeN, offset: skipN, desde, hasta });
  } catch (error: any) {
    console.error('[contabilidad/facturas]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/facturas/:id ─────────────────────────────────────
router.get('/facturas/:id', async (req: Request, res: Response) => {
  try {
    const factura = await prisma.factura.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        creadoPor: { select: { nombre: true } },
        ordenCompra: { select: { id: true, codigo: true } },
        items: {
          include: { producto: { select: { id: true, nombre: true, codigo: true } } },
        },
        pagos: {
          include: { creadoPor: { select: { nombre: true } } },
          orderBy: { createdAt: 'desc' },
        },
        movimientos: {
          select: { id: true, tipo: true, cantidad: true, unidad: true },
        },
      },
    });

    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });

    const totalPagado = factura.pagos.reduce((s, p) => s + p.monto, 0);
    res.json({ ...factura, totalPagado, saldoPendiente: factura.total - totalPagado });
  } catch (error: any) {
    console.error('[contabilidad/facturas/:id]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/contabilidad/facturas ── Crear factura manual ────────────────
router.post('/facturas', async (req: Request, res: Response) => {
  try {
    const {
      tipoComprobante, numero, fecha, fechaVencimiento,
      proveedorId, ordenCompraId, subtotal, iva, total,
      observacion, creadoPorId, imagenBase64, items,
    } = req.body;

    const factura = await prisma.$transaction(async (tx) => {
      // Generar código FAC-NNNN dentro de la transacción para evitar race conditions
      const last = await tx.factura.findFirst({ orderBy: { id: 'desc' } });
      const nextNum = (last?.id || 0) + 1;
      const codigo = `FAC-${String(nextNum).padStart(4, '0')}`;

      const fac = await tx.factura.create({
        data: {
          codigo,
          tipoComprobante: tipoComprobante || 'ticket',
          numero: numero || '',
          fecha,
          fechaVencimiento: fechaVencimiento || null,
          proveedorId: Number(proveedorId),
          ordenCompraId: ordenCompraId ? Number(ordenCompraId) : null,
          subtotal: Number(subtotal || 0),
          iva: Number(iva || 0),
          total: Number(total || 0),
          estado: 'pendiente',
          imagenBase64: imagenBase64 || null,
          observacion: observacion || null,
          creadoPorId: Number(creadoPorId),
        },
      });

      // Crear items
      if (items?.length) {
        for (const item of items) {
          await tx.facturaItem.create({
            data: {
              facturaId: fac.id,
              productoId: item.productoId ? Number(item.productoId) : null,
              descripcion: item.descripcion || '',
              cantidad: Number(item.cantidad),
              unidad: item.unidad || 'unidad',
              precioUnitario: Number(item.precioUnitario || 0),
              alicuotaIva: Number(item.alicuotaIva ?? 21),
              subtotal: Number(item.cantidad) * Number(item.precioUnitario || 0),
              iva: Number(item.cantidad) * Number(item.precioUnitario || 0) * Number(item.alicuotaIva ?? 21) / 100,
            },
          });
        }
      }

      // ── Detectar variaciones de precio + persistir alertas ──────────
      // Se corre sobre los items válidos (con producto + precio). Excluye
      // la factura recién creada para no compararla contra sí misma.
      const itemsValidos = (items || []).filter(
        (i: any) => i && i.productoId && Number(i.precioUnitario) > 0,
      );
      let variaciones: VariacionDetectada[] = [];
      let alertasIds: number[] = [];
      if (itemsValidos.length > 0) {
        variaciones = await detectarVariaciones(
          tx,
          proveedorId ? Number(proveedorId) : null,
          itemsValidos.map((i: any) => ({
            productoId: Number(i.productoId),
            precioUnitario: Number(i.precioUnitario),
            unidad: i.unidad || 'unidad',
          })),
          { excluirFacturaId: fac.id },
        );
        alertasIds = await persistirAlertas(tx, fac.id, variaciones);

        // Actualizar ultimoPrecio en ProveedorProducto (solo si hay proveedor)
        if (proveedorId) {
          for (const item of itemsValidos) {
            try {
              await tx.proveedorProducto.updateMany({
                where: {
                  proveedorId: Number(proveedorId),
                  productoId: Number(item.productoId),
                },
                data: {
                  ultimoPrecio: Number(item.precioUnitario),
                  fechaPrecio: fecha,
                },
              });
            } catch {
              // ProveedorProducto puede no existir, está bien
            }
          }
        }
      }

      return { fac, variaciones, alertasIds };
    });

    res.json({
      ...factura.fac,
      alertasPrecio: factura.variaciones,
      alertasPrecioIds: factura.alertasIds,
    });
  } catch (error: any) {
    console.error('[contabilidad/facturas POST]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /api/contabilidad/facturas/:id ─────────────────────────────────────
router.put('/facturas/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const existing = await prisma.factura.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' });
    if (existing.estado === 'anulada') return res.status(400).json({ error: 'No se puede editar una factura anulada' });

    const {
      tipoComprobante, numero, fecha, fechaVencimiento,
      proveedorId, ordenCompraId, subtotal, iva, total,
      observacion, items,
    } = req.body;

    const factura = await prisma.$transaction(async (tx) => {
      const fac = await tx.factura.update({
        where: { id },
        data: {
          tipoComprobante: tipoComprobante ?? existing.tipoComprobante,
          numero: numero ?? existing.numero,
          fecha: fecha ?? existing.fecha,
          fechaVencimiento: fechaVencimiento !== undefined ? fechaVencimiento : existing.fechaVencimiento,
          proveedorId: proveedorId ? Number(proveedorId) : existing.proveedorId,
          ordenCompraId: ordenCompraId !== undefined ? (ordenCompraId ? Number(ordenCompraId) : null) : existing.ordenCompraId,
          subtotal: subtotal !== undefined ? Number(subtotal) : existing.subtotal,
          iva: iva !== undefined ? Number(iva) : existing.iva,
          total: total !== undefined ? Number(total) : existing.total,
          observacion: observacion !== undefined ? observacion : existing.observacion,
        },
      });

      // Reemplazar items si se envían
      if (items) {
        await tx.facturaItem.deleteMany({ where: { facturaId: id } });
        for (const item of items) {
          await tx.facturaItem.create({
            data: {
              facturaId: id,
              productoId: item.productoId ? Number(item.productoId) : null,
              descripcion: item.descripcion || '',
              cantidad: Number(item.cantidad),
              unidad: item.unidad || 'unidad',
              precioUnitario: Number(item.precioUnitario || 0),
              alicuotaIva: Number(item.alicuotaIva ?? 21),
              subtotal: Number(item.cantidad) * Number(item.precioUnitario || 0),
              iva: Number(item.cantidad) * Number(item.precioUnitario || 0) * Number(item.alicuotaIva ?? 21) / 100,
            },
          });
        }
      }

      return fac;
    });

    res.json(factura);
  } catch (error: any) {
    console.error('[contabilidad/facturas PUT]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /api/contabilidad/facturas/:id/anular ──────────────────────────────
router.put('/facturas/:id/anular', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const factura = await prisma.factura.update({
      where: { id },
      data: { estado: 'anulada' },
    });
    res.json(factura);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /api/contabilidad/facturas/:id/vincular-oc ─────────────────────────
router.put('/facturas/:id/vincular-oc', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { ordenCompraId } = req.body;
    const factura = await prisma.factura.update({
      where: { id },
      data: { ordenCompraId: ordenCompraId ? Number(ordenCompraId) : null },
    });
    res.json(factura);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/contabilidad/facturas/:id/pagos ──────────────────────────────
router.post('/facturas/:id/pagos', async (req: Request, res: Response) => {
  try {
    const facturaId = parseInt(req.params.id as string);
    const { fecha, monto, medioPago, referencia, observacion, creadoPorId } = req.body;

    const pago = await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({
        data: {
          facturaId,
          fecha,
          monto: Number(monto),
          medioPago: medioPago || 'efectivo',
          referencia: referencia || null,
          observacion: observacion || null,
          creadoPorId: Number(creadoPorId),
        },
      });

      // Recalcular estado factura
      const factura = await tx.factura.findUnique({
        where: { id: facturaId },
        include: { pagos: true },
      });
      if (factura) {
        const totalPagado = factura.pagos.reduce((s, pg) => s + pg.monto, 0);
        const estado = totalPagado >= factura.total ? 'pagada' : totalPagado > 0 ? 'parcial' : 'pendiente';
        await tx.factura.update({ where: { id: facturaId }, data: { estado } });
      }

      return p;
    });

    res.json(pago);
  } catch (error: any) {
    console.error('[contabilidad/pagos POST]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /api/contabilidad/pagos/:id ─────────────────────────────────────
router.delete('/pagos/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const pago = await prisma.pago.findUnique({ where: { id } });
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.pago.delete({ where: { id } });

      // Recalcular estado factura
      const factura = await tx.factura.findUnique({
        where: { id: pago.facturaId },
        include: { pagos: true },
      });
      if (factura) {
        const totalPagado = factura.pagos.reduce((s, pg) => s + pg.monto, 0);
        const estado = totalPagado >= factura.total ? 'pagada' : totalPagado > 0 ? 'parcial' : 'pendiente';
        await tx.factura.update({ where: { id: pago.facturaId }, data: { estado } });
      }
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/cuentas-por-pagar ────────────────────────────────
// OOM-safe: un solo raw SQL con JOIN + GROUP BY + aging buckets calculados
// en PostgreSQL (CASE WHEN sobre DATE_PART). Antes cargaba TODAS las
// facturas pendientes/parciales al heap con sus pagos y agrupaba en JS.
router.get('/cuentas-por-pagar', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    const rows = await prisma.$queryRawUnsafe<Array<{
      proveedor_id: number;
      nombre: string;
      total_facturado: number;
      total_pagado: number;
      saldo: number;
      corriente: number;
      dias31_60: number;
      dias61_90: number;
      dias90plus: number;
      cant_facturas: number;
    }>>(`
      SELECT
        f.proveedor_id,
        pr.nombre,
        SUM(f.total)::float AS total_facturado,
        SUM(COALESCE(pg.pagado, 0))::float AS total_pagado,
        SUM(f.total - COALESCE(pg.pagado, 0))::float AS saldo,
        SUM(CASE WHEN dias <= 30 THEN f.total - COALESCE(pg.pagado, 0) ELSE 0 END)::float AS corriente,
        SUM(CASE WHEN dias > 30 AND dias <= 60 THEN f.total - COALESCE(pg.pagado, 0) ELSE 0 END)::float AS dias31_60,
        SUM(CASE WHEN dias > 60 AND dias <= 90 THEN f.total - COALESCE(pg.pagado, 0) ELSE 0 END)::float AS dias61_90,
        SUM(CASE WHEN dias > 90 THEN f.total - COALESCE(pg.pagado, 0) ELSE 0 END)::float AS dias90plus,
        COUNT(*)::int AS cant_facturas
      FROM (
        SELECT f.*,
               EXTRACT(EPOCH FROM (CURRENT_DATE - COALESCE(f.fecha_vencimiento, f.fecha)::date)) / 86400 AS dias
        FROM facturas f
        WHERE f.organizacion_id = $1
          AND f.estado IN ('pendiente', 'parcial')
      ) f
      JOIN proveedores pr ON pr.id = f.proveedor_id
      LEFT JOIN (
        SELECT factura_id, SUM(monto)::float AS pagado
        FROM pagos
        WHERE organizacion_id = $1
        GROUP BY factura_id
      ) pg ON pg.factura_id = f.id
      GROUP BY f.proveedor_id, pr.nombre
      ORDER BY SUM(f.total - COALESCE(pg.pagado, 0)) DESC
    `, organizacionId);

    const resultado = rows.map(r => ({
      proveedorId: Number(r.proveedor_id),
      nombre: r.nombre,
      totalFacturado: Number(r.total_facturado) || 0,
      totalPagado: Number(r.total_pagado) || 0,
      saldo: Number(r.saldo) || 0,
      corriente: Number(r.corriente) || 0,
      dias31_60: Number(r.dias31_60) || 0,
      dias61_90: Number(r.dias61_90) || 0,
      dias90plus: Number(r.dias90plus) || 0,
      cantFacturas: Number(r.cant_facturas) || 0,
    }));

    const totales = resultado.reduce((acc, p) => ({
      totalAdeudado: acc.totalAdeudado + p.saldo,
      totalFacturas: acc.totalFacturas + p.cantFacturas,
      corriente: acc.corriente + p.corriente,
      dias31_60: acc.dias31_60 + p.dias31_60,
      dias61_90: acc.dias61_90 + p.dias61_90,
      dias90plus: acc.dias90plus + p.dias90plus,
    }), { totalAdeudado: 0, totalFacturas: 0, corriente: 0, dias31_60: 0, dias61_90: 0, dias90plus: 0 });

    res.json({ proveedores: resultado, totales });
  } catch (error: any) {
    console.error('[contabilidad/cuentas-por-pagar]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/saldo-proveedor/:id ──────────────────────────────
// OOM-safe: `take: 200` últimas facturas para mostrar + totales calculados
// en SQL sobre TODO el histórico del proveedor (no carga miles de filas).
router.get('/saldo-proveedor/:id', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const proveedorId = parseInt(req.params.id as string);
    if (!Number.isFinite(proveedorId)) return res.status(400).json({ error: 'id inválido' });

    const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    // Totales en SQL — agregación sin cargar filas a Node
    const totalesRows = await prisma.$queryRaw<Array<{
      total_facturado: number;
      total_pagado: number;
    }>>`
      SELECT
        COALESCE(SUM(f.total), 0)::float AS total_facturado,
        COALESCE(SUM((SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.factura_id = f.id AND p.organizacion_id = ${organizacionId})), 0)::float AS total_pagado
      FROM facturas f
      WHERE f.proveedor_id = ${proveedorId}
        AND f.organizacion_id = ${organizacionId}
        AND f.estado != 'anulada'
    `;

    const totalFacturado = Number(totalesRows[0]?.total_facturado) || 0;
    const totalPagado = Number(totalesRows[0]?.total_pagado) || 0;

    // Últimas 200 facturas con select explícito (sin `pagos` inlineados)
    const facturas = await prisma.factura.findMany({
      where: { proveedorId, estado: { not: 'anulada' } },
      select: {
        id: true, codigo: true, tipoComprobante: true, numero: true,
        fecha: true, fechaVencimiento: true, total: true, estado: true,
        _count: { select: { items: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });

    // Agregar totalPagado por factura vía groupBy
    const facturaIds = facturas.map(f => f.id);
    const pagosAgg = facturaIds.length
      ? await prisma.pago.groupBy({
          by: ['facturaId'],
          where: { facturaId: { in: facturaIds } },
          _sum: { monto: true },
        })
      : [];
    const pagadoMap = new Map<number, number>();
    for (const p of pagosAgg) pagadoMap.set(p.facturaId, Number(p._sum.monto) || 0);

    const resumen = facturas.map(f => {
      const pagado = pagadoMap.get(f.id) || 0;
      return { ...f, totalPagado: pagado, saldoPendiente: f.total - pagado };
    });

    res.json({
      proveedor,
      facturas: resumen,
      totalFacturado,
      totalPagado,
      saldo: totalFacturado - totalPagado,
    });
  } catch (error: any) {
    console.error('[contabilidad/saldo-proveedor]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/cogs ─────────────────────────────────────────────
// OOM-safe: JOIN + GROUP BY en PostgreSQL. La versión previa cargaba TODOS
// los ingresos históricos al heap con el include del producto y los agrupaba
// en JS — con decenas de miles de filas fundía el contenedor.
// También: si no viene `desde`/`hasta`, default a los últimos 30 días.
router.get('/cogs', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    let { desde, hasta } = req.query as { desde?: string; hasta?: string };
    if (!desde && !hasta) {
      hasta = new Date().toISOString().split('T')[0];
      desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    const params: any[] = [organizacionId];
    let paramN = 2;
    const extra: string[] = [];
    if (desde) { extra.push(`m.fecha >= $${paramN++}`); params.push(desde); }
    if (hasta) { extra.push(`m.fecha <= $${paramN++}`); params.push(hasta); }
    const extraWhere = extra.length ? ' AND ' + extra.join(' AND ') : '';

    const rows = await prisma.$queryRawUnsafe<Array<{
      rubro: string | null;
      costo_total: number;
      cant_items: number;
    }>>(`
      SELECT COALESCE(p.rubro, 'Sin rubro') AS rubro,
             SUM(COALESCE(m.costo_unitario, 0) * m.cantidad)::float AS costo_total,
             COUNT(*)::int AS cant_items
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      WHERE m.tipo = 'ingreso'
        AND m.organizacion_id = $1
        ${extraWhere}
      GROUP BY COALESCE(p.rubro, 'Sin rubro')
      ORDER BY SUM(COALESCE(m.costo_unitario, 0) * m.cantidad) DESC
    `, ...params);

    const costoGlobal = rows.reduce((s, r) => s + Number(r.costo_total || 0), 0);
    const rubros = rows.map(r => {
      const costo = Number(r.costo_total || 0);
      return {
        rubro: r.rubro || 'Sin rubro',
        costoTotal: Math.round(costo * 100) / 100,
        cantItems: Number(r.cant_items || 0),
        porcentaje: costoGlobal > 0 ? (costo / costoGlobal) * 100 : 0,
      };
    });

    res.json({ rubros, costoTotal: Math.round(costoGlobal * 100) / 100, desde, hasta });
  } catch (error: any) {
    console.error('[contabilidad/cogs]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/cogs/detalle ─────────────────────────────────────
// Detalle de COGS para UN rubro específico en un rango. Devuelve los
// productos consumidos con cantidad y costo total, ordenados desc.
// OOM-safe: agregación en PostgreSQL con JOIN + GROUP BY + filtro de rubro
// en la DB (antes descartaba productos del rubro equivocado en JS después
// de cargar TODOS los ingresos históricos al heap).
router.get('/cogs/detalle', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const { rubro } = req.query as { rubro?: string };
    let { desde, hasta } = req.query as { desde?: string; hasta?: string };
    if (!rubro) {
      res.status(400).json({ error: 'rubro es requerido' });
      return;
    }
    if (!desde && !hasta) {
      hasta = new Date().toISOString().split('T')[0];
      desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // Normalizar "Sin rubro" para que coincida con la representación del SELECT.
    const rubroFilter = rubro === 'Sin rubro' ? null : rubro;

    const params: any[] = [organizacionId];
    let paramN = 2;
    const conditions: string[] = [];
    if (rubroFilter === null) {
      conditions.push(`p.rubro IS NULL`);
    } else {
      conditions.push(`p.rubro = $${paramN++}`);
      params.push(rubroFilter);
    }
    if (desde) { conditions.push(`m.fecha >= $${paramN++}`); params.push(desde); }
    if (hasta) { conditions.push(`m.fecha <= $${paramN++}`); params.push(hasta); }
    const extraWhere = ' AND ' + conditions.join(' AND ');

    const rows = await prisma.$queryRawUnsafe<Array<{
      producto_id: number;
      codigo: string;
      nombre: string;
      unidad_compra: string | null;
      cantidad: number;
      costo_total: number;
      cant_movimientos: number;
      proveedores: string[] | null;
    }>>(`
      SELECT p.id AS producto_id,
             p.codigo,
             p.nombre,
             p.unidad_compra,
             SUM(m.cantidad)::float AS cantidad,
             SUM(COALESCE(m.costo_unitario, 0) * m.cantidad)::float AS costo_total,
             COUNT(*)::int AS cant_movimientos,
             ARRAY_REMOVE(ARRAY_AGG(DISTINCT pr.nombre), NULL) AS proveedores
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN proveedores pr ON pr.id = m.proveedor_id
      WHERE m.tipo = 'ingreso'
        AND m.organizacion_id = $1
        ${extraWhere}
      GROUP BY p.id, p.codigo, p.nombre, p.unidad_compra
      ORDER BY SUM(COALESCE(m.costo_unitario, 0) * m.cantidad) DESC
    `, ...params);

    const productos = rows.map(r => {
      const cantidad = Number(r.cantidad || 0);
      const costoTotal = Number(r.costo_total || 0);
      return {
        productoId: Number(r.producto_id),
        codigo: r.codigo,
        nombre: r.nombre,
        unidad: r.unidad_compra || '',
        cantidad: Math.round(cantidad * 100) / 100,
        costoTotal: Math.round(costoTotal * 100) / 100,
        costoPromedio: cantidad > 0 ? Math.round((costoTotal / cantidad) * 100) / 100 : 0,
        cantMovimientos: Number(r.cant_movimientos || 0),
        proveedores: Array.isArray(r.proveedores) ? r.proveedores : [],
      };
    });

    const costoTotalRubro = productos.reduce((s, p) => s + p.costoTotal, 0);

    res.json({ rubro, costoTotal: Math.round(costoTotalRubro * 100) / 100, productos, desde, hasta });
  } catch (error: any) {
    console.error('[contabilidad/cogs/detalle]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/historial-precios/:productoId ────────────────────
router.get('/historial-precios/:productoId', async (req: Request, res: Response) => {
  try {
    // SECURITY: FacturaItem NO es tenant-aware (es child de Factura). Sin
    // filtro explícito por `factura.organizacionId`, un usuario autenticado
    // podría pedir /historial-precios/<cualquier-producto-id> y ver precios
    // de facturas de OTRAS organizaciones. Filtramos explícitamente.
    const { organizacionId } = getTenant();
    const productoId = parseInt(req.params.productoId as string);
    if (!Number.isFinite(productoId)) {
      res.status(400).json({ error: 'productoId inválido' });
      return;
    }

    // Precios desde movimientos de ingreso (Movimiento SÍ es tenant-aware —
    // la extensión filtra por org automáticamente)
    const movimientos = await prisma.movimiento.findMany({
      where: {
        productoId,
        tipo: 'ingreso',
        costoUnitario: { not: null },
      },
      include: {
        proveedor: { select: { nombre: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 50,
    });

    // Precios desde items de facturas — filtrado por factura.organizacionId
    const facturaItems = await prisma.facturaItem.findMany({
      where: {
        productoId,
        factura: { organizacionId },
      },
      include: {
        factura: {
          select: { fecha: true, proveedor: { select: { nombre: true } } },
        },
      },
      orderBy: { factura: { fecha: 'desc' } },
      take: 50,
    });

    const historial = [
      ...movimientos.map(m => ({
        fecha: m.fecha,
        precio: m.costoUnitario,
        cantidad: m.cantidad,
        unidad: m.unidad,
        proveedor: m.proveedor?.nombre || null,
        fuente: 'movimiento' as const,
      })),
      ...facturaItems.map(fi => ({
        fecha: fi.factura.fecha,
        precio: fi.precioUnitario,
        cantidad: fi.cantidad,
        unidad: fi.unidad,
        proveedor: fi.factura.proveedor?.nombre || null,
        fuente: 'factura' as const,
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Deduplicar por fecha+proveedor+precio
    const seen = new Set<string>();
    const unique = historial.filter(h => {
      const key = `${h.fecha}-${h.proveedor}-${h.precio}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json(unique);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
