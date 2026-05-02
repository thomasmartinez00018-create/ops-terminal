import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

const router = Router();

// ============================================================================
// SESIONES DE VENTA — Punto de Venta móvil
// ============================================================================
// Modelo genérico: una "sesión" es la ventana operativa de un depósito que
// vende. Aplica a kiosco/carrito, barra de evento, food truck, delivery propio,
// minibar de hotel, cantina con buffet, etc.
//
// Flujo:
//   POST   /sesiones                  → abrir sesión (estado=abierta)
//   GET    /sesiones                  → listar (filtros: estado, depositoId)
//   GET    /sesiones/abierta/:depId   → obtener sesión activa de un depósito
//   GET    /sesiones/:id              → detalle (con ventas + cobros + conteos)
//   POST   /sesiones/:id/ventas       → registrar venta-item (no descuenta stock)
//   DELETE /sesiones/:id/ventas/:vid  → eliminar venta (solo sesión abierta)
//   POST   /sesiones/:id/cerrar       → cerrar (descuenta stock, registra cobros + conteos)
//   POST   /sesiones/:id/reabrir      → reabrir sesión cerrada (admin only) — TODO si se necesita
// ============================================================================

// ─── Helpers ───────────────────────────────────────────────────────────────
function todayDate(): string {
  // YYYY-MM-DD en zona local
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function nowTime(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ─── GET /api/sesiones ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { estado, depositoId, limite } = req.query;
    const where: any = {};
    if (estado) where.estado = String(estado);
    if (depositoId) where.depositoId = parseInt(String(depositoId));

    const sesiones = await prisma.sesionVenta.findMany({
      where,
      include: {
        deposito: { select: { id: true, codigo: true, nombre: true, tipo: true } },
        operador: { select: { id: true, nombre: true } },
        _count: { select: { ventas: true, cobros: true } },
      },
      orderBy: [{ estado: 'asc' }, { abiertaAt: 'desc' }],
      take: limite ? Math.min(parseInt(String(limite)), 500) : 50,
    });
    res.json(sesiones);
  } catch (e: any) {
    console.error('[sesiones] GET error', e);
    res.status(500).json({ error: e?.message || 'Error listando sesiones' });
  }
});

// ─── GET /api/sesiones/abierta/:depositoId ─────────────────────────────────
// Devuelve la sesión activa del depósito o null. Útil al entrar al PuntoVenta.
router.get('/abierta/:depositoId', async (req: Request, res: Response) => {
  try {
    const depositoId = parseInt(String(req.params.depositoId));
    const sesion = await prisma.sesionVenta.findFirst({
      where: { depositoId, estado: 'abierta' },
      include: {
        deposito: { select: { id: true, codigo: true, nombre: true } },
        operador: { select: { id: true, nombre: true } },
        ventas: {
          include: {
            producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
          },
          orderBy: { registradoAt: 'desc' },
        },
        cobros: true,
      },
    });
    res.json(sesion);
  } catch (e: any) {
    console.error('[sesiones] GET abierta error', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ─── GET /api/sesiones/:id ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const sesion = await prisma.sesionVenta.findUnique({
      where: { id },
      include: {
        deposito: { select: { id: true, codigo: true, nombre: true, tipo: true } },
        operador: { select: { id: true, nombre: true } },
        ventas: {
          include: {
            producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
          },
          orderBy: { registradoAt: 'desc' },
        },
        cobros: true,
        conteos: {
          include: {
            producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
          },
        },
      },
    });
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
    res.json(sesion);
  } catch (e: any) {
    console.error('[sesiones] GET :id error', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ─── POST /api/sesiones ─────────────────────────────────────────────────────
// Abre una sesión sobre un depósito. Falla si ya hay una abierta para ese
// depósito (constraint operativo: una activa por punto).
router.post('/', async (req: Request, res: Response) => {
  try {
    const { depositoId, operadorId, observaciones } = req.body || {};
    if (!depositoId || !operadorId) {
      return res.status(400).json({ error: 'depositoId y operadorId son requeridos' });
    }
    const depId = parseInt(String(depositoId));
    const opId = parseInt(String(operadorId));

    // Validar depósito y operador existen (multi-tenant lo filtra)
    const [dep, op] = await Promise.all([
      prisma.deposito.findUnique({ where: { id: depId } }),
      prisma.usuario.findUnique({ where: { id: opId } }),
    ]);
    if (!dep) return res.status(404).json({ error: 'Depósito no encontrado' });
    if (!op) return res.status(404).json({ error: 'Operador no encontrado' });

    // Una sola sesión activa por depósito
    const yaAbierta = await prisma.sesionVenta.findFirst({
      where: { depositoId: depId, estado: 'abierta' },
      select: { id: true },
    });
    if (yaAbierta) {
      return res.status(409).json({
        error: 'Ya existe una sesión abierta en este depósito',
        sesionAbiertaId: yaAbierta.id,
      });
    }

    const sesion = await prisma.sesionVenta.create({
      data: {
        depositoId: depId,
        operadorId: opId,
        observaciones: observaciones ? String(observaciones).slice(0, 500) : null,
        estado: 'abierta',
      },
      include: {
        deposito: { select: { id: true, codigo: true, nombre: true } },
        operador: { select: { id: true, nombre: true } },
      },
    });
    res.status(201).json(sesion);
  } catch (e: any) {
    console.error('[sesiones] POST error', e);
    res.status(500).json({ error: e?.message || 'Error creando sesión' });
  }
});

// ─── POST /api/sesiones/:id/ventas ─────────────────────────────────────────
// Registra un VentaItem. NO descuenta stock todavía (eso pasa al cerrar).
// Acepta clienteUuid para idempotencia (retries de red / offline futuro).
router.post('/:id/ventas', async (req: Request, res: Response) => {
  try {
    const sesionId = parseInt(String(req.params.id));
    const { productoId, cantidad, precioUnitario, clienteUuid } = req.body || {};
    if (!productoId || cantidad == null || precioUnitario == null) {
      return res.status(400).json({ error: 'productoId, cantidad y precioUnitario son requeridos' });
    }
    const cant = Number(cantidad);
    const precio = Number(precioUnitario);
    if (!isFinite(cant) || cant <= 0) return res.status(400).json({ error: 'cantidad inválida' });
    if (!isFinite(precio) || precio < 0) return res.status(400).json({ error: 'precioUnitario inválido' });

    const sesion = await prisma.sesionVenta.findUnique({
      where: { id: sesionId },
      select: { id: true, estado: true },
    });
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (sesion.estado !== 'abierta') {
      return res.status(409).json({ error: 'La sesión está cerrada — no se pueden agregar ventas' });
    }

    // Idempotencia: si vino un clienteUuid y ya existe, devuelvo el item existente
    if (clienteUuid) {
      const existente = await prisma.ventaItem.findUnique({
        where: { clienteUuid: String(clienteUuid) },
        include: { producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } } },
      });
      if (existente) return res.json(existente);
    }

    const subtotal = +(cant * precio).toFixed(2);
    const item = await prisma.ventaItem.create({
      data: {
        sesionId,
        productoId: parseInt(String(productoId)),
        cantidad: cant,
        precioUnitario: precio,
        subtotal,
        clienteUuid: clienteUuid ? String(clienteUuid) : null,
      },
      include: {
        producto: { select: { id: true, codigo: true, nombre: true, unidadUso: true } },
      },
    });
    res.status(201).json(item);
  } catch (e: any) {
    console.error('[sesiones] POST ventas error', e);
    res.status(500).json({ error: e?.message || 'Error registrando venta' });
  }
});

// ─── DELETE /api/sesiones/:id/ventas/:ventaId ──────────────────────────────
router.delete('/:id/ventas/:ventaId', async (req: Request, res: Response) => {
  try {
    const sesionId = parseInt(String(req.params.id));
    const ventaId = parseInt(String(req.params.ventaId));
    const sesion = await prisma.sesionVenta.findUnique({ where: { id: sesionId }, select: { estado: true } });
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (sesion.estado !== 'abierta') {
      return res.status(409).json({ error: 'La sesión está cerrada — no se pueden eliminar ventas' });
    }
    await prisma.ventaItem.deleteMany({ where: { id: ventaId, sesionId } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[sesiones] DELETE venta error', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ─── POST /api/sesiones/:id/cerrar ─────────────────────────────────────────
// Cierra la sesión:
//   1. Suma cantidades vendidas por producto
//   2. Crea Movimientos tipo='salida' (descuenta stock del depósito)
//   3. Registra Cobros del body
//   4. Registra ConteoCierre del body (con diferencia esperado vs real)
//   5. Marca sesión estado='cerrada' + totales
//
// Body: {
//   cobros: [{ medio, monto, observacion? }],
//   conteos: [{ productoId, real }],   // esperado se calcula
//   observaciones?: string
// }
router.post('/:id/cerrar', async (req: Request, res: Response) => {
  try {
    const sesionId = parseInt(String(req.params.id));
    const { cobros = [], conteos = [], observaciones } = req.body || {};
    const { staffUid } = getTenant();

    const sesion = await prisma.sesionVenta.findUnique({
      where: { id: sesionId },
      include: { ventas: true, deposito: { select: { id: true, codigo: true } } },
    });
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (sesion.estado !== 'abierta') {
      return res.status(409).json({ error: 'La sesión ya está cerrada' });
    }

    // Sumar cantidad vendida por producto
    const ventasPorProducto = new Map<number, number>();
    let totalVentas = 0;
    for (const v of sesion.ventas) {
      ventasPorProducto.set(
        v.productoId,
        (ventasPorProducto.get(v.productoId) || 0) + v.cantidad,
      );
      totalVentas += v.subtotal;
    }
    totalVentas = +totalVentas.toFixed(2);

    // Validar cobros
    const cobrosClean: Array<{ medio: string; monto: number; observacion?: string }> = [];
    let totalCobros = 0;
    for (const c of cobros) {
      const monto = Number(c?.monto);
      const medio = String(c?.medio || '').trim();
      if (!medio || !isFinite(monto)) continue;
      cobrosClean.push({
        medio,
        monto,
        observacion: c?.observacion ? String(c.observacion).slice(0, 200) : undefined,
      });
      totalCobros += monto;
    }
    totalCobros = +totalCobros.toFixed(2);

    const fechaCierre = todayDate();
    const horaCierre = nowTime();
    const operadorMovId = sesion.operadorId;

    // Catálogo de productos para sacar unidad
    const prodIds = Array.from(ventasPorProducto.keys());
    const productos = prodIds.length
      ? await prisma.producto.findMany({
          where: { id: { in: prodIds } },
          select: { id: true, unidadUso: true },
        })
      : [];
    const unidadPorProducto = new Map(productos.map(p => [p.id, p.unidadUso]));

    await prisma.$transaction(async (tx) => {
      // 1. Movimientos de salida (descuento de stock del depósito)
      for (const [productoId, cantidadTotal] of ventasPorProducto) {
        if (cantidadTotal <= 0) continue;
        await tx.movimiento.create({
          data: {
            fecha: fechaCierre,
            hora: horaCierre,
            usuarioId: operadorMovId,
            tipo: 'salida',
            productoId,
            cantidad: cantidadTotal,
            unidad: unidadPorProducto.get(productoId) || 'unidad',
            depositoOrigenId: sesion.depositoId,
            motivo: `Venta sesión #${sesion.id}`,
            documentoRef: `SES-${sesion.id}`,
          },
        });
      }

      // 2. Cobros
      if (cobrosClean.length) {
        for (const c of cobrosClean) {
          await tx.cobro.create({
            data: {
              sesionId,
              medio: c.medio,
              monto: c.monto,
              observacion: c.observacion ?? null,
            },
          });
        }
      }

      // 3. Conteos de cierre con diferencia esperado vs real
      // El "esperado" es el stock que debería tener el depósito DESPUÉS del
      // descuento de la sesión. Lo calculamos al vuelo a partir de movimientos
      // del depósito + lo que acabamos de descontar.
      // Para evitar consultas pesadas, lo derivamos como:
      //   esperado = stock_actual_post_descuento (Postgres sum)
      // pero es más simple delegar el cálculo al frontend (que ya tiene la
      // foto del stock pre-cierre y le resta lo vendido). Acá confiamos en el
      // body: { productoId, esperado, real } o solo { productoId, real }.
      // Si no viene `esperado`, lo calculamos restando lo vendido al stock
      // actual del depósito.

      if (Array.isArray(conteos) && conteos.length) {
        for (const c of conteos) {
          const productoId = parseInt(String(c?.productoId));
          const real = Number(c?.real);
          if (!productoId || !isFinite(real)) continue;

          let esperado = c?.esperado != null ? Number(c.esperado) : null;
          if (esperado == null) {
            // Stock actual del depósito (post descuento) = sumatoria de
            // movimientos cuyo destino es este depósito menos los que tienen
            // origen acá.
            const r = await tx.$queryRawUnsafe<Array<{ stock: number }>>(
              `SELECT
                  COALESCE(SUM(CASE WHEN deposito_destino_id = $1 THEN cantidad
                                    WHEN deposito_origen_id = $1 THEN -cantidad
                                    ELSE 0 END), 0)::float AS stock
                 FROM movimientos
                WHERE producto_id = $2`,
              sesion.depositoId, productoId,
            );
            esperado = r[0]?.stock ?? 0;
          }
          const diferencia = +(real - (esperado || 0)).toFixed(4);

          await tx.conteoCierre.upsert({
            where: { sesionId_productoId: { sesionId, productoId } },
            create: { sesionId, productoId, esperado: esperado || 0, real, diferencia },
            update: { esperado: esperado || 0, real, diferencia },
          });
        }
      }

      // 4. Marcar sesión como cerrada
      await tx.sesionVenta.update({
        where: { id: sesionId },
        data: {
          estado: 'cerrada',
          cerradaAt: new Date(),
          totalVentas,
          totalCobros,
          observaciones: observaciones
            ? String(observaciones).slice(0, 500)
            : sesion.observaciones,
        },
      });
    });

    const full = await prisma.sesionVenta.findUnique({
      where: { id: sesionId },
      include: {
        deposito: { select: { id: true, codigo: true, nombre: true } },
        operador: { select: { id: true, nombre: true } },
        ventas: { include: { producto: { select: { nombre: true, unidadUso: true } } } },
        cobros: true,
        conteos: { include: { producto: { select: { nombre: true, unidadUso: true } } } },
      },
    });
    res.json(full);
  } catch (e: any) {
    console.error('[sesiones] cerrar error', e);
    res.status(500).json({ error: e?.message || 'Error cerrando sesión' });
  }
});

// ─── GET /api/sesiones/depositos/disponibles ──────────────────────────────
// Lista depósitos del tenant — útil para elegir carrito al abrir sesión.
// (Trae también la sesión abierta si la hay.)
router.get('/depositos/disponibles', async (_req: Request, res: Response) => {
  try {
    const depositos = await prisma.deposito.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, tipo: true },
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
    const ids = depositos.map(d => d.id);
    const sesionesAbiertas = ids.length
      ? await prisma.sesionVenta.findMany({
          where: { depositoId: { in: ids }, estado: 'abierta' },
          select: { id: true, depositoId: true, operadorId: true, abiertaAt: true,
                    operador: { select: { nombre: true } } },
        })
      : [];
    const mapAbierta = new Map(sesionesAbiertas.map(s => [s.depositoId, s]));
    const out = depositos.map(d => ({
      ...d,
      sesionAbierta: mapAbierta.get(d.id) || null,
    }));
    res.json(out);
  } catch (e: any) {
    console.error('[sesiones] depositos error', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// ─── GET /api/sesiones/:id/stock-actual ────────────────────────────────────
// Devuelve el stock actual del depósito de la sesión, restando ya las ventas
// pendientes (no descontadas todavía). Útil para el conteo de cierre — el
// frontend muestra "esperado" pre-completado.
router.get('/:id/stock-actual', async (req: Request, res: Response) => {
  try {
    const sesionId = parseInt(String(req.params.id));
    const sesion = await prisma.sesionVenta.findUnique({
      where: { id: sesionId },
      select: { depositoId: true, ventas: { select: { productoId: true, cantidad: true } } },
    });
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });

    // Stock actual del depósito por producto (todos los productos con movimientos)
    const stockRows = await prisma.$queryRawUnsafe<Array<{ producto_id: number; stock: number; nombre: string; codigo: string; unidad_uso: string }>>(
      `SELECT m.producto_id::int as producto_id, p.nombre, p.codigo, p.unidad_uso,
              COALESCE(SUM(CASE WHEN m.deposito_destino_id = $1 THEN m.cantidad
                                WHEN m.deposito_origen_id  = $1 THEN -m.cantidad
                                ELSE 0 END), 0)::float AS stock
         FROM movimientos m
         JOIN productos p ON p.id = m.producto_id
        WHERE (m.deposito_destino_id = $1 OR m.deposito_origen_id = $1)
        GROUP BY m.producto_id, p.nombre, p.codigo, p.unidad_uso
        HAVING COALESCE(SUM(CASE WHEN m.deposito_destino_id = $1 THEN m.cantidad
                                  WHEN m.deposito_origen_id  = $1 THEN -m.cantidad
                                  ELSE 0 END), 0) <> 0`,
      sesion.depositoId,
    );

    // Restar ventas pendientes (no descontadas)
    const pendiente = new Map<number, number>();
    for (const v of sesion.ventas) {
      pendiente.set(v.productoId, (pendiente.get(v.productoId) || 0) + v.cantidad);
    }

    const out = stockRows.map(r => ({
      productoId: r.producto_id,
      codigo: r.codigo,
      nombre: r.nombre,
      unidadUso: r.unidad_uso,
      stockActual: r.stock,                                        // antes de descontar ventas
      stockEsperado: +(r.stock - (pendiente.get(r.producto_id) || 0)).toFixed(4), // post-cierre
    }));
    res.json(out);
  } catch (e: any) {
    console.error('[sesiones] stock-actual error', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
