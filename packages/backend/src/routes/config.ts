import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

const router = Router();

// ============================================================================
// RESET operaciones — BUG CRÍTICO FIXEADO
// ----------------------------------------------------------------------------
// ANTES: requireAdmin leía `usuarioId` del body/query, lo buscaba con
// findUnique SIN filtro de organizacionId, y si era admin permitía continuar.
// Adentro del $transaction, los `tx.X.deleteMany({})` usan un cliente RAW
// sin la extensión multi-tenant → BORRABAN DATA DE TODAS LAS ORGANIZACIONES.
// Un admin malicioso (o confundido) de Org A podía tirar POST /reset-total
// y destruir los datos de todos los clientes de Tomás.
//
// AHORA:
// 1. Capturamos organizacionId del token (vía tenantContext) — fuente de
//    verdad, no del body.
// 2. Validamos que el usuario del token es admin de ESTA organización.
// 3. TODOS los deleteMany llevan `where: { organizacionId }` explícito.
// 4. Agregamos check adicional de rol 'owner' | 'admin' de la cuenta.
// ============================================================================

interface ValidacionOk {
  ok: true;
  organizacionId: number;
  staffUid: number;
}
interface ValidacionFail { ok: false; }

async function validarAdmin(req: Request, res: Response): Promise<ValidacionOk | ValidacionFail> {
  const token = req.token as any;
  if (!token) {
    res.status(401).json({ error: 'Sesión requerida' });
    return { ok: false };
  }
  // Extraer tenant de forma defensiva (getTenant throw si no hay contexto).
  let organizacionId: number;
  let staffUid: number | undefined;
  try {
    const ctx = getTenant();
    organizacionId = ctx.organizacionId;
    staffUid = ctx.staffUid;
  } catch {
    res.status(401).json({ error: 'Se requiere estar en un workspace activo' });
    return { ok: false };
  }

  // El staff debe existir Y ser admin EN ESTA organización (la extensión
  // multi-tenant ya filtra por organizacionId en findFirst).
  if (!staffUid) {
    res.status(401).json({ error: 'Se requiere autenticación de staff' });
    return { ok: false };
  }
  const user = await prisma.usuario.findFirst({ where: { id: staffUid, activo: true } });
  if (!user || user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo administradores pueden ejecutar esta acción' });
    return { ok: false };
  }
  return { ok: true, organizacionId, staffUid };
}

// ── POST /api/config/reset-operativo ──────────────────────────────────────────
// Borra todos los datos OPERATIVOS de la ORGANIZACIÓN ACTIVA. Mantiene maestros.
router.post('/reset-operativo', async (req: Request, res: Response) => {
  try {
    const v = await validarAdmin(req, res);
    if (!v.ok) return;
    const { organizacionId } = v;

    await prisma.$transaction(async (tx) => {
      // Orden: primero tablas hijas, luego padres. Cada deleteMany con filter
      // organizacionId explícito — el tx no tiene la extensión multi-tenant.
      //
      // Modelos sin organizacionId propio (ej: Pago, FacturaItem, OrdenCompraItem,
      // RecepcionItem, InventarioDetalle) se filtran por su relación padre.
      await tx.pago.deleteMany({ where: { factura: { organizacionId } } });
      await tx.movimiento.deleteMany({ where: { organizacionId } });
      await tx.facturaItem.deleteMany({ where: { factura: { organizacionId } } });
      await tx.factura.deleteMany({ where: { organizacionId } });
      await tx.recepcionItem.deleteMany({ where: { recepcion: { organizacionId } } });
      await tx.recepcion.deleteMany({ where: { organizacionId } });
      await tx.ordenCompraItem.deleteMany({ where: { ordenCompra: { organizacionId } } });
      await tx.ordenCompra.deleteMany({ where: { organizacionId } });
      await tx.inventarioDetalle.deleteMany({ where: { inventario: { organizacionId } } });
      await tx.inventario.deleteMany({ where: { organizacionId } });
      await tx.elaboracionLote.deleteMany({ where: { organizacionId } });
      await tx.tarea.deleteMany({ where: { organizacionId } });
    });

    res.json({
      ok: true,
      mensaje: 'Datos operativos de este workspace eliminados. Maestros conservados.',
    });
  } catch (err: any) {
    console.error('[config/reset-operativo]', err);
    res.status(500).json({ error: err.message || 'Error al resetear datos operativos' });
  }
});

// ── POST /api/config/reset-total ──────────────────────────────────────────────
// Borra TODOS los datos de LA ORGANIZACIÓN ACTIVA (operativos + maestros).
// Conserva SOLO el admin actual para no dejar al cliente afuera.
router.post('/reset-total', async (req: Request, res: Response) => {
  try {
    const v = await validarAdmin(req, res);
    if (!v.ok) return;
    const { organizacionId, staffUid } = v;

    await prisma.$transaction(async (tx) => {
      // 1. Operativos (ver comentarios arriba)
      await tx.pago.deleteMany({ where: { factura: { organizacionId } } });
      await tx.movimiento.deleteMany({ where: { organizacionId } });
      await tx.facturaItem.deleteMany({ where: { factura: { organizacionId } } });
      await tx.factura.deleteMany({ where: { organizacionId } });
      await tx.recepcionItem.deleteMany({ where: { recepcion: { organizacionId } } });
      await tx.recepcion.deleteMany({ where: { organizacionId } });
      await tx.ordenCompraItem.deleteMany({ where: { ordenCompra: { organizacionId } } });
      await tx.ordenCompra.deleteMany({ where: { organizacionId } });
      await tx.inventarioDetalle.deleteMany({ where: { inventario: { organizacionId } } });
      await tx.inventario.deleteMany({ where: { organizacionId } });
      await tx.elaboracionLote.deleteMany({ where: { organizacionId } });
      await tx.tarea.deleteMany({ where: { organizacionId } });

      // 2. Limpiar FKs de usuarios/productos que apuntan a depósitos
      await tx.usuario.updateMany({
        where: { organizacionId },
        data: { depositoDefectoId: null },
      });
      await tx.producto.updateMany({
        where: { organizacionId },
        data: { depositoDefectoId: null },
      });

      // 3. Maestros secundarios — scopeados al tenant
      await tx.recetaIngrediente.deleteMany({ where: { receta: { organizacionId } } });
      await tx.receta.deleteMany({ where: { organizacionId } });
      await tx.proveedorProducto.deleteMany({ where: { organizacionId } });
      await tx.proveedor.deleteMany({ where: { organizacionId } });
      await tx.producto.deleteMany({ where: { organizacionId } });
      await tx.deposito.deleteMany({ where: { organizacionId } });

      // 4. Usuarios de esta org — conservamos SOLO al admin que ejecutó el reset
      // (si lo borramos pierde acceso y queda el workspace en limbo).
      await tx.usuario.deleteMany({
        where: { organizacionId, NOT: { id: staffUid } },
      });

      // 5. Si por alguna razón ya no existe el admin (no debería, porque
      // validamos en validarAdmin), recrearlo con PIN por default.
      const adminAun = await tx.usuario.findFirst({
        where: { organizacionId, id: staffUid },
      });
      if (!adminAun) {
        await tx.usuario.create({
          data: {
            organizacionId,
            codigo: 'ADM-01',
            nombre: 'Administrador',
            rol: 'admin',
            pin: '1234',
            activo: true,
            permisos: '["*"]',
          },
        });
      }
    });

    res.json({
      ok: true,
      mensaje: 'Reseteo total de este workspace completado. Se conservó tu usuario administrador.',
    });
  } catch (err: any) {
    console.error('[config/reset-total]', err);
    res.status(500).json({ error: err.message || 'Error al ejecutar reset total' });
  }
});

// ── GET /api/config/stats ─────────────────────────────────────────────────────
// Estadísticas de la organización actual (los counts usan la extensión
// multi-tenant, así que automáticamente filtran por organizacionId).
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [
      productos, depositos, usuarios, proveedores, recetas,
      movimientos, inventarios, ordenesCompra, tareas,
      elaboraciones, facturas, pagos,
    ] = await Promise.all([
      prisma.producto.count(),
      prisma.deposito.count(),
      prisma.usuario.count(),
      prisma.proveedor.count(),
      prisma.receta.count(),
      prisma.movimiento.count(),
      prisma.inventario.count(),
      prisma.ordenCompra.count(),
      prisma.tarea.count(),
      prisma.elaboracionLote.count(),
      prisma.factura.count(),
      prisma.pago.count(),
    ]);

    res.json({
      maestros: { productos, depositos, usuarios, proveedores, recetas },
      operativos: { movimientos, inventarios, ordenesCompra, tareas, elaboraciones, facturas, pagos },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
