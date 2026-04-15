import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
  detectarAlertas,
  agruparAlertasParaOrdenes,
  siguienteCodigoReposicion,
  calcularStockMap,
  getStock,
} from '../lib/reposicionMotor';

// ============================================================================
// Router /api/reposicion — reposición encadenada entre depósitos
// ============================================================================
// Endpoints:
//   GET  /alertas           → todas las alertas detectadas por el motor
//   POST /generar-ordenes   → genera OrdenReposicion 'sugerida' agrupando por
//                             par (origen, destino). No ejecuta movimientos.
//   GET  /                  → lista órdenes de reposición (filtro estado)
//   GET  /:id               → detalle de orden con items
//   PUT  /:id/confirmar     → pasa de 'sugerida' → 'pendiente' con cantidades
//                             confirmadas y asignado
//   PUT  /:id/ejecutar      → crea Movimientos de transferencia, pasa a
//                             'ejecutada'. AQUÍ es donde se descuenta stock
//                             (con confirmación humana explícita)
//   PUT  /:id/cancelar      → marca 'cancelada', no toca movimientos
//   POST /manual            → crea una orden manualmente (sin pasar por el
//                             motor) para que un usuario arme una
//                             transferencia bajo demanda
//
// Regla de oro: NUNCA se crea un Movimiento desde el motor automático. Solo
// /ejecutar (explícito) dispara los movimientos reales. Esto preserva el
// principio del cliente — "nada se descuenta sin confirmación humana".
// ============================================================================

const router = Router();

// Helper: usuario que hizo el request (staff logueado)
function getUsuarioId(req: Request): number {
  // El middleware requireStaff pone req.usuario con el id del staff.
  return (req as any).usuario?.id ?? 0;
}

// ---------------------------------------------------------------------------
// GET /api/reposicion/alertas — detecta en vivo, no persiste
// ---------------------------------------------------------------------------
router.get('/alertas', async (_req: Request, res: Response) => {
  try {
    const alertas = await detectarAlertas();
    res.json({
      total: alertas.length,
      alertas,
      // Helper para el frontend: cuántas requieren compra (sin padre) y
      // cuántas pueden resolverse moviendo de padre→hijo.
      resumen: {
        paraTransferir: alertas.filter(a => !a.requiereCompra).length,
        paraComprar: alertas.filter(a => a.requiereCompra).length,
        conStockPadreSuficiente: alertas.filter(a => a.puedeReponerDesdePadre).length,
      },
    });
  } catch (error) {
    console.error('GET /reposicion/alertas error:', error);
    res.status(500).json({ error: 'Error al detectar alertas de reposición' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reposicion/generar-ordenes — crea órdenes 'sugerida' agrupadas
// ---------------------------------------------------------------------------
// Detecta alertas, agrupa por (origen → destino) y por cada grupo crea una
// OrdenReposicion con sus items. Si ya existe una orden 'sugerida' o
// 'pendiente' para el mismo par origen→destino, la REEMPLAZA (cancela la
// vieja y crea una nueva) — así el usuario no acumula órdenes fantasma si
// genera varias veces seguidas.
// ---------------------------------------------------------------------------
router.post('/generar-ordenes', async (req: Request, res: Response) => {
  try {
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const alertas = await detectarAlertas();
    const grupos = agruparAlertasParaOrdenes(alertas);

    if (grupos.size === 0) {
      res.json({
        ordenesCreadas: 0,
        ordenes: [],
        mensaje: 'No hay alertas que puedan resolverse por transferencia interna.',
        paraComprar: alertas.filter(a => a.requiereCompra).length,
      });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    const ordenesCreadas: any[] = [];

    for (const [, grupo] of grupos) {
      await prisma.$transaction(async (tx) => {
        // Cancela órdenes previas no ejecutadas para este mismo par — evita
        // duplicados si el usuario spamea el botón.
        await tx.ordenReposicion.updateMany({
          where: {
            depositoOrigenId: grupo.depositoOrigenId,
            depositoDestinoId: grupo.depositoDestinoId,
            estado: { in: ['sugerida', 'pendiente'] },
            generadoAuto: true,
          },
          data: { estado: 'cancelada' },
        });

        // Código único con retry anti-colisión
        let codigo = '';
        let intentos = 0;
        while (intentos < 5) {
          codigo = await siguienteCodigoReposicion();
          const existe = await tx.ordenReposicion.findFirst({ where: { codigo } });
          if (!existe) break;
          intentos++;
        }

        const orden = await tx.ordenReposicion.create({
          data: {
            codigo,
            fecha: hoy,
            estado: 'sugerida',
            depositoOrigenId: grupo.depositoOrigenId,
            depositoDestinoId: grupo.depositoDestinoId,
            motivo: 'Punto de reposición (automático)',
            creadoPorId: usuarioId,
            generadoAuto: true,
            items: {
              create: grupo.items.map(a => ({
                productoId: a.productoId,
                cantidadSugerida: a.cantidadSugerida,
                unidad: a.unidad,
                stockOrigenSnapshot: a.stockEnPadre ?? null,
                stockDestinoSnapshot: a.stockActual,
              })),
            },
          },
          include: {
            depositoOrigen: { select: { nombre: true } },
            depositoDestino: { select: { nombre: true } },
            items: {
              include: {
                producto: { select: { codigo: true, nombre: true } },
              },
            },
          },
        });

        ordenesCreadas.push(orden);
      });
    }

    res.status(201).json({
      ordenesCreadas: ordenesCreadas.length,
      ordenes: ordenesCreadas,
      paraComprar: alertas.filter(a => a.requiereCompra).length,
    });
  } catch (error) {
    console.error('POST /reposicion/generar-ordenes error:', error);
    res.status(500).json({ error: 'Error al generar órdenes de reposición' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reposicion — lista órdenes
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const { estado, activas, depositoDestinoId, depositoOrigenId } = req.query;
    const where: any = {};

    if (estado) where.estado = estado;
    if (activas === 'true') where.estado = { in: ['sugerida', 'pendiente'] };
    if (depositoDestinoId) where.depositoDestinoId = parseInt(depositoDestinoId as string);
    if (depositoOrigenId) where.depositoOrigenId = parseInt(depositoOrigenId as string);

    const ordenes = await prisma.ordenReposicion.findMany({
      where,
      include: {
        depositoOrigen: { select: { id: true, nombre: true } },
        depositoDestino: { select: { id: true, nombre: true } },
        creadoPor: { select: { nombre: true } },
        asignadoA: { select: { nombre: true } },
        ejecutadoPor: { select: { nombre: true } },
        _count: { select: { items: true } },
      },
      orderBy: [
        { estado: 'asc' }, // sugerida antes que pendiente antes que ejecutada
        { createdAt: 'desc' },
      ],
    });

    res.json(ordenes);
  } catch (error) {
    console.error('GET /reposicion error:', error);
    res.status(500).json({ error: 'Error al listar órdenes de reposición' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/reposicion/:id — detalle
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const orden = await prisma.ordenReposicion.findUnique({
      where: { id },
      include: {
        depositoOrigen: { select: { id: true, nombre: true, codigo: true } },
        depositoDestino: { select: { id: true, nombre: true, codigo: true } },
        creadoPor: { select: { id: true, nombre: true } },
        asignadoA: { select: { id: true, nombre: true } },
        ejecutadoPor: { select: { id: true, nombre: true } },
        items: {
          include: {
            producto: {
              select: { id: true, codigo: true, nombre: true, unidadUso: true },
            },
          },
        },
      },
    });

    if (!orden) {
      res.status(404).json({ error: 'Orden de reposición no encontrada' });
      return;
    }

    res.json(orden);
  } catch (error) {
    console.error('GET /reposicion/:id error:', error);
    res.status(500).json({ error: 'Error al obtener orden de reposición' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reposicion/:id/confirmar — sugerida → pendiente
// ---------------------------------------------------------------------------
// Body: { asignadoAId, items: [{ id, cantidadConfirmada, observacion? }], observacion? }
// Permite ajustar cantidades antes de ejecutar. Items no mencionados se
// mantienen con cantidadConfirmada = cantidadSugerida.
// ---------------------------------------------------------------------------
router.put('/:id/confirmar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { asignadoAId, items, observacion } = req.body as {
      asignadoAId?: number;
      items?: Array<{ id: number; cantidadConfirmada: number; observacion?: string }>;
      observacion?: string;
    };

    const orden = await prisma.ordenReposicion.findUnique({ where: { id } });
    if (!orden) {
      res.status(404).json({ error: 'Orden de reposición no encontrada' });
      return;
    }
    if (orden.estado !== 'sugerida' && orden.estado !== 'pendiente') {
      res.status(400).json({ error: `No se puede confirmar una orden en estado ${orden.estado}` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Items: default confirmada = sugerida si no se pasa
      if (items && items.length > 0) {
        for (const it of items) {
          await tx.ordenReposicionItem.update({
            where: { id: it.id },
            data: {
              cantidadConfirmada: it.cantidadConfirmada,
              observacion: it.observacion ?? undefined,
            },
          });
        }
      }

      // Para items no tocados, copia sugerida → confirmada (si aún está null)
      const itemsSinConfirmar = await tx.ordenReposicionItem.findMany({
        where: { ordenReposicionId: id, cantidadConfirmada: null },
      });
      for (const it of itemsSinConfirmar) {
        await tx.ordenReposicionItem.update({
          where: { id: it.id },
          data: { cantidadConfirmada: it.cantidadSugerida },
        });
      }

      await tx.ordenReposicion.update({
        where: { id },
        data: {
          estado: 'pendiente',
          asignadoAId: asignadoAId ?? orden.asignadoAId,
          observacion: observacion ?? orden.observacion,
        },
      });
    });

    const updated = await prisma.ordenReposicion.findUnique({
      where: { id },
      include: {
        depositoOrigen: { select: { id: true, nombre: true } },
        depositoDestino: { select: { id: true, nombre: true } },
        asignadoA: { select: { id: true, nombre: true } },
        items: {
          include: { producto: { select: { codigo: true, nombre: true } } },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('PUT /reposicion/:id/confirmar error:', error);
    res.status(500).json({ error: 'Error al confirmar orden de reposición' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reposicion/:id/ejecutar — pendiente → ejecutada (crea movimientos)
// ---------------------------------------------------------------------------
// AQUÍ es donde el stock realmente se mueve. Crea un Movimiento de
// 'transferencia' por cada item con cantidadConfirmada > 0, vinculando
// origen y destino de la orden. Esto preserva la semántica del sistema:
// el cálculo de stock sigue funcionando porque los movimientos son la
// fuente de verdad.
// ---------------------------------------------------------------------------
router.put('/:id/ejecutar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const orden = await prisma.ordenReposicion.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!orden) {
      res.status(404).json({ error: 'Orden de reposición no encontrada' });
      return;
    }
    if (orden.estado !== 'pendiente' && orden.estado !== 'sugerida') {
      res.status(400).json({ error: `No se puede ejecutar una orden en estado ${orden.estado}` });
      return;
    }

    // Validación previa: stock disponible en el depósito origen para cada item.
    // Si no alcanza, abortamos ANTES de crear movimientos — los movimientos
    // crearían saldo negativo y ensuciarían el cálculo.
    const stockMap = await calcularStockMap();
    const faltantes: Array<{ productoId: number; pedido: number; disponible: number }> = [];
    for (const it of orden.items) {
      const cant = it.cantidadConfirmada ?? it.cantidadSugerida;
      if (cant <= 0) continue;
      const disponible = getStock(stockMap, it.productoId, orden.depositoOrigenId);
      if (disponible < cant) {
        faltantes.push({ productoId: it.productoId, pedido: cant, disponible });
      }
    }

    if (faltantes.length > 0) {
      res.status(409).json({
        error: 'Stock insuficiente en depósito origen',
        faltantes,
        sugerencia: 'Reducí las cantidades confirmadas o reponé primero el depósito origen.',
      });
      return;
    }

    const now = new Date();
    const fecha = now.toISOString().split('T')[0];
    const hora = now.toTimeString().slice(0, 5);

    await prisma.$transaction(async (tx) => {
      // Crear un Movimiento de transferencia por cada item con cantidad > 0
      for (const it of orden.items) {
        const cant = it.cantidadConfirmada ?? it.cantidadSugerida;
        if (cant <= 0) continue;

        await tx.movimiento.create({
          data: {
            fecha,
            hora,
            usuarioId,
            tipo: 'transferencia',
            depositoOrigenId: orden.depositoOrigenId,
            depositoDestinoId: orden.depositoDestinoId,
            productoId: it.productoId,
            cantidad: cant,
            unidad: it.unidad,
            motivo: `Reposición ${orden.codigo}`,
            documentoRef: orden.codigo,
          },
        });
      }

      await tx.ordenReposicion.update({
        where: { id },
        data: {
          estado: 'ejecutada',
          ejecutadoPorId: usuarioId,
          fechaEjecucion: fecha,
        },
      });
    });

    const updated = await prisma.ordenReposicion.findUnique({
      where: { id },
      include: {
        depositoOrigen: { select: { id: true, nombre: true } },
        depositoDestino: { select: { id: true, nombre: true } },
        ejecutadoPor: { select: { id: true, nombre: true } },
        items: { include: { producto: { select: { codigo: true, nombre: true } } } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('PUT /reposicion/:id/ejecutar error:', error);
    res.status(500).json({ error: 'Error al ejecutar orden de reposición' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/reposicion/:id/cancelar
// ---------------------------------------------------------------------------
router.put('/:id/cancelar', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const orden = await prisma.ordenReposicion.findUnique({ where: { id } });
    if (!orden) {
      res.status(404).json({ error: 'Orden de reposición no encontrada' });
      return;
    }
    if (orden.estado === 'ejecutada') {
      res.status(400).json({ error: 'No se puede cancelar una orden ya ejecutada' });
      return;
    }

    const updated = await prisma.ordenReposicion.update({
      where: { id },
      data: { estado: 'cancelada' },
    });

    res.json(updated);
  } catch (error) {
    console.error('PUT /reposicion/:id/cancelar error:', error);
    res.status(500).json({ error: 'Error al cancelar orden de reposición' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reposicion/manual — crea orden manualmente (sin pasar por motor)
// ---------------------------------------------------------------------------
// Body: { depositoOrigenId, depositoDestinoId, items: [{ productoId, cantidad, unidad }], observacion?, asignadoAId? }
// Útil cuando un usuario quiere armar una transferencia libre, no
// necesariamente sugerida por el motor. Empieza directamente en 'pendiente'.
// ---------------------------------------------------------------------------
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const usuarioId = getUsuarioId(req);
    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no identificado' });
      return;
    }

    const { depositoOrigenId, depositoDestinoId, items, observacion, asignadoAId } = req.body as {
      depositoOrigenId: number;
      depositoDestinoId: number;
      items: Array<{ productoId: number; cantidad: number; unidad: string; observacion?: string }>;
      observacion?: string;
      asignadoAId?: number;
    };

    if (!depositoOrigenId || !depositoDestinoId || !items || items.length === 0) {
      res.status(400).json({ error: 'Faltan campos: depositoOrigenId, depositoDestinoId, items' });
      return;
    }
    if (depositoOrigenId === depositoDestinoId) {
      res.status(400).json({ error: 'Origen y destino no pueden ser el mismo depósito' });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];

    const orden = await prisma.$transaction(async (tx) => {
      // Código único con retry
      let codigo = '';
      let intentos = 0;
      while (intentos < 5) {
        codigo = await siguienteCodigoReposicion();
        const existe = await tx.ordenReposicion.findFirst({ where: { codigo } });
        if (!existe) break;
        intentos++;
      }

      return tx.ordenReposicion.create({
        data: {
          codigo,
          fecha: hoy,
          estado: 'pendiente',
          depositoOrigenId,
          depositoDestinoId,
          motivo: 'Manual',
          creadoPorId: usuarioId,
          asignadoAId: asignadoAId ?? null,
          observacion: observacion ?? null,
          generadoAuto: false,
          items: {
            create: items.map(it => ({
              productoId: it.productoId,
              cantidadSugerida: it.cantidad,
              cantidadConfirmada: it.cantidad, // ya confirmado por el usuario
              unidad: it.unidad,
              observacion: it.observacion ?? null,
            })),
          },
        },
        include: {
          depositoOrigen: { select: { id: true, nombre: true } },
          depositoDestino: { select: { id: true, nombre: true } },
          items: { include: { producto: { select: { codigo: true, nombre: true } } } },
        },
      });
    });

    res.status(201).json(orden);
  } catch (error) {
    console.error('POST /reposicion/manual error:', error);
    res.status(500).json({ error: 'Error al crear orden manual de reposición' });
  }
});

// ---------------------------------------------------------------------------
// PARÁMETROS de reposición (por producto × depósito)
// ---------------------------------------------------------------------------

// GET /api/reposicion/parametros?depositoId=X → todos los parámetros del depósito
// o GET /api/reposicion/parametros?productoId=Y → todos los de un producto
router.get('/parametros/lista', async (req: Request, res: Response) => {
  try {
    const { depositoId, productoId } = req.query;
    const where: any = { activo: true };
    if (depositoId) where.depositoId = parseInt(depositoId as string);
    if (productoId) where.productoId = parseInt(productoId as string);

    const parametros = await prisma.stockParametro.findMany({
      where,
      include: {
        producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true, stockMinimo: true, stockIdeal: true } },
        deposito: { select: { id: true, codigo: true, nombre: true } },
      },
      orderBy: [{ depositoId: 'asc' }, { productoId: 'asc' }],
    });

    res.json(parametros);
  } catch (error) {
    console.error('GET /reposicion/parametros/lista error:', error);
    res.status(500).json({ error: 'Error al listar parámetros de reposición' });
  }
});

// PUT /api/reposicion/parametros — bulk upsert de parámetros
// Body: { parametros: [{ productoId, depositoId, stockMinimo?, stockObjetivo?, puntoReposicion? }] }
router.put('/parametros', async (req: Request, res: Response) => {
  try {
    const { parametros } = req.body as {
      parametros: Array<{
        productoId: number;
        depositoId: number;
        stockMinimo?: number | null;
        stockObjetivo?: number | null;
        puntoReposicion?: number | null;
      }>;
    };

    if (!Array.isArray(parametros)) {
      res.status(400).json({ error: 'parametros debe ser un array' });
      return;
    }

    const resultados: any[] = [];

    await prisma.$transaction(async (tx) => {
      for (const p of parametros) {
        if (!p.productoId || !p.depositoId) continue;

        // Si los 3 vienen en null o 0, eliminamos la fila (volvemos al fallback
        // del producto global).
        const allEmpty = (p.stockMinimo == null || p.stockMinimo === 0) &&
                          (p.stockObjetivo == null || p.stockObjetivo === 0) &&
                          (p.puntoReposicion == null || p.puntoReposicion === 0);

        const existing = await tx.stockParametro.findFirst({
          where: { productoId: p.productoId, depositoId: p.depositoId },
        });

        if (allEmpty) {
          if (existing) {
            await tx.stockParametro.delete({ where: { id: existing.id } });
          }
          continue;
        }

        if (existing) {
          const updated = await tx.stockParametro.update({
            where: { id: existing.id },
            data: {
              stockMinimo: p.stockMinimo ?? null,
              stockObjetivo: p.stockObjetivo ?? null,
              puntoReposicion: p.puntoReposicion ?? null,
              activo: true,
            },
          });
          resultados.push(updated);
        } else {
          const created = await tx.stockParametro.create({
            data: {
              productoId: p.productoId,
              depositoId: p.depositoId,
              stockMinimo: p.stockMinimo ?? null,
              stockObjetivo: p.stockObjetivo ?? null,
              puntoReposicion: p.puntoReposicion ?? null,
            },
          });
          resultados.push(created);
        }
      }
    });

    res.json({ actualizados: resultados.length, parametros: resultados });
  } catch (error) {
    console.error('PUT /reposicion/parametros error:', error);
    res.status(500).json({ error: 'Error al guardar parámetros de reposición' });
  }
});

export default router;
