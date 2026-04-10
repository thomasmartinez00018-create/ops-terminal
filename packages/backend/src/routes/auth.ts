import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { hashPin, verifyPin, isBcryptHash, signToken, requireAuth } from '../lib/auth';

const router = Router();

// ── Rate limit: 10 intentos cada 15 min por IP ──────────────────────────────
// Protege contra brute-force del PIN. En cloud la app está expuesta a internet
// entero, así que esto es crítico.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login — devuelve { token, user }
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { codigo, pin } = req.body;
    if (!codigo || typeof codigo !== 'string') {
      res.status(400).json({ error: 'Código requerido' });
      return;
    }

    const usuario = await prisma.usuario.findUnique({
      where: { codigo },
      include: { depositoDefecto: { select: { id: true, nombre: true } } },
    });

    if (!usuario || !usuario.activo) {
      res.status(401).json({ error: 'Usuario o PIN incorrectos' });
      return;
    }

    // Verificar PIN (si el usuario tiene uno configurado)
    if (usuario.pin) {
      if (typeof pin !== 'string' || pin.length === 0) {
        res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        return;
      }
      const valid = await verifyPin(pin, usuario.pin);
      if (!valid) {
        res.status(401).json({ error: 'Usuario o PIN incorrectos' });
        return;
      }
      // Migración transparente: si el PIN estaba en texto plano (legacy de
      // antes del hardening), lo re-hasheamos ahora que sabemos el valor
      // correcto. El usuario no nota nada.
      if (!isBcryptHash(usuario.pin)) {
        try {
          const newHash = await hashPin(pin);
          await prisma.usuario.update({ where: { id: usuario.id }, data: { pin: newHash } });
        } catch (_) {}
      }
    }

    // Parsear permisos
    let permisos: string[] = [];
    if (usuario.rol === 'admin') {
      permisos = ['*'];
    } else {
      try { permisos = JSON.parse(usuario.permisos || '[]'); } catch { permisos = []; }
    }

    // Configuracion del dashboard
    let configuracion: any = null;
    if (usuario.configuracion) {
      try { configuracion = JSON.parse(usuario.configuracion); } catch {}
    }

    // Firmar JWT
    const token = signToken({
      uid: usuario.id,
      codigo: usuario.codigo,
      rol: usuario.rol,
    });

    res.json({
      token,
      user: {
        id: usuario.id,
        codigo: usuario.codigo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        permisos,
        configuracion,
        depositoDefectoId: usuario.depositoDefectoId ?? null,
        depositoDefectoNombre: usuario.depositoDefecto?.nombre ?? null,
      },
    });
  } catch (error) {
    console.error('[auth/login]', error);
    res.status(500).json({ error: 'Error en login' });
  }
});

// GET /api/auth/me — validar token y refrescar datos del usuario
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const usuario = await prisma.usuario.findUnique({
      where: { id: uid },
      include: { depositoDefecto: { select: { id: true, nombre: true } } },
    });
    if (!usuario || !usuario.activo) {
      res.status(401).json({ error: 'Usuario inactivo' });
      return;
    }
    let permisos: string[] = [];
    if (usuario.rol === 'admin') {
      permisos = ['*'];
    } else {
      try { permisos = JSON.parse(usuario.permisos || '[]'); } catch {}
    }
    let configuracion: any = null;
    if (usuario.configuracion) {
      try { configuracion = JSON.parse(usuario.configuracion); } catch {}
    }
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
    res.status(500).json({ error: 'Error al validar sesión' });
  }
});

// GET /api/auth/usuarios — lista de usuarios activos para el selector del login.
// Esta ruta NO requiere auth (es pre-login) pero solo devuelve datos públicos
// básicos (nombre, código, rol). Sin PINs, sin emails, sin nada sensible.
router.get('/usuarios', async (_req: Request, res: Response) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rol: true },
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

export default router;
