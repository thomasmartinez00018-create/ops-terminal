import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import { AlertTriangle, Search, RefreshCw } from 'lucide-react';
import PageTour from '../components/PageTour';

const RUBROS_STOCK = [
  'Verduras', 'Frutas', 'Carnes', 'Pescados', 'Lácteos', 'Fiambres',
  'Panadería', 'Aceites', 'Condimentos', 'Bebidas', 'Vinos', 'Limpieza',
  'Descartables', 'Elaborados', 'Otros'
];

export default function Stock() {
  const [stock, setStock] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [filtroDeposito, setFiltroDeposito] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [filtroSubrubro, setFiltroSubrubro] = useState('');
  const [subrubrosDisponibles, setSubrubrosDisponibles] = useState<string[]>([]);
  const [filtroBajoMinimo, setFiltroBajoMinimo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);

  const cargar = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filtroDeposito) params.depositoId = filtroDeposito;
    if (filtroBajoMinimo) params.bajosDeMinimo = 'true';
    api.getStock(params).then(setStock).catch(console.error).finally(() => setLoading(false));
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

  return (
    <div>
      <PageTour pageKey="stock" />
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Control</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Stock Actual</h1>
      </div>

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

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Rubro</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Mínimo</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Por depósito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-on-surface-variant">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm font-medium">Cargando stock...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && stock.filter(s => {
                if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase()) && !s.codigo.toLowerCase().includes(busqueda.toLowerCase())) return false;
                if (filtroRubro && s.rubro !== filtroRubro) return false;
                if (filtroSubrubro && s.subrubro !== filtroSubrubro) return false;
                return true;
              }).map(s => (
                <tr key={s.productoId} className={`hover:bg-surface-high/50 transition-colors ${s.bajoMinimo ? 'bg-destructive/5' : ''}`}>
                  <td className="p-3 font-mono text-xs text-primary">{s.codigo}</td>
                  <td className="p-3 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      {s.nombre}
                      {s.bajoMinimo && <AlertTriangle size={14} className="text-destructive" />}
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell">
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
                    <div className="flex flex-wrap gap-1">
                      {s.porDeposito.map((d: any) => (
                        <span key={d.depositoId} className="text-[10px] font-bold bg-surface-high px-2 py-0.5 rounded uppercase tracking-wider">
                          {d.depositoNombre}: <span className="text-primary">{d.cantidad}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && stock.filter(s => {
                if (busqueda && !s.nombre.toLowerCase().includes(busqueda.toLowerCase()) && !s.codigo.toLowerCase().includes(busqueda.toLowerCase())) return false;
                if (filtroRubro && s.rubro !== filtroRubro) return false;
                if (filtroSubrubro && s.subrubro !== filtroSubrubro) return false;
                return true;
              }).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                    {busqueda
                      ? `Sin resultados para "${busqueda}"`
                      : filtroBajoMinimo
                        ? 'Todos los productos están por encima del stock mínimo'
                        : 'Sin datos de stock. Registrá movimientos para ver el stock.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
