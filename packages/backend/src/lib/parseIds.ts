// ============================================================================
// parseIds — helpers para validar IDs numéricos de req.params / req.query
// ----------------------------------------------------------------------------
// Problema recurrente: `parseInt(req.params.id)` devuelve NaN si el param
// no es numérico (ej: /api/productos/abc). Si ese NaN se pasa a
// `prisma.X.findUnique({ where: { id: NaN } })`, Prisma tira
// PrismaClientValidationError → 500 para el usuario y ruido en logs.
//
// En vez de validar a mano en cada handler, usamos este helper y
// respondemos 400 temprano si el ID no es válido.
//
// Uso típico:
//   const id = parseId(req.params.id);
//   if (id == null) { res.status(400).json({ error: 'id inválido' }); return; }
//   const p = await prisma.producto.findUnique({ where: { id } });
//
// O más compacto con el helper de handler:
//   const id = assertId(req.params.id, res);
//   if (id == null) return;
// ============================================================================

import type { Response } from 'express';

/**
 * Parsea un valor string/number a entero positivo. Devuelve null si el
 * valor no representa un entero > 0.
 */
export function parseId(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Sugar: valida el ID y si es inválido, responde 400 y devuelve null.
 * El caller tiene que hacer `return` después si obtiene null.
 */
export function assertId(v: string | number | undefined | null, res: Response, field = 'id'): number | null {
  const id = parseId(v);
  if (id == null) {
    res.status(400).json({ error: `${field} inválido` });
    return null;
  }
  return id;
}
