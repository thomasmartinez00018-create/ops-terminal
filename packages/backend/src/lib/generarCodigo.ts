// ============================================================================
// generarCodigo — helper reentrante y retry-safe para códigos secuenciales
// ----------------------------------------------------------------------------
// Problema: muchos modelos (ListaPrecio, OrdenCompra, Elaboracion, Porcionado,
// Factura, etc.) generan un código "prefijo-NNN" leyendo el último registro
// y sumando 1. En condición de carga concurrente (dos imports simultáneos,
// por ejemplo) ambas transacciones leen el mismo `last.codigo`, generan el
// mismo "LP-042" y la segunda falla con P2002 (violación de UNIQUE).
//
// Este helper:
//   1. Calcula el próximo número a partir del último.
//   2. Intenta crear; si falla con P2002 (duplicate), reintenta hasta N veces
//      incrementando el número.
//
// Uso:
//   const lista = await generarConCodigoUnico({
//     prefix: 'LP',
//     tx,
//     delegate: tx.listaPrecio,
//     organizacionId,
//     extraData: { proveedorId, fecha, ... },
//     extraIncludes: { proveedor: true, items: true },
//   });
//
// Es un helper general, no atado a un modelo específico. Tiene que devolver
// el record creado, ya que el caller lo necesita para usar el lista.id en
// pasos siguientes del $transaction.
// ============================================================================

const MAX_RETRIES = 8;

export interface GenerarCodigoOpts {
  /** "LP", "OC", "ELA", "PORC", etc. */
  prefix: string;
  /** El modelo de Prisma: tx.listaPrecio, tx.ordenCompra, etc. */
  delegate: any;
  /** organizacionId (requerido — siempre filtramos por tenant) */
  organizacionId: number;
  /** data del create, sin `codigo` ni `organizacionId` (los seteamos nosotros). */
  data: Record<string, any>;
  /** include del create, si necesitás relaciones en el return */
  include?: any;
  /** padding para el número (default 3 → LP-001, LP-042, LP-999) */
  pad?: number;
}

/**
 * Crea un registro con código secuencial único. Reintenta hasta 8 veces si
 * choca con otra transacción que usó el mismo número.
 */
export async function generarConCodigoUnico<T>(opts: GenerarCodigoOpts): Promise<T> {
  const pad = opts.pad ?? 3;
  const re = new RegExp(`^${opts.prefix}-(\\d+)`);

  // Leer el último para tener un punto de partida razonable.
  const last = await opts.delegate.findFirst({
    where: { organizacionId: opts.organizacionId },
    orderBy: { id: 'desc' },
    select: { codigo: true },
  });
  let nextNum = 1;
  if (last?.codigo) {
    const m = String(last.codigo).match(re);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }

  let lastError: any;
  for (let intento = 0; intento < MAX_RETRIES; intento++) {
    const codigo = `${opts.prefix}-${String(nextNum).padStart(pad, '0')}`;
    try {
      const created = await opts.delegate.create({
        data: {
          ...opts.data,
          organizacionId: opts.organizacionId,
          codigo,
        },
        include: opts.include,
      });
      return created as T;
    } catch (e: any) {
      // P2002 = unique constraint violation. Otra request usó nuestro número.
      // Seguimos incrementando y reintentamos.
      if (e?.code === 'P2002') {
        lastError = e;
        nextNum += 1;
        continue;
      }
      // Cualquier otro error — lo propagamos tal cual.
      throw e;
    }
  }
  throw lastError ?? new Error(`No se pudo generar código único tras ${MAX_RETRIES} intentos`);
}
