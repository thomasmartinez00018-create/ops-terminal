import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PageTour from '../components/PageTour';
import Badge from '../components/ui/Badge';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { formatCurrency } from '../lib/exportUtils';
import { BarChart3, TrendingDown, DollarSign, Package, Filter, RefreshCw } from 'lucide-react';

type Tab = 'movimientos' | 'mermas' | 'valorizado' | 'historial';

const tipoBadge: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
  ingreso: 'success', elaboracion: 'info', merma: 'danger',
  transferencia: 'warning', ajuste: 'default', consumo_interno: 'default', devolucion: 'warning',
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '$ 0.00';
  return `$ ${Number(n).toFixed(2)}`;
}

export default function Reportes() {
  const [tab, setTab] = useState<Tab>('movimientos');
  const [depositos, setDepositos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);

  // Shared filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [depositoId, setDepositoId] = useState('');
  const [productoId, setProductoId] = useState('');

  // Tab 1: Movimientos por tipo
  const [movPorTipo, setMovPorTipo] = useState<any[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);

  // Tab 2: Mermas
  const [mermas, setMermas] = useState<any>(null);
  const [loadingMermas, setLoadingMermas] = useState(false);

  // Tab 3: Stock valorizado
  const [stockVal, setStockVal] = useState<any[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [filtroStockRubro, setFiltroStockRubro] = useState('');
  const [filtroStockProveedor, setFiltroStockProveedor] = useState('');
  const [filtroStockBusqueda, setFiltroStockBusqueda] = useState('');

  // Tab 4: Historial por producto
  const [historial, setHistorial] = useState<any[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
  }, []);

  // Load data when tab changes or filters change
  useEffect(() => {
    if (tab === 'movimientos') fetchMovPorTipo();
    if (tab === 'mermas') fetchMermas();
    if (tab === 'valorizado') fetchStockValorizado();
    if (tab === 'historial' && productoId) fetchHistorial();
  }, [tab]);

  const fetchMovPorTipo = () => {
    setLoadingMov(true);
    const params: Record<string, string> = {};
    if (fechaDesde) params.fechaDesde = fechaDesde;
    if (fechaHasta) params.fechaHasta = fechaHasta;
    api.getReporteMovimientosPorTipo(params)
      .then(setMovPorTipo)
      .catch(console.error)
      .finally(() => setLoadingMov(false));
  };

  const fetchMermas = () => {
    setLoadingMermas(true);
    const params: Record<string, string> = {};
    if (fechaDesde) params.fechaDesde = fechaDesde;
    if (fechaHasta) params.fechaHasta = fechaHasta;
    if (depositoId) params.depositoId = depositoId;
    api.getReporteMermas(params)
      .then(setMermas)
      .catch(console.error)
      .finally(() => setLoadingMermas(false));
  };

  const fetchStockValorizado = () => {
    setLoadingStock(true);
    api.getStockValorizado()
      .then((data: any) => {
        // Backend may return { items: [], granTotal: X } or a flat array
        setStockVal(Array.isArray(data) ? data : (data.items || []));
      })
      .catch(console.error)
      .finally(() => setLoadingStock(false));
  };

  const fetchHistorial = () => {
    if (!productoId) return;
    setLoadingHistorial(true);
    const params: Record<string, string> = {};
    if (fechaDesde) params.fechaDesde = fechaDesde;
    if (fechaHasta) params.fechaHasta = fechaHasta;
    api.getMovimientosPorProducto(Number(productoId), params)
      .then(setHistorial)
      .catch(console.error)
      .finally(() => setLoadingHistorial(false));
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'movimientos', label: 'Movimientos por tipo', icon: <BarChart3 size={14} /> },
    { key: 'mermas', label: 'Mermas', icon: <TrendingDown size={14} /> },
    { key: 'valorizado', label: 'Stock valorizado', icon: <DollarSign size={14} /> },
    { key: 'historial', label: 'Historial producto', icon: <Package size={14} /> },
  ];

  const isCurrentTabLoading = tab === 'movimientos' ? loadingMov
    : tab === 'mermas' ? loadingMermas
    : tab === 'valorizado' ? loadingStock
    : loadingHistorial;

  const refreshCurrentTab = () => {
    if (tab === 'movimientos') fetchMovPorTipo();
    else if (tab === 'mermas') fetchMermas();
    else if (tab === 'valorizado') fetchStockValorizado();
    else if (tab === 'historial') fetchHistorial();
  };

  const maxCount = movPorTipo.length > 0 ? Math.max(...movPorTipo.map(m => m.cantidad || 0), 1) : 1;

  const mermasTotal = mermas?.detalle?.length || 0;
  const mermasCantidad = mermas?.detalle?.reduce((acc: number, d: any) => acc + (d.cantidad || 0), 0) || 0;

  // Stock valorizado: filtros derivados
  const rubrosDisponibles = Array.from(
    new Set(stockVal.map(s => s.rubro || s.producto?.rubro).filter(Boolean) as string[])
  ).sort();
  const proveedoresDisponibles = Array.from(
    new Map(
      stockVal
        .flatMap(s => s.proveedores || [])
        .filter((p: any) => p && p.id)
        .map((p: any) => [p.id, p])
    ).values()
  ).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

  const stockValFiltrado = stockVal.filter(s => {
    const rubro = s.rubro || s.producto?.rubro || '';
    if (filtroStockRubro && rubro !== filtroStockRubro) return false;
    if (filtroStockProveedor) {
      const ids = (s.proveedores || []).map((p: any) => String(p.id));
      if (!ids.includes(filtroStockProveedor)) return false;
    }
    if (filtroStockBusqueda) {
      const q = filtroStockBusqueda.toLowerCase();
      const nombre = (s.producto?.nombre || s.nombre || '').toLowerCase();
      const cod = (s.producto?.codigo || '').toLowerCase();
      if (!nombre.includes(q) && !cod.includes(q)) return false;
    }
    return true;
  });

  const stockGrandTotal = stockValFiltrado.reduce((acc, s) => acc + (s.valorTotal || 0), 0);

  return (
    <div>
      <PageTour pageKey="reportes" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Análisis</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Reportes</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshCurrentTab}
          disabled={isCurrentTabLoading}
        >
          <RefreshCw size={14} className={isCurrentTabLoading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Movimientos por tipo */}
      {tab === 'movimientos' && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <Input
                label="Desde"
                id="movDesde"
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
              />
              <Input
                label="Hasta"
                id="movHasta"
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
              />
              <Button onClick={fetchMovPorTipo} size="sm">
                <Filter size={14} /> Filtrar
              </Button>
              <ExportMenu size="sm" getConfig={() => ({
                title: 'Movimientos por Tipo',
                filename: `movimientos-tipo-${fechaDesde}-${fechaHasta}`,
                subtitle: `${fechaDesde} al ${fechaHasta}`,
                headers: ['Tipo', 'Cantidad', 'Total Unidades'],
                rows: movPorTipo.map(m => [m.tipo, m.cantidad, m.totalUnidades]),
                numberColumns: [1, 2],
              } as ExportConfig)} />
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Unidades</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest w-1/3">Distribución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movPorTipo.map(m => (
                    <tr key={m.tipo} className="hover:bg-surface-high/50 transition-colors">
                      <td className="p-3">
                        <Badge variant={tipoBadge[m.tipo] || 'default'}>{m.tipo}</Badge>
                      </td>
                      <td className="p-3 font-semibold text-foreground">{m.cantidad}</td>
                      <td className="p-3 font-semibold text-foreground">{m.totalUnidades}</td>
                      <td className="p-3">
                        <div className="w-full bg-surface-high rounded-full h-2.5">
                          <div
                            className="bg-primary h-2.5 rounded-full transition-all"
                            style={{ width: `${((m.cantidad || 0) / maxCount) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {movPorTipo.length === 0 && !loadingMov && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-on-surface-variant font-medium">
                        {fechaDesde || fechaHasta
                          ? 'No hay movimientos para el periodo seleccionado. Probá ajustando las fechas.'
                          : 'Seleccioná un rango de fechas y hacé clic en Filtrar para ver los movimientos.'}
                      </td>
                    </tr>
                  )}
                  {loadingMov && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-on-surface-variant font-medium">
                        Cargando...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Mermas */}
      {tab === 'mermas' && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <Input
                label="Desde"
                id="mermaDesde"
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
              />
              <Input
                label="Hasta"
                id="mermaHasta"
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
              />
              <Select
                label="Depósito"
                id="mermaDeposito"
                value={depositoId}
                onChange={e => setDepositoId(e.target.value)}
                options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                placeholder="Todos"
              />
              <Button onClick={fetchMermas} size="sm">
                <Filter size={14} /> Filtrar
              </Button>
              <ExportMenu size="sm" disabled={!mermas?.detalle?.length} getConfig={() => ({
                title: 'Reporte de Mermas',
                filename: `mermas-${fechaDesde}-${fechaHasta}`,
                subtitle: `${fechaDesde} al ${fechaHasta}`,
                headers: ['Fecha', 'Producto', 'Cantidad', 'Unidad', 'Motivo', 'Deposito', 'Usuario'],
                rows: (mermas?.detalle || []).map((d: any) => [
                  d.fecha, d.producto?.nombre || d.productoNombre || '', d.cantidad,
                  d.unidad, d.motivo, d.deposito?.nombre || d.depositoNombre || '',
                  d.usuario?.nombre || d.usuarioNombre || '',
                ]),
                summary: [
                  { label: 'Total items', value: mermas?.totalItems || 0 },
                  { label: 'Total unidades', value: mermas?.totalUnidades?.toFixed(1) || '0' },
                ],
                numberColumns: [2],
              } as ExportConfig)} />
            </div>
          </div>

          {/* Resumen cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass rounded-xl p-5">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Items</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{mermasTotal}</p>
            </div>
            <div className="glass rounded-xl p-5">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Cantidad</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{mermasCantidad}</p>
            </div>
            {mermas?.porMotivo && Object.entries(mermas.porMotivo).map(([motivo, count]) => (
              <div key={motivo} className="glass rounded-xl p-5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{motivo}</p>
                <p className="text-2xl font-extrabold text-destructive mt-1">{String(count)}</p>
              </div>
            ))}
          </div>

          {/* Detalle table */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Unidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Motivo</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Depósito</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mermas?.detalle?.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-surface-high/50 transition-colors">
                      <td className="p-3 text-xs text-on-surface-variant">{d.fecha}</td>
                      <td className="p-3 font-semibold text-foreground">{d.producto?.nombre || d.productoNombre}</td>
                      <td className="p-3 font-semibold text-foreground">{d.cantidad}</td>
                      <td className="p-3 text-on-surface-variant">{d.unidad}</td>
                      <td className="p-3"><Badge variant="danger">{d.motivo}</Badge></td>
                      <td className="p-3 text-xs text-on-surface-variant hidden md:table-cell">{d.deposito?.nombre || d.depositoNombre}</td>
                      <td className="p-3 text-xs text-on-surface-variant hidden lg:table-cell">{d.usuario?.nombre || d.usuarioNombre}</td>
                    </tr>
                  ))}
                  {(!mermas?.detalle || mermas.detalle.length === 0) && !loadingMermas && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">
                        {fechaDesde || fechaHasta || depositoId
                          ? 'No hay mermas registradas para los filtros seleccionados. Probá con otro rango o deposito.'
                          : 'Aplicá filtros de fecha o deposito y hacé clic en Filtrar para consultar las mermas.'}
                      </td>
                    </tr>
                  )}
                  {loadingMermas && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">
                        Cargando...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Stock Valorizado */}
      {tab === 'valorizado' && (
        <div className="space-y-4">
          {/* Filtros + Export */}
          <div className="glass rounded-xl p-4 flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Buscar producto</label>
                <input
                  type="text"
                  placeholder="Nombre o código..."
                  value={filtroStockBusqueda}
                  onChange={e => setFiltroStockBusqueda(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Rubro</label>
                <select
                  value={filtroStockRubro}
                  onChange={e => setFiltroStockRubro(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Todos los rubros</option>
                  {rubrosDisponibles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Proveedor</label>
                <select
                  value={filtroStockProveedor}
                  onChange={e => setFiltroStockProveedor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Todos los proveedores</option>
                  {proveedoresDisponibles.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(filtroStockRubro || filtroStockProveedor || filtroStockBusqueda) && (
                <button
                  onClick={() => { setFiltroStockRubro(''); setFiltroStockProveedor(''); setFiltroStockBusqueda(''); }}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:text-foreground hover:bg-surface-high transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
              <ExportMenu size="sm" disabled={stockValFiltrado.length === 0} getConfig={() => ({
                title: 'Stock Valorizado',
                filename: `stock-valorizado-${new Date().toISOString().split('T')[0]}`,
                headers: ['Producto', 'Rubro', 'Proveedor(es)', 'Stock Actual', 'Costo Unitario', 'Valor Total'],
                rows: stockValFiltrado.map(s => [
                  s.producto?.nombre || s.nombre || s.productoNombre || '',
                  s.rubro || s.producto?.rubro || '',
                  (s.proveedores || []).map((p: any) => p.nombre).join(', '),
                  s.stockTotal ?? s.stockActual ?? 0,
                  s.costoUnitario,
                  s.valorTotal,
                ]),
                summary: [
                  { label: 'Valor total stock', value: formatCurrency(stockGrandTotal) },
                  { label: 'Productos', value: stockValFiltrado.length },
                ],
                currencyColumns: [4, 5],
                numberColumns: [3],
              } as ExportConfig)} />
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rubro</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Proveedor(es)</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Costo Unit.</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stockValFiltrado.map((s, i) => {
                    const provs = (s.proveedores || []) as { id: number; nombre: string }[];
                    return (
                      <tr key={i} className="hover:bg-surface-high/50 transition-colors">
                        <td className="p-3 font-semibold text-foreground">
                          {s.producto?.nombre || s.nombre || s.productoNombre}
                          {s.producto?.codigo && (
                            <span className="block text-[10px] font-mono text-on-surface-variant/70">{s.producto.codigo}</span>
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {s.rubro || s.producto?.rubro ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-surface-high text-on-surface-variant font-semibold">{s.rubro || s.producto.rubro}</span>
                          ) : <span className="text-on-surface-variant/40">—</span>}
                        </td>
                        <td className="p-3 text-xs text-on-surface-variant">
                          {provs.length === 0 ? <span className="text-on-surface-variant/40">—</span> :
                            provs.length <= 2 ? provs.map(p => p.nombre).join(', ') :
                            <span title={provs.map(p => p.nombre).join(', ')}>{provs[0].nombre} +{provs.length - 1}</span>}
                        </td>
                        <td className="p-3 text-right font-semibold text-foreground tabular-nums">{s.stockTotal ?? s.stockActual ?? 0}</td>
                        <td className="p-3 text-right text-on-surface-variant tabular-nums">{fmtMoney(s.costoUnitario)}</td>
                        <td className="p-3 text-right font-semibold text-foreground tabular-nums">{fmtMoney(s.valorTotal)}</td>
                      </tr>
                    );
                  })}
                  {stockValFiltrado.length > 0 && (
                    <tr className="bg-surface-high/50">
                      <td className="p-3 font-extrabold text-foreground" colSpan={5}>
                        Total ({stockValFiltrado.length} producto{stockValFiltrado.length === 1 ? '' : 's'})
                      </td>
                      <td className="p-3 text-right font-extrabold text-primary text-base tabular-nums">{fmtMoney(stockGrandTotal)}</td>
                    </tr>
                  )}
                  {stockValFiltrado.length === 0 && stockVal.length > 0 && !loadingStock && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                        Ningún producto coincide con los filtros. <button onClick={() => { setFiltroStockRubro(''); setFiltroStockProveedor(''); setFiltroStockBusqueda(''); }} className="text-primary font-bold hover:underline">Limpiar</button>
                      </td>
                    </tr>
                  )}
                  {stockVal.length === 0 && !loadingStock && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                        No hay datos de stock valorizado. Verificá que existan productos con stock y costo unitario cargado.
                      </td>
                    </tr>
                  )}
                  {loadingStock && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                        Cargando...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Historial por producto */}
      {tab === 'historial' && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <Select
                label="Producto"
                id="histProducto"
                value={productoId}
                onChange={e => setProductoId(e.target.value)}
                options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
                placeholder="Seleccionar producto..."
              />
              <Input
                label="Desde"
                id="histDesde"
                type="date"
                value={fechaDesde}
                onChange={e => setFechaDesde(e.target.value)}
              />
              <Input
                label="Hasta"
                id="histHasta"
                type="date"
                value={fechaHasta}
                onChange={e => setFechaHasta(e.target.value)}
              />
              <Button onClick={fetchHistorial} size="sm" disabled={!productoId}>
                <Filter size={14} /> Filtrar
              </Button>
              <ExportMenu size="sm" disabled={historial.length === 0} getConfig={() => ({
                title: 'Historial de Producto',
                filename: `historial-producto-${productoId}`,
                subtitle: productos.find(p => String(p.id) === productoId)?.nombre || '',
                headers: ['Fecha', 'Tipo', 'Cantidad', 'Deposito Origen', 'Deposito Destino', 'Usuario', 'Observacion'],
                rows: historial.map(h => [
                  h.fecha, h.tipo, h.cantidad,
                  h.depositoOrigen?.nombre || '', h.depositoDestino?.nombre || '',
                  h.usuario?.nombre || h.usuarioNombre || '', h.observacion || '',
                ]),
                numberColumns: [2],
              } as ExportConfig)} />
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Depósito</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Usuario</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historial.map((h, i) => (
                    <tr key={i} className="hover:bg-surface-high/50 transition-colors">
                      <td className="p-3 text-xs text-on-surface-variant">{h.fecha} {h.hora}</td>
                      <td className="p-3"><Badge variant={tipoBadge[h.tipo] || 'default'}>{h.tipo}</Badge></td>
                      <td className="p-3 font-semibold text-foreground">{h.cantidad} <span className="text-on-surface-variant font-normal">{h.unidad}</span></td>
                      <td className="p-3 text-xs text-on-surface-variant hidden md:table-cell">
                        {h.depositoOrigen?.nombre && <span>{h.depositoOrigen.nombre}</span>}
                        {h.depositoOrigen?.nombre && h.depositoDestino?.nombre && <span className="text-primary mx-1">&rarr;</span>}
                        {h.depositoDestino?.nombre && <span>{h.depositoDestino.nombre}</span>}
                      </td>
                      <td className="p-3 text-xs text-on-surface-variant hidden lg:table-cell">{h.usuario?.nombre || h.usuarioNombre}</td>
                      <td className="p-3 text-xs text-on-surface-variant hidden lg:table-cell">{h.observacion || '—'}</td>
                    </tr>
                  ))}
                  {historial.length === 0 && !loadingHistorial && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                        {productoId
                          ? 'No hay movimientos para este producto en el periodo seleccionado. Probá ampliando las fechas.'
                          : 'Seleccioná un producto y hacé clic en Filtrar para ver su historial de movimientos.'}
                      </td>
                    </tr>
                  )}
                  {loadingHistorial && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                        Cargando...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
