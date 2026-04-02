import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowRightLeft,
  ClipboardList, LogOut, Menu, X, ChefHat, Truck, ClipboardCheck,
  Upload, BarChart3, Link2, ShoppingCart, ScanBarcode, AlertTriangle, ScanLine
} from 'lucide-react';
import { useState } from 'react';

// permiso: clave requerida para ver el item (undefined = visible para todos)
// adminOnly: solo admin, sin excepción
const navItems: { to: string; label: string; icon: any; permiso?: string; adminOnly?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ordenes-compra', label: 'Órdenes', icon: ShoppingCart, permiso: 'ordenes-compra' },
  { to: '/control-scanner', label: 'Control', icon: ScanBarcode, permiso: 'control-scanner' },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowRightLeft, permiso: 'movimientos' },
  { to: '/stock', label: 'Stock', icon: ClipboardList, permiso: 'stock' },
  { to: '/productos', label: 'Maestro', icon: Package, permiso: 'productos' },
  { to: '/depositos', label: 'Depósitos', icon: Warehouse, permiso: 'depositos' },
  { to: '/recetas', label: 'Recetas', icon: ChefHat, permiso: 'recetas' },
  { to: '/proveedores', label: 'Proveedores', icon: Truck, permiso: 'proveedores' },
  { to: '/inventarios', label: 'Inventarios', icon: ClipboardCheck, permiso: 'inventarios' },
  { to: '/discrepancias', label: 'Discrepancias', icon: AlertTriangle, permiso: 'discrepancias' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, permiso: 'reportes' },
  { to: '/escanear-factura', label: 'Escanear Factura', icon: ScanLine, permiso: 'importar' },
  { to: '/importar', label: 'Importar', icon: Upload, permiso: 'importar' },
  { to: '/vincular', label: 'Vincular', icon: Link2, permiso: 'vincular' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
];

export default function Sidebar() {
  const { user, logout, tienePermiso } = useAuth();
  const [open, setOpen] = useState(false);

  const filteredItems = navItems.filter(item => {
    if (item.adminOnly) return user?.rol === 'admin';
    if (!item.permiso) return true; // Dashboard: visible para todos
    return tienePermiso(item.permiso);
  });

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
      isActive
        ? 'text-primary bg-primary/10'
        : 'text-on-surface-variant hover:text-foreground hover:bg-surface-high'
    }`;

  const nav = (
    <>
      <div className="p-5 mb-4">
        <div className="text-lg font-extrabold tracking-tight text-foreground">OPS<span className="text-primary">TERMINAL</span></div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em] mt-1">
          Stock Gastro
        </p>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {filteredItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={linkClass}
            onClick={() => setOpen(false)}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border mt-auto">
        <div className="px-4 py-3">
          <p className="text-xs font-bold text-foreground">{user?.nombre}</p>
          <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest">{user?.rol}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 p-2.5 rounded-lg bg-surface border border-border lg:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={18} className="text-foreground" /> : <Menu size={18} className="text-foreground" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-surface border-r border-white/5 flex flex-col transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
