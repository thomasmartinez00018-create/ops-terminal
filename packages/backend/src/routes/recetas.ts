import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/recetas - Listar recetas
//
// CRÍTICO: este endpoint NO devuelve `imagenBase64`. Cada imagen puede pesar
// hasta 500KB en base64. Con 30-50 recetas, devolver esto en la lista empuja
// la respuesta a 10-25MB, y el proceso Node (heap ~500MB en Railway)
// revienta con "FATAL ERROR: Reached heap limit" al hacer JSON.stringify().
//
// La lista solo necesita metadata — nombre, costos, margen. La foto se
// carga bajo demanda en GET /recetas/:id cuando el usuario abre el detalle
// o el modo cocina. Misma estrategia usan Instagram/Shopify para feeds.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};

    if (activo !== undefined) where.activo = activo === 'true';

    const recetas = await prisma.receta.findMany({
      where,
      // select explícito — listamos TODOS los campos excepto imagenBase64.
      // Así el frontend sigue recibiendo toda la metadata que necesitaba
      // antes (precio, margen, notas, método) sin los bytes de la foto.
      select: {
        id: true,
        organizacionId: true,
        codigo: true,
        nombre: true,
        categoria: true,
        sector: true,
        porciones: true,
        productoResultadoId: true,
        cantidadProducida: true,
        unidadProducida: true,
        activo: true,
        precioVenta: true,
        margenObjetivo: true,
        metodoPreparacion: true,
        tiempoPreparacion: true,
        notasChef: true,
        // imagenBase64 — OMITIDO a propósito. Se carga en GET /recetas/:id.
        productoResultado: { select: { id: true, nombre: true, unidadUso: true } },
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
        productoResultado: { select: { id: true, nombre: true, unidadUso: true } },
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

// Helper: normaliza campos opcionales de Receta (precio/ficha técnica).
// Devuelve un objeto con las keys que vinieron en el body — si un campo no
// está, Prisma lo deja como está (no lo pisa con null en un PUT parcial).
function camposOpcionales(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  if ('precioVenta' in body) {
    const n = Number(body.precioVenta);
    out.precioVenta = body.precioVenta === null || body.precioVenta === '' ? null
      : Number.isFinite(n) && n > 0 ? n : null;
  }
  if ('margenObjetivo' in body) {
    const n = Number(body.margenObjetivo);
    out.margenObjetivo = body.margenObjetivo === null || body.margenObjetivo === '' ? null
      : Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  if ('metodoPreparacion' in body) {
    out.metodoPreparacion = typeof body.metodoPreparacion === 'string'
      ? body.metodoPreparacion.slice(0, 5000) || null : null;
  }
  if ('tiempoPreparacion' in body) {
    const n = Number(body.tiempoPreparacion);
    out.tiempoPreparacion = body.tiempoPreparacion === null || body.tiempoPreparacion === '' ? null
      : Number.isInteger(n) && n >= 0 ? n : null;
  }
  if ('notasChef' in body) {
    out.notasChef = typeof body.notasChef === 'string'
      ? body.notasChef.slice(0, 2000) || null : null;
  }
  if ('imagenBase64' in body) {
    // Cap a ~500KB de base64 (~375KB de imagen) para no romper el transfer
    // de Neon. El frontend comprime agresivamente antes de subir.
    if (typeof body.imagenBase64 === 'string' && body.imagenBase64.length <= 500_000) {
      out.imagenBase64 = body.imagenBase64 || null;
    } else if (body.imagenBase64 === null || body.imagenBase64 === '') {
      out.imagenBase64 = null;
    }
  }
  return out;
}

// POST /api/recetas
router.post('/', async (req: Request, res: Response) => {
  try {
    const { codigo, nombre, categoria, sector, porciones, productoResultadoId, cantidadProducida, unidadProducida, ingredientes } = req.body;

    if (!ingredientes || !Array.isArray(ingredientes) || ingredientes.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos un ingrediente' });
      return;
    }

    const receta = await prisma.$transaction(async (tx) => {
      const nuevaReceta = await tx.receta.create({
        data: {
          codigo,
          nombre,
          categoria,
          sector: sector || null,
          porciones,
          productoResultadoId: productoResultadoId ? Number(productoResultadoId) : null,
          cantidadProducida: cantidadProducida ? Number(cantidadProducida) : null,
          unidadProducida: unidadProducida || null,
          ...camposOpcionales(req.body),
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
          productoResultado: { select: { id: true, nombre: true, unidadUso: true } },
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
    const { codigo, nombre, categoria, sector, porciones, productoResultadoId, cantidadProducida, unidadProducida, ingredientes } = req.body;

    if (!ingredientes || !Array.isArray(ingredientes) || ingredientes.length === 0) {
      res.status(400).json({ error: 'Se requiere al menos un ingrediente' });
      return;
    }

    const receta = await prisma.$transaction(async (tx) => {
      const recetaActualizada = await tx.receta.update({
        where: { id },
        data: {
          codigo, nombre, categoria, sector: sector || null, porciones,
          productoResultadoId: productoResultadoId ? Number(productoResultadoId) : null,
          cantidadProducida: cantidadProducida ? Number(cantidadProducida) : null,
          unidadProducida: unidadProducida || null,
          ...camposOpcionales(req.body),
        }
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
          productoResultado: { select: { id: true, nombre: true, unidadUso: true } },
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

        const costoUnitario = Number(ultimoIngreso?.costoUnitario ?? 0);
        const cantidadNeta = Number(ing.cantidad);
        const mermaPct = Number(ing.mermaEsperada) || 0;
        // Factor de desperdicio (estándar gastronómico):
        // Si merma = %desperdicio sobre peso BRUTO, entonces:
        //   factor = 1 / (1 - merma/100)  ≡  (merma / (100 - merma)) + 1
        // Clamp: merma ∈ [0, 99) para evitar div/0.
        const mermaSafe = Math.min(Math.max(mermaPct, 0), 99);
        const factor = mermaSafe > 0 ? 1 / (1 - mermaSafe / 100) : 1;
        const cantidadBruta = cantidadNeta * factor;
        const costoTotal = cantidadBruta * costoUnitario;

        return {
          productoId: ing.productoId,
          codigo: ing.producto?.codigo ?? '',
          nombre: ing.producto?.nombre ?? '',
          cantidad: cantidadNeta,
          unidad: ing.unidad,
          mermaEsperada: mermaPct,
          factor,
          cantidadBruta,
          costoUnitario,
          costoTotal
        };
      })
    );

    const costoTotal = ingredientesConCosto.reduce((sum, ing) => sum + ing.costoTotal, 0);
    const costoPorPorcion = receta.porciones > 0 ? costoTotal / receta.porciones : 0;

    // Margen — si la receta tiene precio de venta setteado, calculamos
    // margen bruto real vs objetivo. Si no, los campos van en null y el
    // frontend no muestra la sección de margen.
    const precioVenta = (receta as any).precioVenta as number | null ?? null;
    const margenObjetivo = (receta as any).margenObjetivo as number | null ?? null;
    let margenActual: number | null = null;
    let gananciaPorPorcion: number | null = null;
    let estadoMargen: 'ok' | 'alerta' | 'critico' | null = null;
    if (precioVenta && precioVenta > 0) {
      margenActual = ((precioVenta - costoPorPorcion) / precioVenta) * 100;
      gananciaPorPorcion = precioVenta - costoPorPorcion;
      const objetivo = margenObjetivo ?? 70;
      // Umbrales: verde >= objetivo, amber 10 puntos debajo, rojo más abajo.
      if (margenActual >= objetivo) estadoMargen = 'ok';
      else if (margenActual >= objetivo - 10) estadoMargen = 'alerta';
      else estadoMargen = 'critico';
    }

    res.json({
      nombre: receta.nombre,
      codigo: receta.codigo,
      porciones: receta.porciones,
      costoTotal,
      costoPorPorcion,
      precioVenta,
      margenObjetivo,
      margenActual,
      gananciaPorPorcion,
      estadoMargen,
      ingredientes: ingredientesConCosto
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular costo de receta' });
  }
});

export default router;
