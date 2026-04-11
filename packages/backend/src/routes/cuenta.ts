import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import prisma, { prismaRaw } from '../lib/prisma';
import { runWithoutTenant } from '../lib/tenantContext';
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAnyAuth,
  requireOrg,
  TokenCuenta,
  TokenOrg,
} from '../lib/auth';

const router = Router();

// ============================================================================
// CUENTA ROUTES — nivel 1 de auth (email + password + workspaces)
// ============================================================================
// Todas estas rutas corren con bypassTenant en el Prisma context porque
// operan a nivel cross-org (signup crea nuevas orgs, login busca cuentas por
// email globalmente, etc.). Ninguna de ellas lee tablas tenant-aware sin
// filtro manual.
// ============================================================================

// ── Rate limits ─────────────────────────────────────────────────────────────
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,                    // 5 signups por IP por hora
  message: { error: 'Demasiados intentos de signup. Esperá una hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Esperá unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'workspace';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prismaRaw.organizacion.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${i}`;
    i++;
    if (i > 50) {
      slug = `${base}-${Date.now()}`;
      return slug;
    }
  }
}

function isEmailValid(email: string): boolean {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

function isPasswordValid(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

// ============================================================================
// POST /api/cuenta/signup
// ----------------------------------------------------------------------------
// Crea una Cuenta + Organizacion + Miembro (rol owner) en una transacción.
//
// Special case — "reclamo" de la org inicial:
//   Si no existe ninguna Miembro en la DB todavía, asumimos que es el primer
//   signup y vinculamos esta cuenta como owner de la organización id=1 que
//   ya existe con los datos del cliente actual (Más Orgánicos). Así Tomás
//   puede hacer signup una sola vez y "adoptar" la data que ya está en Neon.
//
//   Para signups subsiguientes, se crea una organización nueva.
// ============================================================================
router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, orgNombre } = req.body ?? {};

    if (!isEmailValid(email)) {
      res.status(400).json({ error: 'Email inválido' });
      return;
    }
    if (!isPasswordValid(password)) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    if (typeof nombre !== 'string' || nombre.trim().length < 2) {
      res.status(400).json({ error: 'Nombre requerido (mínimo 2 caracteres)' });
      return;
    }

    const emailNorm = email.trim().toLowerCase();

    await runWithoutTenant(async () => {
      // Verificar email disponible
      const existing = await prismaRaw.cuenta.findUnique({ where: { email: emailNorm } });
      if (existing) {
        res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
        return;
      }

      const passwordHash = await hashPassword(password);

      // ¿Es el primer signup del sistema? → reclamar org #1
      const totalMiembros = await prismaRaw.miembro.count();
      const claimDefault = totalMiembros === 0;

      let cuentaCreated: any;
      let orgCreated: any;

      if (claimDefault) {
        // Modo "adopción": usar la org 1 que ya existe con los datos backfilleados
        const orgDefault = await prismaRaw.organizacion.findUnique({ where: { id: 1 } });
        if (!orgDefault) {
          // Fallback: crear una org nueva si por alguna razón no existe
          const fallbackSlug = await uniqueSlug(slugify(orgNombre || nombre));
          orgCreated = await prismaRaw.organizacion.create({
            data: {
              nombre: orgNombre || `${nombre}'s Workspace`,
              slug: fallbackSlug,
              plan: 'pro',
              estadoSuscripcion: 'active',
              trialHasta: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          });
        } else {
          orgCreated = orgDefault;
        }
        cuentaCreated = await prismaRaw.cuenta.create({
          data: { email: emailNorm, passwordHash, nombre: nombre.trim(), ultimoLogin: new Date() },
        });
        await prismaRaw.miembro.create({
          data: {
            cuentaId: cuentaCreated.id,
            organizacionId: orgCreated.id,
            rol: 'owner',
          },
        });
      } else {
        // Modo "nueva org": signup normal de un nuevo cliente
        cuentaCreated = await prismaRaw.cuenta.create({
          data: { email: emailNorm, passwordHash, nombre: nombre.trim(), ultimoLogin: new Date() },
        });
        const slugBase = slugify(orgNombre || nombre);
        const slug = await uniqueSlug(slugBase);
        orgCreated = await prismaRaw.organizacion.create({
          data: {
            nombre: orgNombre || `${nombre}'s Workspace`,
            slug,
            plan: 'trial',
            estadoSuscripcion: 'trialing',
            trialHasta: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });
        await prismaRaw.miembro.create({
          data: {
            cuentaId: cuentaCreated.id,
            organizacionId: orgCreated.id,
            rol: 'owner',
          },
        });
      }

      // Firmar stage 1 (cuenta sin org)
      const token = signToken({
        kind: 'cuenta',
        cuentaId: cuentaCreated.id,
        email: cuentaCreated.email,
      });

      res.status(201).json({
        token,
        cuenta: {
          id: cuentaCreated.id,
          email: cuentaCreated.email,
          nombre: cuentaCreated.nombre,
        },
        workspaces: [{
          id: orgCreated.id,
          nombre: orgCreated.nombre,
          slug: orgCreated.slug,
          plan: orgCreated.plan,
          estadoSuscripcion: orgCreated.estadoSuscripcion,
          rol: 'owner',
        }],
        claimedDefault: claimDefault,
      });
    });
  } catch (err: any) {
    console.error('[cuenta/signup]', err);
    res.status(500).json({ error: 'Error al crear la cuenta' });
  }
});

// ============================================================================
// POST /api/cuenta/login
// ----------------------------------------------------------------------------
// Email + password → stage 1 JWT + lista de workspaces.
// ============================================================================
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (!isEmailValid(email) || typeof password !== 'string') {
      res.status(400).json({ error: 'Email o contraseña inválidos' });
      return;
    }

    await runWithoutTenant(async () => {
      const cuenta = await prismaRaw.cuenta.findUnique({
        where: { email: email.trim().toLowerCase() },
        include: {
          miembros: {
            include: { organizacion: true },
          },
        },
      });

      if (!cuenta) {
        res.status(401).json({ error: 'Email o contraseña incorrectos' });
        return;
      }

      const ok = await verifyPassword(password, cuenta.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Email o contraseña incorrectos' });
        return;
      }

      await prismaRaw.cuenta.update({
        where: { id: cuenta.id },
        data: { ultimoLogin: new Date() },
      });

      const token = signToken({
        kind: 'cuenta',
        cuentaId: cuenta.id,
        email: cuenta.email,
      });

      res.json({
        token,
        cuenta: {
          id: cuenta.id,
          email: cuenta.email,
          nombre: cuenta.nombre,
        },
        workspaces: cuenta.miembros.map(m => ({
          id: m.organizacion.id,
          nombre: m.organizacion.nombre,
          slug: m.organizacion.slug,
          plan: m.organizacion.plan,
          estadoSuscripcion: m.organizacion.estadoSuscripcion,
          rol: m.rol,
        })),
      });
    });
  } catch (err: any) {
    console.error('[cuenta/login]', err);
    res.status(500).json({ error: 'Error en login' });
  }
});

// ============================================================================
// GET /api/cuenta/workspaces
// ----------------------------------------------------------------------------
// Lista workspaces (organizaciones) a los que pertenece la cuenta autenticada.
// Acepta cualquier stage (1, 2 o 3) del JWT.
// ============================================================================
router.get('/workspaces', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const cuentaId = req.token!.kind === 'cuenta'
      ? (req.token as TokenCuenta).cuentaId
      : (req.token as any).cuentaId;

    await runWithoutTenant(async () => {
      const miembros = await prismaRaw.miembro.findMany({
        where: { cuentaId },
        include: { organizacion: true },
        orderBy: { createdAt: 'asc' },
      });

      res.json(miembros.map(m => ({
        id: m.organizacion.id,
        nombre: m.organizacion.nombre,
        slug: m.organizacion.slug,
        plan: m.organizacion.plan,
        estadoSuscripcion: m.organizacion.estadoSuscripcion,
        rol: m.rol,
      })));
    });
  } catch (err: any) {
    console.error('[cuenta/workspaces]', err);
    res.status(500).json({ error: 'Error al listar workspaces' });
  }
});

// ============================================================================
// POST /api/cuenta/switch
// ----------------------------------------------------------------------------
// Elegir un workspace → stage 2 JWT con organizacionId.
// ============================================================================
router.post('/switch', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const { organizacionId } = req.body ?? {};
    const orgId = Number(organizacionId);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      res.status(400).json({ error: 'organizacionId inválido' });
      return;
    }

    const cuentaId = (req.token as any).cuentaId;
    const email = (req.token as any).email;

    await runWithoutTenant(async () => {
      const miembro = await prismaRaw.miembro.findUnique({
        where: { cuentaId_organizacionId: { cuentaId, organizacionId: orgId } },
        include: { organizacion: true },
      });

      if (!miembro) {
        res.status(403).json({ error: 'No pertenecés a ese workspace' });
        return;
      }

      const token = signToken({
        kind: 'org',
        cuentaId,
        email,
        organizacionId: orgId,
        rolCuenta: miembro.rol,
      });

      res.json({
        token,
        workspace: {
          id: miembro.organizacion.id,
          nombre: miembro.organizacion.nombre,
          slug: miembro.organizacion.slug,
          plan: miembro.organizacion.plan,
          estadoSuscripcion: miembro.organizacion.estadoSuscripcion,
          rol: miembro.rol,
        },
      });
    });
  } catch (err: any) {
    console.error('[cuenta/switch]', err);
    res.status(500).json({ error: 'Error al cambiar workspace' });
  }
});

// ============================================================================
// POST /api/cuenta/workspaces — crear workspace adicional
// ----------------------------------------------------------------------------
// El owner de una cuenta puede crear otra organización (otro resto) desde
// adentro de la app. Queda vinculado automáticamente como owner.
// ============================================================================
router.post('/workspaces', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const { nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2) {
      res.status(400).json({ error: 'Nombre del workspace requerido' });
      return;
    }
    const cuentaId = (req.token as any).cuentaId;

    await runWithoutTenant(async () => {
      const slug = await uniqueSlug(slugify(nombre));
      const org = await prismaRaw.organizacion.create({
        data: {
          nombre: nombre.trim(),
          slug,
          plan: 'trial',
          estadoSuscripcion: 'trialing',
          trialHasta: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });
      await prismaRaw.miembro.create({
        data: { cuentaId, organizacionId: org.id, rol: 'owner' },
      });

      res.status(201).json({
        id: org.id,
        nombre: org.nombre,
        slug: org.slug,
        plan: org.plan,
        estadoSuscripcion: org.estadoSuscripcion,
        rol: 'owner',
      });
    });
  } catch (err: any) {
    console.error('[cuenta/workspaces POST]', err);
    res.status(500).json({ error: 'Error al crear workspace' });
  }
});

// ============================================================================
// GET /api/cuenta/me — datos de la cuenta autenticada
// ============================================================================
router.get('/me', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const cuentaId = (req.token as any).cuentaId;
    await runWithoutTenant(async () => {
      const cuenta = await prismaRaw.cuenta.findUnique({ where: { id: cuentaId } });
      if (!cuenta) {
        res.status(404).json({ error: 'Cuenta no encontrada' });
        return;
      }
      res.json({
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        emailVerificado: cuenta.emailVerificado,
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al leer cuenta' });
  }
});

// ============================================================================
// POST /api/cuenta/to-stage-1
// ----------------------------------------------------------------------------
// Baja un token stage 2/3 (org/staff) a un token stage 1 (cuenta). Usa los
// datos ya firmados en el JWT (cuentaId + email), así que no pide password.
// Sirve para el flujo "cambiar workspace" desde dentro de la app: en vez de
// forzar logout + re-login, el front pide este endpoint y recibe un nuevo
// token stage 1 + lista de workspaces. El gate del front pinta el selector.
// ============================================================================
router.post('/to-stage-1', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const token = req.token as any;
    if (!token || !token.cuentaId || !token.email) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    await runWithoutTenant(async () => {
      // Validar que la cuenta sigue existiendo
      const cuenta = await prismaRaw.cuenta.findUnique({
        where: { id: token.cuentaId },
        include: {
          miembros: {
            include: { organizacion: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!cuenta) {
        res.status(404).json({ error: 'Cuenta no encontrada' });
        return;
      }

      const nuevoToken = signToken({
        kind: 'cuenta',
        cuentaId: cuenta.id,
        email: cuenta.email,
      });

      res.json({
        token: nuevoToken,
        cuenta: {
          id: cuenta.id,
          email: cuenta.email,
          nombre: cuenta.nombre,
        },
        workspaces: cuenta.miembros.map(m => ({
          id: m.organizacion.id,
          nombre: m.organizacion.nombre,
          slug: m.organizacion.slug,
          plan: m.organizacion.plan,
          estadoSuscripcion: m.organizacion.estadoSuscripcion,
          rol: m.rol,
        })),
      });
    });
  } catch (err: any) {
    console.error('[cuenta/to-stage-1]', err);
    res.status(500).json({ error: 'Error al volver al selector' });
  }
});

// ============================================================================
// POST /api/cuenta/logout — stub (el logout real es client-side borrando el
// token). Esta ruta existe por si en el futuro queremos una blacklist.
// ============================================================================
router.post('/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
