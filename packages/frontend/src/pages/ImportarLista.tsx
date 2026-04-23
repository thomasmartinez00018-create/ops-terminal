import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import MatchListaIAModal from '../components/MatchListaIAModal';
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader2, Sparkles, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ImportarLista() {
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [listas, setListas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Import wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLista, setDetailLista] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');

  // Match IA modal — usado desde la grilla por fila y auto-gatillado después
  // de importar una lista. Centraliza el flujo match-ai → review → apply sin
  // forzar al usuario a navegar a /equivalencias.
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
      pendientes: lista.stats?.pendientes ?? lista.items?.length ?? 0,
    });
    setMatchOpen(true);
  };

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [p, l] = await Promise.all([api.getProveedores({ activo: 'true' }), api.getListasPrecio()]);
      setProveedores(p);
      setListas(l);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const abrirWizard = () => {
    setProveedorId('');
    setFecha(new Date().toISOString().split('T')[0]);
    setArchivo(null);
    setImportError('');
    setImportResult(null);
    setWizardOpen(true);
  };

  const importar = async () => {
    if (!proveedorId || !archivo) { setImportError('Selecciona proveedor y archivo'); return; }
    setImporting(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('proveedorId', proveedorId);
      fd.append('fecha', fecha);
      const result = await api.importarListaPrecio(fd);
      setImportResult(result);
      cargar();
    } catch (e: any) {
      setImportError(e.message || 'Error al importar');
    }
    setImporting(false);
  };

  const verDetalle = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    setDetailSearch(''); // resetear búsqueda al abrir
    try {
      const d = await api.getListaPrecio(id);
      setDetailLista(d);
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  const eliminar = async (id: number) => {
    if (!confirm('Eliminar esta lista de precios?')) return;
    try {
      await api.deleteListaPrecio(id);
      cargar();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Importar Listas de Precios</h1>
          <p className="text-sm text-zinc-400 mt-1">Subi listas de proveedores en PDF o Excel y la IA extrae los precios</p>
        </div>
        <Button onClick={abrirWizard}><Upload className="w-4 h-4 mr-2" /> Importar Lista</Button>
      </div>

      {/* Historial de listas — overflow-x-auto para que tablas anchas no
          empujen el layout y quede "desfasado" contra el sidebar. */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="px-4 py-3 text-left">Codigo</th>
              <th className="px-4 py-3 text-left">Proveedor</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Archivo</th>
              <th className="px-4 py-3 text-center">Productos</th>
              <th className="px-4 py-3 text-center">Vinculados</th>
              <th className="px-4 py-3 text-center">Falta vincular</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-8 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</td></tr>
            )}
            {!loading && listas.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-zinc-500">No hay listas importadas</td></tr>
            )}
            {listas.map((l: any) => (
              <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-mono text-xs text-orange-400">{l.codigo}</td>
                <td className="px-4 py-3 text-white">{l.proveedor?.nombre}</td>
                <td className="px-4 py-3 text-zinc-300">{l.fecha}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{l.archivoOrigen}</td>
                <td className="px-4 py-3 text-center text-zinc-300">{l.stats?.total || l._count?.items || 0}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-green-400">{l.stats?.ok || 0}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {(l.stats?.pendientes || 0) > 0 ? (
                    <span className="text-amber-400 font-medium">{l.stats.pendientes}</span>
                  ) : (
                    <span className="text-zinc-500">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => verDetalle(l.id)} className="text-zinc-400 hover:text-white" title="Ver detalle">
                    <FileText className="w-4 h-4 inline" />
                  </button>
                  {(l.stats?.pendientes || 0) > 0 && (
                    <button
                      onClick={() => abrirMatchIA(l)}
                      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-xs font-bold"
                      title="Vincular pendientes con IA"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Vincular IA
                    </button>
                  )}
                  <button onClick={() => eliminar(l.id)} className="text-zinc-400 hover:text-red-400" title="Eliminar">
                    <Trash2 className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wizard de importacion */}
      <Modal open={wizardOpen} onClose={() => setWizardOpen(false)} title="Importar Lista de Precios" size="lg">
        {importResult ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
              <div>
                <p className="text-green-300 font-medium">Lista {importResult.codigo} importada</p>
                <p className="text-sm text-zinc-400 mt-1">{importResult.items?.length || 0} productos extraídos del archivo</p>
              </div>
            </div>

            {/* CTA principal: vincular con IA en la misma página. No queremos
                que el usuario vea el éxito, cierre el modal y se vaya al
                Comparador pensando que terminó — los items todavía están en
                estadoMatch='PENDIENTE' y el Comparador los va a ignorar. */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-bold text-foreground">Último paso: vincular con tu catálogo</p>
                <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Los productos importados todavía no están vinculados a los productos
                  de tu sistema. Sin este paso no van a aparecer en el Comparador.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setWizardOpen(false); setImportResult(null); }}>
                Cerrar
              </Button>
              <Button
                onClick={() => {
                  // Abrir el modal de match-ai con la lista recién importada.
                  // Capturamos los datos ANTES de limpiar importResult.
                  abrirMatchIA({
                    id: importResult.id,
                    codigo: importResult.codigo,
                    proveedor: importResult.proveedor,
                    stats: { pendientes: importResult.items?.length || 0 },
                  });
                  setWizardOpen(false);
                  setImportResult(null);
                }}
              >
                <Sparkles className="w-4 h-4" />
                Vincular con IA
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Select label="Proveedor" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Select>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Archivo (PDF o Excel)</label>
              <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-600 transition-colors">
                <input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt"
                  onChange={e => setArchivo(e.target.files?.[0] || null)}
                  className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                  {archivo ? (
                    <p className="text-white font-medium">{archivo.name} <span className="text-zinc-400 text-sm">({(archivo.size / 1024).toFixed(0)} KB)</span></p>
                  ) : (
                    <p className="text-zinc-400">Click para seleccionar archivo</p>
                  )}
                </label>
              </div>
            </div>

            {importError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-300 text-sm">{importError}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setWizardOpen(false)}>Cancelar</Button>
              <Button onClick={importar} disabled={importing || !proveedorId || !archivo}>
                {importing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Procesando con IA...</> : 'Importar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Match IA modal — flujo completo match-ai → review → apply */}
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
        showComparadorCTA
        onGoComparador={() => navigate('/comparador')}
      />

      {/* Detail modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={`Detalle: ${detailLista?.codigo || ''}`} size="xl">
        {detailLoading ? (
          <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : detailLista ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
              <span>Proveedor: <strong className="text-white">{detailLista.proveedor?.nombre}</strong></span>
              <span>Fecha: {detailLista.fecha}</span>
              <span>Archivo: {detailLista.archivoOrigen}</span>
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar producto en esta lista..."
                value={detailSearch}
                onChange={e => setDetailSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
              {detailSearch && (
                <button
                  onClick={() => setDetailSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >×</button>
              )}
            </div>

            <div className="max-h-[420px] overflow-auto">
              {(() => {
                const items = detailLista.items ?? [];
                const q = detailSearch.trim().toLowerCase();
                const filtered = q
                  ? items.filter((it: any) =>
                      it.productoOriginal?.toLowerCase().includes(q) ||
                      it.proveedorProducto?.producto?.nombre?.toLowerCase().includes(q) ||
                      it.proveedorProducto?.producto?.codigo?.toLowerCase().includes(q)
                    )
                  : items;
                return (
                  <>
                    {q && (
                      <p className="text-[11px] text-zinc-500 mb-1">
                        {filtered.length} de {items.length} productos
                      </p>
                    )}
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr className="text-zinc-400 border-b border-zinc-800">
                          <th className="px-2 py-2 text-left">Producto</th>
                          <th className="px-2 py-2 text-left">Presentacion</th>
                          <th className="px-2 py-2 text-right">Precio</th>
                          <th className="px-2 py-2 text-right">$/Unidad</th>
                          <th className="px-2 py-2 text-center">Estado</th>
                          <th className="px-2 py-2 text-left">Producto Interno</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-2 py-6 text-center text-zinc-500 italic">
                              Sin resultados para "{detailSearch}"
                            </td>
                          </tr>
                        )}
                        {filtered.map((it: any) => (
                          <tr key={it.id} className="border-b border-zinc-800/50">
                            <td className="px-2 py-1.5 text-white">{it.productoOriginal}</td>
                            <td className="px-2 py-1.5 text-zinc-400">{it.presentacionOriginal || '-'}</td>
                            <td className="px-2 py-1.5 text-right text-zinc-300">${it.precioInformado?.toLocaleString('es-AR')}</td>
                            <td className="px-2 py-1.5 text-right text-zinc-300">{it.precioPorUnidad ? `$${it.precioPorUnidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : '-'}</td>
                            <td className="px-2 py-1.5 text-center">
                              {it.estadoMatch === 'OK' ? (
                                <span className="text-green-400 font-bold">OK</span>
                              ) : (
                                <span className="text-amber-400 font-bold">PENDIENTE</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-zinc-400">
                              {it.proveedorProducto?.producto
                                ? `${it.proveedorProducto.producto.codigo} - ${it.proveedorProducto.producto.nombre}`
                                : <span className="italic text-zinc-600">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
