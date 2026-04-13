import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft } from 'lucide-react';
import { useIsDesktop } from '../../hooks/useMediaQuery';

interface DrawerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_MAP: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function DrawerModal({ open, onClose, title, children, size = 'md' }: DrawerModalProps) {
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  // Desktop: standard modal (same as Modal.tsx)
  if (isDesktop) {
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

  // Mobile: fullscreen drawer
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      style={{ animation: 'slideUp 0.2s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center h-12 px-3 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="p-2 -ml-1 rounded-lg hover:bg-surface-high transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h2 className="flex-1 text-sm font-bold text-foreground text-center pr-8 truncate">{title}</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>,
    document.body,
  );
}
