import { useEffect, useRef, useState } from 'react';

/**
 * useCountUpMemo — contador animado con memoria por clave en sessionStorage.
 *
 * Mejora sobre useCountUp básico:
 *   - La primera vez que ve el valor en la sesión: anima de 0 → target.
 *   - En renders sucesivos con el MISMO valor: NO anima (no irrita).
 *   - Cuando el valor CAMBIA: anima del valor anterior → nuevo (no de 0).
 *
 * Así la animación COMUNICA un cambio real, no se repite gratis por refrescar.
 *
 * @example
 *   const display = useCountUpMemo('hero.ingresos', valor, 1200);
 */
export function useCountUpMemo(
  key: string,
  target: number,
  duration = 1200,
  decimals = 0,
): number {
  const storageKey = `cup:${key}`;
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw !== null ? Number(raw) : 0;
    } catch {
      return 0;
    }
  });
  const startTime = useRef<number | null>(null);
  const startValue = useRef(value);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) { setValue(0); return; }

    let stored = 0;
    try {
      const raw = sessionStorage.getItem(storageKey);
      stored = raw !== null ? Number(raw) : 0;
    } catch {/* */}

    // Sin cambio respecto al último valor visto: no animar
    if (Math.abs(target - stored) < 1e-9) {
      setValue(target);
      return;
    }

    startTime.current = null;
    startValue.current = stored;
    if (rafId.current) cancelAnimationFrame(rafId.current);

    const tick = (now: number) => {
      if (startTime.current === null) startTime.current = now;
      const elapsed = now - startTime.current;
      const t = Math.min(1, elapsed / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const v = startValue.current + (target - startValue.current) * eased;
      setValue(v);
      if (t < 1) {
        rafId.current = requestAnimationFrame(tick);
      } else {
        try { sessionStorage.setItem(storageKey, String(target)); } catch {/* */}
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
  }, [storageKey, target, duration]);

  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
