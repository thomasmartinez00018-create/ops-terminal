import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { BarChart3, TrendingUp, Search, Download } from 'lucide-react';

export default function ReportesCostos() {
  const [tab, setTab] = useState<'cogs' | 'precios'>('cogs');

  // COGS
  const [cogsData, setCogsData] = useState<any>(null);
  const [cogsDesde, setCogsDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [cogsHasta, setCogsHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [cogsLoading, setCogsLoading] = useState(false);

  // Historial precios
  const [productos, setProductos] = useState<any[]>([]);
  const [productoId, setProductoId] = useState('');
  const [historial, setHistorial] = useState<any[]>([]);
  const [preciosLoading, setPreciosLoading] = useState(false);
  const [buscarProducto, setBuscarProducto] = useState('');

  useEffect(() => {
    api.getProductos({ activo: 'true' }).then(setProductos).catch(() => {});
  }, []);

  const cargarCogs = async () => {
    setCogsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (cogsDesde) params.desde = cogsDesde;
      if (cogsHasta) params.hasta = cogsHasta;
      const data = await api.getCogs(params);
      setCogsData(data);
    } catch { }
    setCogsLoading(false);
  };

  useEffect(() => { cargarCogs(); }, [cogsDesde, cogsHasta]);

  const cargarHistorial = async (pid: string) => {
    setProductoId(pid);
    if (!pid) { setHistorial([]); return; }
    setPreciosLoading(true);
    try {
      const data = await api.getHistorialPrecios(Number(pid));
      setHistorial(data);
    } catch { }
    setPreciosLoading(false);
  };

  const formatMoney = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const productosFiltrados = productos.filter(p => {
    if (!buscarProducto) return true;
    const q = buscarProducto.toLowerCase();
    return p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q);
  });

  const exportarCogsCSV = () => {
    if (!cogsData?.rubros?.length) return;
    const headers = ['Rubro', 'Costo Total', '% del Total', 'Items'];
    const rows = cogsData.rubros.map((r: any) => [r.rubro, r.costoTotal.toFixed(2), r.porcentaje.toFixed(1) + '%', r.cantItems]);
    const csv = [headers, ...rows].map((r: any[]) => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cogs-${cogsDesde}-${cogsHasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Contabilidad</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Costos y Precios</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-high rounded-xl p-1 mb-6">
        <button
          onClick={() => setTab('cogs')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === 'cogs' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-foreground'
          }`}
        >
          <BarChart3 size={16} /> COGS por Período
        </button>
        <button
          onClick={() => setTab('precios')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === 'precios' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-foreground'
          }`}
        >
          <TrendingUp size={16} /> Historial de Precios
        </button>
      </div>

      {/* TAB: COGS */}
      {tab === 'cogs' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Desde</label>
              <input
                type="date"
                value={cogsDesde}
                onChange={e => setCogsDesde(e.target.value)}
                className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Hasta</label>
              <input
                type="date"
                value={cogsHasta}
                onChange={e => setCogsHasta(e.target.value)}
                className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={exportarCogsCSV}
              disabled={!cogsData?.rubros?.length}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-high border border-border text-sm font-semibold text-on-surface-variant hover:text-foreground transition-colors disabled:opacity-40"
            >
              <Download size={14} /> CSV
            </button>
          </div>

          {cogsLoading ? (
            <p className="text-center text-on-surface-variant py-8">Cargando...</p>
          ) : cogsData && (
            <>
              {/* Total card */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Costo total del período</p>
                <p className="text-3xl font-extrabold text-foreground mt-1">{formatMoney(cogsData.costoTotal)}</p>
              </div>

              {/* Rubros table */}
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rubro</th>
                      <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Costo total</th>
                      <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">% del total</th>
                      <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Items</th>
                      <th className="p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell w-48"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cogsData.rubros.map((r: any) => (
                      <tr key={r.rubro} className="hover:bg-surface-high/50 transition-colors">
                        <td className="p-3 font-semibold text-foreground">{r.rubro}</td>
                        <td className="p-3 text-right font-bold text-foreground">{formatMoney(r.costoTotal)}</td>
                        <td className="p-3 text-right font-semibold text-primary">{r.porcentaje.toFixed(1)}%</td>
                        <td className="p-3 text-right text-on-surface-variant hidden sm:table-cell">{r.cantItems}</td>
                        <td className="p-3 hidden md:table-cell">
                          <div className="w-full bg-surface-high rounded-full h-2">
                            <div
                              className="bg-primary rounded-full h-2 transition-all"
                              style={{ width: `${r.porcentaje}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {cogsData.rubros.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">
                          No hay datos de costos para este período
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: Historial de Precios */}
      {tab === 'precios' && (
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Seleccioná un producto</label>
            <div className="relative mb-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={buscarProducto}
                onChange={e => setBuscarProducto(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <select
              value={productoId}
              onChange={e => cargarHistorial(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              size={5}
            >
              {productosFiltrados.slice(0, 50).map(p => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>

          {preciosLoading ? (
            <p className="text-center text-on-surface-variant py-8">Cargando...</p>
          ) : productoId && historial.length > 0 ? (
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Proveedor</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Precio</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Fuente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historial.map((h, idx) => {
                    const prev = historial[idx + 1];
                    const diff = prev?.precio && h.precio ? ((h.precio - prev.precio) / prev.precio) * 100 : null;
                    return (
                      <tr key={idx} className="hover:bg-surface-high/50 transition-colors">
                        <td className="p-3 font-semibold text-foreground">{h.fecha}</td>
                        <td className="p-3 text-on-surface-variant font-medium">{h.proveedor || '—'}</td>
                        <td className="p-3 text-right font-bold text-foreground">
                          {h.precio != null ? formatMoney(h.precio) : '—'}
                          {diff != null && Math.abs(diff) > 0.5 && (
                            <span className={`ml-1 text-[10px] font-bold ${diff > 0 ? 'text-destructive' : 'text-success'}`}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right text-on-surface-variant">{h.cantidad} {h.unidad}</td>
                        <td className="p-3 hidden sm:table-cell">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                            h.fuente === 'factura' ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant'
                          }`}>
                            {h.fuente === 'factura' ? 'Factura' : 'Movimiento'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : productoId ? (
            <p className="text-center text-on-surface-variant py-8 font-medium">No hay historial de precios para este producto</p>
          ) : (
            <p className="text-center text-on-surface-variant py-8 font-medium">Seleccioná un producto para ver su historial de precios</p>
          )}
        </div>
      )}
    </div>
  );
}
