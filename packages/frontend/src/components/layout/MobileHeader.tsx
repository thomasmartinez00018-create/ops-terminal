import { useLocation } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';

// Route → display name map
const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/tareas': 'Tareas',
  '/movimientos': 'Movimientos',
  '/elaboraciones': 'Elaboraciones',
  '/ordenes-compra': 'Órdenes de compra',
  '/control-scanner': 'Control Scanner',
  '/stock': 'Stock',
  '/inventarios': 'Inventarios',
  '/discrepancias': 'Discrepancias',
  '/reportes': 'Reportes',
  '/proveedores': 'Proveedores',
  '/importar-lista': 'Importar Listas',
  '/equivalencias': 'Equivalencias',
  '/comparador': 'Comparador',
  '/facturas': 'Facturas',
  '/cuentas-por-pagar': 'Cuentas por Pagar',
  '/reportes-costos': 'Costos',
  '/escanear-factura': 'Escanear Factura',
  '/productos': 'Productos',
  '/depositos': 'Depósitos',
  '/recetas': 'Recetas',
  '/usuarios': 'Usuarios',
  '/configuracion': 'Configuración',
  '/importar': 'Importar',
  '/vincular': 'Vincular',
};

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
}

export default function MobileHeader({ sidebarOpen, onToggleSidebar, onOpenSearch }: Props) {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'OPS Terminal';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 lg:hidden bg-surface/95 backdrop-blur-md border-b border-border/60">
      <div className="flex items-center h-12 px-3">
        {/* Hamburger */}
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-1 rounded-lg hover:bg-surface-high transition-colors"
        >
          {sidebarOpen
            ? <X size={18} className="text-foreground" />
            : <Menu size={18} className="text-foreground" />
          }
        </button>

        {/* Page title */}
        <div className="flex-1 text-center min-w-0 px-2">
          <p className="text-sm font-bold text-foreground truncate">{title}</p>
        </div>

        {/* Search */}
        <button
          onClick={onOpenSearch}
          className="p-2 -mr-1 rounded-lg hover:bg-surface-high transition-colors"
        >
          <Search size={18} className="text-on-surface-variant" />
        </button>
      </div>
    </header>
  );
}
