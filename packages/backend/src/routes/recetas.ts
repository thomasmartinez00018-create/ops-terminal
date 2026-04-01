import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/recetas - Listar recetas
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};

    if (activo !== undefined) where.activo = activo === 'true';

    const recetas = await prisma.receta.findMany({
      where,
      include: {
        ingredientes: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true } }
          }
        }
      },
      orderBy: { nombre: 'asc' }
    });
    res.json(recetas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener recetas' });
  }
});

// GET /api/recetas/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const receta = await prisma.receta.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        ingredientes: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true } }
          }
        }
      }
    });
    if (!receta) {
      res.status(404).json({ error: 'Receta no encontrada' });
      return;
    }
    res.json(receta);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener receta' });
  }
});

// POST /api/recetas
router.post('/', async (req: Request, res: Response) => {
  try {
    const { codigo, nombre, categoria, porciones, ingredientes } = req.body;

    const receta = await prisma.$transaction(async (tx) => {
      const nuevaReceta = await tx.receta.create({
        data: {
          codigo,
          nombre,
          categoria,
          porciones,
          ingredientes: {
            create: ingredientes.map((ing: any) => ({
              productoId: ing.productoId,
              cantidad: ing.cantidad,
              unidad: ing.unidad,
              mermaEsperada: ing.mermaEsperada
            }))
          }
        },
        include: {
          ingredientes: {
            include: {
              producto: { select: { codigo: true, nombre: true, unidadUso: true } }
            }
          }
        }
      });
      return nuevaReceta;
    });

    res.status(201).json(receta);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe una receta con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear receta' });
  }
});

// PUT /api/recetas/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { codigo, nombre, categoria, porciones, ingredientes } = req.body;

    const receta = await prisma.$transaction(async (tx) => {
      const recetaActualizada = await tx.receta.update({
        where: { id },
        data: { codigo, nombre, categoria, porciones }
      });

      await tx.recetaIngrediente.deleteMany({
        where: { recetaId: id }
      });

      await tx.recetaIngrediente.createMany({
        data: ingredientes.map((ing: any) => ({
          recetaId: id,
          productoId: ing.productoId,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          mermaEsperada: ing.mermaEsperada
        }))
      });

      return tx.receta.findUnique({
        where: { id },
        include: {
          ingredientes: {
            include: {
              producto: { select: { codigo: true, nombre: true, unidadUso: true } }
            }
          }
        }
      });
    });

    res.json(receta);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe una receta con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar receta' });
  }
});

// DELETE /api/recetas/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.receta.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Receta desactivada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar receta' });
  }
});

// GET /api/recetas/:id/costo - Calcular costo de receta
router.get('/:id/costo', async (req: Request, res: Response) => {
  try {
    const receta = await prisma.receta.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        ingredientes: {
          include: {
            producto: { select: { codigo: true, nombre: true, unidadUso: true } }
          }
        }
      }
    });

    if (!receta) {
      res.status(404).json({ error: 'Receta no encontrada' });
      return;
    }

    const ingredientesConCosto = await Promise.all(
      receta.ingredientes.map(async (ing) => {
        const ultimoIngreso = await prisma.movimiento.findFirst({
          where: {
            productoId: ing.productoId,
            tipo: 'ingreso'
          },
          orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
          select: { costoUnitario: true }
        });

        const costoUnitario = ultimoIngreso?.costoUnitario ?? 0;
        const costoTotal = Number(ing.cantidad) * (1 + Number(ing.mermaEsperada) / 100) * Number(costoUnitario);

        return {
          producto: ing.producto,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          costoUnitario,
          costoTotal
        };
      })
    );

    const costoTotal = ingredientesConCosto.reduce((sum, ing) => sum + ing.costoTotal, 0);
    const costoPorPorcion = receta.porciones > 0 ? costoTotal / receta.porciones : 0;

    res.json({
      costoTotal,
      costoPorPorcion,
      ingredientes: ingredientesConCosto
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular costo de receta' });
  }
});

export default router;
