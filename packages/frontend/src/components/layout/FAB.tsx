import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { puedeRegistrarMovimiento } from '../../lib/permisosMovimiento';
import {
  Plus, X, ArrowRightLeft, ShoppingCart, ScanLine, FlaskConical,
  ScanBarcode, Trash2
} from 'lucide-react';

interface FABAction {
  label: string;
  icon: any;
  to?: string;
  action?: string;             // 'quick-mov' | 'quick-mov-merma'
  requierePermisoMov?: string; // tipo de movimiento requerido (p.ej. "merma")
}

const ACTIONS_POR_ROL: Record<string, FABAction[]> = {
  admin: [
    { label: 'Movimiento', icon: ArrowRightLeft, action: 'quick-mov' },
    { label: 'Orden de compra', icon: ShoppingCart, to: '/ordenes-compra' },
    { label: 'Escanear factura', icon: ScanLine, to: '/escanear-factura' },
  ],
  compras: [
    { label: 'Orden de compra', icon: ShoppingCart, to: '/ordenes-compra' },
    { label: 'Escanear factura', icon: ScanLine, to: '/escanear-factura' },
    { label: 'Comparador', icon: ArrowRightLeft, to: '/comparador' },
  ],
  deposito: [
    { label: 'Movimiento', icon: ArrowRightLeft, action: 'quick-mov' },
    { label: 'Scanner', icon: ScanBarcode, to: '/control-scanner' },
    { label: 'Recibir', icon: ShoppingCart, to: '/ordenes-compra' },
  ],
  cocina: [
    { label: 'Registrar uso', icon: ArrowRightLeft, action: 'quick-mov' },
    { label: 'Elaborar', icon: FlaskConical, to: '/elaboraciones' },
    { label: 'Merma', icon: Trash2, action: 'quick-mov-merma', requierePermisoMov: 'merma' },
  ],
  barra: [
    { label: 'Registrar uso', icon: ArrowRightLeft, action: 'quick-mov' },
    { label: 'Merma', icon: Trash2, action: 'quick-mov-merma', requierePermisoMov: 'merma' },
  ],
};

interface Props {
  onQuickMov: (tipo?: string) => void;
}

export default function FAB({ onQuickMov }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);

  // Close on route change
  useEffect(() => { setExpanded(false); }, [location.pathname]);

  if (!user) return null;

  // Filtrar acciones: si la acción es un tipo de movimiento específico,
  // verificar que el usuario tenga permiso para ese tipo. Las acciones
  // generales (navegación, quick-mov genérico) pasan sin check.
  const actions = (ACTIONS_POR_ROL[user.rol] || ACTIONS_POR_ROL['admin'])
    .filter((a: FABAction) =>
      !a.requierePermisoMov || puedeRegistrarMovimiento(user as any, a.requierePermisoMov as any)
    );

  const handleAction = (action: FABAction) => {
    setExpanded(false);
    if (action.to) {
      navigate(action.to);
    } else if (action.action === 'quick-mov') {
      onQuickMov();
    } else if (action.action === 'quick-mov-merma') {
      onQuickMov('merma');
    }
  };

  return (
    <div className="lg:hidden fixed right-4 bottom-20 z-50">
      {/* Action items */}
      {expanded && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 -z-10" onClick={() => setExpanded(false)} />

          {/* Actions */}
          <div className="absolute bottom-16 right-0 flex flex-col-reverse gap-2 mb-2"
            style={{ animation: 'fadeInUp 0.15s ease-out' }}>
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleAction(action)}
                className="flex items-center gap-2.5 pl-3 pr-4 py-2.5 bg-surface border border-border rounded-full shadow-lg whitespace-nowrap"
                style={{ animation: `fadeInUp ${0.05 * (actions.length - idx)}s ease-out` }}
              >
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                  <action.icon size={15} className="text-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Main FAB button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
          expanded
            ? 'bg-surface-high border border-border rotate-45'
            : 'bg-primary text-background'
        }`}
        style={!expanded ? { boxShadow: '0 4px 20px rgba(212, 175, 55, 0.3)' } : undefined}
      >
        {expanded
          ? <X size={22} className="text-foreground -rotate-45" />
          : <Plus size={24} strokeWidth={2.5} />
        }
      </button>
    </div>
  );
}
