import { Fragment, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { buildWALink, buildOrderMessage } from '../lib/whatsapp';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import SearchableSelect from '../components/ui/SearchableSelect';
import MatchListaIAModal from '../components/MatchListaIAModal';
import { BarChart3, TrendingUp, ShoppingCart, Send, Loader2, ArrowUpRight, ArrowDownRight, Sparkles, Upload, AlertTriangle, ChevronDown, ChevronRight, Pencil, Check, X as XIcon, Info } from 'lucide-react';

// Rubros sugeridos para el editor inline de categoría. Mismos que Proveedores.tsx
// + rubros comunes en gastronomía, para que un click alcance.
const RUBROS_SUGERIDOS = [
  'Verdulería', 'Carnicería', 'Fiambrería', 'Bebidas', 'Limpieza',
  'Descartables', 'Lácteos', 'Secos/Almacén', 'Panadería', 'Congelados',
  'Especias', 'Aceites', 'Pescadería', 'General',
];

function defaultDesde() {
  const d = new Date(); d.setDate(d.getDate() - 90);
  return d.toISOString().split('T')[0];
}
const todayStr = () => new Date().toISOString().split('T')[0];
const fmt = (n: number | null) => n != null ? `$${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : '-';

export default function ComparadorPrecios() {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [proveedoresImp, setProveedoresImp] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Listas con items pendientes — usado para el empty state que le dice al
  // usuario "importaste pero falta vincular". Cargado en paralelo con la
  // comparativa para no agregar latencia.
  const [listasPendientes, setListasPendientes] = useState<any[]>([]);
  const [totalListas, setTotalListas] = useState(0);

  // Modal match-ia
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchLista, setMatchLista] = useState<{
    id: number;
    codigo?: string;
    proveedorNombre?: string;
    pendientes?: number;
  } | null>(null);

  const abrirMatchIA = (lista: any) => {
    setMatchLista({
      id: lista.id,
      codigo: lista.codigo,
      proveedorNombre: lista.proveedor?.nombre,
      pendientes: lista.stats?.pendientes,
    });
    setMatchOpen(true);
  };

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

  // Shopping list — ya no hay "proveedor seleccionado"; el tab compara
  // precios de TODOS los proveedores en paralelo y totaliza por cada uno.
  const [listaItems, setListaItems] = useState<{ productoId: number; codigo: string; nombre: string; cantidad: number; unidad: string }[]>([]);

  // UI state: fila expandida para detalle + edición inline de categoría.
  // `expandedCode` es el código del producto con detalle abierto (uno por vez).
  // `editingCatCode` es el código del producto cuya categoría se está editando.
  // Overrides locales permiten reflejar el cambio sin recargar todo el comparativo.
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [editingCatCode, setEditingCatCode] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState('');
  const [categoriaOverrides, setCategoriaOverrides] = useState<Record<string, string>>({});
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [d, pi, p, listas] = await Promise.all([
        api.getComparativa({ desde, hasta }),
        api.getProveedoresImpuestos(),
        api.getProductos({ activo: 'true' }),
        api.getListasPrecio().catch(() => [] as any[]),
      ]);
      setData(d);
      setProveedoresImp(pi);
      setProductos(p);
      setTotalListas(Array.isArray(listas) ? listas.length : 0);
      // Filtramos listas con pendientes > 0 para el empty state del "importaste
      // pero no vinculaste" — ordenadas por cantidad descendente para poner
      // primero las que más desbloquean el Comparador.
      setListasPendientes(
        (Array.isArray(listas) ? listas : [])
          .filter((l: any) => (l.stats?.pendientes ?? 0) > 0)
          .sort((a: any, b: any) => (b.stats?.pendientes ?? 0) - (a.stats?.pendientes ?? 0))
      );
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

  // ── Edición inline de categoría/rubro ─────────────────────────────────────
  // El cliente pidió poder corregir errores de categorización de la IA desde
  // acá, sin tener que ir a Productos. Al guardar llamamos a updateProducto
  // con { rubro: nuevoValor } y aplicamos un override local para no esperar
  // el round-trip completo del getComparativa.
  const iniciarEditCat = (codigo: string, valorActual: string) => {
    setEditingCatCode(codigo);
    setEditingCatValue(valorActual || '');
  };
  const cancelarEditCat = () => {
    setEditingCatCode(null);
    setEditingCatValue('');
  };
  const guardarEditCat = async (codigo: string, productoId: number) => {
    const nuevo = editingCatValue.trim();
    if (!nuevo || savingCat) return;
    setSavingCat(true);
    try {
      await api.updateProducto(productoId, { rubro: nuevo });
      setCategoriaOverrides(prev => ({ ...prev, [codigo]: nuevo }));
      cancelarEditCat();
    } catch (e) {
      console.error('[comparador] updateProducto', e);
    }
    setSavingCat(false);
  };

  // Obtener la categoría visible (override local > categoría del dato).
  const getCategoria = (codigo: string, fallback: string) =>
    categoriaOverrides[codigo] ?? fallback;

  // Expand / collapse de fila. Si la misma fila se clickea, toggle.
  const toggleExpand = (codigo: string) => {
    setExpandedCode(prev => (prev === codigo ? null : codigo));
  };

  // Helper: info adicional para el detalle expandido. Busca stock y unidad
  // del producto en el listado general.
  const prodInfo = (productoId: number) => {
    const p = productos.find(pr => pr.id === productoId);
    return p ? { unidad: p.unidadUso, subrubro: p.subrubro, stockMinimo: p.stockMinimo } : null;
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

      {/* Filtros — contextuales por tab.
          Antes se mostraban todos los filtros siempre, incluyendo el input
          "Buscar" del header en el tab Lista de Compra donde NO aplica (ese
          tab tiene su propio SearchableSelect para agregar productos). El
          usuario veía dos buscadores y el de arriba "no andaba" — porque
          efectivamente filtraba la grilla de Última que ese tab no mostraba. */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Rango de fechas: relevante para Última y Evolución */}
        {tab !== 'lista' && (
          <>
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
          </>
        )}
        {/* Categoría + Buscar: solo aplican a la grilla de Última */}
        {tab === 'ultima' && (
          <>
            <div className="w-44">
              <Select label="Categoria" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div className="w-52">
              <Input label="Buscar" value={search} onChange={e => setSearch(e.target.value)} placeholder="Codigo o nombre..." />
            </div>
          </>
        )}
        {/* Con impuestos aplica a todos los tabs (afecta precios mostrados) */}
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

      {/* ═══ Banner de listas pendientes de vincular ═══
          Caso crítico: el usuario importó una lista pero todos los items
          quedaron en estadoMatch='PENDIENTE' porque el auto-match exacto por
          nombre no encontró coincidencias. El Comparador filtra por OK → 0
          resultados. Sin este banner, "muere ahí" como dijo el cliente. */}
      {!loading && data.length === 0 && listasPendientes.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">
                Tenés {listasPendientes.reduce((sum, l) => sum + (l.stats?.pendientes ?? 0), 0)} productos importados sin vincular
              </p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-2xl">
                Los productos que importaste todavía no están vinculados a tu catálogo, por
                eso el Comparador no los muestra. Vinculá con IA y en un minuto van a aparecer
                acá con precios comparables entre proveedores.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {listasPendientes.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {l.proveedor?.nombre || 'Proveedor desconocido'}
                    <span className="ml-2 text-[10px] font-bold text-primary uppercase tracking-widest">
                      {l.codigo}
                    </span>
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    <strong className="text-amber-400">{l.stats?.pendientes ?? 0}</strong>{' '}
                    pendientes
                    {l.stats?.ok > 0 && (
                      <span className="text-on-surface-variant/60">
                        {' '}· {l.stats.ok} ya vinculados
                      </span>
                    )}
                    <span className="text-on-surface-variant/60"> · importada {l.fecha}</span>
                  </p>
                </div>
                <Button size="sm" onClick={() => abrirMatchIA(l)}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Vincular con IA
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state cuando no hay NINGUNA lista todavía */}
      {!loading && data.length === 0 && listasPendientes.length === 0 && totalListas === 0 && (
        <div className="rounded-xl border border-border bg-surface p-10 text-center space-y-4">
          <div className="inline-flex w-14 h-14 rounded-full bg-primary/10 items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Todavía no hay listas de precios</p>
            <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto">
              Subí una lista de algún proveedor (PDF o Excel) y la IA extrae los
              precios automáticamente para comparar entre proveedores.
            </p>
          </div>
          <Button onClick={() => navigate('/importar-lista')}>
            <Upload className="w-4 h-4" />
            Importar primera lista
          </Button>
        </div>
      )}

      {/* TAB: Ultima */}
      {!loading && tab === 'ultima' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-auto">
          {/* Hint discreto sobre interactividad */}
          <p className="px-4 pt-3 pb-1 text-[11px] text-zinc-500 flex items-center gap-1.5">
            <Info size={11} /> Tocá una fila para ver el detalle · clic en la categoría para corregirla
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-2 py-3 w-6"></th>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">Categoria</th>
                {proveedoresEnData.map(p => (
                  <th key={p.id} className="px-3 py-3 text-right text-xs">{p.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={3 + proveedoresEnData.length} className="py-8 text-center text-zinc-500">Sin datos</td></tr>
              )}
              {entries.slice(0, 100).map(([cod, g]) => {
                const ultimas = getUltima(g.rows);
                // Mapa por proveedor con el registro COMPLETO (no solo el precio)
                // — así podemos mostrar la presentación en el detalle.
                const rowByProv: Record<number, any> = {};
                const priceMap: Record<number, number | null> = {};
                ultimas.forEach(r => {
                  rowByProv[r.proveedorId] = r;
                  priceMap[r.proveedorId] = adjustPrice(r.precioPorMedidaBase || r.precioPorUnidad, r.proveedorId);
                });
                const allPrices = Object.values(priceMap).filter(p => p != null && p > 0) as number[];
                const minPrice = allPrices.length ? Math.min(...allPrices) : null;
                const maxPrice = allPrices.length ? Math.max(...allPrices) : null;
                // "Imposible": variación > 3x entre min y max → probablemente
                // unidades/presentaciones incompatibles entre proveedores.
                const discrepanciaGrande = minPrice && maxPrice && maxPrice / minPrice > 3;
                const expanded = expandedCode === cod;
                const categoriaMostrada = getCategoria(cod, g.categoria);
                const editandoCat = editingCatCode === cod;
                const info = prodInfo(g.productoId);

                return (
                  <Fragment key={cod}>
                    <tr
                      onClick={() => toggleExpand(cod)}
                      className={`border-b border-zinc-800/50 cursor-pointer ${expanded ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/30'}`}
                    >
                      <td className="px-2 py-2 text-zinc-500">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-white">{g.nombre}</span>
                        <span className="text-zinc-500 text-xs ml-2">{cod}</span>
                        {discrepanciaGrande && (
                          <span
                            className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400"
                            title={`Variación ${(maxPrice! / minPrice!).toFixed(1)}× entre el más caro y el más barato — probablemente presentaciones distintas`}
                            onClick={e => { e.stopPropagation(); setExpandedCode(cod); }}
                          >
                            <AlertTriangle size={9} /> Revisar unidades
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-2 text-xs group"
                        onClick={e => { if (!editandoCat) { e.stopPropagation(); iniciarEditCat(cod, categoriaMostrada); } }}
                      >
                        {editandoCat ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              list={`rubros-${cod}`}
                              value={editingCatValue}
                              onChange={e => setEditingCatValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); guardarEditCat(cod, g.productoId); }
                                if (e.key === 'Escape') cancelarEditCat();
                              }}
                              autoFocus
                              className="flex-1 min-w-[100px] px-2 py-1 rounded bg-zinc-800 border border-primary/50 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="Categoría..."
                            />
                            <datalist id={`rubros-${cod}`}>
                              {Array.from(new Set([...RUBROS_SUGERIDOS, ...categorias])).map(r => (
                                <option key={r} value={r} />
                              ))}
                            </datalist>
                            <button
                              onClick={() => guardarEditCat(cod, g.productoId)}
                              disabled={savingCat}
                              className="p-1 rounded bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-50"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={cancelarEditCat}
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                            >
                              <XIcon size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400">{categoriaMostrada || <span className="italic text-zinc-600">Sin categoría</span>}</span>
                            <Pencil size={10} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>
                      {proveedoresEnData.map(p => {
                        const price = priceMap[p.id];
                        const row = rowByProv[p.id];
                        const isMin = price != null && price === minPrice && allPrices.length > 1;
                        return (
                          <td
                            key={p.id}
                            className={`px-3 py-2 text-right font-mono text-xs ${isMin ? 'text-green-400 font-bold' : price != null ? 'text-zinc-300' : 'text-zinc-600'}`}
                            title={row?.presentacionOriginal ? `Presentación: ${row.presentacionOriginal}` : undefined}
                          >
                            {fmt(price ?? null)}
                          </td>
                        );
                      })}
                    </tr>
                    {expanded && (
                      <tr key={`${cod}-detail`} className="border-b border-zinc-800/70 bg-zinc-900/80">
                        <td></td>
                        <td colSpan={2 + proveedoresEnData.length} className="px-4 py-3">
                          <div className="space-y-3">
                            {/* Info del producto */}
                            <div className="flex flex-wrap gap-4 text-[11px] text-zinc-400">
                              {info?.unidad && <span><span className="text-zinc-500">Unidad de uso:</span> <span className="text-zinc-200">{info.unidad}</span></span>}
                              {info?.subrubro && <span><span className="text-zinc-500">Subrubro:</span> <span className="text-zinc-200">{info.subrubro}</span></span>}
                              {info?.stockMinimo != null && <span><span className="text-zinc-500">Stock mínimo:</span> <span className="text-zinc-200">{info.stockMinimo} {info.unidad}</span></span>}
                            </div>

                            {/* Tabla con precio / presentación / fecha por proveedor.
                                Acá se ven las "discrepancias imposibles": un proveedor
                                vende "CAJA x12" a $7.820 y otro "UNIDAD" a $4.833 —
                                la presentación explica el delta, no es un bug. */}
                            <div className="overflow-x-auto">
                              <table className="text-[11px] w-full">
                                <thead>
                                  <tr className="text-zinc-500 border-b border-zinc-800">
                                    <th className="px-2 py-1.5 text-left font-medium">Proveedor</th>
                                    <th className="px-2 py-1.5 text-left font-medium">Presentación</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Precio informado</th>
                                    <th className="px-2 py-1.5 text-right font-medium">$ / unidad</th>
                                    <th className="px-2 py-1.5 text-right font-medium">$ / base (kg/l)</th>
                                    <th className="px-2 py-1.5 text-right font-medium">Fecha</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {proveedoresEnData.map(p => {
                                    const r = rowByProv[p.id];
                                    if (!r) {
                                      return (
                                        <tr key={p.id} className="text-zinc-600">
                                          <td className="px-2 py-1.5">{p.nombre}</td>
                                          <td colSpan={5} className="px-2 py-1.5 italic">Sin datos recientes</td>
                                        </tr>
                                      );
                                    }
                                    const ppu = adjustPrice(r.precioPorUnidad, r.proveedorId);
                                    const ppb = adjustPrice(r.precioPorMedidaBase, r.proveedorId);
                                    const inf = adjustPrice(r.precioInformado, r.proveedorId);
                                    return (
                                      <tr key={p.id} className="text-zinc-300 hover:bg-zinc-800/40">
                                        <td className="px-2 py-1.5 text-white">{p.nombre}</td>
                                        <td className="px-2 py-1.5 text-zinc-400">
                                          {r.presentacionOriginal || <span className="italic text-zinc-600">sin presentación</span>}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-mono">{fmt(inf)}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{fmt(ppu)}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{fmt(ppb)}</td>
                                        <td className="px-2 py-1.5 text-right text-zinc-500">{r.fecha || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={e => { e.stopPropagation(); navigate(`/productos?id=${g.productoId}`); }}
                                className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-wider"
                              >
                                Editar producto →
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setTab('evolucion'); cargarEvolucion(String(g.productoId)); }}
                                className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 uppercase tracking-wider"
                              >
                                Ver evolución →
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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

      {/* TAB: Lista de Compra
          Armá una lista, la app compara precios entre TODOS los proveedores
          al mismo tiempo y muestra el total por proveedor. Antes solo
          mostraba 1 proveedor a la vez (Select "Proveedor para cotizar"),
          lo que hacía que el nombre del tab "Lista de Compra" fuera en
          realidad una cotización individual. El cliente pedía ver los
          precios en paralelo para decidir a quién comprarle cada cosa, y
          el total a pagar con cada proveedor. */}
      {!loading && tab === 'lista' && (
        <div className="space-y-4">
          <div className="max-w-md">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">Agregar productos a la lista</h3>
            <SearchableSelect
              options={Object.entries(grouped).map(([cod, g]) => ({ value: cod, label: `${cod} - ${g.nombre}` }))}
              value=""
              onChange={(val) => {
                const g = grouped[val];
                if (g) addToLista(g.productoId, val, g.nombre);
              }}
              placeholder="Buscar producto..."
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Sumá los productos que querés cotizar. El total se calcula por proveedor con el último precio disponible.
            </p>
          </div>

          {listaItems.length === 0 && (
            <div className="bg-zinc-900/60 border border-zinc-800 border-dashed rounded-lg p-8 text-center">
              <ShoppingCart className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">La lista está vacía</p>
              <p className="text-xs text-zinc-500 mt-1">Agregá al menos un producto arriba para empezar a comparar.</p>
            </div>
          )}

          {listaItems.length > 0 && proveedoresEnData.length > 0 && (() => {
            // Pre-calcular matriz precio[producto][proveedor] y totales por proveedor.
            // Esto se hace dentro del JSX con un IIFE para no ensuciar el render
            // principal con más hooks — es un tab, no se re-renderiza seguido.
            const matriz: Record<number, Record<number, number | null>> = {};
            const totalPorProveedor: Record<number, { total: number; cobertura: number }> = {};
            proveedoresEnData.forEach(p => { totalPorProveedor[p.id] = { total: 0, cobertura: 0 }; });

            for (const item of listaItems) {
              matriz[item.productoId] = {};
              const g = grouped[item.codigo];
              if (!g) { proveedoresEnData.forEach(p => { matriz[item.productoId][p.id] = null; }); continue; }
              const ultimas = getUltima(g.rows);
              const byProv: Record<number, any> = {};
              ultimas.forEach(r => { byProv[r.proveedorId] = r; });
              for (const p of proveedoresEnData) {
                const r = byProv[p.id];
                const precio = r ? adjustPrice(r.precioPorUnidad || r.precioInformado, p.id) : null;
                matriz[item.productoId][p.id] = precio;
                if (precio != null && precio > 0) {
                  totalPorProveedor[p.id].total += precio * item.cantidad;
                  totalPorProveedor[p.id].cobertura += 1;
                }
              }
            }

            // Mejor total entre los que cubren TODOS los items — si ninguno
            // cubre todos, comparamos los que cubren más items.
            const proveedorIdsOrdenados = [...proveedoresEnData].map(p => p.id);
            const coberturaMax = Math.max(...proveedorIdsOrdenados.map(id => totalPorProveedor[id].cobertura));
            const candidatos = proveedorIdsOrdenados.filter(id =>
              totalPorProveedor[id].cobertura === coberturaMax && totalPorProveedor[id].total > 0
            );
            const mejorProvId = candidatos.length
              ? candidatos.reduce((a, b) => totalPorProveedor[a].total <= totalPorProveedor[b].total ? a : b)
              : null;

            return (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-3 py-3 text-left sticky left-0 bg-zinc-900 z-10 min-w-[200px]">Producto</th>
                      <th className="px-3 py-3 text-center w-24">Cantidad</th>
                      {proveedoresEnData.map(p => (
                        <th key={p.id} className={`px-3 py-3 text-right text-xs min-w-[100px] ${mejorProvId === p.id ? 'text-green-400' : ''}`}>
                          {p.nombre}
                          {mejorProvId === p.id && <span className="block text-[9px] font-normal opacity-80">✓ Más barato</span>}
                        </th>
                      ))}
                      <th className="px-3 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaItems.map(item => {
                      const precios = matriz[item.productoId] || {};
                      const preciosValidos = Object.values(precios).filter((p): p is number => p != null && p > 0);
                      const minPrecio = preciosValidos.length ? Math.min(...preciosValidos) : null;
                      return (
                        <tr key={item.productoId} className="border-b border-zinc-800/50">
                          <td className="px-3 py-2 text-white sticky left-0 bg-zinc-900 z-10">
                            {item.nombre}
                            <span className="text-zinc-500 text-xs ml-2">{item.codigo}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="number" min={0.1} step={0.1} value={item.cantidad}
                              onChange={e => updateListaCant(item.productoId, Number(e.target.value))}
                              className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-center text-sm" />
                          </td>
                          {proveedoresEnData.map(p => {
                            const precio = precios[p.id];
                            const isMin = precio != null && precio === minPrecio && preciosValidos.length > 1;
                            const subtotal = precio != null ? precio * item.cantidad : null;
                            return (
                              <td key={p.id} className={`px-3 py-2 text-right font-mono text-xs ${isMin ? 'text-green-400 font-bold' : precio != null ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                {subtotal != null ? fmt(subtotal) : '—'}
                                {precio != null && (
                                  <span className="block text-[9px] text-zinc-500 font-normal">{fmt(precio)} c/u</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2">
                            <button onClick={() => removeLista(item.productoId)} className="text-zinc-500 hover:text-red-400" title="Quitar de la lista">×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-700 bg-zinc-900/80">
                      <td colSpan={2} className="px-3 py-3 text-right text-zinc-300 font-bold sticky left-0 bg-zinc-900 z-10">Total:</td>
                      {proveedoresEnData.map(p => {
                        const t = totalPorProveedor[p.id];
                        const esMejor = mejorProvId === p.id;
                        const coberturaIncompleta = t.cobertura < listaItems.length;
                        return (
                          <td key={p.id} className={`px-3 py-3 text-right font-bold ${esMejor ? 'text-green-400 text-base' : 'text-white text-sm'}`}>
                            {t.total > 0 ? fmt(t.total) : '—'}
                            {coberturaIncompleta && t.total > 0 && (
                              <span className="block text-[9px] text-amber-400 font-normal" title={`Solo ${t.cobertura} de ${listaItems.length} productos tienen precio de este proveedor`}>
                                ({t.cobertura}/{listaItems.length})
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td></td>
                    </tr>
                    <tr className="bg-zinc-900/60">
                      <td colSpan={2} className="px-3 py-2 text-right text-[10px] text-zinc-500 uppercase tracking-wider sticky left-0 bg-zinc-900 z-10">Acción:</td>
                      {proveedoresEnData.map(p => {
                        const prov = proveedoresImp.find(pi => pi.id === p.id);
                        const t = totalPorProveedor[p.id];
                        const tieneWA = Boolean(prov?.whatsapp);
                        return (
                          <td key={p.id} className="px-2 py-2 text-center">
                            <button
                              disabled={!tieneWA || t.total === 0}
                              onClick={() => {
                                if (!prov?.whatsapp) return;
                                const msg = buildOrderMessage({
                                  proveedor: prov.nombre,
                                  items: listaItems
                                    .filter(it => (matriz[it.productoId]?.[p.id] ?? 0) > 0)
                                    .map(it => ({ producto: it.nombre, cantidad: it.cantidad, unidad: it.unidad })),
                                  total: t.total,
                                });
                                const link = buildWALink(prov.whatsapp, msg);
                                if (link) window.open(link, '_blank');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={tieneWA ? `Enviar lista a ${p.nombre} por WhatsApp` : 'Este proveedor no tiene WhatsApp configurado'}
                            >
                              <Send size={10} /> WA
                            </button>
                          </td>
                        );
                      })}
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}

          {listaItems.length > 0 && proveedoresEnData.length === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-400">
              No hay proveedores con precios cargados en el rango elegido. Ampliá "Desde/Hasta" en la tab Última.
            </div>
          )}
        </div>
      )}

      {/* Match IA modal — disparado desde el banner de pendientes. Al aplicar
          los vínculos, refrescamos la comparativa para que los productos
          aparezcan inmediatamente en la tabla sin necesidad de recargar. */}
      <MatchListaIAModal
        open={matchOpen}
        onClose={() => setMatchOpen(false)}
        listaId={matchLista?.id ?? null}
        listaInfo={{
          codigo: matchLista?.codigo,
          proveedorNombre: matchLista?.proveedorNombre,
          pendientes: matchLista?.pendientes,
        }}
        onSuccess={() => { cargar(); }}
      />
    </div>
  );
}
