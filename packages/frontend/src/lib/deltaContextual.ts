/**
 * deltaContextual — calcula la voz semántica de una variación entre dos
 * valores, según el DOMINIO de la métrica (no solo el signo del delta).
 *
 * Ejemplo del problema que resuelve:
 *   actual=0, anterior=50000 en una métrica de MERMAS
 *   Naive:    "-100%"  (signo negativo, color rojo → parece malo)
 *   Real:     "Cortaste las mermas (eran $50k)"  (signo es BUENO en mermas)
 *
 * La métrica le pasa su "polaridad": 'mas_es_mejor' (ingresos) o
 * 'menos_es_mejor' (mermas, deuda, mermas porcentuales). El helper devuelve
 * el mensaje listo + el tono (good/bad/neutral) para colorear sin pensar.
 */

export type Polaridad = 'mas_es_mejor' | 'menos_es_mejor';
export type TonoDelta = 'good' | 'bad' | 'neutral';

export interface DeltaContextual {
  /** Mensaje human-friendly para mostrar al lado del número */
  mensaje: string;
  /** Tono semántico (no el signo del número) */
  tono: TonoDelta;
  /** % de variación, o null cuando no aplica */
  pct: number | null;
  /** Indica si se debe mostrar flecha y en qué dirección */
  flecha: 'up' | 'down' | null;
}

const fmt = (n: number): string =>
  '$' + Math.round(Math.abs(n)).toLocaleString('es-AR');

export function calcularDelta(
  actual: number,
  anterior: number,
  polaridad: Polaridad = 'mas_es_mejor',
): DeltaContextual {
  const ambosCero = actual === 0 && anterior === 0;
  if (ambosCero) {
    return {
      mensaje: polaridad === 'menos_es_mejor' ? 'Sin novedad ✓' : 'Sin datos',
      tono: polaridad === 'menos_es_mejor' ? 'good' : 'neutral',
      pct: null,
      flecha: null,
    };
  }

  // Caso A: actual = 0 y anterior > 0 (la métrica DESAPARECIÓ)
  if (actual === 0 && anterior > 0) {
    if (polaridad === 'menos_es_mejor') {
      // Mermas = 0 cuando antes había → ¡bárbaro!
      return {
        mensaje: `Cortaste (eran ${fmt(anterior)})`,
        tono: 'good',
        pct: -100,
        flecha: 'down',
      };
    }
    // Ingresos = 0 cuando antes había → ALARMA
    return {
      mensaje: `Sin ingresos este período (antes ${fmt(anterior)})`,
      tono: 'bad',
      pct: -100,
      flecha: 'down',
    };
  }

  // Caso B: actual > 0 y anterior = 0 (apareció algo nuevo)
  if (anterior === 0 && actual > 0) {
    if (polaridad === 'menos_es_mejor') {
      return {
        mensaje: `Apareció ${fmt(actual)} — revisar`,
        tono: 'bad',
        pct: null,
        flecha: 'up',
      };
    }
    return {
      mensaje: `Arrancaste con ${fmt(actual)}`,
      tono: 'good',
      pct: null,
      flecha: 'up',
    };
  }

  // Caso C: ambos > 0 → calcular % real
  const pct = ((actual - anterior) / anterior) * 100;
  const sube = pct > 0.5;
  const baja = pct < -0.5;
  const sinCambio = !sube && !baja;

  if (sinCambio) {
    return { mensaje: 'Estable', tono: 'neutral', pct: 0, flecha: null };
  }

  const pctText = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
  const subeBueno =
    (sube && polaridad === 'mas_es_mejor') ||
    (baja && polaridad === 'menos_es_mejor');

  return {
    mensaje: pctText + ' vs período anterior',
    tono: subeBueno ? 'good' : 'bad',
    pct,
    flecha: sube ? 'up' : 'down',
  };
}

/** Detecta si un número está fuera de banda vs un promedio histórico. */
export function esAnomalia(actual: number, promedio: number, factor = 0.3): boolean {
  if (promedio <= 0) return false;
  return actual < promedio * factor;
}
