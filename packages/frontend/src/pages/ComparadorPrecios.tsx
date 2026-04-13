import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { buildWALink, buildOrderMessage } from '../lib/whatsapp';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import SearchableSelect from '../components/ui/SearchableSelect';
import { BarChart3, TrendingUp, ShoppingCart, Send, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function defaultDesde() {
  const d = new Date(); d.setDate(d.getDate() - 90);
  return d.toISOString().split('T')[0];
}
const todayStr = () => new Date().toISOString().split('T')[0];
const fmt = (n: number | null) => n != null ? `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : '-';

export default function ComparadorPrecios() {
  const [data, setData] = useState<any[]>([]);
  const [proveedoresImp, setProveedoresImp] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [desde, setDesde] = useState(defaultDesde());
  const [hasta, setHasta] = useState(todayStr());
  const [catFilter, setCatFilter] = useState('');
  const [search, setSearch] = useState('');
  const [conImpuestos, setConImpuestos] = useState(false);
  const [soloVariaciones, setSoloVariaciones] = useState(false);

  // Tabs
  const [tab, setTab] = useState<'ultima' | 'evolucion' | 'lista'>('ultima');

  // Evolution
  const [evoProductoId, setEvoProductoId] = useState('');
  const [evoData, setEvoData] = useState<any[]>([]);
  const [evoLoading, setEvoLoading] = useState(false);

  // Shopping list
  const [listaItems, setListaItems] = useState<{ productoId: number; codigo: string; nombre: string; cantidad: number; unidad: string }[]>([]);
  const [listaProveedorId, setListaProveedorId] = useState('');

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [d, pi, p] = await Promise.all([
        api.getComparativa({ desde, hasta }),
        api.getProveedoresImpuestos(),
        api.getProductos({ activo: 'true' }),
      ]);
      setData(d);
      setProveedoresImp(pi);
      setProductos(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [desde, hasta]);

  // Proveedor map for multiplier
  const provMap = useMemo(() => {
    const m: Record<number, any> = {};
    proveedoresImp.forEach(p => { m[p.id] = p; });
    return m;
  }, [proveedoresImp]);

  const getMultiplicador = (provId: number) => provMap[provId]?.multiplicador || 1;

  const adjustPrice = (precio: number | null, provId: number) => {
    if (precio == null) return null;
    return conImpuestos ? precio * getMultiplicador(provId) : precio;
  };

  // Categories from data
  const categorias = useMemo(() => [...new Set(data.map(d => d.categoria).filter(Boolean))].sort(), [data]);

  // Group by product
  const grouped = useMemo(() => {
    const g: Record<string, { productoId: number; codigo: string; nombre: string; categoria: string; rows: any[] }> = {};
    data.forEach(row => {
      if (!row.codigoProducto) return;
      if (!g[row.codigoProducto]) {
        g[row.codigoProducto] = { productoId: row.productoId, codigo: row.codigoProducto, nombre: row.productoEstandar, categoria: row.categoria, rows: [] };
      }
      g[row.codigoProducto].rows.push(row);
    });
    return g;
  }, [data]);

  // Get latest price per proveedor
  const getUltima = (rows: any[]) => {
    const byProv: Record<number, any> = {};
    rows.forEach(r => {
      if (!byProv[r.proveedorId] || (r.fecha || '') > (byProv[r.proveedorId].fecha || '')) byProv[r.proveedorId] = r;
    });
    return Object.values(byProv);
  };

  // Filtered entries
  const entries = useMemo(() => {
    return Object.entries(grouped).filter(([cod, g]) => {
      if (catFilter && g.categoria !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!g.nombre?.toLowerCase().includes(q) && !cod.toLowerCase().includes(q)) return false;
      }
      if (soloVariaciones) {
        const prices = getUltima(g.rows).map(r => adjustPrice(r.precioPorMedidaBase || r.precioPorUnidad, r.proveedorId)).filter(p => p != null && p > 0) as number[];
        if (prices.length < 2 || Math.max(...prices) === Math.min(...prices)) return false;
      }
      return true;
    });
  }, [grouped, catFilter, search, soloVariaciones, conImpuestos, provMap]);

  // All proveedores that appear in data
  const proveedoresEnData = useMemo(() => {
    const ids = new Set(data.map(d => d.proveedorId));
    return proveedoresImp.filter(p => ids.has(p.id));
  }, [data, proveedoresImp]);

  // Load evolution
  const cargarEvolucion = async (prodId: string) => {
    setEvoProductoId(prodId);
    if (!prodId) { setEvoData([]); return; }
    setEvoLoading(true);
    try {
      const d = await api.getEvolucion(Number(prodId), { desde, hasta });
      setEvoData(d);
    } catch (e) { console.error(e); }
    setEvoLoading(false);
  };

  // Shopping list helpers
  const addToLista = (productoId: number, codigo: string, nombre: string) => {
    if (listaItems.find(i => i.productoId === productoId)) return;
    setListaItems(prev => [...prev, { productoId, codigo, nombre, cantidad: 1, unidad: 'kg' }]);
  };
  const removeLista = (productoId: number) => setListaItems(prev => prev.filter(i => i.productoId !== productoId));
  const updateListaCant = (productoId: number, cantidad: number) =>
    setListaItems(prev => prev.map(i => i.productoId === productoId ? { ...i, cantidad } : i));

  const listaTotal = useMemo(() => {
    if (!listaProveedorId) return 0;
    return listaItems.reduce((sum, item) => {
      const g = grouped[item.codigo];
      if (!g) return sum;
      const ultima = getUltima(g.rows).find(r => r.proveedorId === Number(listaProveedorId));
      if (!ultima) return sum;
      const precio = adjustPrice(ultima.precioPorUnidad || ultima.precioInformado, ultima.proveedorId) || 0;
      return sum + precio * item.cantidad;
    }, 0);
  }, [listaItems, listaProveedorId, grouped, conImpuestos, provMap]);

  const enviarWhatsApp = () => {
    const prov = proveedoresImp.find(p => p.id === Number(listaProveedorId));
    if (!prov?.whatsapp) { alert('El proveedor no tiene WhatsApp configurado'); return; }
    const msg = buildOrderMessage({
      proveedor: prov.nombre,
      items: listaItems.map(i => ({ producto: i.nombre, cantidad: i.cantidad, unidad: i.unidad })),
      total: listaTotal,
    });
    const link = buildWALink(prov.whatsapp, msg);
    if (link) window.open(link, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Comparador de Precios</h1>
          <p className="text-sm text-zinc-400 mt-1">Compara precios entre proveedores con listas importadas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg w-fit">
        {[
          { key: 'ultima' as const, label: 'Ultima', icon: BarChart3 },
          { key: 'evolucion' as const, label: 'Evolucion', icon: TrendingUp },
          { key: 'lista' as const, label: 'Lista de Compra', icon: ShoppingCart },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors ${tab === t.key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <label className="block text-xs text-zinc-400 mb-1">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" />
        </div>
        <div className="w-40">
          <label className="block text-xs text-zinc-400 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm" />
        </div>
        <div className="w-44">
          <Select label="Categoria" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="w-52">
          <Input label="Buscar" value={search} onChange={e => setSearch(e.target.value)} placeholder="Codigo o nombre..." />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={conImpuestos} onChange={e => setConImpuestos(e.target.checked)} className="accent-orange-500" />
          Con impuestos
        </label>
        {tab === 'ultima' && (
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={soloVariaciones} onChange={e => setSoloVariaciones(e.target.checked)} className="accent-orange-500" />
            Solo variaciones
          </label>
        )}
      </div>

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-400 inline" /></div>}

      {/* TAB: Ultima */}
      {!loading && tab === 'ultima' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Categoria</th>
                {proveedoresEnData.map(p => (
                  <th key={p.id} className="px-3 py-3 text-right text-xs">{p.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={2 + proveedoresEnData.length} className="py-8 text-center text-zinc-500">Sin datos</td></tr>
              )}
              {entries.slice(0, 100).map(([cod, g]) => {
                const ultimas = getUltima(g.rows);
                const priceMap: Record<number, number | null> = {};
                ultimas.forEach(r => {
                  priceMap[r.proveedorId] = adjustPrice(r.precioPorMedidaBase || r.precioPorUnidad, r.proveedorId);
                });
                const allPrices = Object.values(priceMap).filter(p => p != null && p > 0) as number[];
                const minPrice = allPrices.length ? Math.min(...allPrices) : null;

                return (
                  <tr key={cod} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-2">
                      <span className="text-white">{g.nombre}</span>
                      <span className="text-zinc-500 text-xs ml-2">{cod}</span>
                    </td>
                    <td className="px-4 py-2 text-zinc-400 text-xs">{g.categoria}</td>
                    {proveedoresEnData.map(p => {
                      const price = priceMap[p.id];
                      const isMin = price != null && price === minPrice && allPrices.length > 1;
                      return (
                        <td key={p.id} className={`px-3 py-2 text-right font-mono text-xs ${isMin ? 'text-green-400 font-bold' : price != null ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          {fmt(price ?? null)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {entries.length > 100 && <p className="text-xs text-zinc-500 px-4 py-2">Mostrando 100 de {entries.length}</p>}
        </div>
      )}

      {/* TAB: Evolucion */}
      {!loading && tab === 'evolucion' && (
        <div className="space-y-4">
          <div className="w-72">
            <SearchableSelect
              options={productos.map(p => ({ value: String(p.id), label: `${p.codigo} - ${p.nombre}` }))}
              value={evoProductoId}
              onChange={val => cargarEvolucion(val)}
              placeholder="Seleccionar producto..."
            />
          </div>

          {evoLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
          {!evoLoading && evoData.length > 0 && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Proveedor</th>
                    <th className="px-4 py-3 text-left">Presentacion</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                    <th className="px-4 py-3 text-right">$/Unidad</th>
                    <th className="px-4 py-3 text-right">$/Base</th>
                  </tr>
                </thead>
                <tbody>
                  {evoData.map((r: any, i: number) => {
                    const prev = i > 0 ? evoData[i - 1] : null;
                    const change = prev && prev.precioPorUnidad && r.precioPorUnidad
                      ? ((r.precioPorUnidad - prev.precioPorUnidad) / prev.precioPorUnidad * 100) : null;
                    return (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2 text-zinc-300">{r.fecha}</td>
                        <td className="px-4 py-2 text-white">{r.proveedorNombre}</td>
                        <td className="px-4 py-2 text-zinc-400 text-xs">{r.presentacionOriginal || '-'}</td>
                        <td className="px-4 py-2 text-right text-zinc-300">{fmt(r.precioInformado)}</td>
                        <td className="px-4 py-2 text-right text-zinc-300">{fmt(r.precioPorUnidad)}</td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-zinc-300">{fmt(r.precioPorMedidaBase)}</span>
                          {change != null && (
                            <span className={`ml-2 text-xs ${change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-zinc-500'}`}>
                              {change > 0 ? <ArrowUpRight className="w-3 h-3 inline" /> : change < 0 ? <ArrowDownRight className="w-3 h-3 inline" /> : null}
                              {Math.abs(change).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!evoLoading && evoProductoId && evoData.length === 0 && (
            <p className="text-zinc-500 text-center py-8">Sin datos de precios para este producto</p>
          )}
        </div>
      )}

      {/* TAB: Lista de Compra */}
      {!loading && tab === 'lista' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Agregar productos</h3>
              <SearchableSelect
                options={Object.entries(grouped).map(([cod, g]) => ({ value: cod, label: `${cod} - ${g.nombre}` }))}
                value=""
                onChange={(val) => {
                  const g = grouped[val];
                  if (g) addToLista(g.productoId, val, g.nombre);
                }}
                placeholder="Buscar producto..."
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Proveedor para cotizar</h3>
              <Select value={listaProveedorId} onChange={e => setListaProveedorId(e.target.value)}>
                <option value="">Seleccionar proveedor...</option>
                {proveedoresEnData.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
            </div>
          </div>

          {listaItems.length > 0 && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="px-4 py-3 text-left">Producto</th>
                    <th className="px-4 py-3 text-center w-24">Cantidad</th>
                    {listaProveedorId && <th className="px-4 py-3 text-right">Precio Unit.</th>}
                    {listaProveedorId && <th className="px-4 py-3 text-right">Subtotal</th>}
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {listaItems.map(item => {
                    const g = grouped[item.codigo];
                    let precioUnit: number | null = null;
                    if (g && listaProveedorId) {
                      const ultima = getUltima(g.rows).find(r => r.proveedorId === Number(listaProveedorId));
                      if (ultima) precioUnit = adjustPrice(ultima.precioPorUnidad || ultima.precioInformado, ultima.proveedorId);
                    }
                    return (
                      <tr key={item.productoId} className="border-b border-zinc-800/50">
                        <td className="px-4 py-2 text-white">{item.nombre} <span className="text-zinc-500 text-xs">{item.codigo}</span></td>
                        <td className="px-4 py-2 text-center">
                          <input type="number" min={0.1} step={0.1} value={item.cantidad}
                            onChange={e => updateListaCant(item.productoId, Number(e.target.value))}
                            className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-center text-sm" />
                        </td>
                        {listaProveedorId && <td className="px-4 py-2 text-right text-zinc-300">{fmt(precioUnit)}</td>}
                        {listaProveedorId && <td className="px-4 py-2 text-right text-white font-medium">{precioUnit != null ? fmt(precioUnit * item.cantidad) : '-'}</td>}
                        <td className="px-4 py-2">
                          <button onClick={() => removeLista(item.productoId)} className="text-zinc-500 hover:text-red-400">x</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {listaProveedorId && (
                  <tfoot>
                    <tr className="border-t border-zinc-700">
                      <td colSpan={3} className="px-4 py-3 text-right text-zinc-300 font-medium">Total:</td>
                      <td className="px-4 py-3 text-right text-white font-bold text-base">{fmt(listaTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {listaItems.length > 0 && listaProveedorId && (
            <div className="flex gap-2">
              <Button onClick={enviarWhatsApp}>
                <Send className="w-4 h-4 mr-2" /> Enviar por WhatsApp
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
