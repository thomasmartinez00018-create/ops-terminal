import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { detectarVariaciones, persistirAlertas, type VariacionDetectada } from '../lib/alertasPrecio';

const router = Router();

// ── GET /api/contabilidad/facturas ─────────────────────────────────────────
router.get('/facturas', async (req: Request, res: Response) => {
  try {
    const { proveedorId, estado, tipo, desde, hasta } = req.query;
    const where: any = {};

    if (proveedorId) where.proveedorId = parseInt(proveedorId as string);
    if (estado) where.estado = estado;
    if (tipo) where.tipoComprobante = tipo;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = desde;
      if (hasta) where.fecha.lte = hasta;
    }

    const facturas = await prisma.factura.findMany({
      where,
      include: {
        proveedor: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } },
        _count: { select: { items: true, pagos: true } },
        pagos: { select: { monto: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular saldo pendiente
    const result = facturas.map(f => {
      const totalPagado = f.pagos.reduce((s, p) => s + p.monto, 0);
      return {
        ...f,
        pagos: undefined,
        totalPagado,
        saldoPendiente: f.total - totalPagado,
      };
    });

    res.json(result);
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
router.get('/cuentas-por-pagar', async (_req: Request, res: Response) => {
  try {
    const facturas = await prisma.factura.findMany({
      where: { estado: { in: ['pendiente', 'parcial'] } },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        pagos: { select: { monto: true } },
      },
    });

    const hoy = new Date();
    // Agrupar por proveedor
    const porProveedor: Record<number, {
      proveedorId: number; nombre: string;
      totalFacturado: number; totalPagado: number; saldo: number;
      corriente: number; dias31_60: number; dias61_90: number; dias90plus: number;
      cantFacturas: number;
    }> = {};

    for (const f of facturas) {
      const pid = f.proveedorId;
      if (!porProveedor[pid]) {
        porProveedor[pid] = {
          proveedorId: pid,
          nombre: f.proveedor.nombre,
          totalFacturado: 0, totalPagado: 0, saldo: 0,
          corriente: 0, dias31_60: 0, dias61_90: 0, dias90plus: 0,
          cantFacturas: 0,
        };
      }

      const pagado = f.pagos.reduce((s, p) => s + p.monto, 0);
      const saldo = f.total - pagado;
      const fechaRef = f.fechaVencimiento || f.fecha;
      const dias = Math.floor((hoy.getTime() - new Date(fechaRef).getTime()) / (1000 * 60 * 60 * 24));

      porProveedor[pid].totalFacturado += f.total;
      porProveedor[pid].totalPagado += pagado;
      porProveedor[pid].saldo += saldo;
      porProveedor[pid].cantFacturas += 1;

      if (dias <= 30) porProveedor[pid].corriente += saldo;
      else if (dias <= 60) porProveedor[pid].dias31_60 += saldo;
      else if (dias <= 90) porProveedor[pid].dias61_90 += saldo;
      else porProveedor[pid].dias90plus += saldo;
    }

    const resultado = Object.values(porProveedor).sort((a, b) => b.saldo - a.saldo);
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
router.get('/saldo-proveedor/:id', async (req: Request, res: Response) => {
  try {
    const proveedorId = parseInt(req.params.id as string);
    const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const facturas = await prisma.factura.findMany({
      where: { proveedorId, estado: { not: 'anulada' } },
      include: {
        pagos: { select: { monto: true, fecha: true, medioPago: true } },
        _count: { select: { items: true } },
      },
      orderBy: { fecha: 'desc' },
    });

    const resumen = facturas.map(f => {
      const totalPagado = f.pagos.reduce((s, p) => s + p.monto, 0);
      return {
        ...f,
        totalPagado,
        saldoPendiente: f.total - totalPagado,
      };
    });

    const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);
    const totalPagado = facturas.reduce((s, f) => s + f.pagos.reduce((sp, p) => sp + p.monto, 0), 0);

    res.json({
      proveedor,
      facturas: resumen,
      totalFacturado,
      totalPagado,
      saldo: totalFacturado - totalPagado,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/cogs ─────────────────────────────────────────────
router.get('/cogs', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = req.query;
    const where: any = { tipo: 'ingreso' };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = desde;
      if (hasta) where.fecha.lte = hasta;
    }

    const movimientos = await prisma.movimiento.findMany({
      where,
      include: {
        producto: { select: { id: true, nombre: true, rubro: true } },
      },
    });

    // Agrupar por rubro
    const porRubro: Record<string, { rubro: string; costoTotal: number; cantItems: number }> = {};
    let costoGlobal = 0;

    for (const m of movimientos) {
      const rubro = m.producto?.rubro || 'Sin rubro';
      if (!porRubro[rubro]) porRubro[rubro] = { rubro, costoTotal: 0, cantItems: 0 };
      const costo = (m.costoUnitario || 0) * m.cantidad;
      porRubro[rubro].costoTotal += costo;
      porRubro[rubro].cantItems += 1;
      costoGlobal += costo;
    }

    const rubros = Object.values(porRubro)
      .map(r => ({ ...r, porcentaje: costoGlobal > 0 ? (r.costoTotal / costoGlobal * 100) : 0 }))
      .sort((a, b) => b.costoTotal - a.costoTotal);

    res.json({ rubros, costoTotal: costoGlobal });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/contabilidad/historial-precios/:productoId ────────────────────
router.get('/historial-precios/:productoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);

    // Precios desde movimientos de ingreso
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

    // Precios desde items de facturas
    const facturaItems = await prisma.facturaItem.findMany({
      where: { productoId },
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
