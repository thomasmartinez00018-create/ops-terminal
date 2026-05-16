import { useEffect, useState } from 'react';

/**
 * useStickyState — como useState pero persiste el valor en sessionStorage
 * bajo `key`. Sobrevive a navegación entre páginas y recarga de pestaña,
 * pero NO entre sesiones distintas del navegador (sessionStorage se limpia
 * al cerrar la pestaña). Ideal para filtros: el usuario filtra Stock por
 * depósito, entra a ver un producto, vuelve y el filtro sigue puesto.
 *
 * Seguro ante JSON corrupto o storage no disponible (modo incógnito de
 * algunos navegadores): cae al default sin romper.
 *
 * @example
 *   const [filtroDeposito, setFiltroDeposito] = useStickyState('stock.dep', '');
 */
export function useStickyState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(`ops:${key}`);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(`ops:${key}`, JSON.stringify(value));
    } catch {
      /* storage lleno / no disponible — degradamos silencioso */
    }
  }, [key, value]);

  return [value, setValue];
}
