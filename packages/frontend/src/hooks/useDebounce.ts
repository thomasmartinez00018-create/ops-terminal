import { useEffect, useState } from 'react';

/**
 * Devuelve una versión "debounced" del valor: solo se actualiza cuando
 * el valor original dejó de cambiar por `delay` ms. Típico use case:
 * input de búsqueda que dispara un fetch. Sin debounce, tipear "queso"
 * hace 5 requests (q, qu, que, ques, queso). Con debounce 300ms, hace 1.
 *
 * @example
 *   const [buscar, setBuscar] = useState('');
 *   const buscarDebounced = useDebounce(buscar, 300);
 *   useEffect(() => { cargar(); }, [buscarDebounced]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
