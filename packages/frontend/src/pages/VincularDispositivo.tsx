import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, getTokenStage } from '../lib/api';
import { useSession } from '../context/SessionContext';
import Button from '../components/ui/Button';
import { Smartphone, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

// ============================================================================
// VincularDispositivo — pantalla pública (stage none)
// ============================================================================
// El empleado abre la app en su propio celular, tap "Vincular dispositivo",
// ingresa el código de 6 dígitos que le dictó el admin y queda bindeado al
// workspace con un token stage 2 (pairedDevice:true). De ahí, el SessionGate
// lo manda directo al selector de usuarios staff (stage 2 → 3 con su PIN).
//
// Diseño:
//   - 6 inputs tipo OTP que auto-avanzan al siguiente dígito
//   - Paste inteligente: si el user pega "123456", rellena los 6
//   - Back/delete se come el anterior
//   - Loading + feedback inline de éxito/error
// ============================================================================
export default function VincularDispositivo() {
  const navigate = useNavigate();
  // Truco: usamos onStaffLogin (setStage) para que el gate re-renderice
  // apenas el canje actualiza el token en localStorage. El nombre no es
  // del todo semántico pero el efecto es el correcto — recalcula el stage.
  const { onStaffLogin } = useSession();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const codigo = useMemo(() => digits.join(''), [digits]);
  const isComplete = codigo.length === 6 && /^\d{6}$/.test(codigo);

  // Auto-focus primer input al montar
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // Auto-submit cuando los 6 dígitos están completos
  useEffect(() => {
    if (isComplete && !busy && !success) {
      handleRedeem();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 1);
    setDigits(prev => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    setError('');
    if (clean && i < 5) {
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
      setDigits(prev => {
        const next = [...prev];
        next[i - 1] = '';
        return next;
      });
    }
    if (e.key === 'ArrowLeft' && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    const focusIdx = Math.min(text.length, 5);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleRedeem = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.pairRedeem(codigo);
      // Guardar token stage 2 + actualizar stage del SessionContext
      setToken(res.token);
      setSuccess(true);
      // Pequeño delay para que el check verde sea visible antes del redirect
      setTimeout(() => {
        onStaffLogin(); // recalcula stage a 'org'
        // getTokenStage() ahora devuelve 'org' → SessionGate mostrará <Login>
        if (getTokenStage() !== 'org') {
          // Fallback: recarga full page si algo raro pasó
          window.location.reload();
        }
      }, 600);
    } catch (err: any) {
      setError(err?.message || 'Código inválido');
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background flex items-center justify-center p-4">
      {/* Fondo: gradiente sutil + grid de puntos */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(212,175,55,0.6) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="text-xs text-on-surface-variant hover:text-foreground font-semibold uppercase tracking-wider mb-6 inline-flex items-center gap-1.5"
        >
          ← Volver
        </button>

        <div className="glass rounded-2xl p-8 relative">
          {/* Icon header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl" />
              <div className="relative w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Link2 className="w-7 h-7 text-primary" />
              </div>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Vincular dispositivo
            </h1>
            <p className="text-xs text-on-surface-variant font-semibold mt-2 leading-relaxed max-w-xs">
              Pedile al administrador del local que genere un código de 6 dígitos desde su dispositivo
            </p>
          </div>

          {/* OTP inputs */}
          <div className="mb-5">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.15em] block mb-3 text-center">
              Código de vinculación
            </label>
            <div className="flex items-center justify-center gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputsRef.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  value={d}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  disabled={busy || success}
                  className={`
                    w-11 h-14 rounded-xl text-center text-xl font-extrabold font-mono-alt
                    bg-surface-high border transition-all
                    ${error ? 'border-destructive text-destructive' :
                      success ? 'border-success text-success' :
                      d ? 'border-primary/60 text-foreground' :
                      'border-border text-foreground'}
                    focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                    disabled:opacity-70
                  `}
                />
              ))}
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 mb-4">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive font-semibold">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-success/10 border border-success/30 mb-4">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <p className="text-xs text-success font-semibold">
                Dispositivo vinculado. Llevándote al login de empleados...
              </p>
            </div>
          )}

          {busy && !success && (
            <p className="text-xs text-on-surface-variant text-center font-semibold mb-4">
              Validando código...
            </p>
          )}

          {/* Manual submit (fallback — normalmente auto-submit) */}
          <Button
            onClick={handleRedeem}
            disabled={!isComplete || busy || success}
            className="w-full"
            size="lg"
          >
            {busy ? 'Validando...' : success ? '¡Listo!' : 'Vincular'}
          </Button>

          {/* Help text */}
          <div className="mt-6 pt-4 border-t border-border/50">
            <div className="flex items-start gap-2.5 text-[11px] text-on-surface-variant leading-relaxed">
              <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/70" />
              <p>
                El código expira en 10 minutos y solo se puede usar una vez.
                Tu dispositivo quedará vinculado al local — el dueño podrá
                revocar el acceso desde el panel de usuarios.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
