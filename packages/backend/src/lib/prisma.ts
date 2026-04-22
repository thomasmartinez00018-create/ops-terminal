import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenantContext';

// ============================================================================
// PRISMA CLIENT con extensión multi-tenant automática
// ============================================================================
// La extensión intercepta TODAS las operaciones sobre modelos marcados como
// "tenant-aware" y les inyecta organizacion_id del AsyncLocalStorage.
//
// - Reads (findMany, findFirst, count, aggregate, groupBy): agrega
//     where.organizacionId = ctx.organizacionId
// - findUnique: lo convierte a findFirst con el filtro extra (porque Prisma
//     no permite combinar un composite unique con where extra en findUnique)
// - Creates (create, createMany): inyecta data.organizacionId
// - Updates/Deletes (update, updateMany, delete, deleteMany, upsert):
//     agrega where.organizacionId
//
// Escape hatch: si el context tiene bypassTenant=true, la extensión no hace
// nada. Se usa en rutas de sistema (cuenta signup/login) que necesitan
// buscar/crear a través de tenants.
//
// Modelos que son child de otro (RecetaIngrediente → Receta, etc.) NO
// tienen organizacion_id directamente. Su seguridad se deriva del parent.
// Si una ruta los toca directamente, DEBE filtrar por el parent primero.
// ============================================================================

const TENANT_MODELS = new Set([
  'Producto',
  'Deposito',
  'Usuario',
  'Movimiento',
  'Proveedor',
  'ProveedorProducto',
  'Receta',
  'ElaboracionLote',
  'Inventario',
  'OrdenCompra',
  'Recepcion',
  'Tarea',
  'Factura',
  'Pago',
  'ListaPrecio',
  'StockParametro',
  'OrdenReposicion',
  'AlertaPrecio',
  // Porcionado tiene organizacionId directo en el schema pero no estaba acá
  // — cualquier findMany SIN filtro explícito devolvía porcionados de TODAS
  // las orgs. Leak cross-tenant confirmado. PorcionadoItem es child y se
  // escopea vía parent (igual que RecetaIngrediente).
  'Porcionado',
]);

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const WRITE_OPS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

const base = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
});

const prisma = base.$extends({
  name: 'multi-tenant',
  query: {
    $allModels: {
      async $allOperations({ args, query, model, operation }) {
        const ctx = tenantContext.getStore();

        // Sin contexto o bypass explícito → query original, sin filtro
        if (!ctx || ctx.bypassTenant) {
          return query(args);
        }

        // Modelo no-tenant (Cuenta, Organizacion, Miembro, RecetaIngrediente,
        // InventarioDetalle, OrdenCompraItem, RecepcionItem, FacturaItem) →
        // query original
        if (!TENANT_MODELS.has(model)) {
          return query(args);
        }

        const organizacionId = ctx.organizacionId;

        // ── Reads ────────────────────────────────────────────────────────
        if (READ_OPS.has(operation)) {
          const a: any = args ?? {};
          a.where = { ...(a.where ?? {}), organizacionId };
          return query(a);
        }

        // ── findUnique/findUniqueOrThrow → post-check ─────────────────────
        // Prisma no permite combinar where extra con un composite unique en
        // findUnique, y reescribir a findFirst rompería dentro de
        // transacciones interactivas. Solución: dejar pasar la query, y si
        // el resultado pertenece a otra org, devolver null (o throw en
        // findUniqueOrThrow). Defensa en profundidad + compatible con tx.
        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const result: any = await query(args);
          if (result && result.organizacionId !== undefined && result.organizacionId !== organizacionId) {
            if (operation === 'findUniqueOrThrow') {
              throw new Error(`${model} no encontrado`);
            }
            return null;
          }
          return result;
        }

        // ── create ───────────────────────────────────────────────────────
        if (operation === 'create') {
          const a: any = args ?? {};
          a.data = { ...(a.data ?? {}), organizacionId };
          return query(a);
        }

        // ── createMany ───────────────────────────────────────────────────
        if (operation === 'createMany') {
          const a: any = args ?? {};
          if (Array.isArray(a.data)) {
            a.data = a.data.map((d: any) => ({ ...d, organizacionId }));
          } else if (a.data) {
            a.data = { ...a.data, organizacionId };
          }
          return query(a);
        }

        // ── upsert ───────────────────────────────────────────────────────
        if (operation === 'upsert') {
          const a: any = args ?? {};
          a.where = { ...(a.where ?? {}), organizacionId };
          a.create = { ...(a.create ?? {}), organizacionId };
          // `update` branch no necesita organizacionId explícito, ya está
          // fijado por where.
          return query(a);
        }

        // ── writes destructivos (update/updateMany/delete/deleteMany) ────
        if (WRITE_OPS.has(operation)) {
          const a: any = args ?? {};
          a.where = { ...(a.where ?? {}), organizacionId };
          return query(a);
        }

        return query(args);
      },
    },
  },
});

export default prisma;

// Exportamos también el cliente base sin extensión, para casos muy
// puntuales (auth.ts usa prismaRaw.cuenta.findUnique({ where: { email } })
// porque Cuenta no es tenant-aware igual pero ilustra el escape).
// Con bypassTenant ya cubrimos el caso, pero tener el raw disponible ayuda
// para raw queries en auto-migrations.
export const prismaRaw = base;
