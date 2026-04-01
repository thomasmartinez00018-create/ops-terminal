import { useCallback } from 'react';

const MAX_RECENT = 6;

function storageKey(userId: number) {
  return `recent_products_${userId}`;
}

export function useRecentProducts(userId: number) {
  const getRecents = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
    } catch {
      return [];
    }
  }, [userId]);

  const addRecent = useCallback((productId: string) => {
    const prev = getRecents().filter(id => id !== productId);
    const next = [productId, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  }, [userId, getRecents]);

  return { getRecents, addRecent };
}
