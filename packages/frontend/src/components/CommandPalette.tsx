import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import {
  Search, LayoutDashboard, ArrowRightLeft, FlaskConical, ShoppingCart,
  ScanBarcode, ClipboardList, ClipboardCheck, AlertTriangle, BarChart3,
  Truck, Upload, Link2, FileText, DollarSign, TrendingUp, ScanLine,
  Package, Warehouse, ChefHat, Users, Settings, ListTodo,
  Plus, Zap, Repeat
} from 'lucide-react';

// ── Search index ────────────────────────────────────────────

interface SearchItem {
  id: string;
  label: string;
  group: string;
  icon: any;
  to: string;
  keywords: string[];
  permiso?: string;
  adminOnly?: boolean;
  type: 'page' | 'action';
}

const PAGES: SearchItem[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'General', icon: LayoutDashboard, to: '/', keywords: ['inicio', 'home', 'panel'], type: 'page' },
  { id: 'tareas', label: 'Tareas', group: 'General', icon: ListTodo, to: '/tareas', keywords: ['todo', 'pendientes'], type: 'page' },
  // Operaciones
  { id: 'movimientos', label: 'Movimientos', group: 'Operaciones', icon: ArrowRightLeft, to: '/movimientos', keywords: ['mov', 'transferencia', 'ingreso', 'merma', 'venta'], permiso: 'movimientos', type: 'page' },
  { id: 'reposicion', label: 'Reposición', group: 'Operaciones', icon: Repeat, to: '/reposicion', keywords: ['reposicion', 'reponer', 'abastecer', 'transferir', 'punto', 'minimo', 'garage', 'gamuza', 'barra', 'cadena'], permiso: 'stock', type: 'page' },
  { id: 'elaboraciones', label: 'Elaboraciones', group: 'Operaciones', icon: FlaskConical, to: '/elaboraciones', keywords: ['elaborar', 'produccion', 'cocina', 'receta'], permiso: 'movimientos', type: 'page' },
  { id: 'ordenes', label: 'Órdenes de compra', group: 'Operaciones', icon: ShoppingCart, to: '/ordenes-compra', keywords: ['orden', 'compra', 'pedido', 'oc'], permiso: 'ordenes-compra', type: 'page' },
  { id: 'scanner', label: 'Control Scanner', group: 'Operaciones', icon: ScanBarcode, to: '/control-scanner', keywords: ['escanear', 'codigo', 'barras', 'conteo'], permiso: 'control-scanner', type: 'page' },
  // Stock
  { id: 'stock', label: 'Stock', group: 'Stock', icon: ClipboardList, to: '/stock', keywords: ['inventario', 'existencia', 'deposito'], permiso: 'stock', type: 'page' },
  { id: 'inventarios', label: 'Inventarios', group: 'Stock', icon: ClipboardCheck, to: '/inventarios', keywords: ['conteo', 'fisico', 'control'], permiso: 'inventarios', type: 'page' },
  { id: 'discrepancias', label: 'Discrepancias', group: 'Stock', icon: AlertTriangle, to: '/discrepancias', keywords: ['diferencia', 'faltante', 'sobrante'], permiso: 'discrepancias', type: 'page' },
  { id: 'reportes', label: 'Reportes', group: 'Stock', icon: BarChart3, to: '/reportes', keywords: ['reporte', 'informe', 'estadistica'], permiso: 'reportes', type: 'page' },
  // Proveedores
  { id: 'proveedores', label: 'Proveedores', group: 'Proveedores', icon: Truck, to: '/proveedores', keywords: ['proveedor', 'supplier'], permiso: 'proveedores', type: 'page' },
  { id: 'importar-lista', label: 'Importar Listas', group: 'Proveedores', icon: Upload, to: '/importar-lista', keywords: ['lista', 'precio', 'pdf', 'excel', 'importar'], permiso: 'proveedores', type: 'page' },
  { id: 'equivalencias', label: 'Equivalencias', group: 'Proveedores', icon: Link2, to: '/equivalencias', keywords: ['match', 'vincular', 'equivalencia'], permiso: 'proveedores', type: 'page' },
  { id: 'comparador', label: 'Comparador de Precios', group: 'Proveedores', icon: BarChart3, to: '/comparador', keywords: ['comparar', 'precio', 'costo'], permiso: 'proveedores', type: 'page' },
  // Contabilidad
  { id: 'facturas', label: 'Facturas', group: 'Contabilidad', icon: FileText, to: '/facturas', keywords: ['factura', 'comprobante'], permiso: 'contabilidad', type: 'page' },
  { id: 'cxp', label: 'Cuentas por Pagar', group: 'Contabilidad', icon: DollarSign, to: '/cuentas-por-pagar', keywords: ['cuenta', 'pagar', 'deuda', 'vencimiento'], permiso: 'contabilidad', type: 'page' },
  { id: 'costos', label: 'Costos', group: 'Contabilidad', icon: TrendingUp, to: '/reportes-costos', keywords: ['costo', 'margen', 'rentabilidad'], permiso: 'contabilidad', type: 'page' },
  { id: 'escanear-factura', label: 'Escanear Factura', group: 'Contabilidad', icon: ScanLine, to: '/escanear-factura', keywords: ['ocr', 'escanear', 'factura', 'foto'], permiso: 'contabilidad', type: 'page' },
  { id: 'alertas-precio', label: 'Alertas de precio', group: 'Contabilidad', icon: AlertTriangle, to: '/alertas-precio', keywords: ['alerta', 'precio', 'variacion', 'subio', 'bajo', 'cambio'], permiso: 'contabilidad', type: 'page' },
  // Config
  { id: 'productos', label: 'Productos', group: 'Configuración', icon: Package, to: '/productos', keywords: ['producto', 'articulo', 'item'], permiso: 'productos', type: 'page' },
  { id: 'depositos', label: 'Depósitos', group: 'Configuración', icon: Warehouse, to: '/depositos', keywords: ['deposito', 'almacen', 'camara', 'freezer'], permiso: 'depositos', type: 'page' },
  { id: 'recetas', label: 'Recetas', group: 'Configuración', icon: ChefHat, to: '/recetas', keywords: ['receta', 'formula', 'ingrediente'], permiso: 'recetas', type: 'page' },
  { id: 'usuarios', label: 'Usuarios', group: 'Configuración', icon: Users, to: '/usuarios', keywords: ['usuario', 'staff', 'permiso', 'rol'], adminOnly: true, type: 'page' },
  { id: 'config', label: 'Configuración', group: 'Configuración', icon: Settings, to: '/configuracion', keywords: ['config', 'ajustes', 'settings'], adminOnly: true, type: 'page' },
];

const ACTIONS: SearchItem[] = [
  { id: 'action-mov', label: 'Registrar movimiento', group: 'Acciones rápidas', icon: Plus, to: '/movimientos', keywords: ['registrar', 'nuevo', 'movimiento'], permiso: 'movimientos', type: 'action' },
  { id: 'action-orden', label: 'Crear orden de compra', group: 'Acciones rápidas', icon: ShoppingCart, to: '/ordenes-compra', keywords: ['nueva', 'orden', 'compra', 'pedido'], permiso: 'ordenes-compra', type: 'action' },
  { id: 'action-scan', label: 'Escanear factura', group: 'Acciones rápidas', icon: ScanLine, to: '/escanear-factura', keywords: ['escanear', 'factura', 'ocr'], permiso: 'contabilidad', type: 'action' },
  { id: 'action-elaborar', label: 'Registrar elaboración', group: 'Acciones rápidas', icon: FlaskConical, to: '/elaboraciones', keywords: ['elaborar', 'producir', 'cocinar'], permiso: 'movimientos', type: 'action' },
];

const ALL_ITEMS = [...ACTIONS, ...PAGES];

// ── Component ───────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const { user, tienePermiso } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const canSee = useCallback((item: SearchItem) => {
    if (item.adminOnly) return user?.rol === 'admin';
    if (!item.permiso) return true;
    return tienePermiso(item.permiso);
  }, [user, tienePermiso]);

  const visibleItems = useMemo(() => ALL_ITEMS.filter(canSee), [canSee]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // Show actions first, then recent-ish pages (first 8)
      return visibleItems.slice(0, 12);
    }
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return visibleItems
      .map(item => {
        const label = item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const kws = item.keywords.join(' ');
        let score = 0;
        if (label.startsWith(q)) score = 100;
        else if (label.includes(q)) score = 80;
        else if (kws.includes(q)) score = 60;
        else {
          // Fuzzy: check if all chars appear in order
          let qi = 0;
          for (const ch of label) {
            if (qi < q.length && ch === q[qi]) qi++;
          }
          if (qi === q.length) score = 40;
        }
        return { item, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.item)
      .slice(0, 10);
  }, [query, visibleItems]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on route change
  useEffect(() => { onClose(); }, [location.pathname]);

  // Keyboard nav
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault();
      navigate(results[selectedIdx].to);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0); }, [results.length, query]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative flex flex-col mx-auto mt-[12vh] lg:mt-[20vh] w-full max-w-lg px-4">
        <div className="bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden"
          style={{ animation: 'scaleIn 0.15s ease-out' }}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search size={18} className="text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar página, acción..."
              className="flex-1 bg-transparent text-sm font-semibold text-foreground placeholder:text-on-surface-variant/50 outline-none"
              autoFocus
            />
            <kbd className="hidden lg:inline-block text-[10px] font-bold text-on-surface-variant bg-surface-high px-1.5 py-0.5 rounded border border-border">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {results.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-8">Sin resultados</p>
            )}
            {results.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => { navigate(item.to); onClose(); }}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  idx === selectedIdx
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-surface-high'
                }`}
              >
                <item.icon size={16} className={`shrink-0 ${idx === selectedIdx ? 'text-primary' : 'text-on-surface-variant'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.label}</p>
                  <p className="text-[10px] text-on-surface-variant font-medium">{item.group}</p>
                </div>
                {item.type === 'action' && (
                  <Zap size={12} className="text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-on-surface-variant font-bold">
            <span>↑↓ navegar</span>
            <span>↵ abrir</span>
            <span>esc cerrar</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Hook to bind Cmd+K globally
export function useCommandPaletteShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);
}
