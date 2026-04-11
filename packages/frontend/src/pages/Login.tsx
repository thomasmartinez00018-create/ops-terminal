import { useState, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { api, setToken } from '../lib/api';
import Button from '../components/ui/Button';

export default function Login() {
  // Nota: este componente corre en stage 2 (workspace elegido, staff no
  // logueado todavía). Usa SessionContext para flipear al stage 3 una vez
  // que el staff login tenga éxito. AuthContext se monta después,
  // consumiendo el user desde localStorage y refrescando vía /api/auth/me.
  const { onStaffLogin, workspace, backToWorkspaces, logout: cuentaLogout, cuenta, workspaces } = useSession();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUsuariosLogin()
      .then(setUsuarios)
      .catch(() => setError('No se pudo conectar al servidor'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async () => {
    if (!selected) return;
    setError('');
    try {
      const res = await api.login(selected.codigo, pin);
      // Stage 3 token + persistencia local del staff user. AuthProvider lo
      // leerá de localStorage al montar y luego refrescará con /api/auth/me.
      setToken(res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      onStaffLogin();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handlePinKey = (digit: string) => {
    if (digit === 'del') {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 4) {
      setPin(p => p + digit);
    }
  };

  // Keyboard support
  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinKey(e.key);
      else if (e.key === 'Backspace') handlePinKey('del');
      else if (e.key === 'Enter' && pin.length === 4) handleLogin();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, pin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-on-surface-variant font-semibold">Conectando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-lg font-extrabold tracking-tight text-foreground">
            OPS<span className="text-primary">TERMINAL</span>
          </div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em] mt-1">
            Stock Gastro
          </p>
          {workspace && (
            <div className="mt-3 px-3 py-1.5 rounded-lg bg-surface-high inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-bold text-foreground">{workspace.nombre}</span>
              {workspaces.length > 1 && (
                <button
                  onClick={backToWorkspaces}
                  className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline ml-1"
                  title="Cambiar de workspace"
                >
                  Cambiar
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-on-surface-variant mt-3 font-semibold">
            {selected ? 'Ingresá tu PIN' : 'Seleccionar usuario'}
          </p>
        </div>

        {!selected ? (
          <div className="space-y-2">
            {usuarios.map(u => (
              <button
                key={u.id}
                onClick={() => { setSelected(u); setPin(''); setError(''); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-surface-high transition-all text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {u.nombre.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{u.nombre}</p>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{u.rol}</p>
                </div>
              </button>
            ))}
            {usuarios.length === 0 && (
              <p className="text-center text-sm text-on-surface-variant py-4">
                No hay usuarios registrados
              </p>
            )}
          </div>
        ) : (
          <div>
            <button
              onClick={() => { setSelected(null); setPin(''); setError(''); }}
              className="text-xs font-bold text-primary hover:text-primary/80 mb-4 block uppercase tracking-wider"
            >
              &larr; Cambiar usuario
            </button>

            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl mx-auto mb-2">
                {selected.nombre.charAt(0)}
              </div>
              <p className="font-semibold text-foreground">{selected.nombre}</p>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{selected.rol}</p>
            </div>

            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-4">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all ${
                    pin.length > i ? 'bg-primary shadow-[0_0_8px_rgba(212,175,55,0.4)]' : 'bg-surface-high'
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-xs text-destructive text-center mb-3 font-semibold">{error}</p>
            )}

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-2 max-w-[220px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(d => (
                <button
                  key={d}
                  onClick={() => d && handlePinKey(d)}
                  disabled={!d}
                  className={`h-12 rounded-lg text-lg font-bold transition-all ${
                    d === 'del'
                      ? 'text-xs text-on-surface-variant hover:bg-surface-high uppercase tracking-wider'
                      : d
                      ? 'bg-surface-high hover:bg-border text-foreground'
                      : ''
                  }`}
                >
                  {d === 'del' ? 'Borrar' : d}
                </button>
              ))}
            </div>

            <Button
              onClick={handleLogin}
              disabled={pin.length < 4}
              className="w-full mt-4"
              size="lg"
            >
              Ingresar
            </Button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border text-center">
          {cuenta && (
            <p className="text-[10px] text-on-surface-variant mb-2">
              Sesión: <span className="font-semibold text-on-surface-variant/90">{cuenta.email}</span>
            </p>
          )}
          <button
            onClick={cuentaLogout}
            className="text-[10px] font-bold text-on-surface-variant hover:text-destructive uppercase tracking-widest"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
