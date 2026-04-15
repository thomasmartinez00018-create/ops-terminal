import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import Button from '../components/ui/Button';

// ============================================================================
// CuentaLogin — pantalla stage 1 (owner / admin de la cuenta)
// ============================================================================
// Primer paso del login multi-tenant. Email + password del owner de la
// cuenta. No es el login del staff operativo (código + PIN), ese viene
// después de elegir workspace.
// ============================================================================
export default function CuentaLogin({ onSwitchToSignup }: { onSwitchToSignup: () => void }) {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-lg font-extrabold tracking-tight text-foreground">
            OPS<span className="text-primary">TERMINAL</span>
          </div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em] mt-1">
            Ingresá a tu cuenta
          </p>
          <p className="text-xs text-on-surface-variant mt-3 font-semibold">
            Email y contraseña de tu cuenta owner
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              placeholder="tu@email.com"
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-xs text-destructive text-center font-semibold">{error}</p>
          )}

          <Button type="submit" disabled={busy || !email || !password} className="w-full" size="lg">
            {busy ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border text-center space-y-2">
          <p className="text-xs text-on-surface-variant">
            ¿No tenés cuenta?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-primary font-bold hover:underline"
            >
              Registrate
            </button>
          </p>
          <p className="text-[11px] text-on-surface-variant/80">
            ¿Sos empleado?{' '}
            <a
              href="/vincular-dispositivo"
              className="text-primary font-bold hover:underline"
            >
              Vinculá tu dispositivo con un código
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
