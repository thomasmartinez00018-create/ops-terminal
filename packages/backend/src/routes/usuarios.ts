import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/usuarios
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};
    if (activo !== undefined) where.activo = activo === 'true';

    const usuarios = await prisma.usuario.findMany({
      where,
      orderBy: { nombre: 'asc' }
    });
    // No enviar PIN en la lista
    res.json(usuarios.map(({ pin, ...u }) => u));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// GET /api/usuarios/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: parseInt(req.params.id as string) }
    });
    if (!usuario) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    const { pin, ...data } = usuario;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// POST /api/usuarios
router.post('/', async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.create({ data: req.body });
    const { pin, ...data } = usuario;
    res.status(201).json(data);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un usuario con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const usuario = await prisma.usuario.update({
      where: { id: parseInt(req.params.id as string) },
      data: req.body
    });
    const { pin, ...data } = usuario;
    res.json(data);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un usuario con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/usuarios/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.usuario.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Usuario desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
});

export default router;
