import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// TENANT CONTEXT — AsyncLocalStorage para propagar organizacionId por request
// ============================================================================
// Idea: al principio de cada request multi-tenant, un middleware hace
//
//   tenantContext.run({ organizacionId, cuentaId, staffUid }, () => next())
//
// Cualquier código async dentro de ese callback (incluidas las queries de
// Prisma) puede leer el context vía tenantContext.getStore(). Node propaga
// el AsyncLocalStorage automáticamente por await, timers, etc.
//
// Esto permite que el cliente Prisma extendido (lib/prisma.ts) inyecte
// where.organizacionId en TODAS las queries sin que las rutas tengan que
// tocar una línea. Multi-tenancy invisible y a prueba de olvidos humanos.
// ============================================================================

export interface TenantStore {
  organizacionId: number;
  cuentaId: number;
  staffUid?: number;    // id del Usuario staff logueado (si hay)
  rolCuenta: string;    // rol de la cuenta en la org
  rolStaff?: string;    // rol del staff dentro de la app (cocina/admin/...)
  // Escape hatch: si true, el cliente Prisma NO inyecta filtros de tenant.
  // Solo usar en rutas de sistema (auth, signup) que necesitan buscar a
  // través de orgs. NUNCA en rutas de negocio.
  bypassTenant?: boolean;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

/** Helper: obtiene el store actual o lanza si no hay contexto. */
export function getTenant(): TenantStore {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error('tenantContext: sin contexto activo — falta tenantMiddleware en la ruta');
  }
  return store;
}

/** Helper: obtiene el store actual o null si no hay contexto. */
export function tryGetTenant(): TenantStore | null {
  return tenantContext.getStore() ?? null;
}

/**
 * Corre un bloque SIN filtro de tenant (bypass total). Usar con cuidado —
 * solo para operaciones de sistema como autenticación, signup, migraciones.
 *
 * Ejemplo:
 *   const cuenta = await runWithoutTenant(() =>
 *     prisma.cuenta.findUnique({ where: { email } })
 *   );
 */
export function runWithoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  const current = tenantContext.getStore();
  const next: TenantStore = current
    ? { ...current, bypassTenant: true }
    : { organizacionId: 0, cuentaId: 0, rolCuenta: '', bypassTenant: true };
  return tenantContext.run(next, fn);
}
