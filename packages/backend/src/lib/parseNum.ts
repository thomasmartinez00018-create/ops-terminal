// ============================================================================
// parseNum — parseo robusto de números en formato argentino / mixto
// ----------------------------------------------------------------------------
// Los datos vienen de Excel/PDF/POS con formatos inconsistentes:
//   "17.007,31" (AR: punto miles, coma decimal) → 17007.31
//   "1.478.856"  (AR: solo miles)                → 1478856
//   "207,517.97" (US: coma miles, punto decimal) → 207517.97
//   "13.500"     (AR miles SIN coma)             → 13500   ← el caso traicionero
//   "0,05" / "0.05" (cantidad chica)             → 0.05
//
// Distinguimos PRECIO de CANTIDAD porque la heurística del "punto solo" cambia:
//   - En un PRECIO, "13.500" casi siempre son 13.500 pesos (miles). En este
//     dominio gastronómico ningún insumo vale 13,5 centavos.
//   - En una CANTIDAD, "0.050" son 0,05 kg (decimal). Nunca son miles.
// ============================================================================

/** Normaliza dejando solo dígitos, punto, coma y signo. */
function limpiar(v: any): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  const s = String(v).trim().replace(/[^0-9.,-]/g, '');
  return s || null;
}

/**
 * Parsea un PRECIO/monto. Maneja el caso ambiguo "13.500" como miles.
 * Devuelve 0 si no es parseable.
 */
export function parsePrecio(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = limpiar(v);
  if (!s) return 0;

  let out = s;
  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // El último separador que aparece es el decimal; el otro es de miles.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      out = s.replace(/\./g, '').replace(',', '.'); // AR: 17.007,31
    } else {
      out = s.replace(/,/g, ''); // US: 207,517.97
    }
  } else if (tieneComa) {
    // Solo coma → coma decimal (AR)
    out = s.replace(',', '.');
  } else if (tienePunto) {
    // Solo punto(s) — ambiguo
    const parts = s.split('.');
    if (parts.length > 2) {
      out = parts.join(''); // múltiples puntos = miles: 1.478.856
    } else {
      const dec = parts[1] ?? '';
      // Punto único: si hay exactamente 3 dígitos después y el entero no es 0,
      // lo tratamos como separador de miles (13.500 → 13500). Si no, decimal.
      if (dec.length === 3 && parts[0] !== '0' && parts[0] !== '') {
        out = parts.join('');
      } // else: decimal real (12.50, 0.99) → dejar como está
    }
  }

  const n = parseFloat(out);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parsea una CANTIDAD chica (kg, litros, unidades). El punto/coma siempre es
 * decimal — nunca miles. Devuelve 0 si no es parseable.
 */
export function parseCantidad(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = limpiar(v);
  if (!s) return 0;

  let out = s;
  if (s.includes('.') && s.includes(',')) {
    // El último separador es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) out = s.replace(/\./g, '').replace(',', '.');
    else out = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    out = s.replace(',', '.');
  }
  // solo punto o sin separador → ya es decimal válido
  const n = parseFloat(out);
  return Number.isFinite(n) ? n : 0;
}

/** Igual que parsePrecio pero devuelve null en vez de 0 si no parsea. */
export function parsePrecioOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  const n = parsePrecio(v);
  return n === 0 && !/0/.test(String(v)) ? null : n;
}
