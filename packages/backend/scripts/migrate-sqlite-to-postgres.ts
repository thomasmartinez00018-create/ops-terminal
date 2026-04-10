/**
 * ── Migración SQLite → Postgres ─────────────────────────────────────────────
 *
 * Lee una DB SQLite existente (típicamente la que el cliente tenía dentro
 * de Electron en %APPDATA%\\OPS Terminal\\stock.db) y la volcá completa
 * en una DB Postgres (típicamente la nueva en Neon).
 *
 * USO:
 *   export SQLITE_PATH=/ruta/a/stock.db                       # origen
 *   export DATABASE_URL="postgresql://usr:pass@host/db"        # destino
 *   npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * SEGURIDAD:
 * - Este script ASUME que la DB destino ya tiene el schema creado
 *   (correr `prisma migrate deploy` antes).
 * - El orden de inserción respeta las FKs.
 * - Los IDs se preservan (usando setval en las secuencias al final).
 * - Si una tabla ya tiene datos, el script aborta para no duplicar.
 * - PIN plano: el script NO re-hashea en el camino porque el login hace
 *   la re-hash transparente la primera vez que cada usuario se loguea.
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const SQLITE_PATH = process.env.SQLITE_PATH;
if (!SQLITE_PATH) {
  console.error('ERROR: SQLITE_PATH no definida');
  console.error('Ejemplo: SQLITE_PATH=/path/to/stock.db');
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`ERROR: no existe ${SQLITE_PATH}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL (postgres) no definida');
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const prisma = new PrismaClient();

// Orden de tablas respetando FKs (padres antes que hijos)
const TABLES_ORDER = [
  'depositos',
  'usuarios',
  'productos',
  'proveedores',
  'proveedor_productos',
  'recetas',
  'receta_ingredientes',
  'elaboracion_lotes',
  'inventarios',
  'inventario_detalles',
  'ordenes_compra',
  'orden_compra_items',
  'recepciones',
  'recepcion_items',
  'facturas',
  'factura_items',
  'pagos',
  'tareas',
  'movimientos',
];

// Columnas de cada tabla que son DateTime (para convertir ISO strings)
const DATETIME_COLS: Record<string, string[]> = {
  productos: ['created_at', 'updated_at'],
  movimientos: ['created_at'],
  elaboracion_lotes: ['created_at'],
  ordenes_compra: ['created_at', 'fecha_entrega'],
  recepciones: ['created_at'],
  facturas: ['created_at', 'updated_at'],
  pagos: ['created_at'],
  tareas: ['created_at', 'updated_at', 'completada_at'],
  inventarios: ['created_at', 'cerrado_at'],
};

function convertRow(table: string, row: any): any {
  const out: any = {};
  const dtCols = DATETIME_COLS[table] || [];
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (dtCols.includes(k) && typeof v === 'string') {
      const d = new Date(v);
      out[k] = isNaN(d.getTime()) ? null : d;
      continue;
    }
    // SQLite booleans vienen como 0/1
    if (typeof v === 'number' && (k === 'activo' || k.startsWith('es_'))) {
      out[k] = v === 1;
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function copyTable(table: string) {
  // Verificar que la tabla existe en SQLite
  const exists = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table);
  if (!exists) {
    console.log(`  [${table}] tabla no existe en SQLite, salteando`);
    return;
  }

  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as any[];
  if (rows.length === 0) {
    console.log(`  [${table}] vacía`);
    return;
  }

  // Verificar que la tabla destino está vacía
  const count = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*)::bigint AS count FROM "${table}"`
  );
  if (count[0].count > 0n) {
    console.log(`  [${table}] destino ya tiene ${count[0].count} filas — SALTEANDO`);
    return;
  }

  // Insertar en batches de 500 usando SQL crudo (más rápido que Prisma.$insertMany)
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => convertRow(table, r));
    const cols = Object.keys(batch[0]);
    const values: any[] = [];
    const placeholders: string[] = [];
    batch.forEach((row, rowIdx) => {
      const rowPlaceholders = cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`);
      placeholders.push(`(${rowPlaceholders.join(',')})`);
      cols.forEach(c => values.push(row[c]));
    });
    const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${placeholders.join(',')}`;
    await prisma.$executeRawUnsafe(sql, ...values);
    inserted += batch.length;
  }
  console.log(`  [${table}] ${inserted} filas insertadas`);

  // Actualizar la secuencia del id para que los próximos autoincrement no choquen
  try {
    const maxId = sqlite.prepare(`SELECT MAX(id) as m FROM "${table}"`).get() as { m: number | null };
    if (maxId.m) {
      const seqName = `${table}_id_seq`;
      await prisma.$executeRawUnsafe(
        `SELECT setval('${seqName}', $1, true)`,
        maxId.m
      );
    }
  } catch (e: any) {
    console.log(`    WARN: no se pudo setval en ${table}: ${e.message}`);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  OPS Terminal — Migración SQLite → Postgres');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Origen:', SQLITE_PATH);
  console.log('Destino:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
  console.log('');

  for (const table of TABLES_ORDER) {
    try {
      await copyTable(table);
    } catch (e: any) {
      console.error(`  [${table}] ERROR: ${e.message}`);
      if (process.env.STRICT === 'true') {
        throw e;
      }
    }
  }

  console.log('');
  console.log('━━━ Migración completa ━━━');
  console.log('Los PINs quedan en texto plano y se re-hashean automáticamente');
  console.log('la primera vez que cada usuario se loguea.');
}

main()
  .catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
