import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSession } from '../../context/SessionContext';
import { api } from '../../lib/api';
import {
  LayoutDashboard, Package, Warehouse, Users, ArrowRightLeft,
  ClipboardList, LogOut, ChefHat, Truck, ClipboardCheck,
  Upload, BarChart3, Link2, ShoppingCart, ScanBarcode, AlertTriangle, ScanLine, ListTodo, FlaskConical,
  FileText, DollarSign, TrendingUp, Settings, ChevronDown, Crown, Repeat, Search
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

// ── Tipos ────────────────────────────────────────────────────
interface NavItem {
  to: string;
  label: string;
  icon: any;
  permiso?: string;
  adminOnly?: boolean;
  // Key para inyectar un badge numérico en tiempo real. El Sidebar hace
  // polling del backend y mapea por este key. Hoy soportado: 'alertasPrecio'.
  badgeKey?: 'alertasPrecio';
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// ── Items top-level (siempre visibles) ───────────────────────
const topItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tareas', label: 'Tareas', icon: ListTodo },
];

// ── Grupos colapsables ───────────────────────────────────────
const navGroups: NavGroup[] = [
  {
    key: 'operaciones',
    label: 'Operaciones',
    items: [
      { to: '/movimientos', label: 'Movimientos', icon: ArrowRightLeft, permiso: 'movimientos' },
      { to: '/reposicion', label: 'Reposición', icon: Repeat, permiso: 'stock' },
      { to: '/elaboraciones', label: 'Elaborar', icon: FlaskConical, permiso: 'movimientos' },
      { to: '/ordenes-compra', label: 'Órdenes', icon: ShoppingCart, permiso: 'ordenes-compra' },
      { to: '/control-scanner', label: 'Control', icon: ScanBarcode, permiso: 'control-scanner' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    items: [
      { to: '/stock', label: 'Stock', icon: ClipboardList, permiso: 'stock' },
      { to: '/inventarios', label: 'Inventarios', icon: ClipboardCheck, permiso: 'inventarios' },
      { to: '/discrepancias', label: 'Discrepancias', icon: AlertTriangle, permiso: 'discrepancias' },
      { to: '/reportes', label: 'Reportes', icon: BarChart3, permiso: 'reportes' },
    ],
  },
  {
    key: 'proveedores',
    label: 'Proveedores',
    items: [
      { to: '/proveedores', label: 'Proveedores', icon: Truck, permiso: 'proveedores' },
      { to: '/importar-lista', label: 'Listas de precio', icon: Upload, permiso: 'proveedores' },
      { to: '/equivalencias', label: 'Equivalencias', icon: Link2, permiso: 'proveedores' },
      { to: '/comparador', label: 'Comparador', icon: BarChart3, permiso: 'proveedores' },
    ],
  },
  {
    key: 'contabilidad',
    label: 'Contabilidad',
    items: [
      { to: '/facturas', label: 'Facturas', icon: FileText, permiso: 'contabilidad' },
      { to: '/alertas-precio', label: 'Alertas de precio', icon: AlertTriangle, permiso: 'contabilidad', badgeKey: 'alertasPrecio' },
      { to: '/cuentas-por-pagar', label: 'Cuentas x Pagar', icon: DollarSign, permiso: 'contabilidad' },
      { to: '/reportes-costos', label: 'Costos', icon: TrendingUp, permiso: 'contabilidad' },
      { to: '/escanear-factura', label: 'Escanear Factura', icon: ScanLine, permiso: 'contabilidad' },
    ],
  },
  {
    key: 'config',
    label: 'Configuración',
    items: [
      { to: '/productos', label: 'Productos', icon: Package, permiso: 'productos' },
      { to: '/depositos', label: 'Depósitos', icon: Warehouse, permiso: 'depositos' },
      { to: '/recetas', label: 'Recetas', icon: ChefHat, permiso: 'recetas' },
      { to: '/usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
      { to: '/suscripcion', label: 'Suscripción', icon: Crown, adminOnly: true },
      { to: '/configuracion', label: 'Ajustes', icon: Settings, adminOnly: true },
    ],
  },
];

// ── Sidebar ──────────────────────────────────────────────────
interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  /** Callback para abrir el CommandPalette. Si no se pasa, se oculta el
   *  botón de búsqueda (compat con tests u otros layouts). */
  onOpenSearch?: () => void;
}

export default function Sidebar({ open = false, onClose, onOpenSearch }: SidebarProps) {
  const { user, logout, tienePermiso } = useAuth();
  const { workspace, workspaces, backToWorkspaces } = useSession();
  const location = useLocation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Badges dinámicos (polling liviano). Se refrescan cada 60s y al cambiar
  // de ruta para reflejar al instante cuando el usuario revisa una alerta.
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const cargarBadges = async () => {
      try {
        if (tienePermiso('contabilidad') || user?.rol === 'admin') {
          const data = await api.getAlertasPrecioCount();
          if (!cancelled) {
            setBadges(prev => ({ ...prev, alertasPrecio: data.pendientes ?? 0 }));
          }
        }
      } catch {}
    };
    cargarBadges();
    const iv = setInterval(cargarBadges, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, location.pathname]);

  // El perfil "dueño" es un dashboard ejecutivo: esconde todo lo operativo/CRUD
  // y deja solo lo que un owner no-técnico usa para monitorear el negocio.
  const esDueno = user?.configuracion?.tipo === 'dueno';
  const duenoAllowList = new Set<string>([
    '/',                  // Dashboard
    '/tareas',            // Tareas propias
    '/stock',             // Ver stock (solo lectura visual)
    '/reportes',          // Reportes operativos
    '/reportes-costos',   // Costos/márgenes
    '/alertas-precio',    // Alertas de variación
    '/cuentas-por-pagar', // Qué debe a proveedores
    '/comparador',        // Comparador de precios
    '/facturas',          // Facturas (lectura)
    '/discrepancias',     // Discrepancias de inventario
  ]);

  // Filtrar items según permisos
  const canSee = (item: NavItem) => {
    if (esDueno && !duenoAllowList.has(item.to)) return false;
    if (item.adminOnly) return user?.rol === 'admin';
    if (!item.permiso) return true;
    return tienePermiso(item.permiso);
  };

  // Grupos filtrados (solo los que tienen al menos un item visible)
  const visibleGroups = useMemo(() =>
    navGroups
      .map(g => ({ ...g, items: g.items.filter(canSee) }))
      .filter(g => g.items.length > 0),
    [user]
  );

  // Auto-expandir el grupo que contiene la ruta activa
  useEffect(() => {
    const path = location.pathname;
    for (const group of visibleGroups) {
      const match = group.items.some(item =>
        path === item.to || (item.to !== '/' && path.startsWith(item.to))
      );
      if (match) {
        setExpanded(prev => ({ ...prev, [group.key]: true }));
        break;
      }
    }
  }, [location.pathname]);

  const toggleGroup = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all ${
      isActive
        ? 'text-primary bg-primary/10 nav-link-active'
        : 'text-on-surface-variant hover:text-foreground hover:bg-surface-high/70'
    }`;

  const groupLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 pl-6 pr-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${
      isActive
        ? 'text-primary bg-primary/8'
        : 'text-on-surface-variant/80 hover:text-foreground hover:bg-surface-high/50'
    }`;

  const nav = (
    <div className="flex flex-col h-full">
      {/* ── Branding ──────────────────────────────────────── */}
      <div className="p-5 mb-1 shrink-0">
        <div className="text-lg font-extrabold tracking-tight text-foreground">OPS<span className="text-gold-gradient">TERMINAL</span></div>
        <p className="text-[10px] font-bold text-primary/70 uppercase tracking-[0.2em] mt-1">
          Stock Gastro
        </p>
        <div className="mt-3 h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
      </div>

      {/* ── Buscar (CommandPalette) ───────────────────────────
          Botón EXPLÍCITO para que usuarios no-técnicos descubran el buscador.
          Antes solo estaba Cmd+K, que un dueño de 55 años nunca va a usar.
          En mobile ya está el icono lupa en MobileHeader. */}
      {onOpenSearch && (
        <div className="px-3 mb-3 shrink-0">
          <button
            onClick={() => { onOpenSearch(); onClose?.(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-surface-high/60 hover:bg-surface-high text-on-surface-variant hover:text-foreground text-sm font-medium transition-colors border border-border/40"
          >
            <Search size={15} className="opacity-70" />
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="hidden lg:inline-block text-[10px] font-mono font-bold text-on-surface-variant/70 bg-background/70 px-1.5 py-0.5 rounded border border-border/40">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────── */}
      <nav className="flex-1 px-3 overflow-y-auto min-h-0 pb-2">
        {/* Top-level items (siempre visibles) */}
        <div className="space-y-0.5 mb-2">
          {topItems.filter(canSee).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={linkClass}
              onClick={() => onClose?.()}
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Grouped sections */}
        {visibleGroups.map(group => {
          const isOpen = expanded[group.key] ?? false;
          const hasActive = group.items.some(item =>
            location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to))
          );

          return (
            <div key={group.key} className="mb-1">
              {/* Section header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-all ${
                  hasActive
                    ? 'text-primary'
                    : 'text-on-surface-variant/60 hover:text-on-surface-variant'
                }`}
              >
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                />
                <span className="flex-1 text-left">{group.label}</span>
                {hasActive && !isOpen && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>

              {/* Collapsible items */}
              <div
                className="overflow-hidden transition-all duration-200 ease-out"
                style={{
                  maxHeight: isOpen ? `${group.items.length * 40}px` : '0px',
                  opacity: isOpen ? 1 : 0,
                }}
              >
                <div className="space-y-0.5 py-0.5">
                  {group.items.map(item => {
                    const badgeCount = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={groupLinkClass}
                        onClick={() => onClose?.()}
                      >
                        <item.icon size={15} className="opacity-70" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-extrabold">
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── User footer ───────────────────────────────────── */}
      <div className="p-3 pb-20 lg:pb-3 border-t border-border shrink-0">
        {workspace && (
          <div className="px-3 py-2 mb-1 rounded-lg bg-surface-high">
            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
              Workspace
            </p>
            <p className="text-xs font-bold text-foreground truncate">{workspace.nombre}</p>
            {/* Siempre mostramos el botón para que el usuario pueda volver al
                selector y crear nuevos workspaces (no solo cuando hay >1). */}
            <button
              onClick={backToWorkspaces}
              className="text-[9px] font-bold text-primary uppercase tracking-wider hover:underline mt-0.5"
            >
              {workspaces.length > 1 ? 'Cambiar workspace' : 'Gestionar workspaces'}
            </button>
          </div>
        )}
        <div className="px-3 py-2">
          <p className="text-xs font-bold text-foreground">{user?.nombre}</p>
          <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-widest">{user?.rol}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => onClose?.()}
        />
      )}

      {/* Sidebar — shrink-0 evita que un main con contenido ancho (tablas) empuje
          el sidebar y reduzca su ancho visible, dejando el contenido del main
          superpuesto sobre él. */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 lg:shrink-0 bg-surface border-r border-white/5 flex flex-col transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {nav}
      </aside>
    </>
  );
}
