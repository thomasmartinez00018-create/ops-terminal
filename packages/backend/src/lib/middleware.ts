import type { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenantContext';
import { verifyToken, AnyToken, TokenOrg, TokenStaff } from './auth';
import prisma, { prismaRaw } from './prisma';

// ============================================================================
// tenantMiddleware — setea el AsyncLocalStorage si hay token stage 2 o 3
// ============================================================================
// Corre globalmente (server.ts lo monta antes de cualquier router). Si el
// token es stage 2 o 3, abre un tenantContext.run que envuelve todo el resto
// del request pipeline. Cualquier query de Prisma dentro recibe
// organizacion_id automáticamente.
//
// Si el token es stage 1 (cuenta sin workspace) o no hay token, el request
// corre SIN contexto tenant. Las rutas que necesitan org (cualquier ruta de
// negocio) usan requireOrg/requireStaff para bloquear si falta.
// ============================================================================
export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!raw) {
    next();
    return;
  }

  const token: AnyToken | null = verifyToken(raw);
  if (!token) {
    next();
    return;
  }

  // Exponer el token parseado en req para no tener que reparsearlo en los
  // middlewares de las rutas. Los middlewares de auth (requireOrg, etc.)
  // pueden seguir haciéndolo por su cuenta — la idea es que ambos caminos
  // funcionen.
  req.token = token;
  req.user = token as any;

  if (token.kind === 'org' || token.kind === 'staff') {
    const store = {
      organizacionId: token.organizacionId,
      cuentaId: token.cuentaId,
      staffUid: token.kind === 'staff' ? (token as TokenStaff).uid : undefined,
      rolCuenta: (token as TokenOrg).rolCuenta,
      rolStaff: token.kind === 'staff' ? (token as TokenStaff).rol : undefined,
    };
    tenantContext.run(store, () => next());
    return;
  }

  // Stage 1 (cuenta sin org) → sin contexto
  next();
}

// ============================================================================
// requireSuscripcionActiva — billing stub
// ============================================================================
// Lee organizacion.plan y organizacion.estadoSuscripcion. Si la org no tiene
// una suscripción válida (trialing o active) devuelve 402 Payment Required.
//
// No está conectado a Stripe todavía — los campos se setean a mano o con un
// endpoint admin. Cuando integremos Stripe, el único cambio es que los
// webhooks de Stripe actualizan estos campos.
//
// Estados válidos:
//   trialing  → trial activo, todas las features
//   active    → pago al día
//   past_due  → pago pendiente, gracia de 3 días (opcional)
//   canceled  → bloqueado
//   unpaid    → bloqueado
// ============================================================================
const ESTADOS_VALIDOS = new Set(['trialing', 'active', 'past_due']);

export async function requireSuscripcionActiva(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.token;
    if (!token || (token.kind !== 'org' && token.kind !== 'staff')) {
      // Si no hay token de org, no podemos chequear suscripción. Dejamos
      // que requireOrg/requireStaff frenen más abajo.
      return next();
    }

    const organizacionId = (token as TokenOrg).organizacionId;

    // Lookup directo al cliente raw para no recursionar el filtro de tenant.
    const org = await prismaRaw.organizacion.findUnique({
      where: { id: organizacionId },
      select: {
        id: true,
        plan: true,
        estadoSuscripcion: true,
        trialHasta: true,
      },
    });

    if (!org) {
      res.status(404).json({ error: 'Organización no encontrada' });
      return;
    }

    // Trial expirado?
    if (org.estadoSuscripcion === 'trialing' && org.trialHasta && org.trialHasta < new Date()) {
      // Auto-marcar como past_due si el trial venció. No bloquea hoy pero
      // el próximo check ya lo tiene al día.
      await prismaRaw.organizacion.update({
        where: { id: organizacionId },
        data: { estadoSuscripcion: 'past_due' },
      }).catch(() => {});
      res.status(402).json({
        error: 'Tu trial venció',
        code: 'trial_expired',
        plan: org.plan,
      });
      return;
    }

    if (!ESTADOS_VALIDOS.has(org.estadoSuscripcion)) {
      res.status(402).json({
        error: 'Suscripción inactiva',
        code: 'subscription_inactive',
        estado: org.estadoSuscripcion,
      });
      return;
    }

    next();
  } catch (err: any) {
    console.error('[requireSuscripcionActiva]', err);
    // No bloquear por errores internos — logear y seguir
    next();
  }
}
