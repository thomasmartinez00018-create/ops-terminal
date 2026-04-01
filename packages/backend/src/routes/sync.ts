import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// ─── Formato canónico de sincronización ────────────────────────────────────────
// Compartido entre OPS Terminal y Gestión de Proveedores
// {
//   version: "1.0",
//   source: "ops-terminal" | "gestion-proveedores",
//   exportedAt: ISO string,
//   productos: [{ codigo, nombre, rubro, unidad, precioRef? }],
//   proveedores: [{ codigo, nombre, contacto?, telefono?, email? }],
//   precios: [{ codigoProducto, codigoProveedor, nombreProductoProveedor, precio, unidad, fecha? }]
// }

// GET /api/sync/export — exporta todo el catálogo para sincronizar
router.get('/export', async (_req: Request, res: Response) => {
  try {
    const [productos, proveedores, precios] = await Promise.all([
      prisma.producto.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
      prisma.proveedorProducto.findMany({
        include: { proveedor: true, producto: true }
      }),
    ]);

    const payload = {
      version: '1.0',
      source: 'ops-terminal',
      exportedAt: new Date().toISOString(),
      productos: productos.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        rubro: p.rubro,
        unidad: p.unidadUso,
        precioRef: null,
      })),
      proveedores: proveedores.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        contacto: p.contacto || '',
        telefono: p.telefono || '',
        email: p.email || '',
      })),
      precios: precios.map(pp => ({
        codigoProducto: pp.producto.codigo,
        codigoProveedor: pp.proveedor.codigo,
        nombreProductoProveedor: pp.nombreProveedor,
        precio: pp.ultimoPrecio || 0,
        unidad: pp.unidadProveedor || pp.producto.unidadUso,
        fecha: pp.fechaPrecio || null,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ops-terminal-sync-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

// POST /api/sync/import — importa desde gestion-proveedores (o cualquier fuente con el formato canónico)
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { productos = [], proveedores = [], precios = [], source } = req.body;

    if (!Array.isArray(productos) && !Array.isArray(proveedores)) {
      return res.status(400).json({ error: 'Formato de datos inválido' });
    }

    let productosInsertados = 0, productosActualizados = 0;
    let proveedoresInsertados = 0, proveedoresActualizados = 0;
    let preciosUpserted = 0;
    const errores: string[] = [];

    // ── Upsert productos ────────────────────────────────────────────────────────
    for (const p of productos) {
      if (!p.codigo || !p.nombre) continue;
      try {
        const existing = await prisma.producto.findUnique({ where: { codigo: p.codigo } });
        if (existing) {
          // Actualizar solo campos que vengan del sync y no sobrescribir datos operativos
          await prisma.producto.update({
            where: { codigo: p.codigo },
            data: {
              nombre: p.nombre,
              rubro: p.rubro || existing.rubro,
              unidadUso: p.unidad || existing.unidadUso,
            },
          });
          productosActualizados++;
        } else {
          await prisma.producto.create({
            data: {
              codigo: p.codigo,
              nombre: p.nombre,
              rubro: p.rubro || 'General',
              tipo: p.tipo || 'insumo',
              unidadCompra: p.unidad || 'unidad',
              unidadUso: p.unidad || 'unidad',
            },
          });
          productosInsertados++;
        }
      } catch (e: any) {
        errores.push(`Producto ${p.codigo}: ${e.message}`);
      }
    }

    // ── Upsert proveedores ──────────────────────────────────────────────────────
    for (const p of proveedores) {
      if (!p.codigo || !p.nombre) continue;
      try {
        const existing = await prisma.proveedor.findUnique({ where: { codigo: p.codigo } });
        if (existing) {
          await prisma.proveedor.update({
            where: { codigo: p.codigo },
            data: {
              nombre: p.nombre,
              contacto: p.contacto || existing.contacto,
              telefono: p.telefono || existing.telefono,
              email: p.email || existing.email,
            },
          });
          proveedoresActualizados++;
        } else {
          await prisma.proveedor.create({
            data: {
              codigo: p.codigo,
              nombre: p.nombre,
              contacto: p.contacto || null,
              telefono: p.telefono || null,
              email: p.email || null,
            },
          });
          proveedoresInsertados++;
        }
      } catch (e: any) {
        errores.push(`Proveedor ${p.codigo}: ${e.message}`);
      }
    }

    // ── Upsert precios (proveedor_productos) ────────────────────────────────────
    for (const pr of precios) {
      if (!pr.codigoProducto || !pr.codigoProveedor || !pr.precio) continue;
      try {
        const [producto, proveedor] = await Promise.all([
          prisma.producto.findUnique({ where: { codigo: pr.codigoProducto } }),
          prisma.proveedor.findUnique({ where: { codigo: pr.codigoProveedor } }),
        ]);
        if (!producto || !proveedor) continue;

        const existing = await prisma.proveedorProducto.findFirst({
          where: { proveedorId: proveedor.id, productoId: producto.id },
        });

        if (existing) {
          await prisma.proveedorProducto.update({
            where: { id: existing.id },
            data: {
              nombreProveedor: pr.nombreProductoProveedor || existing.nombreProveedor,
              ultimoPrecio: pr.precio,
              fechaPrecio: pr.fecha || existing.fechaPrecio,
              unidadProveedor: pr.unidad || existing.unidadProveedor,
            },
          });
        } else {
          await prisma.proveedorProducto.create({
            data: {
              proveedorId: proveedor.id,
              productoId: producto.id,
              nombreProveedor: pr.nombreProductoProveedor || pr.codigoProducto,
              ultimoPrecio: pr.precio,
              fechaPrecio: pr.fecha || null,
              unidadProveedor: pr.unidad || null,
            },
          });
        }
        preciosUpserted++;
      } catch (e: any) {
        errores.push(`Precio ${pr.codigoProducto}/${pr.codigoProveedor}: ${e.message}`);
      }
    }

    res.json({
      ok: true,
      source: source || 'desconocido',
      productosInsertados,
      productosActualizados,
      proveedoresInsertados,
      proveedoresActualizados,
      preciosUpserted,
      errores,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al importar datos', detail: error.message });
  }
});

export default router;
