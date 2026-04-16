import { useCallback } from 'react';

const MAX_RECENT = 6;

function storageKey(userId: number) {
  return `recent_products_${userId}`;
}

export function useRecentProducts(userId: number) {
  const getRecents = useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(storageKey(userId)) || '[]';
      const parsed = JSON.parse(raw);
      // Defensa: asegurar que es array de strings (datos viejos/corruptos)
      return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, [userId]);

  const addRecent = useCallback((productId: string) => {
    const prev = getRecents().filter(id => id !== productId);
    const next = [productId, ...prev].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // incógnito / quota — no frenar el flujo UI
    }
  }, [userId, getRecents]);

  return { getRecents, addRecent };
}
