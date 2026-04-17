import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

// ============================================================================
// HelpHint — ayuda contextual mínima para pantallas complejas
// ----------------------------------------------------------------------------
// Botón (?) chiquito, al tap abre un popover con 2-4 bullets en lenguaje
// humano. Pensado para el que abre una pantalla por primera vez y no sabe
// por dónde empezar — sin ensuciar la UI del usuario experto.
//
// No es un tour completo: solo 3-4 líneas de "qué hago acá" con los pasos
// prácticos. Mobile-first: overlay que cubre pantalla al tap (para que no
// quede tapado por otros elementos).
// ============================================================================

interface HelpHintProps {
  title?: string;
  bullets: string[];
  className?: string;
}

export default function HelpHint({ title = '¿Cómo se usa esto?', bullets, className = '' }: HelpHintProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 text-primary transition-colors ${className}`}
        aria-label="Ayuda"
        title="Ver cómo usar esta pantalla"
      >
        <HelpCircle size={14} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface border border-primary/30 rounded-2xl p-5 max-w-md w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <HelpCircle size={17} className="text-primary" />
                </div>
                <h3 className="text-base font-extrabold text-foreground">{title}</h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-high text-on-surface-variant"
              >
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-2.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground leading-snug">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[10px] font-extrabold text-primary shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setOpen(false)}
              className="w-full mt-4 py-2.5 rounded-lg bg-primary text-background font-bold text-sm active:scale-95 transition-transform"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
