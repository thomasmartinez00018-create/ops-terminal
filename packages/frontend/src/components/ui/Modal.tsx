import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const SIZE_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  // 2xl ≈ 1280px — necesario para los forms con grid 2-cols (plato-card +
  // precio-card). El xl (896px) no alcanza para el breakpoint md de Tailwind.
  '2xl': 'max-w-6xl',
};

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // IMPORTANTE: renderizamos via createPortal a document.body porque el
  // contenedor de la página (.page-enter) usa `animation: fadeInUp` con
  // `transform: translateY()`. Cualquier ancestro con transform crea un
  // nuevo containing block para position: fixed, asi que sin el portal
  // el modal se posiciona relativo al <main> y queda cortado por arriba
  // cuando su contenido es mas alto que el viewport visible del main.
  // El portal lo saca del arbol y lo pega a <body>, donde fixed vuelve a
  // ser relativo al viewport real.
  //
  // ADEMAS: flex items-start + py-[5vh] (en vez de items-center) garantiza
  // que, si el contenido del modal es mas alto que el viewport, el scroll
  // interno arranca desde el HEADER y no desde el centro, asi no se corta
  // el titulo nunca.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-[5vh]"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-surface rounded-xl shadow-2xl w-full ${SIZE_MAP[size] || 'max-w-lg'} mx-4 border border-border flex flex-col max-h-[90vh]`}
        style={{ animation: 'scaleIn 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-extrabold text-foreground uppercase tracking-widest">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
