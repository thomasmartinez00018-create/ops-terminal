import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface DashboardConfig {
  tipo?: 'auto' | 'admin' | 'simple' | 'deposito';
  widgets?: string[];   // para tipo='admin': qué secciones mostrar
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
  login: (user: User) => void;
  logout: () => void;
  tienePermiso: (clave: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const login = (userData: User) => setUser(userData);
  const logout = () => setUser(null);

  const tienePermiso = (clave: string): boolean => {
    if (!user) return false;
    if (user.rol === 'admin') return true;
    if (user.permisos?.includes('*')) return true;
    return user.permisos?.includes(clave) ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, tienePermiso }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
