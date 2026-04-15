import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, setToken, getToken, AUTH_ERROR_EVENT } from '../lib/api';
import { useSession } from './SessionContext';

export interface DashboardConfig {
  tipo?: 'auto' | 'admin' | 'simple' | 'deposito' | 'dueno';
  widgets?: string[];   // para tipo='admin'|'dueno': qué secciones mostrar
  acciones?: string[];  // para tipo='simple'|'deposito': qué botones mostrar
}

export interface User {
  id: number;
  codigo: string;
  nombre: string;
  rol: string;
  permisos: string[]; // ['*'] para admin, lista de claves para otros
  configuracion?: DashboardConfig | null;
  depositoDefectoId?: number | null;
  depositoDefectoNombre?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  tienePermiso: (clave: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Delegamos el logout de sesión completa al SessionContext (que maneja
  // los 3 stages). AuthProvider solo se monta cuando stage === 'staff',
  // así que useSession siempre está disponible acá.
  const session = useSession();
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  // Si hay token guardado, arranca "loading" para revalidarlo antes de
  // mostrar la app (evita flash de contenido con un token vencido)
  const [loading, setLoading] = useState<boolean>(() => !!getToken());

  // ── Validar token al arrancar ──────────────────────────────────────────
  // Si hay token guardado, pegamos a /api/auth/me para refrescar los datos
  // del usuario y detectar tokens expirados antes de navegar.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(u => {
        const userData: User = {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol,
          permisos: u.permisos || [],
          configuracion: u.configuracion ?? null,
          depositoDefectoId: u.depositoDefectoId ?? null,
          depositoDefectoNombre: u.depositoDefectoNombre ?? null,
        };
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      })
      .catch(() => {
        // Token inválido o servidor caído → cerrar sesión
        setToken(null);
        setUser(null);
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Listener global de 401 ─────────────────────────────────────────────
  // api.ts dispara este evento cuando cualquier request recibe 401.
  // Acá cerramos sesión para forzar re-login.
  useEffect(() => {
    const handler = () => {
      setUser(null);
      localStorage.removeItem('user');
    };
    window.addEventListener(AUTH_ERROR_EVENT, handler);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, handler);
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }, [user]);

  const login = (token: string, userData: User) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    // Cerrar también la sesión de la cuenta → vuelve al login stage 1.
    session.logout();
  };

  const tienePermiso = (clave: string): boolean => {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    if (user.permisos?.includes('*')) return true;
    return user.permisos?.includes(clave) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, tienePermiso }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
