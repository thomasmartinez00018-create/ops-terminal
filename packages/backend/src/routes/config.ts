import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// ── Helper: verificar que el usuario sea admin ──────────────────────────────
async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const usuarioId = Number(req.body?.usuarioId || req.query?.usuarioId);
  if (!usuarioId || isNaN(usuarioId)) {
    res.status(401).json({ error: 'Se requiere usuarioId' });
    return false;
  }
  const user = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!user || user.rol !== 'admin') {
    res.status(403).json({ error: 'Solo administradores pueden ejecutar esta acción' });
    return false;
  }
  return true;
}

// ── POST /api/config/reset-operativo ──────────────────────────────────────────
// Borra todos los datos operativos: movimientos, facturas, OC, inventarios,
// tareas, elaboraciones. Mantiene maestros: productos, depósitos, usuarios,
// proveedores, recetas.
router.post('/reset-operativo', async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await prisma.$transaction(async (tx) => {
      // Orden: primero las tablas hoja, luego las padres
      await tx.pago.deleteMany({});
      await tx.movimiento.deleteMany({});
      await tx.facturaItem.deleteMany({});
      await tx.factura.deleteMany({});
      await tx.recepcionItem.deleteMany({});
      await tx.recepcion.deleteMany({});
      await tx.ordenCompraItem.deleteMany({});
      await tx.ordenCompra.deleteMany({});
      await tx.inventarioDetalle.deleteMany({});
      await tx.inventario.deleteMany({});
      await tx.elaboracionLote.deleteMany({});
      await tx.tarea.deleteMany({});
    });

    res.json({
      ok: true,
      mensaje: 'Datos operativos eliminados. Maestros (productos, depósitos, usuarios, proveedores, recetas) conservados.',
    });
  } catch (err: any) {
    console.error('[config/reset-operativo]', err);
    res.status(500).json({ error: err.message || 'Error al resetear datos operativos' });
  }
});

// ── POST /api/config/reset-total ──────────────────────────────────────────────
// Borra ABSOLUTAMENTE TODOS los datos y deja la app como recién instalada.
// Conserva SOLO el usuario administrador con PIN 1234.
router.post('/reset-total', async (req: Request, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    await prisma.$transaction(async (tx) => {
      // 1. Datos operativos
      await tx.pago.deleteMany({});
      await tx.movimiento.deleteMany({});
      await tx.facturaItem.deleteMany({});
      await tx.factura.deleteMany({});
      await tx.recepcionItem.deleteMany({});
      await tx.recepcion.deleteMany({});
      await tx.ordenCompraItem.deleteMany({});
      await tx.ordenCompra.deleteMany({});
      await tx.inventarioDetalle.deleteMany({});
      await tx.inventario.deleteMany({});
      await tx.elaboracionLote.deleteMany({});
      await tx.tarea.deleteMany({});

      // 2. Limpiar FKs de usuarios y productos que apuntan a depósitos
      await tx.usuario.updateMany({ data: { depositoDefectoId: null } });
      await tx.producto.updateMany({ data: { depositoDefectoId: null } });

      // 3. Maestros secundarios
      await tx.recetaIngrediente.deleteMany({});
      await tx.receta.deleteMany({});
      await tx.proveedorProducto.deleteMany({});
      await tx.proveedor.deleteMany({});
      await tx.producto.deleteMany({});
      await tx.deposito.deleteMany({});

      // 4. Eliminar todos los usuarios excepto el admin que conservamos
      await tx.usuario.deleteMany({});

      // 5. Recrear usuario administrador
      await tx.usuario.create({
        data: {
          codigo: 'ADM-01',
          nombre: 'Administrador',
          rol: 'admin',
          pin: '1234',
          activo: true,
          permisos: '["*"]',
        },
      });
    });

    res.json({
      ok: true,
      mensaje: 'Reseteo de fábrica completado. Se conservó únicamente el usuario Administrador (PIN: 1234).',
    });
  } catch (err: any) {
    console.error('[config/reset-total]', err);
    res.status(500).json({ error: err.message || 'Error al ejecutar reset de fábrica' });
  }
});

// ── GET /api/config/stats ─────────────────────────────────────────────────────
// Estadísticas de cuántos registros hay en la DB, para mostrar antes del reset
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
