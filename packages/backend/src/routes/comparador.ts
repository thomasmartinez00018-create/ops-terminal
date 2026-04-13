import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/comparador — Main comparative data
// Returns all matched price list items with product + proveedor info
router.get('/', async (req: Request, res: Response) => {
  try {
    const { categoria, productoId, desde, hasta } = req.query;

    // Build where for ListaPrecioItem
    const where: any = { estadoMatch: 'OK', activo: true };

    // Filter by date range on parent ListaPrecio
    const listaWhere: any = {};
    if (desde || hasta) {
      listaWhere.fecha = {};
      if (desde) listaWhere.fecha.gte = desde as string;
      if (hasta) listaWhere.fecha.lte = hasta as string;
    }

    const items = await prisma.listaPrecioItem.findMany({
      where: {
        ...where,
        listaPrecio: listaWhere,
        proveedorProducto: productoId
          ? { productoId: Number(productoId) }
          : undefined,
      },
      include: {
        listaPrecio: {
          select: { fecha: true, proveedorId: true, proveedor: { select: { id: true, nombre: true, codigo: true } } },
        },
        proveedorProducto: {
          include: {
            producto: { select: { id: true, codigo: true, nombre: true, rubro: true, unidadUso: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    // Filter by category if requested
    let result = items.map((item: any) => ({
      id: item.id,
      productoId: item.proveedorProducto?.producto?.id,
      codigoProducto: item.proveedorProducto?.producto?.codigo,
      productoEstandar: item.proveedorProducto?.producto?.nombre,
      categoria: item.proveedorProducto?.producto?.rubro,
      proveedorId: item.listaPrecio?.proveedor?.id,
      proveedorNombre: item.listaPrecio?.proveedor?.nombre,
      proveedorCodigo: item.listaPrecio?.proveedor?.codigo,
      fecha: item.listaPrecio?.fecha,
      productoOriginal: item.productoOriginal,
      presentacionOriginal: item.presentacionOriginal,
      tipoCompra: item.tipoCompra,
      cantidadPorUnidad: item.cantidadPorUnidad,
      unidadMedida: item.unidadMedida,
      precioInformado: item.precioInformado,
      precioPorUnidad: item.precioPorUnidad,
      precioPorMedidaBase: item.precioPorMedidaBase,
    }));

    if (categoria) {
      result = result.filter((r: any) => r.categoria === categoria);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[comparador/get]', error);
    res.status(500).json({ error: 'Error al obtener datos comparativos' });
  }
});

// GET /api/comparador/evolucion/:productoId — Price evolution for one product
router.get('/evolucion/:productoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);
    const { desde, hasta } = req.query;

    const listaWhere: any = {};
    if (desde || hasta) {
      listaWhere.fecha = {};
      if (desde) listaWhere.fecha.gte = desde as string;
      if (hasta) listaWhere.fecha.lte = hasta as string;
    }

    const items = await prisma.listaPrecioItem.findMany({
      where: {
        estadoMatch: 'OK',
        activo: true,
        proveedorProducto: { productoId },
        listaPrecio: listaWhere,
      },
      include: {
        listaPrecio: {
          select: { fecha: true, proveedor: { select: { id: true, nombre: true } } },
        },
      },
      orderBy: { listaPrecio: { fecha: 'asc' } },
    });

    const result = items.map((item: any) => ({
      fecha: item.listaPrecio?.fecha,
      proveedorId: item.listaPrecio?.proveedor?.id,
      proveedorNombre: item.listaPrecio?.proveedor?.nombre,
      precioInformado: item.precioInformado,
      precioPorUnidad: item.precioPorUnidad,
      precioPorMedidaBase: item.precioPorMedidaBase,
      presentacionOriginal: item.presentacionOriginal,
    }));

    res.json(result);
  } catch (error: any) {
    console.error('[comparador/evolucion]', error);
    res.status(500).json({ error: 'Error al obtener evolución' });
  }
});

// GET /api/comparador/proveedores-impuestos — Proveedores with tax fields + multiplier
router.get('/proveedores-impuestos', async (_req: Request, res: Response) => {
  try {
    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      select: {
        id: true, codigo: true, nombre: true, whatsapp: true,
        descuentoPct: true, aplicaIva: true, aplicaPercepcion: true, impuestoInterno: true,
      },
      orderBy: { nombre: 'asc' },
    });

    const result = proveedores.map((p: any) => ({
      ...p,
      multiplicador:
        (1 - (p.descuentoPct || 0) / 100) *
        (1 + (p.aplicaIva ? 0.21 : 0)) *
        (1 + (p.aplicaPercepcion ? 0.03 : 0)) *
        (1 + (p.impuestoInterno || 0) / 100),
    }));

    res.json(result);
  } catch (error: any) {
    console.error('[comparador/proveedores-impuestos]', error);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

export default router;
