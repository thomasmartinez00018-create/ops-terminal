import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/ordenes-compra
router.get('/', async (req: Request, res: Response) => {
  try {
    const { estado, proveedorId, responsableId, activas } = req.query;
    const where: any = {};

    if (estado) where.estado = estado;
    // activas=true → solo pendiente + parcial (sin recibidas ni canceladas)
    if (activas === 'true') where.estado = { in: ['pendiente', 'parcial'] };
    if (proveedorId) where.proveedorId = parseInt(proveedorId as string);
    if (responsableId) where.responsableId = parseInt(responsableId as string);

    const ordenes = await prisma.ordenCompra.findMany({
      where,
      include: {
        proveedor: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        _count: { select: { items: true, recepciones: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(ordenes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener órdenes de compra' });
  }
});

// GET /api/ordenes-compra/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const orden = await prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        creadoPor: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        items: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadCompra: true } }
          }
        },
        recepciones: {
          include: {
            recibidoPor: { select: { nombre: true } },
            items: {
              include: {
                producto: { select: { codigo: true, nombre: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!orden) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }

    res.json(orden);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener orden de compra' });
  }
});

// POST /api/ordenes-compra
router.post('/', async (req: Request, res: Response) => {
  try {
    const { proveedorId, creadoPorId, responsableId, depositoDestinoId, observacion, items } = req.body;

    // Auto-generar código OC-XXX
    const lastOC = await prisma.ordenCompra.findFirst({
      orderBy: { id: 'desc' },
      select: { codigo: true }
    });
    let nextNum = 1;
    if (lastOC) {
      const match = lastOC.codigo.match(/OC-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const codigo = `OC-${String(nextNum).padStart(3, '0')}`;

    const hoy = new Date().toISOString().split('T')[0];

    const orden = await prisma.ordenCompra.create({
      data: {
        codigo,
        fecha: hoy,
        proveedorId,
        creadoPorId,
        responsableId,
        depositoDestinoId: depositoDestinoId || null,
        observacion,
        items: {
          create: items.map((item: any) => ({
            productoId: item.productoId,
            cantidadPedida: item.cantidadPedida,
            unidad: item.unidad,
            precioEstimado: item.precioEstimado || null
          }))
        }
      },
      include: {
        proveedor: { select: { nombre: true } },
        creadoPor: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        items: {
          include: {
            producto: { select: { codigo: true, nombre: true } }
          }
        }
      }
    });

    res.status(201).json(orden);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear orden de compra' });
  }
});

// PUT /api/ordenes-compra/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { responsableId, depositoDestinoId, observacion, items } = req.body;

    const orden = await prisma.ordenCompra.findUnique({ where: { id } });
    if (!orden) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }
    if (orden.estado !== 'pendiente') {
      res.status(400).json({ error: 'Solo se pueden editar órdenes pendientes' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.ordenCompra.update({
        where: { id },
        data: { responsableId, depositoDestinoId, observacion }
      });

      if (items) {
        await tx.ordenCompraItem.deleteMany({ where: { ordenCompraId: id } });
        for (const item of items) {
          await tx.ordenCompraItem.create({
            data: {
              ordenCompraId: id,
              productoId: item.productoId,
              cantidadPedida: item.cantidadPedida,
              unidad: item.unidad,
              precioEstimado: item.precioEstimado || null
            }
          });
        }
      }
    });

    const updated = await prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        proveedor: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
        items: { include: { producto: { select: { codigo: true, nombre: true } } } }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar orden de compra' });
  }
});

// PUT /api/ordenes-compra/:id/cancelar
router.put('/:id/cancelar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const orden = await prisma.ordenCompra.findUnique({ where: { id } });

    if (!orden) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }
    if (orden.estado === 'recibida' || orden.estado === 'cancelada') {
      res.status(400).json({ error: 'No se puede cancelar esta orden' });
      return;
    }

    const updated = await prisma.ordenCompra.update({
      where: { id },
      data: { estado: 'cancelada' }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cancelar orden' });
  }
});

// POST /api/ordenes-compra/:id/recibir
router.post('/:id/recibir', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { recibidoPorId, observacion, items, depositoDestinoId } = req.body;

    const orden = await prisma.ordenCompra.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!orden) {
      res.status(404).json({ error: 'Orden no encontrada' });
      return;
    }
    if (orden.estado === 'cancelada' || orden.estado === 'recibida') {
      res.status(400).json({ error: 'No se puede recibir esta orden' });
      return;
    }

    const now = new Date();
    const fecha = now.toISOString().split('T')[0];
    const hora = now.toTimeString().slice(0, 5);
    const depDestinoId = depositoDestinoId || orden.depositoDestinoId;

    const recepcion = await prisma.$transaction(async (tx) => {
      // Crear recepción
      const rec = await tx.recepcion.create({
        data: {
          ordenCompraId: id,
          fecha,
          hora,
          recibidoPorId,
          observacion,
          items: {
            create: items.map((item: any) => ({
              productoId: item.productoId,
              cantidadRecibida: item.cantidadRecibida,
              unidad: item.unidad,
              costoUnitario: item.costoUnitario || null,
              lote: item.lote || null,
              observacion: item.observacion || null
            }))
          }
        }
      });

      // Crear movimientos de ingreso por cada item recibido
      for (const item of items) {
        if (item.cantidadRecibida > 0) {
          await tx.movimiento.create({
            data: {
              fecha,
              hora,
              usuarioId: recibidoPorId,
              tipo: 'ingreso',
              depositoDestinoId: depDestinoId,
              productoId: item.productoId,
              cantidad: item.cantidadRecibida,
              unidad: item.unidad,
              costoUnitario: item.costoUnitario || null,
              lote: item.lote || null,
              proveedorId: orden.proveedorId,
              documentoRef: orden.codigo,
              observacion: `Recepción de ${orden.codigo}`,
              recepcionId: rec.id
            }
          });
        }
      }

      // Determinar nuevo estado: comparar total pedido vs total recibido (incluyendo recepciones anteriores)
      const todasRecepciones = await tx.recepcion.findMany({
        where: { ordenCompraId: id },
        include: { items: true }
      });

      // Sumar todo lo recibido por producto
      const recibidoPorProducto = new Map<number, number>();
      for (const r of todasRecepciones) {
        for (const ri of r.items) {
          recibidoPorProducto.set(ri.productoId, (recibidoPorProducto.get(ri.productoId) || 0) + ri.cantidadRecibida);
        }
      }
      // Sumar lo de esta recepción también
      for (const item of items) {
        recibidoPorProducto.set(item.productoId, (recibidoPorProducto.get(item.productoId) || 0) + item.cantidadRecibida);
      }

      let todoRecibido = true;
      for (const ocItem of orden.items) {
        const recibido = recibidoPorProducto.get(ocItem.productoId) || 0;
        if (recibido < ocItem.cantidadPedida) {
          todoRecibido = false;
          break;
        }
      }

      const nuevoEstado = todoRecibido ? 'recibida' : 'parcial';
      await tx.ordenCompra.update({
        where: { id },
        data: { estado: nuevoEstado }
      });

      return rec;
    });

    const recepcionCompleta = await prisma.recepcion.findUnique({
      where: { id: recepcion.id },
      include: {
        recibidoPor: { select: { nombre: true } },
        items: {
          include: { producto: { select: { codigo: true, nombre: true } } }
        }
      }
    });

    res.status(201).json(recepcionCompleta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al recibir orden' });
  }
});

export default router;
