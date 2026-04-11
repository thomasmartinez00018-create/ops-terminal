import { useState } from 'react';
import { useSession } from '../context/SessionContext';
import Button from '../components/ui/Button';

// ============================================================================
// Signup — crear una nueva cuenta + workspace
// ============================================================================
// Primer signup del sistema "adopta" la org existente (Más Orgánicos) —
// esto lo maneja el backend automáticamente revisando si hay miembros.
// Signups siguientes crean un workspace nuevo con trial de 14 días.
// ============================================================================
export default function Signup({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { signup } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nombre, setNombre] = useState('');
  const [orgNombre, setOrgNombre] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== password2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setBusy(true);
    try {
      await signup(email.trim(), password, nombre.trim(), orgNombre.trim() || undefined);
    } catch (err: any) {
      setError(err?.message || 'Error al crear la cuenta');
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
            Crear cuenta
          </p>
          <p className="text-xs text-on-surface-variant mt-3 font-semibold">
            Vas a administrar uno o más restaurantes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Tu nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              autoComplete="email"
              required
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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Repetir contraseña
            </label>
            <input
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Nombre del workspace <span className="text-on-surface-variant/60 normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={orgNombre}
              onChange={e => setOrgNombre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border border-border text-foreground text-sm focus:outline-none focus:border-primary"
              placeholder="Ej: Mi Restaurante"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive text-center font-semibold">{error}</p>
          )}

          <Button type="submit" disabled={busy} className="w-full" size="lg">
            {busy ? 'Creando cuenta...' : 'Crear cuenta'}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-xs text-on-surface-variant">
            ¿Ya tenés cuenta?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-primary font-bold hover:underline"
            >
              Iniciar sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
