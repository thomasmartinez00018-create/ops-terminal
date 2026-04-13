import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ShoppingCart, ScanBarcode, ArrowRightLeft,
  ClipboardList, Grid3X3
} from 'lucide-react';
import MoreSheet from './MoreSheet';

// Tabs por rol — máximo 3, el 4to siempre es "Más"
const TABS_POR_ROL: Record<string, { to: string; label: string; icon: any }[]> = {
  admin: [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/stock', label: 'Stock', icon: ClipboardList },
    { to: '/movimientos', label: 'Mov.', icon: ArrowRightLeft },
  ],
  compras: [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/ordenes-compra', label: 'Órdenes', icon: ShoppingCart },
    { to: '/stock', label: 'Stock', icon: ClipboardList },
  ],
  deposito: [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/ordenes-compra', label: 'Recibir', icon: ShoppingCart },
    { to: '/control-scanner', label: 'Scanner', icon: ScanBarcode },
  ],
  cocina: [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/movimientos', label: 'Registrar', icon: ArrowRightLeft },
    { to: '/stock', label: 'Stock', icon: ClipboardList },
  ],
  barra: [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/movimientos', label: 'Registrar', icon: ArrowRightLeft },
    { to: '/stock', label: 'Stock', icon: ClipboardList },
  ],
};

export default function BottomNav() {
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const tabs = TABS_POR_ROL[user.rol] || TABS_POR_ROL['admin'];

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border/60 backdrop-blur-sm">
        <div className="flex items-stretch">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-on-surface-variant'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon size={20} className={isActive ? 'text-primary' : 'text-on-surface-variant'} />
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}

          {/* "Más" tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              moreOpen ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <Grid3X3 size={20} />
            Más
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
