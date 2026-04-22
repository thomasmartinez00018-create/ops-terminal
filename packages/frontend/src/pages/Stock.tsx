import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import { AlertTriangle, Search, RefreshCw, Package } from 'lucide-react';
import PageTour from '../components/PageTour';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { todayStr } from '../lib/exportUtils';
import { useToast } from '../context/ToastContext';

const RUBROS_STOCK = [
  'Verduras', 'Frutas', 'Carnes', 'Pescados', 'Lácteos', 'Fiambres',
  'Panadería', 'Aceites', 'Condimentos', 'Bebidas', 'Vinos', 'Limpieza',
  'Descartables', 'Elaborados', 'Otros'
];

export default function Stock() {
  const { addToast } = useToast();
  const [stock, setStock] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [filtroDeposito, setFiltroDeposito] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [filtroSubrubro, setFiltroSubrubro] = useState('');
  const [subrubrosDisponibles, setSubrubrosDisponibles] = useState<string[]>([]);
  const [filtroBajoMinimo, setFiltroBajoMinimo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);

  // fetchToken: cada `cargar()` incrementa un token; solo la respuesta con
  // el token más reciente "gana" y actualiza el estado. Esto previene que
  // una respuesta lenta de un filtro anterior pise una respuesta rápida del
  // filtro actual (ej: usuario cambia filtroDeposito 2 veces seguidas y
  // termina viendo el stock del primer depósito aunque seleccionó el segundo).
  const fetchTokenRef = useRef(0);
  const cargar = () => {
    const myToken = ++fetchTokenRef.current;
    setLoading(true);
    const params: Record<string, string> = {};
    if (filtroDeposito) params.depositoId = filtroDeposito;
    if (filtroBajoMinimo) params.bajosDeMinimo = 'true';
    api.getStock(params)
      .then(data => { if (myToken === fetchTokenRef.current) setStock(data); })
      .catch((e: any) => {
        if (myToken !== fetchTokenRef.current) return; // respuesta stale
        console.error('[stock/cargar]', e);
        // Silencioso si es "Sesión expirada" (el evento AUTH_ERROR_EVENT
        // ya disparó el flujo de logout — otro toast sería ruido). Para
        // cualquier otro error, avisar en lugar de dejar la pantalla
        // vacía sin feedback.
        const msg = String(e?.message || '');
        if (!/sesi[oó]n expirada/i.test(msg)) {
          addToast('No se pudo cargar el stock. Reintentá en un momento.', 'error');
        }
      })
      .finally(() => { if (myToken === fetchTokenRef.current) setLoading(false); });
  };

  useEffect(() => { cargar(); }, [filtroDeposito, filtroBajoMinimo]);
  useEffect(() => {
    if (filtroRubro) {
      api.getSubrubros(filtroRubro).then(setSubrubrosDisponibles).catch(() => setSubrubrosDisponibles([]));
    } else {
      setSubrubrosDisponibles([]);
    }
    setFiltroSubrubro('');
  }, [filtroRubro]);
  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  }, []);

  // Filtro único centralizado — antes estaba duplicado 3 veces (render, empty
  // state, export), lo que es fuente típica de bugs de "la tabla dice X pero
  // el contador dice Y".
  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return stock.filter((s: any) => {
      if (q && !(s.nombre || '').toLowerCase().includes(q) && !(s.codigo || '').toLowerCase().includes(q)) return false;
      if (filtroRubro && s.rubro !== filtroRubro) return false;
      if (filtroSubrubro && s.subrubro !== filtroSubrubro) return false;
      return true;
    });
  }, [stock, busqueda, filtroRubro, filtroSubrubro]);

  return (
    <div>
      <PageTour pageKey="stock" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Control</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Stock Actual</h1>
        </div>
        <ExportMenu size="sm" disabled={stock.length === 0} getConfig={() => ({
          title: 'Stock Actual',
          filename: `stock-${todayStr()}`,
          subtitle: filtroRubro ? `Rubro: ${filtroRubro}` : undefined,
          headers: ['Codigo', 'Producto', 'Rubro', 'Stock', 'Unidad', 'Minimo', 'Bajo minimo'],
          rows: filtrado.map((s: any) => [s.codigo, s.nombre, s.rubro, s.stockTotal, s.unidad, s.stockMinimo, s.bajoMinimo ? 'SI' : '']),
          summary: [
            { label: 'Productos', value: filtrado.length },
            { label: 'Bajo minimo', value: filtrado.filter((s: any) => s.bajoMinimo).length },
          ],
          numberColumns: [3, 5],
        } as ExportConfig)} />
      </div>

      {/* Mini-cards resumen */}
      {!loading && stock.length > 0 && (() => {
        const bajosCount = filtrado.filter((s: any) => s.bajoMinimo).length;
        return (
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => { setFiltroBajoMinimo(false); setBusqueda(''); setFiltroRubro(''); setFiltroSubrubro(''); setFiltroDeposito(''); }}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <Package size={14} className="text-primary" />
              <span className="text-sm font-bold text-foreground">{filtrado.length}</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">productos</span>
              <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">↺</span>
            </button>
            {bajosCount > 0 && (
              <button
                onClick={() => setFiltroBajoMinimo(true)}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/30 hover:bg-destructive/10 transition-all"
              >
                <AlertTriangle size={14} className="text-destructive" />
                <span className="text-sm font-bold text-destructive">{bajosCount}</span>
                <span className="text-[10px] font-bold text-destructive/80 uppercase tracking-wider">bajo mínimo</span>
                <span className="text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity font-bold">→</span>
              </button>
            )}
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto o código..."
            className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-on-surface-variant/50"
          />
        </div>
        <select
          value={filtroDeposito}
          onChange={e => setFiltroDeposito(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los depósitos</option>
          {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <select
          value={filtroRubro}
          onChange={e => setFiltroRubro(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los rubros</option>
          {RUBROS_STOCK.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {subrubrosDisponibles.length > 0 && (
          <select
            value={filtroSubrubro}
            onChange={e => setFiltroSubrubro(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todos los sub-rubros</option>
            {subrubrosDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant cursor-pointer">
          <input
            type="checkbox"
            checked={filtroBajoMinimo}
            onChange={e => setFiltroBajoMinimo(e.target.checked)}
            className="rounded bg-surface-high border-border accent-primary"
          />
          Solo bajo mínimo
        </label>
        <button
          onClick={cargar}
          className="p-2.5 rounded-lg bg-surface-high hover:bg-primary/10 text-on-surface-variant hover:text-primary transition"
          title="Actualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Loading shared */}
      {loading && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <div className="flex items-center justify-center gap-2 text-on-surface-variant">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm font-medium">Cargando stock...</span>
          </div>
        </div>
      )}

      {/* Empty state cuando no hay resultados */}
      {!loading && filtrado.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-on-surface-variant font-medium">
          {busqueda
            ? `Sin resultados para "${busqueda}"`
            : filtroBajoMinimo
              ? 'Todos los productos están por encima del stock mínimo ✓'
              : 'Sin datos de stock. Registrá movimientos para ver el stock.'}
        </div>
      )}

      {/* Mobile: cards grandes con stock destacado y desglose por depósito */}
      {!loading && filtrado.length > 0 && (
        <div className="sm:hidden space-y-2.5">
          {filtrado.map((s: any) => (
            <div
              key={s.productoId}
              className={`bg-surface rounded-xl border p-3.5 ${s.bajoMinimo ? 'border-destructive/40 bg-destructive/[0.03]' : 'border-border'}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-primary">{s.codigo}</p>
                  <p className="font-bold text-foreground text-sm leading-tight mt-0.5 flex items-center gap-1.5">
                    <span className="truncate">{s.nombre}</span>
                    {s.bajoMinimo && <AlertTriangle size={13} className="text-destructive shrink-0" />}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge>{s.rubro || 'Sin rubro'}</Badge>
                    {s.subrubro && <Badge variant="secondary">{s.subrubro}</Badge>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Stock</p>
                  <p className={`font-mono text-xl font-extrabold tabular-nums leading-tight ${s.bajoMinimo ? 'text-destructive' : 'text-foreground'}`}>
                    {s.stockTotal}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {s.unidad} · min {s.stockMinimo}
                  </p>
                </div>
              </div>
              {/* Desglose por depósito con guard contra array vacío */}
              {Array.isArray(s.porDeposito) && s.porDeposito.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
                  {s.porDeposito.map((d: any) => (
                    <span key={d.depositoId} className="text-[10px] font-bold bg-surface-high px-2 py-0.5 rounded uppercase tracking-wider">
                      {d.depositoNombre}: <span className="text-primary">{d.cantidad}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Desktop: tabla */}
      {!loading && filtrado.length > 0 && (
        <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rubro</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Mínimo</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Por depósito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrado.map((s: any) => (
                  <tr key={s.productoId} className={`hover:bg-surface-high/50 transition-colors ${s.bajoMinimo ? 'bg-destructive/5' : ''}`}>
                    <td className="p-3 font-mono text-xs text-primary">{s.codigo}</td>
                    <td className="p-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        {s.nombre}
                        {s.bajoMinimo && <AlertTriangle size={14} className="text-destructive" />}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge>{s.rubro}</Badge>
                        {s.subrubro && <Badge variant="secondary">{s.subrubro}</Badge>}
                      </div>
                    </td>
                    <td className={`p-3 text-right font-extrabold ${s.bajoMinimo ? 'text-destructive' : 'text-foreground'}`}>
                      {s.stockTotal} <span className="font-normal text-on-surface-variant">{s.unidad}</span>
                    </td>
                    <td className="p-3 text-right hidden md:table-cell text-on-surface-variant">
                      {s.stockMinimo} {s.unidad}
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      {/* Guard contra porDeposito no-array/vacío (bug histórico) */}
                      {Array.isArray(s.porDeposito) && s.porDeposito.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.porDeposito.map((d: any) => (
                            <span key={d.depositoId} className="text-[10px] font-bold bg-surface-high px-2 py-0.5 rounded uppercase tracking-wider">
                              {d.depositoNombre}: <span className="text-primary">{d.cantidad}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-on-surface-variant/60 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
