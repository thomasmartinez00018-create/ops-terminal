import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// ── Config ──────────────────────────────────────────────────────────────────
// JWT_SECRET es obligatorio en producción. En dev usamos un default visible
// para no bloquear el flujo, pero loggeamos un warning.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET no definido en producción — abortando arranque');
  }
  console.warn('[auth] WARN: usando JWT_SECRET de desarrollo. Definí JWT_SECRET en .env antes de deployar.');
  return 'dev-secret-ops-terminal-not-for-production';
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const BCRYPT_ROUNDS = 10;

// ── Hash de PIN ─────────────────────────────────────────────────────────────
// El PIN se guarda hasheado en la DB. El hash bcrypt tiene el formato $2a$10$...
// (~60 chars) lo cual es distinguible de un PIN en plano (4-6 dígitos).
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

// Compara un PIN en plano contra el hash almacenado.
// Fallback: si el valor almacenado NO es un hash bcrypt (legacy de
// usuarios creados antes del hardening), comparamos directo y
// re-hasheamos en caliente en auth.ts login.
export async function verifyPin(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Legacy: comparación directa en texto plano.
  return plain === stored;
}

export function isBcryptHash(value: string): boolean {
  return typeof value === 'string' && /^\$2[abxy]\$\d{2}\$/.test(value);
}

// ── JWT ─────────────────────────────────────────────────────────────────────
export interface TokenPayload {
  uid: number;
  codigo: string;
  rol: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ── Middleware: requireAuth ─────────────────────────────────────────────────
// Extrae el JWT del header Authorization: Bearer <token>. Si es válido, inyecta
// req.user con el payload. Si no, 401.
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }
  req.user = payload;
  next();
}

// Variante: solo para rutas admin-only
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.rol !== 'admin') {
      res.status(403).json({ error: 'Permisos insuficientes' });
      return;
    }
    next();
  });
}
