import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import SearchableSelect from '../components/ui/SearchableSelect';
import Modal from '../components/ui/Modal';
import { Wand2, Check, X, Loader2, Link2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 30;

const CONFIANZA_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  alta:  { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Alta' },
  media: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Media' },
  baja:  { bg: 'bg-red-500/15',   text: 'text-red-400',   label: 'Baja' },
  error: { bg: 'bg-zinc-500/15',  text: 'text-zinc-400',  label: 'Error' },
};

export default function Equivalencias() {
  const [listas, setListas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [selectedLista, setSelectedLista] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterEstado, setFilterEstado] = useState('PENDIENTE');
  const [filterProveedor, setFilterProveedor] = useState('');
  const [page, setPage] = useState(0);

  // AI matching
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);
  const [aiApproved, setAiApproved] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [l, p, pv] = await Promise.all([
        api.getListasPrecio(),
        api.getProductos({ activo: 'true' }),
        api.getProveedores({ activo: 'true' }),
      ]);
      setListas(l);
      setProductos(p);
      setProveedores(pv);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const cargarItems = async (listaId: number) => {
    setLoading(true);
    try {
      const d = await api.getListaPrecio(listaId);
      setSelectedLista(d);
      setItems(d.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Select a lista to work on
  useEffect(() => {
    const withPending = listas.find((l: any) => (l.stats?.pendientes || 0) > 0);
    if (withPending && !selectedLista) {
      cargarItems(withPending.id);
    }
  }, [listas]);

  // Filtered items
  const filtered = useMemo(() => {
    let f = items;
    if (filterEstado) f = f.filter(i => i.estadoMatch === filterEstado);
    return f;
  }, [items, filterEstado]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Manual match
  const matchManual = async (itemId: number, productoId: number) => {
    if (!selectedLista) return;
    try {
      await api.matchListaItem(selectedLista.id, { itemId, productoId });
      // Update local state
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, estadoMatch: 'OK', _matched: true } : i));
    } catch (e: any) {
      alert(e.message);
    }
  };

  // AI auto-match
  const runAI = async () => {
    if (!selectedLista) return;
    setAiOpen(true);
    setAiLoading(true);
    setAiResults([]);
    setAiApproved(new Set());
    try {
      const resp = await api.matchListaAI(selectedLista.id);
      const results = resp.results || [];
      setAiResults(results);
      // Pre-approve alta + media
      setAiApproved(new Set(
        results
          .filter((r: any) => r.productoId && r.confianza !== 'baja' && r.confianza !== 'error')
          .map((r: any) => r.itemId)
      ));
    } catch (e: any) {
      alert(e.message);
    }
    setAiLoading(false);
  };

  const toggleApprove = (itemId: number) => {
    setAiApproved(prev => {
      const s = new Set(prev);
      if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
      return s;
    });
  };

  const applyAI = async () => {
    if (!selectedLista) return;
    setApplying(true);
    try {
      const matches = aiResults
        .filter((r: any) => aiApproved.has(r.itemId) && r.productoId)
        .map((r: any) => ({ itemId: r.itemId, productoId: r.productoId }));
      if (matches.length) {
        await api.applyMatches(selectedLista.id, { matches });
      }
      setAiOpen(false);
      cargarItems(selectedLista.id);
      cargar();
    } catch (e: any) {
      alert(e.message);
    }
    setApplying(false);
  };

  const pendienteCount = items.filter(i => i.estadoMatch === 'PENDIENTE').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Equivalencias</h1>
          <p className="text-sm text-zinc-400 mt-1">Vincula productos de proveedores con tu catalogo interno</p>
        </div>
        {selectedLista && pendienteCount > 0 && (
          <Button onClick={runAI}>
            <Wand2 className="w-4 h-4 mr-2" /> Auto-match IA ({pendienteCount} pendientes)
          </Button>
        )}
      </div>

      {/* Lista selector */}
      <div className="flex gap-4 items-end">
        <div className="w-72">
          <Select label="Lista de precios" value={selectedLista?.id || ''} onChange={e => {
            const id = Number(e.target.value);
            if (id) cargarItems(id);
          }}>
            <option value="">Seleccionar lista...</option>
            {listas.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.codigo} - {l.proveedor?.nombre} ({l.fecha}) {(l.stats?.pendientes || 0) > 0 ? `[${l.stats.pendientes} pend.]` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setFilterEstado('PENDIENTE'); setPage(0); }}
            className={`px-3 py-1.5 text-sm rounded ${filterEstado === 'PENDIENTE' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400'}`}>
            Pendientes
          </button>
          <button onClick={() => { setFilterEstado('OK'); setPage(0); }}
            className={`px-3 py-1.5 text-sm rounded ${filterEstado === 'OK' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-800 text-zinc-400'}`}>
            Matcheados
          </button>
          <button onClick={() => { setFilterEstado(''); setPage(0); }}
            className={`px-3 py-1.5 text-sm rounded ${filterEstado === '' ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
            Todos
          </button>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="px-4 py-3 text-left">Producto Proveedor</th>
              <th className="px-4 py-3 text-left">Presentacion</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-left" style={{ minWidth: 280 }}>Producto Interno</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="py-8 text-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</td></tr>}
            {!loading && paged.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-zinc-500">Sin items</td></tr>}
            {paged.map((item: any) => (
              <tr key={item.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-2 text-white">{item.productoOriginal}</td>
                <td className="px-4 py-2 text-zinc-400 text-xs">{item.presentacionOriginal || '-'}</td>
                <td className="px-4 py-2 text-right text-zinc-300">${item.precioInformado?.toLocaleString('es-AR')}</td>
                <td className="px-4 py-2 text-center">
                  {item.estadoMatch === 'OK' ? (
                    <span className="inline-flex items-center gap-1 text-green-400 text-xs"><Check className="w-3 h-3" /> OK</span>
                  ) : (
                    <span className="text-amber-400 text-xs">PENDIENTE</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {item.estadoMatch === 'OK' && item.proveedorProducto?.producto ? (
                    <span className="text-zinc-300 text-xs">
                      {item.proveedorProducto.producto.codigo} - {item.proveedorProducto.producto.nombre}
                    </span>
                  ) : (
                    <SearchableSelect
                      options={productos.map(p => ({ value: String(p.id), label: `${p.codigo} - ${p.nombre}` }))}
                      value=""
                      onChange={(val) => { if (val) matchManual(item.id, Number(val)); }}
                      placeholder="Buscar producto..."
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <span className="text-xs text-zinc-400">{filtered.length} items, pagina {page + 1}/{totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Results Modal */}
      <Modal open={aiOpen} onClose={() => !aiLoading && setAiOpen(false)} title="Auto-match IA" size="xl">
        {aiLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
            <p className="text-zinc-300">Procesando con IA...</p>
            <p className="text-xs text-zinc-500 mt-1">Esto puede tomar unos segundos</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                {aiResults.filter(r => r.productoId).length} matches encontrados de {aiResults.length} items.
                <span className="text-amber-400 ml-2">{aiApproved.size} seleccionados para aplicar.</span>
              </p>
              <div className="flex gap-2">
                <button onClick={() => setAiApproved(new Set(aiResults.filter(r => r.productoId).map(r => r.itemId)))}
                  className="text-xs text-zinc-400 hover:text-white">Seleccionar todos</button>
                <button onClick={() => setAiApproved(new Set())}
                  className="text-xs text-zinc-400 hover:text-white">Deseleccionar</button>
              </div>
            </div>

            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-800">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left">Producto Proveedor</th>
                    <th className="px-2 py-2 text-left">Match Sugerido</th>
                    <th className="px-2 py-2 text-center">Confianza</th>
                  </tr>
                </thead>
                <tbody>
                  {aiResults.map((r: any) => {
                    const style = CONFIANZA_STYLES[r.confianza] || CONFIANZA_STYLES.error;
                    return (
                      <tr key={r.itemId} className="border-b border-zinc-800/50">
                        <td className="px-2 py-1.5 text-center">
                          {r.productoId && (
                            <input type="checkbox" checked={aiApproved.has(r.itemId)} onChange={() => toggleApprove(r.itemId)}
                              className="accent-orange-500" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-white">{r.productoOriginal}</td>
                        <td className="px-2 py-1.5">
                          {r.producto ? (
                            <span className="text-zinc-300">{r.producto.codigo} - {r.producto.nombre}</span>
                          ) : (
                            <span className="text-zinc-500 italic">Sin match</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>{style.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button>
              <Button onClick={applyAI} disabled={applying || aiApproved.size === 0}>
                {applying ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Aplicando...</> : `Aplicar ${aiApproved.size} matches`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
