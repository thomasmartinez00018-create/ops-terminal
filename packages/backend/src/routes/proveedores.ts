import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/proveedores - Listar proveedores
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};

    if (activo !== undefined) where.activo = activo === 'true';

    const proveedores = await prisma.proveedor.findMany({
      where,
      include: { _count: { select: { proveedorProductos: true } } },
      orderBy: { nombre: 'asc' }
    });
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// GET /api/proveedores/comparar-precios/:productoId - Comparar precios entre proveedores
router.get('/comparar-precios/:productoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);

    const mappings = await prisma.proveedorProducto.findMany({
      where: { productoId },
      include: {
        proveedor: { select: { nombre: true, codigo: true } }
      },
      orderBy: { ultimoPrecio: 'asc' }
    });

    const result = mappings.map(m => ({
      proveedor: m.proveedor,
      nombreProveedor: m.nombreProveedor,
      ultimoPrecio: m.ultimoPrecio,
      fechaPrecio: m.fechaPrecio,
      unidadProveedor: m.unidadProveedor
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error al comparar precios' });
  }
});

// GET /api/proveedores/:id - Obtener proveedor por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        proveedorProductos: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true } }
          }
        }
      }
    });
    if (!proveedor) {
      res.status(404).json({ error: 'Proveedor no encontrado' });
      return;
    }
    res.json(proveedor);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

// POST /api/proveedores - Crear proveedor
router.post('/', async (req: Request, res: Response) => {
  try {
    const { codigo, nombre, contacto, telefono, email, whatsapp, rubro, descuentoPct, aplicaIva, aplicaPercepcion, impuestoInterno } = req.body;
    const proveedor = await prisma.proveedor.create({
      data: {
        codigo, nombre, contacto, telefono, email, whatsapp, rubro,
        descuentoPct: descuentoPct != null ? Number(descuentoPct) : 0,
        aplicaIva: aplicaIva === true || aplicaIva === 'true',
        aplicaPercepcion: aplicaPercepcion === true || aplicaPercepcion === 'true',
        impuestoInterno: impuestoInterno != null ? Number(impuestoInterno) : 0,
      }
    });
    res.status(201).json(proveedor);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un proveedor con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /api/proveedores/:id - Actualizar proveedor
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const proveedor = await prisma.proveedor.update({
      where: { id: parseInt(req.params.id as string) },
      data: req.body
    });
    res.json(proveedor);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un proveedor con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// DELETE /api/proveedores/:id - Soft delete (desactivar)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.proveedor.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Proveedor desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar proveedor' });
  }
});

// GET /api/proveedores/:id/productos - Listar productos de un proveedor
// Unifica 2 fuentes de verdad:
//   1. ProveedorProducto — mapeos "aplicados" (facturas confirmadas,
//      matches manuales, match-ai aplicado). Tienen productoId interno
//      vinculado y último precio.
//   2. ListaPrecioItem sin proveedorProductoId — items que la IA matcheó
//      pero el usuario no aplicó todavía, o items de listas importadas
//      sin matching. Son precios reales del proveedor aunque no haya un
//      producto interno vinculado.
// Si solo devolvíamos el #1, un proveedor con lista importada y matches
// pendientes se veía como "sin precios asignados" aunque visualmente en
// la pantalla de Listas de Precios mostrara 279 matcheados. Este endpoint
// ahora refleja lo que el cliente espera ver.
router.get('/:id/productos', async (req: Request, res: Response) => {
  try {
    const proveedorId = parseInt(req.params.id as string);

    const [proveedorProductos, itemsListas] = await Promise.all([
      prisma.proveedorProducto.findMany({
        where: { proveedorId },
        include: { producto: true },
        orderBy: { nombreProveedor: 'asc' },
      }),
      // Items de listas de precio activos, sin mapping aplicado, pero
      // potencialmente con match-ai pendiente. Los agrupamos por nombre
      // de producto original → dejamos solo el precio más reciente por
      // nombre (no duplicar si el mismo producto está en 3 listas).
      prisma.listaPrecioItem.findMany({
        where: {
          activo: true,
          proveedorProductoId: null,
          listaPrecio: { proveedorId },
        },
        include: {
          listaPrecio: { select: { id: true, codigo: true, fecha: true } },
        },
        orderBy: { id: 'desc' },
      }),
    ]);

    // Dedupe: si dos items tienen mismo nombre, quedamos con el más nuevo
    // (primero en la lista orderBy id desc).
    const nombresYaEnPP = new Set(
      proveedorProductos.map((p: any) => (p.nombreProveedor || '').toLowerCase().trim())
    );
    const seen = new Set<string>();
    const pseudoPP: any[] = [];
    for (const it of itemsListas) {
      const key = (it.productoOriginal || '').toLowerCase().trim();
      if (!key || seen.has(key) || nombresYaEnPP.has(key)) continue;
      seen.add(key);
      pseudoPP.push({
        // id string para evitar colisión con ProveedorProducto.id numérico;
        // el frontend no debe intentar Edit/Delete sobre estos.
        id: `lp-${it.id}`,
        fuente: 'lista',
        listaPrecioId: it.listaPrecio.id,
        listaPrecioCodigo: it.listaPrecio.codigo,
        listaItemId: it.id,
        productoId: null,
        producto: null,
        nombreProveedor: it.productoOriginal,
        codigoProveedor: null,
        unidadProveedor: it.unidadMedida || null,
        factorConversion: it.cantidadPorUnidad || null,
        presentacionOriginal: it.presentacionOriginal || null,
        ultimoPrecio: it.precioPorUnidad ?? it.precioInformado ?? 0,
        fechaPrecio: it.listaPrecio.fecha,
      });
    }

    // Marcar los directos como fuente 'directo' para que el frontend pueda
    // mostrar badge consistente.
    const directos = proveedorProductos.map((p: any) => ({ ...p, fuente: 'directo' }));

    res.json([...directos, ...pseudoPP]);
  } catch (error) {
    console.error('[proveedores/:id/productos]', error);
    res.status(500).json({ error: 'Error al obtener productos del proveedor' });
  }
});

// POST /api/proveedores/:id/productos - Crear mapeo producto-proveedor
router.post('/:id/productos', async (req: Request, res: Response) => {
  try {
    const proveedorId = parseInt(req.params.id as string);
    const { productoId, nombreProveedor, codigoProveedor, unidadProveedor, factorConversion, ultimoPrecio, fechaPrecio } = req.body;

    const mapping = await prisma.proveedorProducto.create({
      data: {
        proveedorId,
        productoId,
        nombreProveedor,
        codigoProveedor,
        unidadProveedor,
        factorConversion,
        ultimoPrecio,
        fechaPrecio: fechaPrecio ? new Date(fechaPrecio as string).toISOString() : undefined
      }
    });
    res.status(201).json(mapping);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Este producto ya está mapeado a este proveedor' });
      return;
    }
    res.status(500).json({ error: 'Error al crear mapeo de producto' });
  }
});

// PUT /api/proveedores/:id/productos/:mapId - Actualizar mapeo producto-proveedor
router.put('/:id/productos/:mapId', async (req: Request, res: Response) => {
  try {
    const mapping = await prisma.proveedorProducto.update({
      where: { id: parseInt(req.params.mapId as string) },
      data: req.body
    });
    res.json(mapping);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Este producto ya está mapeado a este proveedor' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar mapeo de producto' });
  }
});

// DELETE /api/proveedores/:id/productos/:mapId - Eliminar mapeo producto-proveedor
router.delete('/:id/productos/:mapId', async (req: Request, res: Response) => {
  try {
    await prisma.proveedorProducto.delete({
      where: { id: parseInt(req.params.mapId as string) }
    });
    res.json({ message: 'Mapeo de producto eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar mapeo de producto' });
  }
});

export default router;
