import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  api,
  setToken,
  getToken,
  getTokenStage,
  decodeToken,
  AUTH_ERROR_EVENT,
  type TokenStage,
  type CuentaInfo,
  type WorkspaceInfo,
} from '../lib/api';

// ============================================================================
// SessionContext — orquesta las 3 etapas del login multi-tenant
// ============================================================================
// Stage 1 (cuenta):  email + password  →  token cuenta, lista workspaces
// Stage 2 (org):     elegir workspace  →  token org (aún sin staff)
// Stage 3 (staff):   código + PIN       →  token staff, app desbloqueada
//
// Este contexto es el "gate" de más alto nivel: decide qué pantalla mostrar
// según el stage del token actual. Abajo vive <AuthContext> que ya maneja
// datos del staff user (stage 3).
//
// Persistencia mínima:
//   - ops_token       → JWT actual (stage cambia a medida que progresa)
//   - ops_cuenta      → JSON cuenta info, para mostrar email en UI
//   - ops_workspace   → JSON workspace elegido
//   - ops_workspaces  → lista de workspaces disponibles (cacheada)
// ============================================================================

const CUENTA_KEY = 'ops_cuenta';
const WORKSPACE_KEY = 'ops_workspace';
const WORKSPACES_KEY = 'ops_workspaces';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: any | null) {
  if (value === null || value === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

interface SessionContextType {
  stage: TokenStage;
  cuenta: CuentaInfo | null;
  workspace: WorkspaceInfo | null;
  workspaces: WorkspaceInfo[];
  loading: boolean;

  signup: (email: string, password: string, nombre: string, orgNombre?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  selectWorkspace: (organizacionId: number) => Promise<void>;
  createWorkspace: (nombre: string, templateId?: string) => Promise<WorkspaceInfo>;
  backToWorkspaces: () => Promise<void>;
  logout: () => void;
  refreshWorkspaces: () => Promise<void>;
  // Llamado desde AuthContext cuando el staff login completa con éxito.
  // Actualiza el stage interno para que el gate re-renderice la app.
  onStaffLogin: () => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<TokenStage>(() => getTokenStage());
  const [cuenta, setCuenta] = useState<CuentaInfo | null>(() => readJSON<CuentaInfo>(CUENTA_KEY));
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(() => readJSON<WorkspaceInfo>(WORKSPACE_KEY));
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>(() => readJSON<WorkspaceInfo[]>(WORKSPACES_KEY) || []);
  const [loading, setLoading] = useState<boolean>(() => getTokenStage() !== 'none');

  const applySession = (token: string, cuenta?: CuentaInfo | null, workspaces?: WorkspaceInfo[] | null, workspace?: WorkspaceInfo | null) => {
    setToken(token);
    if (cuenta !== undefined) {
      setCuenta(cuenta);
      writeJSON(CUENTA_KEY, cuenta);
    }
    if (workspaces !== undefined) {
      setWorkspaces(workspaces || []);
      writeJSON(WORKSPACES_KEY, workspaces || []);
    }
    if (workspace !== undefined) {
      setWorkspace(workspace);
      writeJSON(WORKSPACE_KEY, workspace);
    }
    setStage(getTokenStage());
  };

  // ── Validación de token al boot ─────────────────────────────────────────
  // Si hay token guardado, re-fetcheamos la cuenta para asegurar que sigue
  // siendo válido. Si falla, reseteamos todo.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // Refrescar cuenta + workspaces si podemos
    (async () => {
      try {
        const me = await api.cuentaMe();
        setCuenta(me);
        writeJSON(CUENTA_KEY, me);
        const list = await api.listWorkspaces();
        setWorkspaces(list);
        writeJSON(WORKSPACES_KEY, list);
        const currentDecoded = decodeToken();
        if (currentDecoded?.organizacionId) {
          const ws = list.find(w => w.id === currentDecoded.organizacionId);
          if (ws) {
            setWorkspace(ws);
            writeJSON(WORKSPACE_KEY, ws);
          }
        }
        setStage(getTokenStage());
      } catch {
        // Token inválido → limpiar todo
        setToken(null);
        setCuenta(null);
        setWorkspace(null);
        setWorkspaces([]);
        writeJSON(CUENTA_KEY, null);
        writeJSON(WORKSPACE_KEY, null);
        writeJSON(WORKSPACES_KEY, null);
        setStage('none');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Listener global de 401 → logout ─────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setCuenta(null);
      setWorkspace(null);
      setWorkspaces([]);
      writeJSON(CUENTA_KEY, null);
      writeJSON(WORKSPACE_KEY, null);
      writeJSON(WORKSPACES_KEY, null);
      setStage('none');
    };
    window.addEventListener(AUTH_ERROR_EVENT, handler);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, handler);
  }, []);

  // ── Acciones ────────────────────────────────────────────────────────────
  const signup = useCallback(async (email: string, password: string, nombre: string, orgNombre?: string) => {
    const res = await api.cuentaSignup({ email, password, nombre, orgNombre });
    applySession(res.token, res.cuenta, res.workspaces, null);
    // Auto-seleccionar el primer workspace si es el único (flujo típico de signup)
    if (res.workspaces.length === 1) {
      const sel = await api.switchWorkspace(res.workspaces[0].id);
      applySession(sel.token, undefined, undefined, sel.workspace);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.cuentaLogin(email, password);
    applySession(res.token, res.cuenta, res.workspaces, null);
    // Si solo tiene un workspace, saltear el selector
    if (res.workspaces.length === 1) {
      const sel = await api.switchWorkspace(res.workspaces[0].id);
      applySession(sel.token, undefined, undefined, sel.workspace);
    }
  }, []);

  const selectWorkspace = useCallback(async (organizacionId: number) => {
    const sel = await api.switchWorkspace(organizacionId);
    applySession(sel.token, undefined, undefined, sel.workspace);
  }, []);

  const createWorkspace = useCallback(async (nombre: string, templateId?: string) => {
    // El backend acepta templateId opcional. Si el user eligió un rubro, el
    // workspace queda precargado con depósitos + productos del template.
    const ws = await api.createWorkspace(nombre, templateId);
    const nextList = [...workspaces, ws];
    setWorkspaces(nextList);
    writeJSON(WORKSPACES_KEY, nextList);
    return ws;
  }, [workspaces]);

  // "Volver al selector de workspaces" — baja el token a stage 1 sin pedir
  // password. Usa POST /api/cuenta/to-stage-1 del backend, que reinyecta un
  // token stage 1 basado en cuentaId+email del JWT actual. El gate re-pinta
  // el selector con la lista fresca de workspaces.
  const backToWorkspaces = useCallback(async () => {
    try {
      const res = await api.downgradeToStage1();
      applySession(res.token, res.cuenta, res.workspaces, null);
      // Limpiar también el user staff persistido del AuthContext — si no,
      // al volver a stage 2 y re-elegir un workspace el viejo user staff
      // aparece residual hasta el próximo login.
      localStorage.removeItem('user');
    } catch (e) {
      // Fallback: si el endpoint falla, hacemos el logout defensivo
      setToken(null);
      setCuenta(null);
      setWorkspace(null);
      setWorkspaces([]);
      writeJSON(CUENTA_KEY, null);
      writeJSON(WORKSPACE_KEY, null);
      writeJSON(WORKSPACES_KEY, null);
      setStage('none');
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setCuenta(null);
    setWorkspace(null);
    setWorkspaces([]);
    writeJSON(CUENTA_KEY, null);
    writeJSON(WORKSPACE_KEY, null);
    writeJSON(WORKSPACES_KEY, null);
    setStage('none');
    // Disparar el evento global también por si algo más está listenando
    window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await api.listWorkspaces();
      setWorkspaces(list);
      writeJSON(WORKSPACES_KEY, list);
    } catch {}
  }, []);

  const onStaffLogin = useCallback(() => {
    setStage(getTokenStage());
  }, []);

  return (
    <SessionContext.Provider
      value={{
        stage,
        cuenta,
        workspace,
        workspaces,
        loading,
        signup,
        login,
        selectWorkspace,
        createWorkspace,
        backToWorkspaces,
        logout,
        refreshWorkspaces,
        onStaffLogin,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}
