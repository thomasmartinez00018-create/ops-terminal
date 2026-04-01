import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { calcularStockTeorico } from '../utils/stockCalculator';

const router = Router();

// GET /api/inventarios
router.get('/', async (req: Request, res: Response) => {
  try {
    const { estado, depositoId } = req.query;
    const where: any = {};

    if (estado) where.estado = estado;
    if (depositoId) where.depositoId = parseInt(depositoId as string);

    const inventarios = await prisma.inventario.findMany({
      where,
      include: {
        usuario: { select: { nombre: true } },
        deposito: { select: { nombre: true, codigo: true } },
        _count: { select: { detalles: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(inventarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener inventarios' });
  }
});

// GET /api/inventarios/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const inventario = await prisma.inventario.findUnique({
      where: { id },
      include: {
        usuario: { select: { nombre: true } },
        deposito: { select: { nombre: true, codigo: true } },
        detalles: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true, rubro: true } }
          }
        }
      }
    });

    if (!inventario) {
      res.status(404).json({ error: 'Inventario no encontrado' });
      return;
    }

    res.json(inventario);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

// POST /api/inventarios
router.post('/', async (req: Request, res: Response) => {
  try {
    const { fecha, usuarioId, depositoId, observacion } = req.body;
    const inventario = await prisma.inventario.create({
      data: {
        fecha,
        usuarioId,
        depositoId,
        observacion,
        estado: 'abierto'
      },
      include: {
        usuario: { select: { nombre: true } },
        deposito: { select: { nombre: true, codigo: true } }
      }
    });
    res.status(201).json(inventario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear inventario' });
  }
});

// POST /api/inventarios/:id/detalles
router.post('/:id/detalles', async (req: Request, res: Response) => {
  try {
    const inventarioId = parseInt(req.params.id as string);
    const { productoId, cantidadFisica, observacion } = req.body;

    // Verificar que el inventario existe y esta abierto
    const inventario = await prisma.inventario.findUnique({
      where: { id: inventarioId }
    });

    if (!inventario) {
      res.status(404).json({ error: 'Inventario no encontrado' });
      return;
    }
    if (inventario.estado !== 'abierto') {
      res.status(400).json({ error: 'El inventario esta cerrado' });
      return;
    }

    // Calcular stock teorico
    const stockTeorico = await calcularStockTeorico(productoId, inventario.depositoId);
    const diferencia = Math.round((cantidadFisica - stockTeorico) * 100) / 100;

    // Buscar si ya existe un detalle para este producto en este inventario
    const existing = await prisma.inventarioDetalle.findFirst({
      where: { inventarioId, productoId }
    });

    let detalle;
    if (existing) {
      detalle = await prisma.inventarioDetalle.update({
        where: { id: existing.id },
        data: { cantidadFisica, stockTeorico, diferencia, observacion },
        include: {
          producto: { select: { codigo: true, nombre: true, unidadUso: true, rubro: true } }
        }
      });
    } else {
      detalle = await prisma.inventarioDetalle.create({
        data: {
          inventarioId,
          productoId,
          cantidadFisica,
          stockTeorico,
          diferencia,
          observacion
        },
        include: {
          producto: { select: { codigo: true, nombre: true, unidadUso: true, rubro: true } }
        }
      });
    }

    res.status(existing ? 200 : 201).json(detalle);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar detalle de inventario' });
  }
});

// PUT /api/inventarios/:id/cerrar
router.put('/:id/cerrar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const inventario = await prisma.inventario.findUnique({
      where: { id },
      include: { detalles: true }
    });

    if (!inventario) {
      res.status(404).json({ error: 'Inventario no encontrado' });
      return;
    }
    if (inventario.estado !== 'abierto') {
      res.status(400).json({ error: 'El inventario ya esta cerrado' });
      return;
    }

    const now = new Date();
    const fechaHoy = now.toISOString().split('T')[0];
    const horaAhora = now.toTimeString().slice(0, 5);

    // Obtener unidades de los productos con diferencia
    const detallesConDif = inventario.detalles.filter(d => d.diferencia && d.diferencia !== 0);
    const productoIds = detallesConDif.map(d => d.productoId);
    const productos = await prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, unidadUso: true }
    });
    const unidadMap = new Map(productos.map(p => [p.id, p.unidadUso]));

    // Cerrar inventario y crear movimientos de ajuste en una transaccion
    await prisma.$transaction(async (tx) => {
      // Cerrar el inventario
      await tx.inventario.update({
        where: { id },
        data: { estado: 'cerrado' }
      });

      // Crear movimientos de ajuste para cada detalle con diferencia != 0
      for (const detalle of detallesConDif) {
        await tx.movimiento.create({
          data: {
            fecha: fechaHoy,
            hora: horaAhora,
            usuarioId: inventario.usuarioId,
            tipo: 'ajuste',
            depositoDestinoId: inventario.depositoId,
            productoId: detalle.productoId,
            cantidad: detalle.diferencia!,
            unidad: unidadMap.get(detalle.productoId) || '',
            motivo: 'Diferencia de inventario',
            observacion: `Ajuste por inventario #${inventario.id}`
          }
        });
      }
    });

    const updated = await prisma.inventario.findUnique({
      where: { id },
      include: {
        usuario: { select: { nombre: true } },
        deposito: { select: { nombre: true, codigo: true } },
        detalles: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true } }
          }
        }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cerrar inventario' });
  }
});

// DELETE /api/inventarios/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const inventario = await prisma.inventario.findUnique({
      where: { id }
    });

    if (!inventario) {
      res.status(404).json({ error: 'Inventario no encontrado' });
      return;
    }
    if (inventario.estado !== 'abierto') {
      res.status(400).json({ error: 'Solo se pueden eliminar inventarios abiertos' });
      return;
    }

    await prisma.inventario.delete({ where: { id } });
    res.json({ message: 'Inventario eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar inventario' });
  }
});

// GET /api/inventarios/:id/resumen
router.get('/:id/resumen', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const inventario = await prisma.inventario.findUnique({
      where: { id },
      include: { detalles: true }
    });

    if (!inventario) {
      res.status(404).json({ error: 'Inventario no encontrado' });
      return;
    }

    const detalles = inventario.detalles;
    const totalContados = detalles.length;
    const conDiferencia = detalles.filter(d => d.diferencia && d.diferencia !== 0).length;
    const diferenciasPositivas = detalles
      .filter(d => d.diferencia && d.diferencia > 0)
      .reduce((sum, d) => sum + (d.diferencia || 0), 0);
    const diferenciasNegativas = detalles
      .filter(d => d.diferencia && d.diferencia < 0)
      .reduce((sum, d) => sum + (d.diferencia || 0), 0);

    res.json({
      inventarioId: id,
      estado: inventario.estado,
      totalContados,
      conDiferencia,
      diferenciasPositivas: Math.round(diferenciasPositivas * 100) / 100,
      diferenciasNegativas: Math.round(diferenciasNegativas * 100) / 100
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener resumen' });
  }
});

export default router;
