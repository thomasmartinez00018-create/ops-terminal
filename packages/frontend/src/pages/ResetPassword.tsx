import { useState, useMemo } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';

// ============================================================================
// ResetPassword — consume el token y deja elegir password nueva
// ============================================================================
// El token viene en ?token=... del query string. Validación cliente mínima:
// 8-128 chars y matchea con confirmación. El backend hace el resto.
// ============================================================================
export default function ResetPassword() {
  const token = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('token') || '';
  }, []);

  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (p1.length < 8) return setError('La contraseña debe tener al menos 8 caracteres');
    if (p1 !== p2) return setError('Las contraseñas no coinciden');

    setBusy(true);
    try {
      await api.resetPassword(token, p1);
      // Limpiar cualquier sesión previa del browser. Si el usuario abrió el
      // link mientras estaba logueado con OTRA cuenta, no debe quedar como
      // esa cuenta — debe re-loguearse con la cuenta cuya password reseteó.
      try {
        localStorage.removeItem('ops_token');
        sessionStorage.clear();
      } catch {}
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Error al resetear contraseña');
    } finally {
      setBusy(false);
    }
  };

  // Token ausente o malformado — no tiene sentido mostrar el form
  if (!token || token.length < 32) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="glass rounded-2xl p-6 w-full max-w-sm text-center">
          <p className="text-sm text-destructive font-semibold mb-3">Link inválido</p>
          <p className="text-xs text-on-surface-variant mb-4">
            Este link no tiene un token válido. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".
          </p>
          <a
            href="/forgot-password"
            className="text-xs text-primary font-bold hover:underline"
          >
            Pedir nuevo link
          </a>
        </div>
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
            Elegí nueva contraseña
          </p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-center">
              <p className="text-sm text-foreground font-semibold">Contraseña actualizada</p>
              <p className="text-xs text-on-surface-variant mt-2">
                Ya podés ingresar con tu nueva contraseña.
              </p>
            </div>
            <button
              onClick={() => { window.location.href = '/login'; }}
              className="block w-full text-center bg-primary text-primary-foreground py-2.5 rounded-lg font-bold text-sm hover:opacity-90"
            >
              Ir al login
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={p1}
                onChange={e => setP1(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                Repetir contraseña
              </label>
              <input
                type="password"
                value={p2}
                onChange={e => setP2(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                placeholder="Repetí la nueva contraseña"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
            </div>

            {error && (
              <p className="text-xs text-destructive text-center font-semibold">{error}</p>
            )}

            <Button type="submit" disabled={busy || !p1 || !p2} className="w-full" size="lg">
              {busy ? 'Guardando...' : 'Cambiar contraseña'}
            </Button>

            <div className="text-center pt-2">
              <a
                href="/login"
                className="text-[11px] text-on-surface-variant hover:text-primary hover:underline"
              >
                Cancelar
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
