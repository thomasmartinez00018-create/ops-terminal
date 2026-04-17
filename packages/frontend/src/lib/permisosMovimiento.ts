// ============================================================================
// Permisos granulares por tipo de movimiento.
//
// Los 5 tipos de movimiento que maneja el sistema (Venta, Consumo/Uso, Merma,
// Transferencia, Ingreso) ahora son controlables independientemente por
// usuario. El admin marca qué tipos cada empleado puede registrar.
//
// Los permisos se guardan en user.permisos[] como strings "mov.<tipo>":
//   "mov.venta", "mov.consumo_interno", "mov.merma",
//   "mov.transferencia", "mov.ingreso"
//
// Reglas de resolución (de mayor a menor prioridad):
//   1. admin   → siempre todos
//   2. permiso "*" → todos (superuser legacy)
//   3. permiso "mov.<tipo>" específico → solo ese tipo
//   4. ningún permiso "mov.*" presente → fallback por rol (retro-compat
//      con usuarios creados antes de este feature)
//   5. al menos un permiso "mov.*" presente → solo los listados
// ============================================================================

export const TIPOS_MOVIMIENTO = [
  { value: 'venta',            label: 'Venta',         icon: '🛒', color: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'consumo_interno',  label: 'Consumo / Uso', icon: '🍽️', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'merma',            label: 'Merma',         icon: '🗑️', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'transferencia',    label: 'Transferencia', icon: '↔️', color: 'bg-warning/10 text-warning border-warning/30' },
  { value: 'ingreso',          label: 'Ingreso',       icon: '📦', color: 'bg-success/10 text-success border-success/30' },
] as const;

export type TipoMovimiento = typeof TIPOS_MOVIMIENTO[number]['value'];

export const PERM_PREFIX = 'mov.';
export const permKey = (tipo: TipoMovimiento) => `${PERM_PREFIX}${tipo}`;

// Todos los permisos de movimiento juntos (útil para "seleccionar todos").
export const PERMISOS_MOVIMIENTO_TODOS = TIPOS_MOVIMIENTO.map(t => permKey(t.value));

// Default por rol para usuarios pre-feature (sin ningún mov.* seteado).
// Matchea la semántica intuitiva: cocina/barra usan/descartan, depósito
// recibe/transfiere/descarta, compras recibe.
const DEFAULT_POR_ROL: Record<string, TipoMovimiento[]> = {
  admin: ['venta', 'consumo_interno', 'merma', 'transferencia', 'ingreso'],
  cocina: ['consumo_interno', 'merma'],
  barra: ['venta', 'consumo_interno', 'merma'],
  deposito: ['ingreso', 'transferencia', 'merma'],
  compras: ['ingreso', 'merma', 'transferencia'],
};

interface UserLike {
  rol?: string | null;
  permisos?: string[] | null;
}

export function tiposPermitidos(user: UserLike | null | undefined): TipoMovimiento[] {
  if (!user) return [];
  if (user.rol === 'admin' || user.permisos?.includes('*')) {
    return TIPOS_MOVIMIENTO.map(t => t.value);
  }
  const permisos = Array.isArray(user.permisos) ? user.permisos : [];
  const explicit = permisos
    .filter(p => typeof p === 'string' && p.startsWith(PERM_PREFIX))
    .map(p => p.slice(PERM_PREFIX.length) as TipoMovimiento)
    .filter((t): t is TipoMovimiento => TIPOS_MOVIMIENTO.some(x => x.value === t));
  if (explicit.length > 0) return explicit;
  // Retrocompatibilidad: si el admin nunca tocó estos permisos, usar el
  // default por rol — así las cuentas viejas siguen funcionando sin config.
  return DEFAULT_POR_ROL[user.rol || ''] ?? TIPOS_MOVIMIENTO.map(t => t.value);
}

export function puedeRegistrarMovimiento(user: UserLike | null | undefined, tipo: TipoMovimiento): boolean {
  return tiposPermitidos(user).includes(tipo);
}
