/**
 * parsePresentacion(str) → { totalQty, baseUnit: 'kg' | 'litro' } | null
 * Calculates total qty in base unit from supplier presentation text.
 */
export function parsePresentacion(str: string | null | undefined): { totalQty: number; baseUnit: string } | null {
  if (!str || typeof str !== 'string') return null;
  const s = str.toUpperCase().replace(/,/g, '.').replace(/[()]/g, ' ');
  const UNITS = 'KGS?|KILOS?|GRS?|G|LTS?|L|LITROS?|ML|CC';
  const N = '(\\d+\\.?\\d*)';

  function toBase(qty: number, rawUnit: string) {
    const u = rawUnit.trim();
    if (/^(KGS?|KILOS?)$/.test(u)) return { totalQty: qty, baseUnit: 'kg' };
    if (/^(GRS?|G)$/.test(u)) return { totalQty: qty / 1000, baseUnit: 'kg' };
    if (/^(LTS?|L|LITROS?)$/.test(u)) return { totalQty: qty, baseUnit: 'litro' };
    if (/^(ML|CC)$/.test(u)) return { totalQty: qty / 1000, baseUnit: 'litro' };
    return null;
  }

  const m1 = s.match(new RegExp(`${N}\\s*[A-Z\\s]*?[X×]\\s*${N}\\s*(${UNITS})\\b`));
  if (m1) {
    const n1 = parseFloat(m1[1]), n2 = parseFloat(m1[2]);
    if (!isNaN(n1) && !isNaN(n2) && n1 > 0 && n2 > 0) {
      const r = toBase(n1 * n2, m1[3]);
      if (r) return r;
    }
  }

  const m2 = s.match(new RegExp(`[X×]\\s*${N}\\s*(?:[A-Z\\.]+\\s*)?${N}\\s*(${UNITS})\\b`));
  if (m2) {
    const n1 = parseFloat(m2[1]), n2 = parseFloat(m2[2]);
    if (!isNaN(n1) && !isNaN(n2) && n1 > 0 && n2 > 0) {
      const r = toBase(n1 * n2, m2[3]);
      if (r) return r;
    }
  }

  const m3 = s.match(new RegExp(`${N}\\s*(${UNITS})\\b`));
  if (m3) {
    const qty = parseFloat(m3[1]);
    if (!isNaN(qty) && qty > 0) {
      const r = toBase(qty, m3[2]);
      if (r) return r;
    }
  }

  return null;
}
