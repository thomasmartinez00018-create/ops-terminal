import { NavLink } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowRightLeft, FlaskConical, ShoppingCart, ScanBarcode,
  ClipboardList, ClipboardCheck, AlertTriangle, BarChart3,
  Truck, Upload, Link2, FileText, DollarSign, TrendingUp,
  ScanLine, Package, Warehouse, ChefHat, Users, Settings, ListTodo, X
} from 'lucide-react';

interface SheetItem {
  to: string;
  label: string;
  icon: any;
  permiso?: string;
  adminOnly?: boolean;
}

interface SheetGroup {
  label: string;
  items: SheetItem[];
}

const GROUPS: SheetGroup[] = [
  {
    label: 'Operaciones',
    items: [
      { to: '/movimientos', label: 'Movimientos', icon: ArrowRightLeft, permiso: 'movimientos' },
      { to: '/elaboraciones', label: 'Elaborar', icon: FlaskConical, permiso: 'movimientos' },
      { to: '/ordenes-compra', label: 'Órdenes', icon: ShoppingCart, permiso: 'ordenes-compra' },
      { to: '/control-scanner', label: 'Scanner', icon: ScanBarcode, permiso: 'control-scanner' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { to: '/stock', label: 'Stock', icon: ClipboardList, permiso: 'stock' },
      { to: '/inventarios', label: 'Inventarios', icon: ClipboardCheck, permiso: 'inventarios' },
      { to: '/discrepancias', label: 'Discrepancias', icon: AlertTriangle, permiso: 'discrepancias' },
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permiso: 'reportes' },
    ],
  },
  {
    label: 'Proveedores',
    items: [
      { to: '/proveedores', label: 'Proveedores', icon: Truck, permiso: 'proveedores' },
      { to: '/importar-lista', label: 'Listas', icon: Upload, permiso: 'proveedores' },
      { to: '/equivalencias', label: 'Equivalencias', icon: Link2, permiso: 'proveedores' },
      { to: '/comparador', label: 'Comparador', icon: BarChart3, permiso: 'proveedores' },
    ],
  },
  {
    label: 'Contabilidad',
    items: [
      { to: '/facturas', label: 'Facturas', icon: FileText, permiso: 'contabilidad' },
      { to: '/cuentas-por-pagar', label: 'Cuentas x Pagar', icon: DollarSign, permiso: 'contabilidad' },
      { to: '/reportes-costos', label: 'Costos', icon: TrendingUp, permiso: 'contabilidad' },
      { to: '/escanear-factura', label: 'Escanear fact.', icon: ScanLine, permiso: 'contabilidad' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { to: '/productos', label: 'Productos', icon: Package, permiso: 'productos' },
      { to: '/depositos', label: 'Depósitos', icon: Warehouse, permiso: 'depositos' },
      { to: '/recetas', label: 'Recetas', icon: ChefHat, permiso: 'recetas' },
      { to: '/tareas', label: 'Tareas', icon: ListTodo },
      { to: '/usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
      { to: '/configuracion', label: 'Ajustes', icon: Settings, adminOnly: true },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MoreSheet({ open, onClose }: Props) {
  const { user, tienePermiso } = useAuth();

  const canSee = (item: SheetItem) => {
    if (item.adminOnly) return user?.rol === 'admin';
    if (!item.permiso) return true;
    return tienePermiso(item.permiso);
  };

  const visibleGroups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(canSee) }))
    .filter(g => g.items.length > 0);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl border-t border-border max-h-[75vh] overflow-y-auto"
        style={{ animation: 'slideUp 0.2s ease-out' }}
      >
        {/* Handle + close */}
        <div className="sticky top-0 bg-surface z-10 pt-3 pb-2 px-4 border-b border-border/50">
          <div className="w-8 h-1 rounded-full bg-border mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Todas las secciones</p>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-high">
              <X size={16} className="text-on-surface-variant" />
            </button>
          </div>
        </div>

        {/* Groups */}
        <div className="p-4 pb-8 space-y-5">
          {visibleGroups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-2">
                {group.label}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-on-surface-variant hover:bg-surface-high'
                      }`
                    }
                  >
                    <item.icon size={20} />
                    <span className="text-[10px] font-bold text-center leading-tight">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
