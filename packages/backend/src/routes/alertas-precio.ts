import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

// ============================================================================
// Router /api/alertas-precio — bandeja de variaciones detectadas en facturas
// ============================================================================
// Endpoints:
//   GET  /                  → lista con filtros (estado, severidad, proveedor…)
//   GET  /count             → badge para Sidebar (solo pendientes)
//   GET  /resumen           → stats por severidad + top productos
//   GET  /:id               → detalle con historial del mismo producto × proveedor
//   PUT  /:id/revisar       → pendiente → revisada (acepta la variación)
//   PUT  /:id/descartar     → pendiente → descartada (falso positivo / OCR error)
//   DELETE /:id             → elimina una alerta (cleanup manual, admin only)
//
// Filosofía:
// - Las alertas se generan automáticamente al confirmar facturas (vía
//   lib/alertasPrecio.ts). Este router es el backoffice que las expone al
//   frontend para que el usuario las revise.
// - "Revisar" != "arreglar el precio". Solo marca que el humano la vio. El
//   ProveedorProducto.ultimoPrecio ya fue actualizado cuando se confirmó la
//   factura — el objetivo de la alerta es que el usuario sepa que pasó, no
//   que tenga que deshacer nada.
// - "Descartar" es para cuando el OCR leyó mal o el item está mal cargado.
//   En ese caso la alerta se marca como descartada para que no contamine la
//   bandeja, pero NO se revierte el ultimoPrecio (eso lo hace el usuario
//   editando la factura o cargando una nueva).
// ============================================================================

const router = Router();

function getUsuarioId(req: Request): number {
  return (req as any).usuario?.id ?? 0;
}

// ---------------------------------------------------------------------------
// GET /api/alertas-precio — lista con filtros
// ---------------------------------------------------------------------------
// Query params:
//   estado      = pendiente | revisada | descartada (default: pendiente)
//   severidad   = leve | media | alta
//   direccion   = sube | baja
//   proveedorId = number
//   productoId  = number
//   desde/hasta = YYYY-MM-DD (filtro sobre createdAt)
//   limit       = default 100
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      estado,
      severidad,
      direccion,
      proveedorId,
      productoId,
      desde,
      hasta,
      limit,
    } = req.query;

    const where: any = {};
    if (estado) where.estado = estado;
    if (severidad) where.severidad = severidad;
    if (direccion) where.direccion = direccion;
    if (proveedorId) where.proveedorId = parseInt(proveedorId as string);
    if (productoId) where.productoId = parseInt(productoId as string);
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = new Date(desde as string);
      if (hasta) {
        const h = new Date(hasta as string);
        h.setHours(23, 59, 59, 999);
        where.createdAt.lte = h;
      }
    }

    const take = Math.min(parseInt(limit as string) || 100, 500);

    const alertas = await prisma.alertaPrecio.findMany({
      where,
      include: {
        producto: { select: { id: true, codigo: true, nombre: true, unidadCompra: true } },
        proveedor: { select: { id: true, nombre: true } },
        factura: {
          select: {
            id: true,
            numero: true,
            fecha: true,
            tipoComprobante: true,
          },
        },
        revisadoPor: { select: { id: true, nombre: true } },
      },
      orderBy: [
        // Pendientes primero, luego por severidad desc, luego por fecha desc
        { estado: 'asc' },
        { createdAt: 'desc' },
      ],
      take,
    });

    res.json({
      total: alertas.length,
      alertas,
    });
  } catch (error) {
    console.error('GET /alertas-precio error:', error);
    res.status(500).json({ error: 'Error al listar alertas de precio' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alertas-precio/count — badge Sidebar (solo pendientes)
// ---------------------------------------------------------------------------
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const [pendientes, altaPendientes] = await Promise.all([
      prisma.alertaPrecio.count({ where: { estado: 'pendiente' } }),
      prisma.alertaPrecio.count({ where: { estado: 'pendiente', severidad: 'alta' } }),
    ]);

    res.json({
      pendientes,
      altaPendientes,
    });
  } catch (error) {
    console.error('GET /alertas-precio/count error:', error);
    res.status(500).json({ error: 'Error al contar alertas de precio' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alertas-precio/resumen — stats para dashboard
// ---------------------------------------------------------------------------
// Devuelve:
//   - total por estado
//   - total por severidad (solo pendientes)
//   - top 5 productos con más variaciones pendientes
//   - top 5 proveedores con más variaciones pendientes
// ---------------------------------------------------------------------------
router.get('/resumen', async (_req: Request, res: Response) => {
  try {
    const [porEstado, porSeveridad, porDireccion] = await Promise.all([
      prisma.alertaPrecio.groupBy({
        by: ['estado'],
        _count: { _all: true },
      }),
      prisma.alertaPrecio.groupBy({
        by: ['severidad'],
        where: { estado: 'pendiente' },
        _count: { _all: true },
      }),
      prisma.alertaPrecio.groupBy({
        by: ['direccion'],
        where: { estado: 'pendiente' },
        _count: { _all: true },
      }),
    ]);

    // Top productos con más variaciones pendientes
    const topProductos = await prisma.alertaPrecio.groupBy({
      by: ['productoId'],
      where: { estado: 'pendiente' },
      _count: { _all: true },
      orderBy: { _count: { productoId: 'desc' } },
      take: 5,
    });

    const productosIds = topProductos.map(p => p.productoId);
    const productosData = productosIds.length
      ? await prisma.producto.findMany({
          where: { id: { in: productosIds } },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];

    const topProductosConNombre = topProductos.map(tp => ({
      ...productosData.find(p => p.id === tp.productoId),
      count: tp._count._all,
    }));

    // Top proveedores
    const topProveedores = await prisma.alertaPrecio.groupBy({
      by: ['proveedorId'],
      where: { estado: 'pendiente', proveedorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { proveedorId: 'desc' } },
      take: 5,
    });

    const proveedoresIds = topProveedores
      .map(p => p.proveedorId)
      .filter((x): x is number => x != null);
    const proveedoresData = proveedoresIds.length
      ? await prisma.proveedor.findMany({
          where: { id: { in: proveedoresIds } },
          select: { id: true, nombre: true },
        })
      : [];

    const topProveedoresConNombre = topProveedores.map(tp => ({
      ...proveedoresData.find(p => p.id === tp.proveedorId),
      count: tp._count._all,
    }));

    res.json({
      porEstado: Object.fromEntries(porEstado.map(r => [r.estado, r._count._all])),
      porSeveridad: Object.fromEntries(porSeveridad.map(r => [r.severidad, r._count._all])),
      porDireccion: Object.fromEntries(porDireccion.map(r => [r.direccion, r._count._all])),
      topProductos: topProductosConNombre,
      topProveedores: topProveedoresConNombre,
    });
  } catch (error) {
    console.error('GET /alertas-precio/resumen error:', error);
    res.status(500).json({ error: 'Error al generar resumen de alertas' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alertas-precio/:id — detalle + historial de precios del producto
// ---------------------------------------------------------------------------
// Además de la alerta, devuelve el historial de las últimas N compras del
// mismo (producto × proveedor) para que el usuario pueda contextualizar la
// variación contra la tendencia histórica, no solo contra el precio anterior.
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const alerta = await prisma.alertaPrecio.findUnique({
      where: { id },
      include: {
        producto: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            unidadCompra: true,
            unidadUso: true,
          },
        },
        proveedor: { select: { id: true, nombre: true } },
        factura: {
          select: {
            id: true,
            numero: true,
            fecha: true,
            tipoComprobante: true,
            total: true,
          },
        },
        revisadoPor: { select: { id: true, nombre: true } },
      },
    });

    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }

    // Historial: últimas 10 compras del mismo producto × proveedor.
    // SECURITY: FacturaItem no es tenant-aware, hay que filtrar por
    // factura.organizacionId para no leakear historial de otras orgs.
    const { organizacionId } = getTenant();
    const historial = await prisma.facturaItem.findMany({
      where: {
        productoId: alerta.productoId,
        precioUnitario: { gt: 0 },
        factura: alerta.proveedorId
          ? { organizacionId, proveedorId: alerta.proveedorId }
          : { organizacionId },
      },
      include: {
        factura: {
          select: {
            id: true,
            numero: true,
            fecha: true,
            proveedorId: true,
            proveedor: { select: { nombre: true } },
          },
        },
      },
      orderBy: { factura: { fecha: 'desc' } },
      take: 10,
    });

    res.json({
      alerta,
      historial: historial.map(h => ({
        facturaItemId: h.id,
        facturaId: h.factura.id,
        facturaNumero: h.factura.numero,
        fecha: h.factura.fecha,
        precio: Number(h.precioUnitario),
        cantidad: Number(h.cantidad),
        unidad: h.unidad,
        proveedorId: h.factura.proveedorId,
        proveedorNombre: h.factura.proveedor?.nombre ?? null,
      })),
    });
  } catch (error) {
    console.error('GET /alertas-precio/:id error:', error);
    res.status(500).json({ error: 'Error al obtener alerta' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/alertas-precio/bulk/revisar — marca varias como revisadas
// ---------------------------------------------------------------------------
// IMPORTANTE: declarado ANTES que /:id/revisar porque Express matchea por
// orden de declaración y /:id/revisar con id="bulk" se comería este path.
// Útil cuando el usuario revisó 10 alertas de una sesión y quiere cerrarlas
// todas de un tiro. Body: { ids: [1,2,3], observacion? }
// ---------------------------------------------------------------------------
router.put('/bulk/revisar', async (req: Request, res: Response) => {
  try {
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const { ids, observacion } = req.body as { ids: number[]; observacion?: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids debe ser un array no vacío' });
      return;
    }

    const result = await prisma.alertaPrecio.updateMany({
      where: {
        id: { in: ids.map(Number) },
        estado: 'pendiente',
      },
      data: {
        estado: 'revisada',
        revisadoPorId: usuarioId,
        fechaRevision: new Date(),
        observacion: observacion ?? undefined,
      },
    });

    res.json({ actualizadas: result.count });
  } catch (error) {
    console.error('PUT /alertas-precio/bulk/revisar error:', error);
    res.status(500).json({ error: 'Error al revisar alertas en bulk' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/alertas-precio/:id/revisar — marca como revisada (acepta)
// ---------------------------------------------------------------------------
router.put('/:id/revisar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const { observacion } = req.body as { observacion?: string };

    const alerta = await prisma.alertaPrecio.findUnique({ where: { id } });
    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }
    if (alerta.estado !== 'pendiente') {
      res.status(400).json({
        error: `La alerta ya está ${alerta.estado}, no se puede volver a revisar`,
      });
      return;
    }

    const updated = await prisma.alertaPrecio.update({
      where: { id },
      data: {
        estado: 'revisada',
        revisadoPorId: usuarioId,
        fechaRevision: new Date(),
        observacion: observacion ?? alerta.observacion,
      },
      include: {
        producto: { select: { codigo: true, nombre: true } },
        proveedor: { select: { nombre: true } },
        revisadoPor: { select: { nombre: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('PUT /alertas-precio/:id/revisar error:', error);
    res.status(500).json({ error: 'Error al revisar alerta' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/alertas-precio/:id/descartar — marca como descartada (falso positivo)
// ---------------------------------------------------------------------------
router.put('/:id/descartar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const { observacion } = req.body as { observacion?: string };

    const alerta = await prisma.alertaPrecio.findUnique({ where: { id } });
    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }
    if (alerta.estado !== 'pendiente') {
      res.status(400).json({
        error: `La alerta ya está ${alerta.estado}, no se puede volver a descartar`,
      });
      return;
    }

    const updated = await prisma.alertaPrecio.update({
      where: { id },
      data: {
        estado: 'descartada',
        revisadoPorId: usuarioId,
        fechaRevision: new Date(),
        observacion: observacion ?? alerta.observacion,
      },
      include: {
        producto: { select: { codigo: true, nombre: true } },
        proveedor: { select: { nombre: true } },
        revisadoPor: { select: { nombre: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('PUT /alertas-precio/:id/descartar error:', error);
    res.status(500).json({ error: 'Error al descartar alerta' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/alertas-precio/:id — eliminar alerta (admin / cleanup)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const alerta = await prisma.alertaPrecio.findUnique({ where: { id } });
    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }

    await prisma.alertaPrecio.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /alertas-precio/:id error:', error);
    res.status(500).json({ error: 'Error al eliminar alerta' });
  }
});

export default router;
