import { useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';

// ============================================================================
// ForgotPassword — pide email para mandar el link de recuperación
// ============================================================================
// El backend SIEMPRE responde 200 OK (no leakea si el email existe).
// Mensaje genérico al usuario: "si existe te llega el mail".
// En NON-prod sin RESEND_API_KEY el backend devuelve devLink → lo mostramos
// para que el admin lo pueda mandar manual.
// ============================================================================
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.forgotPassword(email.trim());
      setSent(true);
      if (r.devLink) setDevLink(r.devLink);
    } catch (err: any) {
      setError(err?.message || 'Error al pedir recuperación');
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
            Recuperar contraseña
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
              <p className="text-sm text-foreground font-semibold">Listo.</p>
              <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                Si hay una cuenta con ese email, te mandamos un link para elegir una nueva contraseña.
                Vence en <strong className="text-foreground">1 hora</strong>. Revisá también la carpeta de spam.
              </p>
            </div>

            {devLink && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Modo dev (sin email configurado)
                </p>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Copiá este link y abrilo manualmente:
                </p>
                <a
                  href={devLink}
                  className="block mt-2 text-[11px] text-primary break-all font-mono hover:underline"
                >
                  {devLink}
                </a>
              </div>
            )}

            <a
              href="/login"
              className="block text-center text-xs text-primary font-bold hover:underline"
            >
              ← Volver al login
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-on-surface-variant text-center mb-4">
              Ingresá el email de tu cuenta y te mandamos un link para elegir una contraseña nueva.
            </p>

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

            {error && (
              <p className="text-xs text-destructive text-center font-semibold">{error}</p>
            )}

            <Button type="submit" disabled={busy || !email} className="w-full" size="lg">
              {busy ? 'Enviando...' : 'Mandarme el link'}
            </Button>

            <div className="text-center pt-2">
              <a
                href="/login"
                className="text-[11px] text-on-surface-variant hover:text-primary hover:underline"
              >
                ← Volver al login
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
