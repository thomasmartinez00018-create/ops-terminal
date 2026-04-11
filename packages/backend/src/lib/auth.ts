import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// AUTH — multi-tenant, dos niveles
// ============================================================================
// Arquitectura de tokens:
//
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ STAGE 1 — Cuenta autenticada (email + password)                     │
//   │   { kind: "cuenta", cuentaId, email }                               │
//   │   Válido solo para /api/cuenta/workspaces y /api/cuenta/switch.     │
//   └─────────────────────────────────────────────────────────────────────┘
//                                    │
//                      POST /api/cuenta/switch { orgId }
//                                    ▼
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ STAGE 2 — Cuenta dentro de un workspace (sin staff aún)             │
//   │   { kind: "org", cuentaId, organizacionId, rolCuenta }              │
//   │   Válido para /api/auth/usuarios (listar staff para el PIN pad)     │
//   │   y /api/auth/login (login de staff con código+PIN).                │
//   └─────────────────────────────────────────────────────────────────────┘
//                                    │
//                      POST /api/auth/login { codigo, pin }
//                                    ▼
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ STAGE 3 — Staff autenticado (uso normal de la app)                  │
//   │   { kind: "staff", cuentaId, organizacionId, rolCuenta, uid,       │
//   │     codigo, rol }                                                   │
//   │   Todas las rutas de negocio (/api/productos, /api/stock, ...).     │
//   └─────────────────────────────────────────────────────────────────────┘
//
// El JWT guarda el stage 3 entero durante la operación normal, así la sesión
// staff puede durar días sin re-login. Si la cuenta quiere cambiar de
// workspace, vuelve al stage 2.
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET no definido en producción — abortando arranque');
  }
  console.warn('[auth] WARN: usando JWT_SECRET de desarrollo. Definí JWT_SECRET en .env antes de deployar.');
  return 'dev-secret-ops-terminal-not-for-production';
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const BCRYPT_ROUNDS = 10;

// ── Hash de PIN (staff) ─────────────────────────────────────────────────────
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Legacy: comparación directa en texto plano (se re-hashea en el login).
  return plain === stored;
}

export function isBcryptHash(value: string): boolean {
  return typeof value === 'string' && /^\$2[abxy]\$\d{2}\$/.test(value);
}

// ── Hash de password (cuenta) ───────────────────────────────────────────────
// Mismo helper que PIN pero nombrado distinto para claridad.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || !isBcryptHash(hash)) return false;
  return bcrypt.compare(plain, hash);
}

// ── Tipos de token ──────────────────────────────────────────────────────────
export interface TokenCuenta {
  kind: 'cuenta';
  cuentaId: number;
  email: string;
}

export interface TokenOrg {
  kind: 'org';
  cuentaId: number;
  email: string;
  organizacionId: number;
  rolCuenta: string; // owner | admin | staff (rol en la org)
}

export interface TokenStaff {
  kind: 'staff';
  cuentaId: number;
  email: string;
  organizacionId: number;
  rolCuenta: string;
  uid: number;       // id del Usuario (staff) seleccionado
  codigo: string;    // código del staff
  rol: string;       // rol del staff (admin/cocina/deposito/...)
}

export type AnyToken = TokenCuenta | TokenOrg | TokenStaff;

export function signToken(payload: AnyToken): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): AnyToken | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AnyToken;
  } catch {
    return null;
  }
}

// ── Request typing ──────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      token?: AnyToken;
      // Compatibilidad con código legacy (routes/auth.ts usa req.user) — lo
      // exponemos como un alias del token stage 3 cuando existe.
      user?: TokenStaff | TokenOrg | TokenCuenta;
    }
  }
}

function extractToken(req: Request): AnyToken | null {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

// ── Middlewares ─────────────────────────────────────────────────────────────

/**
 * Requiere cualquier nivel de token (stage 1, 2 o 3). Se usa en rutas de
 * /api/cuenta/* donde el usuario puede venir recién logueado sin org todavía.
 */
export function requireAnyAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  req.token = token;
  req.user = token as any;
  next();
}

/**
 * Requiere stage 2 o 3 (cuenta con workspace activo). Las rutas que necesitan
 * saber organizacionId (prácticamente todas) usan esto. Además es el hook
 * donde entra el tenantContext (lo setea server.ts vía wrapper).
 */
export function requireOrg(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  if (token.kind === 'cuenta') {
    res.status(403).json({ error: 'Elegí un workspace para continuar', needsWorkspaceSelection: true });
    return;
  }
  req.token = token;
  req.user = token as any;
  next();
}

/**
 * Requiere stage 3 (staff autenticado dentro de un workspace). Las rutas de
 * negocio que graban un Movimiento con usuario_id deben usar esto porque
 * necesitan saber qué staff hizo la acción.
 */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  if (token.kind !== 'staff') {
    res.status(403).json({ error: 'Seleccioná un usuario staff para continuar', needsStaffLogin: true });
    return;
  }
  req.token = token;
  req.user = token;
  next();
}

/**
 * Requiere stage 3 + rol admin (del staff). Para operaciones destructivas.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireStaff(req, res, () => {
    if ((req.token as TokenStaff)?.rol !== 'admin') {
      res.status(403).json({ error: 'Permisos insuficientes' });
      return;
    }
    next();
  });
}

// ── Compatibilidad con código legacy ────────────────────────────────────────
// auth.ts viejo exportaba requireAuth que validaba cualquier token. Mantenemos
// el nombre como alias a requireStaff para no romper las ~12 rutas que lo
// importan. Si alguna necesita stage 2 en vez de 3, se cambia explícitamente.
export const requireAuth = requireStaff;
