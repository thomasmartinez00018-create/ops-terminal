import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/porcionado — Listar porcionados
router.get('/', async (req: Request, res: Response) => {
  try {
    const { fechaDesde, fechaHasta, productoOrigenId } = req.query;
    const where: any = {};
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde as string;
      if (fechaHasta) where.fecha.lte = fechaHasta as string;
    }
    if (productoOrigenId) where.productoOrigenId = parseInt(productoOrigenId as string);

    const porcionados = await prisma.porcionado.findMany({
      where,
      include: {
        productoOrigen: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        elaboracionLote: { select: { codigo: true } },
        items: {
          include: {
            producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
            depositoDestino: { select: { nombre: true } },
          }
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(porcionados);
  } catch (error: any) {
    console.error('[porcionado/get]', error);
    res.status(500).json({ error: 'Error al obtener porcionados' });
  }
});

// POST /api/porcionado — Registrar porcionado
// Toma un producto elaborado y lo divide en N sub-productos
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      productoOrigenId, cantidadOrigen, unidadOrigen,
      depositoOrigenId, elaboracionLoteId, usuarioId,
      fecha, hora, merma, observacion, items,
    } = req.body;

    if (!productoOrigenId || !cantidadOrigen || !usuarioId || !items?.length) {
      res.status(400).json({ error: 'Faltan datos: producto origen, cantidad, usuario e items' });
      return;
    }

    const fechaFinal = fecha || new Date().toISOString().split('T')[0];
    const horaFinal = hora || new Date().toTimeString().slice(0, 5);

    const resultado = await prisma.$transaction(async (tx) => {
      // Auto-generate code POR-XXX
      const last = await tx.porcionado.findFirst({ orderBy: { id: 'desc' }, select: { codigo: true } });
      let nextNum = 1;
      if (last) {
        const match = last.codigo.match(/POR-(\d+)/);
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      const codigo = `POR-${String(nextNum).padStart(3, '0')}`;

      // Crear porcionado
      const porcionado = await tx.porcionado.create({
        data: {
          codigo,
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          elaboracionLoteId: elaboracionLoteId ? Number(elaboracionLoteId) : null,
          productoOrigenId: Number(productoOrigenId),
          cantidadOrigen: Number(cantidadOrigen),
          unidadOrigen: unidadOrigen || 'kg',
          depositoOrigenId: depositoOrigenId ? Number(depositoOrigenId) : null,
          merma: Number(merma || 0),
          observacion: observacion || null,
        }
      });

      // Crear items
      for (const item of items) {
        await tx.porcionadoItem.create({
          data: {
            porcionadoId: porcionado.id,
            productoId: Number(item.productoId),
            cantidad: Number(item.cantidad),
            pesoUnidad: Number(item.pesoUnidad),
            unidad: item.unidad || 'kg',
            depositoDestinoId: item.depositoDestinoId ? Number(item.depositoDestinoId) : null,
          }
        });
      }

      // Movimiento de consumo: sacar producto origen del stock
      await tx.movimiento.create({
        data: {
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          tipo: 'consumo_interno',
          productoId: Number(productoOrigenId),
          cantidad: Number(cantidadOrigen),
          unidad: unidadOrigen || 'kg',
          depositoOrigenId: depositoOrigenId ? Number(depositoOrigenId) : null,
          motivo: `Porcionado ${codigo}`,
          documentoRef: codigo,
          porcionadoId: porcionado.id,
        }
      });

      // Movimientos de ingreso: cada sub-producto entra al stock
      for (const item of items) {
        const cantidadTotal = Number(item.cantidad) * Number(item.pesoUnidad);
        await tx.movimiento.create({
          data: {
            fecha: fechaFinal,
            hora: horaFinal,
            usuarioId: Number(usuarioId),
            tipo: 'elaboracion',
            productoId: Number(item.productoId),
            cantidad: cantidadTotal,
            unidad: item.unidad || 'kg',
            depositoDestinoId: item.depositoDestinoId ? Number(item.depositoDestinoId) : null,
            documentoRef: codigo,
            observacion: `${item.cantidad} unidades x ${item.pesoUnidad} ${item.unidad || 'kg'} c/u`,
            porcionadoId: porcionado.id,
          }
        });
      }

      // Si hay merma, registrarla
      if (Number(merma) > 0) {
        await tx.movimiento.create({
          data: {
            fecha: fechaFinal,
            hora: horaFinal,
            usuarioId: Number(usuarioId),
            tipo: 'merma',
            productoId: Number(productoOrigenId),
            cantidad: Number(merma),
            unidad: unidadOrigen || 'kg',
            depositoOrigenId: depositoOrigenId ? Number(depositoOrigenId) : null,
            motivo: 'Merma de porcionado',
            documentoRef: codigo,
            porcionadoId: porcionado.id,
          }
        });
      }

      return porcionado;
    });

    // Return full object
    const full = await prisma.porcionado.findUnique({
      where: { id: resultado.id },
      include: {
        productoOrigen: { select: { nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        elaboracionLote: { select: { codigo: true } },
        items: {
          include: {
            producto: { select: { nombre: true, unidadUso: true } },
            depositoDestino: { select: { nombre: true } },
          }
        },
        movimientos: {
          include: {
            producto: { select: { nombre: true } },
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
          }
        },
      }
    });

    res.status(201).json(full);
  } catch (error: any) {
    console.error('[porcionado/post]', error);
    res.status(500).json({ error: error.message || 'Error al registrar porcionado' });
  }
});

// GET /api/porcionado/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const porcionado = await prisma.porcionado.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        productoOrigen: { select: { nombre: true, unidadUso: true } },
        usuario: { select: { nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        elaboracionLote: { select: { codigo: true } },
        items: {
          include: {
            producto: { select: { nombre: true, unidadUso: true } },
            depositoDestino: { select: { nombre: true } },
          }
        },
        movimientos: {
          include: {
            producto: { select: { nombre: true } },
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
          }
        },
      }
    });

    if (!porcionado) {
      res.status(404).json({ error: 'Porcionado no encontrado' });
      return;
    }
    res.json(porcionado);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener porcionado' });
  }
});

export default router;
