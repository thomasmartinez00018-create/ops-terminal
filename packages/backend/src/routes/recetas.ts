import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

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

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/recetas/disponibilidad — "86 list" anti-quiebre-de-servicio
// ---------------------------------------------------------------------------
// "86" es jerga de cocina para "no hay más" — se grita cuando un plato se
// terminó. Este endpoint devuelve un vistazo de arranque de día que responde
// dos preguntas operativas:
//
//   1. ¿Qué platos NO puedo hacer ahora mismo? (0 porciones posibles)
//   2. ¿Qué platos me quedan al límite? (1-5 porciones posibles, le avisa
//      al encargado que tiene que reponer hoy o mañana)
//
// Cálculo: por cada receta activa, miramos sus ingredientes:
//   stock_total = sumatoria de movimientos del producto (todos los depósitos)
//   cantidad_neta_por_porcion = ing.cantidad / receta.porciones
//   factor_merma = 1 / (1 - merma%/100)
//   cantidad_bruta_por_porcion = cantidad_neta_por_porcion * factor_merma
//   porciones_posibles_ing = stock_total / cantidad_bruta_por_porcion
// La cantidad que "manda" la receta = min de porciones_posibles_ing.
// Cuando eso es 0 → no se puede hacer; bajo → quedan pocas.
//
// IMPORTANTE: esta ruta tiene que declararse ANTES de /:id, porque Express
// matchea en orden y /:id atraparía /disponibilidad como id='disponibilidad'.
// Además, el param validator global rechaza ids no numéricos con 400.
// ═══════════════════════════════════════════════════════════════════════════
router.get('/disponibilidad', async (_req: Request, res: Response) => {
  try {
    const recetas = await prisma.receta.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        categoria: true,
        porciones: true,
        ingredientes: {
          select: {
            productoId: true,
            cantidad: true,
            unidad: true,
            mermaEsperada: true,
            producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    if (recetas.length === 0) {
      res.json({ sinStock: [], bajoStock: [], totalRecetas: 0 });
      return;
    }

    // Stock agregado por producto (todos los depósitos). Filtramos a los
    // productos que aparecen en alguna receta para no inflar el heap con
    // movimientos irrelevantes.
    const productoIds = new Set<number>();
    for (const r of recetas) {
      for (const ing of r.ingredientes) productoIds.add(ing.productoId);
    }

    // ── Stock agregado en DB — anti-OOM ──────────────────────────────────────
    // Versión anterior: findMany cargaba todos los movimientos en Node.js.
    // Con miles de registros por producto, el heap explotaba.
    // Versión actual: groupBy con _sum delega la agregación a PostgreSQL.
    // Node.js recibe solo (productoId, tipo, suma_cantidad) — muchas menos filas.
    // El tenant extension (prisma.ts) inyecta organizacionId automáticamente.
    const stockAgg = await prisma.movimiento.groupBy({
      by: ['productoId', 'tipo'],
      where: {
        productoId: { in: Array.from(productoIds) },
        tipo: { in: ['ingreso', 'elaboracion', 'devolucion', 'ajuste', 'merma', 'consumo_interno', 'venta'] },
      },
      _sum: { cantidad: true },
    });

    const TIPOS_SUMA = new Set(['ingreso', 'elaboracion', 'devolucion', 'ajuste']);
    const TIPOS_RESTA = new Set(['merma', 'consumo_interno', 'venta']);
    const stockPorProducto: Record<number, number> = {};
    for (const agg of stockAgg) {
      const pid = agg.productoId;
      const qty = Number(agg._sum.cantidad) || 0;
      if (TIPOS_SUMA.has(agg.tipo)) stockPorProducto[pid] = (stockPorProducto[pid] || 0) + qty;
      else if (TIPOS_RESTA.has(agg.tipo)) stockPorProducto[pid] = (stockPorProducto[pid] || 0) - qty;
      // 'transferencia' es neutral en el total global.
    }

    const sinStock: any[] = [];
    const bajoStock: any[] = [];
    const UMBRAL_BAJO = 5;

    for (const r of recetas) {
      if (!r.ingredientes.length || r.porciones <= 0) continue;

      let porcionesPosibles = Infinity;
      let ingredienteLimitante: any = null;

      for (const ing of r.ingredientes) {
        const stock = stockPorProducto[ing.productoId] || 0;
        const cantidadNetaPorPorcion = Number(ing.cantidad) / r.porciones;
        if (!Number.isFinite(cantidadNetaPorPorcion) || cantidadNetaPorPorcion <= 0) continue;

        const mermaSafe = Math.min(Math.max(Number(ing.mermaEsperada) || 0, 0), 99);
        const factor = mermaSafe > 0 ? 1 / (1 - mermaSafe / 100) : 1;
        const cantidadBrutaPorPorcion = cantidadNetaPorPorcion * factor;

        const porcionesDeEsteIng = stock > 0 ? stock / cantidadBrutaPorPorcion : 0;

        if (porcionesDeEsteIng < porcionesPosibles) {
          porcionesPosibles = porcionesDeEsteIng;
          ingredienteLimitante = {
            productoId: ing.productoId,
            codigo: ing.producto?.codigo ?? '',
            nombre: ing.producto?.nombre ?? '',
            stockActual: Math.max(0, stock),
            unidad: ing.producto?.unidadUso ?? ing.unidad,
            cantidadNecesariaPorPorcion: cantidadBrutaPorPorcion,
          };
        }
      }

      const porcionesPosiblesInt = Math.floor(porcionesPosibles);
      const entry = {
        recetaId: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        categoria: r.categoria,
        porciones: r.porciones,
        porcionesPosibles: porcionesPosiblesInt,
        ingredienteLimitante,
      };

      if (porcionesPosiblesInt === 0) sinStock.push(entry);
      else if (porcionesPosiblesInt <= UMBRAL_BAJO) bajoStock.push(entry);
    }

    sinStock.sort((a, b) => a.nombre.localeCompare(b.nombre));
    bajoStock.sort((a, b) => a.porcionesPosibles - b.porcionesPosibles);

    res.json({ sinStock, bajoStock, totalRecetas: recetas.length });
  } catch (error: any) {
    console.error('[recetas/disponibilidad]', error);
    res.status(500).json({ error: 'Error al calcular disponibilidad de recetas' });
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

    // Pool-safe: un solo `DISTINCT ON` en lugar de un findFirst por ingrediente.
    // Con 20 ingredientes el patrón anterior (Promise.all sobre findFirst)
    // disparaba 20 queries paralelas saturando el pool de Prisma.
    const ingredienteIds = receta.ingredientes.map(i => i.productoId);
    const costoMap = new Map<number, number>();
    if (ingredienteIds.length > 0) {
      const { organizacionId } = getTenant();
      const placeholders = ingredienteIds.map((_, i) => `$${i + 2}`).join(', ');
      const costoRows = await prisma.$queryRawUnsafe<Array<{
        producto_id: number;
        costo_unitario: number | null;
      }>>(
        `SELECT DISTINCT ON (producto_id) producto_id, costo_unitario
         FROM movimientos
         WHERE tipo = 'ingreso'
           AND costo_unitario IS NOT NULL
           AND organizacion_id = $1
           AND producto_id IN (${placeholders})
         ORDER BY producto_id, fecha DESC, hora DESC`,
        organizacionId,
        ...ingredienteIds
      );
      for (const row of costoRows) {
        costoMap.set(Number(row.producto_id), Number(row.costo_unitario) || 0);
      }
    }

    const ingredientesConCosto = receta.ingredientes.map((ing) => {
      const costoUnitario = costoMap.get(ing.productoId) ?? 0;
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
    });

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
