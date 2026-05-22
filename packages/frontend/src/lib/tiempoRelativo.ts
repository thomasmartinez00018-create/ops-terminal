/**
 * tiempoRelativo — formatos de fecha humanos en español rioplatense.
 *
 * Reemplaza "2026-05-22 14:30:15" → "hace 5 min" / "hoy 14:30" / "ayer" /
 * "el viernes" / "el 5 de mayo".
 *
 * Pensado para feeds de actividad donde el sello completo es ruido visual.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function toDate(input: string | Date): Date | null {
  if (input instanceof Date) return input;
  // Soporta "YYYY-MM-DD", "YYYY-MM-DD HH:mm", ISO, etc.
  let s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + 'T00:00:00';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "hace 5 min" / "hace 2 hs" / "ayer 19:30" / "el 5 de mayo" */
export function tiempoRelativo(input: string | Date, ref: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '';
  const diff = ref.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  const hh = Math.floor(min / 60);
  const dd = Math.floor(hh / 24);

  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  if (hh < 24 && esMismoDia(d, ref)) return `hoy ${formatHora(d)}`;
  if (esAyer(d, ref)) return `ayer ${formatHora(d)}`;
  if (dd < 7) return `el ${DIAS_SEMANA[d.getDay()]}`;
  if (dd < 30) return `hace ${Math.floor(dd / 7)} sem`;
  // Más de 1 mes: fecha completa human
  return `el ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Agrupar item por "HOY / AYER / ESTA SEMANA / etc." */
export function grupoFecha(input: string | Date, ref: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return 'Sin fecha';
  if (esMismoDia(d, ref)) return 'Hoy';
  if (esAyer(d, ref)) return 'Ayer';
  const dd = Math.floor((ref.getTime() - d.getTime()) / 86400000);
  if (dd < 7) return 'Esta semana';
  if (dd < 30) return 'Este mes';
  return MESES[d.getMonth()].charAt(0).toUpperCase() + MESES[d.getMonth()].slice(1);
}

function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function esAyer(d: Date, ref: Date): boolean {
  const ayer = new Date(ref);
  ayer.setDate(ayer.getDate() - 1);
  return esMismoDia(d, ayer);
}
function formatHora(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Saludo según hora del día */
export function saludo(ref: Date = new Date()): string {
  const h = ref.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
