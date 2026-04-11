import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import {
  hashPin,
  verifyPin,
  isBcryptHash,
  signToken,
  requireOrg,
  requireStaff,
  TokenOrg,
  TokenStaff,
} from '../lib/auth';

const router = Router();

// ============================================================================
// STAFF AUTH — nivel 2/3 (código + PIN dentro de un workspace)
// ============================================================================
// Estas rutas requieren un token stage 2 (cuenta con workspace elegido).
// El staff login es SECUNDARIO al login de cuenta — primero elegiste la org,
// ahora elegís qué usuario staff usás para operar.
//
// El filtro automático del Prisma extension garantiza que solo se listen /
// loguen usuarios de la misma organizacionId del token.
// ============================================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── GET /api/auth/usuarios ─────────────────────────────────────────────────
// Lista usuarios activos de la org actual para mostrar en el selector tipo
// POS. NO expone PINs. Requiere stage 2 (org elegida).
router.get('/usuarios', requireOrg, async (_req: Request, res: Response) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rol: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(usuarios);
  } catch (error) {
    console.error('[auth/usuarios]', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────
// Staff login con código + PIN. El Prisma extension filtra automáticamente
// por organizacionId (del stage 2 token), así que usuarios de otras orgs
// con el mismo código no colisionan.
router.post('/login', loginLimiter, requireOrg, async (req: Request, res: Response) => {
  try {
    const { codigo, pin } = req.body;
    if (!codigo || typeof codigo !== 'string') {
      res.status(400).json({ error: 'Código requerido' });
      return;
    }

    const tokenOrg = req.token as TokenOrg;

    const usuario = await prisma.usuario.findFirst({
      where: { codigo, activo: true },
      include: { depositoDefecto: { select: { id: true, nombre: true } } },
    });

    if (!usuario) {
      res.status(401).json({ error: 'Usuario o PIN incorrectos' });
      return;
    }

    // Verificar PIN
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
      // Migración transparente a bcrypt
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

    // Firmar STAGE 3 — staff autenticado
    const token = signToken({
      kind: 'staff',
      cuentaId: tokenOrg.cuentaId,
      email: tokenOrg.email,
      organizacionId: tokenOrg.organizacionId,
      rolCuenta: tokenOrg.rolCuenta,
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

// ─── POST /api/auth/bootstrap-admin ─────────────────────────────────────────
// Crea el PRIMER usuario staff (rol=admin) de un workspace. Solo funciona si:
//   1. El token es stage 2 (cuenta con workspace elegido)
//   2. El cuenta es owner/admin del workspace (rolCuenta ∈ {owner,admin})
//   3. El workspace tiene 0 usuarios staff todavía
// Esto cubre el flujo "creé un workspace nuevo y no tengo forma de crear el
// primer admin" — sin esto el usuario quedaría trabado en la pantalla de
// "No hay usuarios registrados".
router.post('/bootstrap-admin', requireOrg, async (req: Request, res: Response) => {
  try {
    const tokenOrg = req.token as TokenOrg;
    if (tokenOrg.rolCuenta !== 'owner' && tokenOrg.rolCuenta !== 'admin') {
      res.status(403).json({ error: 'Solo el owner del workspace puede crear el primer admin' });
      return;
    }

    const { codigo, nombre, pin } = req.body ?? {};
    if (typeof codigo !== 'string' || codigo.trim().length < 2 || codigo.trim().length > 20) {
      res.status(400).json({ error: 'Código requerido (2-20 caracteres)' });
      return;
    }
    if (typeof nombre !== 'string' || nombre.trim().length < 2) {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'PIN debe ser exactamente 4 dígitos' });
      return;
    }

    // Chequear que no haya usuarios todavía. El filtro de tenant se aplica
    // automáticamente por la extensión de Prisma (stage 2 token → AsyncLocalStorage).
    const count = await prisma.usuario.count();
    if (count > 0) {
      res.status(409).json({ error: 'Este workspace ya tiene usuarios. Usá el panel de Usuarios para crear más.' });
      return;
    }

    const pinHash = await hashPin(pin);

    // El extension de Prisma inyecta organizacionId automáticamente
    const usuario = await prisma.usuario.create({
      data: {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        rol: 'admin',
        pin: pinHash,
        activo: true,
        permisos: '[]',
      },
    });

    res.status(201).json({
      id: usuario.id,
      codigo: usuario.codigo,
      nombre: usuario.nombre,
      rol: usuario.rol,
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'Ya existe un usuario con ese código' });
      return;
    }
    console.error('[auth/bootstrap-admin]', err);
    res.status(500).json({ error: 'Error al crear admin inicial' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────
// Valida stage 3 (staff) y refresca datos del usuario staff.
router.get('/me', requireStaff, async (req: Request, res: Response) => {
  try {
    const tokenStaff = req.token as TokenStaff;
    const usuario = await prisma.usuario.findFirst({
      where: { id: tokenStaff.uid },
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
    console.error('[auth/me]', error);
    res.status(500).json({ error: 'Error al validar sesión' });
  }
});

export default router;
