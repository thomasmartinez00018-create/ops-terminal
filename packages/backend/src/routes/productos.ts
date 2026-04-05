import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/productos - Listar productos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo, rubro, subrubro, tipo, buscar } = req.query;
    const where: any = {};

    if (activo !== undefined) where.activo = activo === 'true';
    if (rubro) where.rubro = rubro;
    if (subrubro) where.subrubro = subrubro;
    if (tipo) where.tipo = tipo;
    if (buscar) {
      where.OR = [
        { nombre: { contains: buscar as string } },
        { codigo: { contains: buscar as string } }
      ];
    }

    const productos = await prisma.producto.findMany({
      where,
      include: { depositoDefecto: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: { depositoDefecto: true }
    });
    if (!producto) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// POST /api/productos
router.post('/', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.create({ data: req.body });
    res.status(201).json(producto);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un producto con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/productos/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: parseInt(req.params.id as string) },
      data: req.body
    });
    res.json(producto);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un producto con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/productos/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.producto.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Producto desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar producto' });
  }
});

// GET /api/productos/rubros/lista - Rubros únicos
router.get('/rubros/lista', async (_req: Request, res: Response) => {
  try {
    const rubros = await prisma.producto.findMany({
      select: { rubro: true },
      distinct: ['rubro'],
      orderBy: { rubro: 'asc' }
    });
    res.json(rubros.map(r => r.rubro));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener rubros' });
  }
});

// GET /api/productos/subrubros/lista?rubro=Vinos - Sub-rubros únicos por rubro
router.get('/subrubros/lista', async (req: Request, res: Response) => {
  try {
    const { rubro } = req.query;
    const where: any = { subrubro: { not: null } };
    if (rubro) where.rubro = rubro;

    const subrubros = await (prisma.producto as any).findMany({
      where,
      select: { subrubro: true },
      distinct: ['subrubro'],
      orderBy: { subrubro: 'asc' }
    });
    res.json(subrubros.map((s: any) => s.subrubro).filter(Boolean));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener sub-rubros' });
  }
});

export default router;
