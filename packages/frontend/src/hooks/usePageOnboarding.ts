import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function storageKey(userId: number, pageKey: string) {
  return `page_ob_v1_${userId}_${pageKey}`;
}

export function usePageOnboarding(pageKey: string) {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    let done: string | null = null;
    try { done = localStorage.getItem(storageKey(user.id, pageKey)); } catch { /* ignore */ }
    if (!done) {
      const t = setTimeout(() => setShow(true), 400);
      return () => clearTimeout(t);
    }
  }, [user?.id, pageKey]);

  const dismiss = () => {
    if (!user) return;
    try { localStorage.setItem(storageKey(user.id, pageKey), '1'); } catch { /* ignore */ }
    setShow(false);
  };

  return { show, dismiss };
}
