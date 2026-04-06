import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/auth/login - Login con código + PIN
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { codigo, pin } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { codigo },
      include: { depositoDefecto: { select: { id: true, nombre: true } } }
    });

    if (!usuario || !usuario.activo) {
      res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
      return;
    }

    if (usuario.pin && usuario.pin !== pin) {
      res.status(401).json({ error: 'PIN incorrecto' });
      return;
    }

    // Parsear permisos: si es admin tiene acceso a todo, si no, leer del campo
    let permisos: string[] = [];
    if (usuario.rol === 'admin') {
      permisos = ['*']; // wildcard: acceso total
    } else {
      try { permisos = JSON.parse(usuario.permisos || '[]'); } catch { permisos = []; }
    }

    // Leer configuracion de dashboard (columna agregada via migration, no en client Prisma)
    let configuracion: any = null;
    try {
      const raw = await prisma.$queryRawUnsafe<{configuracion: string | null}[]>(
        `SELECT configuracion FROM usuarios WHERE id = ?`, usuario.id
      );
      const confStr = raw[0]?.configuracion;
      if (confStr) configuracion = JSON.parse(confStr);
    } catch {}

    res.json({
      id: usuario.id,
      codigo: usuario.codigo,
      nombre: usuario.nombre,
      rol: usuario.rol,
      permisos,
      configuracion,
      depositoDefectoId: usuario.depositoDefectoId ?? null,
      depositoDefectoNombre: usuario.depositoDefecto?.nombre ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en login' });
  }
});

// GET /api/auth/usuarios - Lista usuarios activos (para selector de login)
router.get('/usuarios', async (_req: Request, res: Response) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rol: true }
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

export default router;
