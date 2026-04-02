import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/elaboraciones
router.get('/', async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta, productoId } = req.query;
    const where: any = {};
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }
    if (productoId) where.productoResultadoId = parseInt(productoId as string);

    const lotes = await prisma.elaboracionLote.findMany({
      where,
      include: {
        productoResultado: { select: { id: true, nombre: true, unidadUso: true } },
        receta: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        movimientos: {
          where: { tipo: 'consumo_interno' },
          include: {
            producto: { select: { nombre: true, unidadUso: true } },
            depositoOrigen: { select: { nombre: true } },
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json(lotes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener elaboraciones' });
  }
});

// POST /api/elaboraciones
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      productoResultadoId, cantidadProducida, unidadProducida,
      depositoDestinoId, recetaId, usuarioId, fecha, hora,
      observacion, ingredientes
    } = req.body;

    if (!productoResultadoId || !cantidadProducida || !usuarioId || !ingredientes?.length) {
      res.status(400).json({ error: 'Faltan datos requeridos: producto, cantidad, usuario e ingredientes' });
      return;
    }

    const fechaFinal = fecha || new Date().toISOString().split('T')[0];
    const horaFinal = hora || new Date().toTimeString().slice(0, 5);

    const lote = await prisma.$transaction(async (tx) => {
      // Auto-generate code ELAB-XXX inside transaction to avoid race conditions
      const lastLote = await tx.elaboracionLote.findFirst({ orderBy: { id: 'desc' }, select: { codigo: true } });
      let nextNum = 1;
      if (lastLote) {
        const match = lastLote.codigo.match(/ELAB-(\d+)/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      const codigo = `ELAB-${String(nextNum).padStart(3, '0')}`;

      // Create the elaboracion lote
      const lote = await tx.elaboracionLote.create({
        data: {
          codigo,
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          recetaId: recetaId ? Number(recetaId) : null,
          productoResultadoId: Number(productoResultadoId),
          cantidadProducida: Number(cantidadProducida),
          unidadProducida: unidadProducida || 'unidad',
          depositoDestinoId: depositoDestinoId ? Number(depositoDestinoId) : null,
          observacion: observacion || null,
        }
      });

      // Movement 1: elaboracion (OUTPUT — product created, goes to destination depot)
      await tx.movimiento.create({
        data: {
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          tipo: 'elaboracion',
          productoId: Number(productoResultadoId),
          cantidad: Number(cantidadProducida),
          unidad: unidadProducida || 'unidad',
          depositoDestinoId: depositoDestinoId ? Number(depositoDestinoId) : null,
          documentoRef: codigo,
          observacion: `Elaboración ${codigo}${observacion ? ': ' + observacion : ''}`,
          elaboracionLoteId: lote.id,
        }
      });

      // Movements for each ingredient: consumo_interno (INPUT — raw ingredients consumed)
      for (const ing of ingredientes) {
        if (Number(ing.cantidad) > 0) {
          await tx.movimiento.create({
            data: {
              fecha: fechaFinal,
              hora: horaFinal,
              usuarioId: Number(usuarioId),
              tipo: 'consumo_interno',
              productoId: Number(ing.productoId),
              cantidad: Number(ing.cantidad),
              unidad: ing.unidad || 'unidad',
              depositoOrigenId: ing.depositoOrigenId ? Number(ing.depositoOrigenId) : null,
              motivo: `Elaboración ${codigo}`,
              documentoRef: codigo,
              observacion: observacion || null,
              elaboracionLoteId: lote.id,
            }
          });
        }
      }

      return lote;
    });

    // Return full lote
    const full = await prisma.elaboracionLote.findUnique({
      where: { id: lote.id },
      include: {
        productoResultado: { select: { nombre: true, unidadUso: true } },
        receta: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        movimientos: {
          include: {
            producto: { select: { nombre: true } },
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
          }
        }
      }
    });

    res.status(201).json(full);
  } catch (error: any) {
    console.error('[elaboraciones/post]', error);
    res.status(500).json({ error: error.message || 'Error al registrar elaboración' });
  }
});

// GET /api/elaboraciones/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lote = await prisma.elaboracionLote.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        productoResultado: { select: { nombre: true, unidadUso: true } },
        receta: { select: { nombre: true, porciones: true } },
        usuario: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        movimientos: {
          include: {
            producto: { select: { nombre: true, unidadUso: true } },
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
          }
        }
      }
    });
    if (!lote) {
      res.status(404).json({ error: 'Elaboración no encontrada' });
      return;
    }
    res.json(lote);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener elaboración' });
  }
});

export default router;
