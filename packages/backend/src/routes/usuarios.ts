import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Nota histórica: este archivo usaba `prisma.$executeRawUnsafe(... ?, ...)` para
// leer/escribir `configuracion`, con placeholders estilo SQLite (`?`). Como la
// DB real es Postgres (schema.prisma → provider="postgresql"), esos queries
// FALLABAN silenciosamente o tiraban 500 → "Vista dueño" no persistía, los
// widgets custom del dashboard volvían al default, etc. Ahora usamos el cliente
// Prisma generado directamente — el campo está en el schema y es typesafe.

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

    // No enviar PIN en la lista. `configuracion` viene como string JSON; lo
    // parseamos acá para que el frontend lo consuma como objeto.
    res.json(usuarios.map(({ pin, configuracion, ...u }: any) => ({
      ...u,
      configuracion: parseConfig(configuracion),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// GET /api/usuarios/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    const { pin, configuracion, ...data } = usuario as any;
    res.json({ ...data, configuracion: parseConfig(configuracion) });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// POST /api/usuarios
router.post('/', async (req: Request, res: Response) => {
  try {
    const { configuracion, ...restBody } = req.body;
    const data: any = { ...restBody };
    if (configuracion !== undefined) {
      data.configuracion = configuracion ? JSON.stringify(configuracion) : null;
    }
    const usuario = await prisma.usuario.create({ data });
    const { pin, configuracion: rawConf, ...rest } = usuario as any;
    res.status(201).json({ ...rest, configuracion: parseConfig(rawConf) });
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
    const { codigo, nombre, rol, pin, permisos, configuracion, depositoDefectoId, activo } = req.body;
    const id = parseInt(req.params.id as string);
    const updateData: any = {};
    if (codigo !== undefined) updateData.codigo = String(codigo);
    if (nombre !== undefined) updateData.nombre = String(nombre);
    if (rol !== undefined) updateData.rol = String(rol);
    if (pin !== undefined && pin !== '' && pin !== null) updateData.pin = String(pin);
    if (permisos !== undefined) updateData.permisos = String(permisos);
    if (depositoDefectoId !== undefined) updateData.depositoDefectoId = depositoDefectoId ? Number(depositoDefectoId) : null;
    if (activo !== undefined) updateData.activo = Boolean(activo);
    if (configuracion !== undefined) {
      updateData.configuracion = configuracion ? JSON.stringify(configuracion) : null;
    }

    const usuario = await prisma.usuario.update({ where: { id }, data: updateData });

    const { pin: _pin, configuracion: rawConf, ...data } = usuario as any;
    res.json({ ...data, configuracion: parseConfig(rawConf) });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un usuario con ese código' });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    console.error('[usuarios/put]', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/usuarios/:id  (soft delete: activo=false)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.usuario.update({ where: { id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// Helper: parseo seguro de configuracion. Si el JSON quedó corrupto (legacy
// de un escritorio viejo, encoding raro), devolvemos null en vez de crashear.
function parseConfig(raw: string | null | undefined): any | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export default router;
