import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/depositos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};
    if (activo !== undefined) where.activo = activo === 'true';

    const depositos = await prisma.deposito.findMany({
      where,
      orderBy: { nombre: 'asc' }
    });
    res.json(depositos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener depósitos' });
  }
});

// GET /api/depositos/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const deposito = await prisma.deposito.findUnique({
      where: { id: parseInt(req.params.id as string) }
    });
    if (!deposito) {
      res.status(404).json({ error: 'Depósito no encontrado' });
      return;
    }
    res.json(deposito);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener depósito' });
  }
});

// POST /api/depositos
router.post('/', async (req: Request, res: Response) => {
  try {
    const deposito = await prisma.deposito.create({ data: req.body });
    res.status(201).json(deposito);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un depósito con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear depósito' });
  }
});

// PUT /api/depositos/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const deposito = await prisma.deposito.update({
      where: { id: parseInt(req.params.id as string) },
      data: req.body
    });
    res.json(deposito);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un depósito con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar depósito' });
  }
});

// DELETE /api/depositos/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.deposito.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Depósito desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar depósito' });
  }
});

export default router;
