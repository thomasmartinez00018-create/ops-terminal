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

    // Validación temprana (antes de abrir transacción) — cada item debe tener
    // productoId + cantidad y pesoUnidad > 0 para evitar movimientos con
    // cantidad 0 o NaN por multiplicación. Sin esto, un pesoUnidad=0 o un
    // item.cantidad=null generaba movimientos fantasma de cantidad 0.
    const cantidadOrigenNum = Number(cantidadOrigen);
    if (!Number.isFinite(cantidadOrigenNum) || cantidadOrigenNum <= 0) {
      res.status(400).json({ error: 'cantidadOrigen debe ser un número mayor a cero' });
      return;
    }
    type ItemValidado = {
      productoId: number;
      cantidad: number;
      pesoUnidad: number;
      unidad: string;
      depositoDestinoId: number | null;
    };
    const itemsValidados: ItemValidado[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const pid = Number(it?.productoId);
      const qty = Number(it?.cantidad);
      const peso = Number(it?.pesoUnidad);
      if (!Number.isInteger(pid) || pid <= 0) {
        res.status(400).json({ error: `Item ${i + 1}: productoId inválido` });
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: `Item ${i + 1}: cantidad debe ser mayor a cero` });
        return;
      }
      if (!Number.isFinite(peso) || peso <= 0) {
        res.status(400).json({ error: `Item ${i + 1}: pesoUnidad debe ser mayor a cero` });
        return;
      }
      itemsValidados.push({
        productoId: pid,
        cantidad: qty,
        pesoUnidad: peso,
        unidad: it.unidad || 'kg',
        depositoDestinoId: it.depositoDestinoId ? Number(it.depositoDestinoId) : null,
      });
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

      // Crear items en batch (1 query vs N)
      await tx.porcionadoItem.createMany({
        data: itemsValidados.map((v) => ({
          porcionadoId: porcionado.id,
          productoId: v.productoId,
          cantidad: v.cantidad,
          pesoUnidad: v.pesoUnidad,
          unidad: v.unidad,
          depositoDestinoId: v.depositoDestinoId,
        })),
      });

      // Todos los movimientos (consumo + ingresos + merma opcional) en 1 batch.
      // Reduce de 1 + N + 1 queries a 1 sola.
      const mermaNum = Number(merma) || 0;
      const movsData: any[] = [
        {
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          tipo: 'consumo_interno',
          productoId: Number(productoOrigenId),
          cantidad: cantidadOrigenNum,
          unidad: unidadOrigen || 'kg',
          depositoOrigenId: depositoOrigenId ? Number(depositoOrigenId) : null,
          motivo: `Porcionado ${codigo}`,
          documentoRef: codigo,
          porcionadoId: porcionado.id,
        },
        ...itemsValidados.map((v) => ({
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          tipo: 'elaboracion',
          productoId: v.productoId,
          cantidad: v.cantidad * v.pesoUnidad,
          unidad: v.unidad,
          depositoDestinoId: v.depositoDestinoId,
          documentoRef: codigo,
          observacion: `${v.cantidad} unidades x ${v.pesoUnidad} ${v.unidad} c/u`,
          porcionadoId: porcionado.id,
        })),
      ];
      if (mermaNum > 0) {
        movsData.push({
          fecha: fechaFinal,
          hora: horaFinal,
          usuarioId: Number(usuarioId),
          tipo: 'merma',
          productoId: Number(productoOrigenId),
          cantidad: mermaNum,
          unidad: unidadOrigen || 'kg',
          depositoOrigenId: depositoOrigenId ? Number(depositoOrigenId) : null,
          motivo: 'Merma de porcionado',
          documentoRef: codigo,
          porcionadoId: porcionado.id,
        });
      }
      await tx.movimiento.createMany({ data: movsData });

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
