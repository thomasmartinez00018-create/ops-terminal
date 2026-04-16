/**
 * Fórmulas de desperdicio/merma — estándar gastronómico profesional.
 *
 * Definiciones:
 *   Peso bruto  = lo que entra a la cocina (con cáscaras, huesos, merma)
 *   Peso neto   = lo que queda utilizable (lo que va al plato)
 *   Desperdicio = peso bruto - peso neto
 *
 * Fórmula 1 — Cálculo del % de desperdicio:
 *   % desperdicio = (desperdicio / peso_bruto) * 100
 *
 * Fórmula 2 — Factor de desperdicio (multiplicador para pasar de neto a bruto):
 *   factor = (% / (100 - %)) + 1    ≡    1 / (1 - %/100)
 *
 * Uso práctico:
 *   cantidad_bruta_a_comprar = cantidad_neta_receta * factor
 *   costo_ingrediente         = cantidad_bruta * precio_de_compra
 */

export function porcentajeDesperdicio(pesoBruto: number, desperdicio: number): number {
  if (!pesoBruto || pesoBruto <= 0) return 0;
  return (desperdicio / pesoBruto) * 100;
}

export function factorDesperdicio(porcentaje: number): number {
  const p = Number(porcentaje) || 0;
  // Clamp [0, 99) para evitar div/0 o factores absurdos.
  const safe = Math.min(Math.max(p, 0), 99);
  return safe > 0 ? 1 / (1 - safe / 100) : 1;
}

export function cantidadBruta(cantidadNeta: number, porcentajeMerma: number): number {
  return Number(cantidadNeta) * factorDesperdicio(porcentajeMerma);
}
