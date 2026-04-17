import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle, XCircle, Info, X, Undo2 } from 'lucide-react';

// ============================================================================
// ToastContext — feedback visual para el cocinero/depósito con manos ocupadas
// ----------------------------------------------------------------------------
// Diseño pensado para cocina: los toasts tienen que ser GRANDES (legibles de
// lejos, de reojo), visibles lo suficiente (3.5-5s según tipo) y tocables
// fácilmente. Soporta "acción" opcional → para implementar "Deshacer" después
// de registrar un movimiento o completar una tarea (5 seg para arrepentirse).
//
// API retrocompatible:
//   addToast('Registrado');                         // success por default
//   addToast('Error', 'error');                     // shorthand legacy
//   addToast('Registrado', { action: { label: 'Deshacer', onClick: undo } });
// ============================================================================

type ToastType = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type?: ToastType;
  action?: ToastAction;
  duration?: number;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextType {
  /** Versión compat: `addToast(msg)` o `addToast(msg, 'error')`.
   *  Versión nueva: `addToast(msg, { type, action, duration })`. */
  addToast: (message: string, typeOrOpts?: ToastType | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, typeOrOpts?: ToastType | ToastOptions) => {
    // Normalizar overload
    const opts: ToastOptions = typeof typeOrOpts === 'string'
      ? { type: typeOrOpts }
      : (typeOrOpts || {});
    const type = opts.type || 'success';
    // Duraciones por default: los errores duran más porque el usuario
    // necesita tiempo para leer. Si hay acción "Deshacer", damos 6s para
    // arrepentirse — el Undo de Gmail usa 5-10s.
    const duration = opts.duration ?? (
      opts.action ? 6000
      : type === 'error' ? 5000
      : 3500
    );

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, message, type, action: opts.action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons = {
    success: <CheckCircle size={20} className="text-success shrink-0" strokeWidth={2.5} />,
    error: <XCircle size={20} className="text-destructive shrink-0" strokeWidth={2.5} />,
    info: <Info size={20} className="text-primary shrink-0" strokeWidth={2.5} />,
  };

  const styles = {
    success: 'border-success/40 bg-success/15',
    error: 'border-destructive/40 bg-destructive/15',
    info: 'border-primary/40 bg-primary/15',
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Container — en mobile ocupa casi todo el ancho (para que el texto
          grande entre bien); en desktop se queda a la derecha como antes.
          bottom-24 en mobile para no chocar con el BottomNav y el FAB. */}
      <div className="fixed inset-x-3 bottom-24 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-md z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 shadow-xl backdrop-blur-md pointer-events-auto
              animate-in slide-in-from-bottom-4 fade-in duration-200
              ${styles[toast.type]}`}
          >
            {icons[toast.type]}
            <p className="text-sm sm:text-base font-bold text-foreground flex-1 leading-snug">
              {toast.message}
            </p>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); remove(toast.id); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-background/40 hover:bg-background/60 active:bg-background/80 text-xs font-extrabold text-foreground border border-border/40 transition-colors"
              >
                <Undo2 size={13} />
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => remove(toast.id)}
              className="text-on-surface-variant hover:text-foreground ml-1 p-1"
              title="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
