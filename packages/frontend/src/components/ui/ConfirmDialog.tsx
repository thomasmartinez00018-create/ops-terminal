import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Check } from 'lucide-react';

// ============================================================================
// ConfirmDialog — reemplazo del window.confirm() nativo
// ----------------------------------------------------------------------------
// Por qué existe: `window.confirm('...')` es horrible para nuestros usuarios.
// Muestra un diálogo nativo del navegador que:
//   - No respeta el theme (fondo blanco sobre fondo dark → ciega al usuario)
//   - Tiene botones chicos, no táctiles, OK a la derecha pero según OS
//   - No permite formatear el mensaje: un párrafo largo se corta o se ve
//     feo. Hoy pasa en Reposicion.tsx que mete 3 líneas en un confirm.
//   - En iPhone con la app embebida se ve distinto según la versión de iOS.
//
// Este componente:
//   - Usa nuestro design system (dark, gold, Manrope)
//   - Botones grandes tocables con el pulgar (44px+)
//   - Variant 'danger' para deletes — botón rojo + icono de advertencia
//   - Permite pasar `detalle` como prop para listar qué se va a perder
//     (ej: "Esto va a eliminar 3 recepciones asociadas")
//   - Focus automático en el botón de acción para que Enter confirme
//   - Esc cancela
//
// Uso tipo 1 — controlado (modal como componente):
//   <ConfirmDialog
//     open={confirmOpen} onClose={() => setConfirmOpen(false)}
//     title="¿Eliminar el producto?"
//     detalle="Esto lo saca del catálogo. Las recetas que lo usan van a dar error."
//     variant="danger" confirmLabel="Eliminar"
//     onConfirm={async () => { await api.deleteProducto(id); setConfirmOpen(false); }}
//   />
//
// Uso tipo 2 — imperativo vía hook (reemplazo directo de window.confirm):
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '¿Eliminar?', variant: 'danger' });
//   if (ok) { ... }
// ============================================================================

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;

  /** Pregunta corta y clara en la primera línea — ej: "¿Eliminar el producto?" */
  title: string;
  /** Detalle opcional — una o dos líneas explicando el impacto real */
  detalle?: ReactNode;

  /** Texto del botón de acción (default: "Sí, continuar") */
  confirmLabel?: string;
  /** Texto del botón de cancelar (default: "Cancelar") */
  cancelLabel?: string;

  /** 'danger' = rojo + icono de trash, 'warning' = ámbar, 'default' = primario gold */
  variant?: 'default' | 'danger' | 'warning';

  /** Mostrar loading en el botón mientras onConfirm corre. Default: true */
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  detalle,
  confirmLabel = 'Sí, continuar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading: externalLoading,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Loading interno por si el caller pasa un onConfirm async y no maneja estado
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = externalLoading ?? internalLoading;

  // Focus primario al abrir (Enter confirma, Esc cancela)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => confirmRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, loading]);

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  // Estilos por variant
  const iconMap = {
    default: <Check size={22} className="text-primary" />,
    danger: <Trash2 size={22} className="text-destructive" />,
    warning: <AlertTriangle size={22} className="text-amber-500" />,
  };
  const ringMap = {
    default: 'bg-primary/10',
    danger: 'bg-destructive/10',
    warning: 'bg-amber-500/10',
  };
  const btnMap = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80',
    warning: 'bg-amber-500 text-amber-950 hover:bg-amber-500/90 active:bg-amber-500/80',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-5 sm:p-6 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${ringMap[variant]}`}>
            {iconMap[variant]}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="font-extrabold text-foreground text-base sm:text-lg leading-tight">{title}</h2>
            {detalle && (
              <div className="mt-1.5 text-sm text-on-surface-variant leading-relaxed">
                {detalle}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl bg-surface-high text-foreground text-sm font-bold border border-border/40 active:scale-[0.98] disabled:opacity-50 transition-transform"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-extrabold active:scale-[0.98] disabled:opacity-70 transition-transform ${btnMap[variant]}`}
          >
            {loading ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// useConfirm() — hook imperativo estilo `window.confirm()`
// ─────────────────────────────────────────────────────────────────────────────
// Para refactorizar rápido el código que hoy hace `if (!confirm('...')) return;`
// sin tener que convertir la página a modal controlado. El hook registra un
// único ConfirmDialog por componente y devuelve una función que abre y
// resuelve una promesa con true/false.
//
// Uso:
//   const { confirm, dialogProps } = useConfirm();
//   ...
//   const ok = await confirm({ title: '¿Eliminar?', variant: 'danger' });
//   if (!ok) return;
//   ...
//   // Y al final del JSX:
//   <ConfirmDialog {...dialogProps} />
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmOptions extends Omit<ConfirmDialogProps, 'open' | 'onClose' | 'onConfirm'> {}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    opts: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    opts: { title: '' },
    resolve: null,
  });

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, opts, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState(s => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const handleClose = useCallback(() => {
    state.resolve?.(false);
    setState(s => ({ ...s, open: false, resolve: null }));
  }, [state]);

  const dialogProps: ConfirmDialogProps = {
    ...state.opts,
    open: state.open,
    onClose: handleClose,
    onConfirm: handleConfirm,
  };

  return { confirm, dialogProps };
}
