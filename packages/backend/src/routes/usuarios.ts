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

    // Leer configuracion via raw (columna no en client generado)
    const rawConfs = await prisma.$queryRawUnsafe<{id: number, configuracion: string | null}[]>(
      `SELECT id, configuracion FROM usuarios`
    );
    const confMap: Record<number, any> = {};
    for (const r of rawConfs) {
      confMap[r.id] = r.configuracion ? JSON.parse(r.configuracion) : null;
    }

    // No enviar PIN en la lista
    res.json(usuarios.map(({ pin, ...u }) => ({
      ...u,
      configuracion: confMap[u.id] ?? null,
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
    const rawConf = await prisma.$queryRawUnsafe<{configuracion: string | null}[]>(
      `SELECT configuracion FROM usuarios WHERE id = ?`, id
    );
    const configuracion = rawConf[0]?.configuracion ? JSON.parse(rawConf[0].configuracion) : null;
    const { pin, ...data } = usuario;
    res.json({ ...data, configuracion });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// POST /api/usuarios
router.post('/', async (req: Request, res: Response) => {
  try {
    const { configuracion, ...restBody } = req.body;
    const usuario = await prisma.usuario.create({ data: restBody });
    if (configuracion) {
      await prisma.$executeRawUnsafe(
        `UPDATE usuarios SET configuracion = ? WHERE id = ?`,
        JSON.stringify(configuracion), usuario.id
      );
    }
    const { pin, ...data } = usuario;
    res.status(201).json({ ...data, configuracion: configuracion ?? null });
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

    const usuario = await prisma.usuario.update({ where: { id }, data: updateData });

    // Guardar configuracion via raw (columna no en client generado)
    if (configuracion !== undefined) {
      const confStr = configuracion ? JSON.stringify(configuracion) : null;
      await prisma.$executeRawUnsafe(
        `UPDATE usuarios SET configuracion = ? WHERE id = ?`,
        confStr, id
      );
    }

    const { pin: _pin, ...data } = usuario;
    res.json({ ...data, configuracion: configuracion ?? null });
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
