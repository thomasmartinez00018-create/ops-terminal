// ============================================================================
// Tabla de mermas sugeridas — referencia gastronómica argentina
// ----------------------------------------------------------------------------
// Datos recopilados de fuentes del rubro (Germán de Bonis, Saleciano,
// Ingeniería de Menú, tablas de rendimiento de carnes) cruzados con el
// uso común en cocinas argentinas. Son VALORES DE REFERENCIA, no reglas —
// el chef los acepta o los ajusta con la calculadora de merma si su
// proveedor/corte/técnica da otro resultado.
//
// Uso: `sugerirMerma("Papa negra 5kg")` → 22 (número) o `null` si no
// hay sugerencia confiable. El frontend muestra un chip "💡 Sugerido: 22%"
// cuando el chef elige ese ingrediente y el campo merma está en 0.
// ============================================================================

interface MermaSugerida {
  /** Patrón exacto o regex para matchear contra el nombre del producto */
  patron: RegExp;
  /** Porcentaje de merma típico (ej: 22 para 22%) */
  pct: number;
  /** Nota corta visible al usuario ("quitar cáscara y ojos") */
  nota: string;
}

// Ordenadas por especificidad: los patrones más específicos primero para que
// "pollo con hueso" matchee antes que "pollo" genérico.
const TABLA: MermaSugerida[] = [
  // ── VEGETALES DE HOJA ─────────────────────────────────────────────────
  { patron: /\bespinac/i,           pct: 40, nota: 'lavado + cocción reducen mucho el peso' },
  { patron: /\bacelga/i,            pct: 35, nota: 'tallo y cocción' },
  { patron: /\brúcul|\brucul/i,     pct: 15, nota: 'tallos y hojas dañadas' },
  { patron: /\blechuga/i,           pct: 20, nota: 'hojas exteriores y tallo' },

  // ── FRUTAS / HORTALIZAS ALTA MERMA ────────────────────────────────────
  { patron: /\bpalta|\baguacate/i,  pct: 30, nota: 'carozo y cáscara' },
  { patron: /\bananá|\bpi[ñn]a/i,   pct: 45, nota: 'cáscara, centro y ojos' },
  { patron: /\bmel[oó]n/i,          pct: 40, nota: 'cáscara y semillas' },
  { patron: /\bsand[ií]a/i,         pct: 45, nota: 'cáscara' },
  { patron: /\blim[oó]n|\bnaranja/i, pct: 50, nota: 'cáscara (si se usa jugo)' },
  { patron: /\bfrutilla/i,          pct: 12, nota: 'cabito verde' },

  // ── HORTALIZAS COMUNES ────────────────────────────────────────────────
  { patron: /\bpapa\b|\bpapas\b/i,  pct: 22, nota: 'pelado + cortes irregulares' },
  { patron: /\bbatata/i,            pct: 25, nota: 'pelado' },
  { patron: /\bzanahoria/i,         pct: 12, nota: 'pelado y cabitos' },
  { patron: /\bcebolla/i,           pct: 10, nota: 'cáscara' },
  { patron: /\bpuerro/i,            pct: 25, nota: 'hojas verdes' },
  { patron: /\bajo\b/i,             pct: 15, nota: 'cáscara' },
  { patron: /\btomate/i,            pct: 8,  nota: 'cabito' },
  { patron: /\bmorr[oó]n|\bpimiento/i, pct: 18, nota: 'semillas y pedúnculo' },
  { patron: /\bberenjena/i,         pct: 12, nota: 'cabito y piel amarga' },
  { patron: /\bzapallito|\bzuc+hini|\bzucchini/i, pct: 8, nota: 'cabitos' },
  { patron: /\bchoclo/i,            pct: 50, nota: 'marlo y chala (si es entero)' },
  { patron: /\bch[aá]mpi|\bchampig/i, pct: 10, nota: 'base sucia' },

  // ── CARNES VACUNAS ────────────────────────────────────────────────────
  { patron: /\bcuadrada\b|\bcuadrat/i, pct: 15, nota: 'grasa y nervios' },
  { patron: /\bpeceto/i,             pct: 12, nota: 'grasa externa' },
  { patron: /\bbife.*(ancho|angosto|chorizo)/i, pct: 10, nota: 'grasa superficial' },
  { patron: /\bnalga\b|\bnalga de/i,  pct: 12, nota: 'grasa y nervios' },
  { patron: /\bmatambre/i,           pct: 18, nota: 'grasa y tendones' },
  { patron: /\bentraña/i,            pct: 8,  nota: 'membrana' },
  { patron: /\bcolita de cuadril/i,  pct: 10, nota: 'grasa' },
  { patron: /\bcarne\s+picada/i,     pct: 5,  nota: 'merma mínima' },
  { patron: /\bosobuco/i,            pct: 40, nota: 'hueso y tuétano (si rinde carne limpia)' },
  { patron: /\bmilanesa/i,           pct: 5,  nota: 'ya viene preparada' },

  // ── AVES ──────────────────────────────────────────────────────────────
  { patron: /\bpollo.*(entero|completo)/i, pct: 35, nota: 'huesos + menudencias' },
  { patron: /\bpollo.*(pata|muslo|pat+a).*hueso/i, pct: 25, nota: 'huesos' },
  { patron: /\bpollo.*(supr[eé]ma|pechuga)/i, pct: 8, nota: 'grasa y tendones' },
  { patron: /\bpata muslo\b/i,       pct: 25, nota: 'huesos' },
  { patron: /\bpavita/i,             pct: 10, nota: 'grasa' },

  // ── CERDO ─────────────────────────────────────────────────────────────
  { patron: /\bcarré de cerdo|\bcarre de cerdo|\blomo de cerdo/i, pct: 12, nota: 'grasa' },
  { patron: /\bcostilla.*cerdo|\bchurras/i, pct: 30, nota: 'huesos' },
  { patron: /\bbondiola/i,           pct: 15, nota: 'grasa' },

  // ── PESCADOS ──────────────────────────────────────────────────────────
  { patron: /\bsalm[oó]n.*entero/i,  pct: 45, nota: 'cabeza, espina, piel' },
  { patron: /\bmerluza.*entera/i,    pct: 50, nota: 'cabeza, espina' },
  { patron: /\blenguado.*entero/i,   pct: 55, nota: 'cabeza y espina' },
  { patron: /\bfilet/i,              pct: 5,  nota: 'ya viene limpio' },
  { patron: /\batún/i,               pct: 10, nota: 'recortes' },
  { patron: /\blangostinos?/i,       pct: 40, nota: 'cabeza y cáscara' },
  { patron: /\bcalamar/i,            pct: 25, nota: 'piel y vísceras' },
  { patron: /\bmejill[oó]n/i,        pct: 65, nota: 'concha' },
  { patron: /\bpulpo\b/i,            pct: 56, nota: 'limpieza + cocción muy alta' },

  // ── LÁCTEOS / DERIVADOS (ya vienen limpios, sin merma) ────────────────
  { patron: /\bmuzzarella|\bmozzarella|\bmuza\b|\bmuzz/i, pct: 0, nota: 'viene lista' },
  { patron: /\bqueso\s+(cremoso|sardo|rall)/i, pct: 0, nota: 'viene listo' },
  { patron: /\bcrema\s+de\s+leche/i, pct: 0, nota: 'viene lista' },
  { patron: /\bmanteca/i,            pct: 0, nota: 'viene lista' },
  { patron: /\bhuevo/i,              pct: 12, nota: 'cáscara' },

  // ── SECOS / GRANOS / HARINAS (sin merma) ──────────────────────────────
  { patron: /\bharina/i,             pct: 0, nota: 'sin merma' },
  { patron: /\baz[uú]car/i,          pct: 0, nota: 'sin merma' },
  { patron: /\barroz/i,              pct: 0, nota: 'sin merma en crudo' },
  { patron: /\bfideos?|\bpastas?\b/i, pct: 0, nota: 'sin merma en crudo' },
  { patron: /\baceite/i,             pct: 0, nota: 'sin merma' },
  { patron: /\bvinagre/i,            pct: 0, nota: 'sin merma' },

  // ── OTROS ─────────────────────────────────────────────────────────────
  { patron: /\bpan\b/i,              pct: 5,  nota: 'secciones duras / puntas' },
  { patron: /\bjam[oó]n|\bfiambr/i,  pct: 3,  nota: 'recortes' },
];

/**
 * Busca una merma sugerida para el nombre de producto dado.
 * Devuelve null si no hay match confiable (mejor silencio que mala sugerencia).
 */
export function sugerirMerma(nombreProducto: string | null | undefined): { pct: number; nota: string } | null {
  if (!nombreProducto || typeof nombreProducto !== 'string') return null;
  const s = nombreProducto.trim();
  if (!s) return null;
  for (const row of TABLA) {
    if (row.patron.test(s)) {
      return { pct: row.pct, nota: row.nota };
    }
  }
  return null;
}
