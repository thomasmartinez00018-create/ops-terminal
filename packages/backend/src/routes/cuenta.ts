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
import {
  listTemplatesSummary,
  applyTemplate,
  getTemplateById,
} from '../lib/workspaceTemplates';

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

// Pairing redeem es público (sin auth): necesita rate limit fuerte para que
// nadie pueda brute-forcear los 6 dígitos. 10 intentos / 5 min / IP.
const pairRedeemLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá unos minutos.' },
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
    const tok = req.token as any;
    // Bloqueo para dispositivos pareados — no deberían poder crear orgs
    if (tok?.pairedDevice === true) {
      res.status(403).json({ error: 'Este dispositivo no puede crear workspaces' });
      return;
    }
    const { nombre, templateId } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2) {
      res.status(400).json({ error: 'Nombre del workspace requerido' });
      return;
    }
    // templateId es opcional. Si viene, validamos que exista.
    if (templateId !== undefined && templateId !== null && templateId !== '') {
      if (typeof templateId !== 'string' || !getTemplateById(templateId)) {
        res.status(400).json({ error: 'Template inválido' });
        return;
      }
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

      // Aplicar template si fue especificado. Best-effort: si falla, loggeamos
      // pero no rompemos la creación del workspace (el user ya tiene su org).
      let templateAplicado: { depositosCreados: number; productosCreados: number } | null = null;
      if (templateId && typeof templateId === 'string' && templateId !== 'vacio') {
        try {
          templateAplicado = await applyTemplate(org.id, templateId);
        } catch (err) {
          console.error('[cuenta/workspaces POST] applyTemplate falló:', err);
        }
      }

      res.status(201).json({
        id: org.id,
        nombre: org.nombre,
        slug: org.slug,
        plan: org.plan,
        estadoSuscripcion: org.estadoSuscripcion,
        rol: 'owner',
        templateAplicado,
      });
    });
  } catch (err: any) {
    console.error('[cuenta/workspaces POST]', err);
    res.status(500).json({ error: 'Error al crear workspace' });
  }
});

// ============================================================================
// GET /api/cuenta/templates — lista pública de templates de rubro
// ----------------------------------------------------------------------------
// Devuelve metadata (id, nombre, íconos, counts) SIN la data cruda de
// productos/depositos. El frontend usa esto para pintar el selector visual.
// Requiere auth (stage 1+) para no exponer públicamente a scrapers, pero NO
// requiere org — se consulta antes de crear el workspace.
// ============================================================================
router.get('/templates', requireAnyAuth, async (_req: Request, res: Response) => {
  try {
    res.json(listTemplatesSummary());
  } catch (err: any) {
    console.error('[cuenta/templates GET]', err);
    res.status(500).json({ error: 'Error al listar templates' });
  }
});

// ============================================================================
// Device Pairing — vincular un dispositivo sin compartir credenciales
// ----------------------------------------------------------------------------
// Flujo:
//   1. El admin, en su dispositivo ya autenticado (stage 2+), pide
//      POST /pair/generate → recibe un código de 6 dígitos con TTL de 10 min.
//   2. En el dispositivo del empleado (navegador limpio, sin auth), el
//      empleado abre la app, hace tap en "Vincular dispositivo", ingresa el
//      código → POST /pair/redeem devuelve un token stage 2 (pairedDevice).
//   3. El empleado ahora ve el selector de usuarios staff (código+PIN) y
//      entra con su cuenta de empleado sin haber visto nunca el email del
//      dueño.
//
// Seguridad:
//   - Códigos single-use, expiran a los 10 min.
//   - Rate limit fuerte en redeem (público).
//   - El token emitido tiene pairedDevice:true → bloquea cambiar workspace,
//     crear workspaces, generar nuevos códigos.
//   - Solo owner/admin (rolCuenta) puede generar códigos.
// ============================================================================

function generate6DigitCode(): string {
  // Evita códigos que empiecen con 0 (mejor legibilidad dictada por teléfono).
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/cuenta/pair/generate — genera un código de 6 dígitos
router.post('/pair/generate', requireAnyAuth, async (req: Request, res: Response) => {
  try {
    const token = req.token as any;
    if (token?.kind !== 'org' && token?.kind !== 'staff') {
      res.status(403).json({ error: 'Elegí un workspace para continuar', needsWorkspaceSelection: true });
      return;
    }
    // Bloquear la generación desde un dispositivo ya bindeado — el empleado
    // no debería poder auto-vincular más dispositivos.
    if (token.pairedDevice === true) {
      res.status(403).json({ error: 'Este dispositivo no puede generar códigos de vinculación' });
      return;
    }
    const rolCuenta = token.rolCuenta;
    if (rolCuenta !== 'owner' && rolCuenta !== 'admin') {
      res.status(403).json({ error: 'Solo el dueño o un admin puede generar códigos' });
      return;
    }

    const organizacionId = token.organizacionId as number;
    const cuentaId = token.cuentaId as number;

    await runWithoutTenant(async () => {
      // Reintentar hasta 5 veces si hay colisión (improbable con 900k combinaciones)
      let codigo = '';
      for (let i = 0; i < 5; i++) {
        codigo = generate6DigitCode();
        const existing = await prismaRaw.devicePairingCode.findUnique({ where: { codigo } });
        if (!existing) break;
        if (i === 4) {
          res.status(500).json({ error: 'No se pudo generar un código único, reintentá' });
          return;
        }
      }

      const expiraEn = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      const row = await prismaRaw.devicePairingCode.create({
        data: {
          codigo,
          organizacionId,
          creadoPorCuentaId: cuentaId,
          expiraEn,
        },
      });

      res.status(201).json({
        codigo: row.codigo,
        expiraEn: row.expiraEn.toISOString(),
        ttlSegundos: Math.floor((row.expiraEn.getTime() - Date.now()) / 1000),
      });
    });
  } catch (err: any) {
    console.error('[cuenta/pair/generate]', err);
    res.status(500).json({ error: 'Error al generar código' });
  }
});

// POST /api/cuenta/pair/redeem — canjea un código por un token stage 2
// ----------------------------------------------------------------------------
// Ruta PÚBLICA (sin auth). El empleado entra con un navegador limpio, tipea
// el código y recibe un token stage 2 bindeado a la org + pairedDevice:true.
// A partir de ese momento el flujo es idéntico al normal: el empleado elige
// su usuario staff y tipea su PIN.
router.post('/pair/redeem', pairRedeemLimiter, async (req: Request, res: Response) => {
  try {
    const { codigo } = req.body ?? {};
    if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) {
      res.status(400).json({ error: 'Código inválido' });
      return;
    }

    // IP del cliente (respeta X-Forwarded-For del trust proxy de Express)
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 64);

    await runWithoutTenant(async () => {
      const row = await prismaRaw.devicePairingCode.findUnique({
        where: { codigo },
      });

      if (!row) {
        res.status(404).json({ error: 'Código inválido o expirado' });
        return;
      }
      if (row.usado) {
        res.status(410).json({ error: 'Código ya fue utilizado' });
        return;
      }
      if (row.expiraEn.getTime() < Date.now()) {
        res.status(410).json({ error: 'Código expirado' });
        return;
      }

      // Cargar org + creador en paralelo
      const [org, creador] = await Promise.all([
        prismaRaw.organizacion.findUnique({ where: { id: row.organizacionId } }),
        prismaRaw.cuenta.findUnique({ where: { id: row.creadoPorCuentaId } }),
      ]);
      if (!org || !creador) {
        res.status(500).json({ error: 'Workspace o cuenta creadora no encontrados' });
        return;
      }

      // Marcar usado
      await prismaRaw.devicePairingCode.update({
        where: { id: row.id },
        data: {
          usado: true,
          usadoEn: new Date(),
          usadoDesdeIp: ip,
        },
      });

      // Emitir token stage 2 con pairedDevice:true + rolCuenta forzado a 'staff'
      // para que el dispositivo no tenga permisos admin a nivel cuenta.
      const newToken = signToken({
        kind: 'org',
        cuentaId: creador.id,
        email: creador.email,
        organizacionId: row.organizacionId,
        rolCuenta: 'staff',
        pairedDevice: true,
      });

      res.json({
        token: newToken,
        workspace: {
          id: org.id,
          nombre: org.nombre,
          slug: org.slug,
          plan: org.plan,
          estadoSuscripcion: org.estadoSuscripcion,
          rol: 'staff',
        },
      });
    });
  } catch (err: any) {
    console.error('[cuenta/pair/redeem]', err);
    res.status(500).json({ error: 'Error al canjear código' });
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
    // Un dispositivo bindeado por pairing NO puede volver al selector de
    // workspaces — el empleado vería los datos/email del dueño.
    if (token.pairedDevice === true) {
      res.status(403).json({ error: 'Este dispositivo está vinculado a un único workspace' });
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
