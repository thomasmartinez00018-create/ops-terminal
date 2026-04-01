import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/movimientos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tipo, productoId, depositoId, fechaDesde, fechaHasta, limit } = req.query;
    const where: any = {};

    if (tipo) where.tipo = tipo;
    if (productoId) where.productoId = parseInt(productoId as string);
    if (depositoId) {
      where.OR = [
        { depositoOrigenId: parseInt(depositoId as string) },
        { depositoDestinoId: parseInt(depositoId as string) }
      ];
    }
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = fechaDesde;
      if (fechaHasta) where.fecha.lte = fechaHasta;
    }

    const movimientos = await prisma.movimiento.findMany({
      where,
      include: {
        usuario: { select: { nombre: true } },
        producto: { select: { codigo: true, nombre: true, unidadUso: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } },
        proveedor: { select: { nombre: true } }
      },
      orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
      take: limit ? parseInt(limit as string) : 100
    });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener movimientos' });
  }
});

// POST /api/movimientos
router.post('/', async (req: Request, res: Response) => {
  try {
    const movimiento = await prisma.movimiento.create({
      data: req.body,
      include: {
        usuario: { select: { nombre: true } },
        producto: { select: { codigo: true, nombre: true } },
        depositoOrigen: { select: { nombre: true } },
        depositoDestino: { select: { nombre: true } }
      }
    });
    res.status(201).json(movimiento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear movimiento' });
  }
});

// GET /api/movimientos/tipos - Tipos de movimiento disponibles
router.get('/tipos', (_req: Request, res: Response) => {
  res.json([
    { value: 'ingreso', label: 'Ingreso / Compra' },
    { value: 'elaboracion', label: 'Elaboración' },
    { value: 'merma', label: 'Merma' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'ajuste', label: 'Ajuste' },
    { value: 'conteo', label: 'Conteo / Inventario' },
    { value: 'consumo_interno', label: 'Consumo interno' },
    { value: 'devolucion', label: 'Devolución' }
  ]);
});

// GET /api/movimientos/motivos/:tipo - Motivos por tipo
router.get('/motivos/:tipo', (req: Request, res: Response) => {
  const motivos: Record<string, string[]> = {
    merma: ['Vencimiento', 'Rotura', 'Deterioro', 'Error de elaboración', 'Derrame', 'Otro'],
    ajuste: ['Diferencia de inventario', 'Corrección de carga', 'Error de sistema', 'Otro'],
    consumo_interno: ['Comida de personal', 'Degustación', 'Cortesía', 'Otro'],
    devolucion: ['Producto en mal estado', 'Error de pedido', 'Otro']
  };
  res.json(motivos[req.params.tipo as string] || []);
});

export default router;
