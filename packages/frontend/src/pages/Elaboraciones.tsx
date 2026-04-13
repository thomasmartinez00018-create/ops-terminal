import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import PageTour from '../components/PageTour';
import { Plus, FlaskConical, X, Wand2, ArrowRight, ArrowLeft, Package, Scissors } from 'lucide-react';

interface IngredienteRow {
  productoId: number | null;
  cantidad: number | string;
  unidad: string;
  depositoOrigenId: number | null;
}

const emptyIngrediente: IngredienteRow = {
  productoId: null,
  cantidad: '',
  unidad: '',
  depositoOrigenId: null,
};

const SECTORES = [
  { value: '', label: 'Sin sector' },
  { value: 'pizzeria', label: 'Pizzería' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'pasteleria', label: 'Pastelería' },
  { value: 'pastas', label: 'Pastas' },
];

const emptyForm = {
  recetaId: null as number | null,
  sector: '' as string,
  productoResultadoId: null as number | null,
  cantidadProducida: '' as string | number,
  unidadProducida: '',
  depositoDestinoId: null as number | null,
  fecha: new Date().toISOString().split('T')[0],
  hora: new Date().toTimeString().slice(0, 5),
  observacion: '',
  ingredientes: [] as IngredienteRow[],
};

export default function Elaboraciones() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [lotes, setLotes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [recetas, setRecetas] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [tab, setTab] = useState<'elaboracion' | 'porcionado'>('elaboracion');

  // ── Porcionado state ──
  const [porcionados, setPorcionados] = useState<any[]>([]);
  const [porcionadoOpen, setPorcionadoOpen] = useState(false);
  const [porcionadoLoading, setPorcionadoLoading] = useState(false);
  const [porcForm, setPorcForm] = useState({
    productoOrigenId: null as number | null,
    cantidadOrigen: '' as string | number,
    unidadOrigen: '',
    depositoOrigenId: null as number | null,
    merma: '' as string | number,
    observacion: '',
    items: [{ productoId: null as number | null, cantidad: '', pesoUnidad: '', unidad: '', depositoDestinoId: null as number | null }],
  });

  const cargar = () => {
    setLoadingList(true);
    api.getElaboraciones().then(setLotes).catch(console.error).finally(() => setLoadingList(false));
  };

  useEffect(() => {
    cargar();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
    api.getRecetasConProducto().then(setRecetas).catch(console.error);
  }, []);

  const abrirModal = () => {
    setForm({
      ...emptyForm,
      fecha: new Date().toISOString().split('T')[0],
      hora: new Date().toTimeString().slice(0, 5),
      ingredientes: [{ ...emptyIngrediente }],
    });
    setModalOpen(true);
  };

  // When a recipe is selected, auto-fill producto resultado and ingredients
  const handleRecetaChange = (recetaId: string) => {
    const id = recetaId ? Number(recetaId) : null;
    if (!id) {
      setForm(f => ({ ...f, recetaId: null }));
      return;
    }
    const receta = recetas.find(r => r.id === id);
    if (!receta) return;

    const cantBase = Number(form.cantidadProducida) || receta.cantidadProducida || 1;
    const ratio = receta.cantidadProducida ? cantBase / receta.cantidadProducida : 1;

    const newIngredientes: IngredienteRow[] = receta.ingredientes.map((ing: any) => ({
      productoId: ing.productoId,
      cantidad: +(Number(ing.cantidad) * ratio * (1 + Number(ing.mermaEsperada) / 100)).toFixed(3),
      unidad: ing.unidad,
      depositoOrigenId: null,
    }));

    setForm(f => ({
      ...f,
      recetaId: id,
      productoResultadoId: receta.productoResultadoId ?? f.productoResultadoId,
      cantidadProducida: receta.cantidadProducida ? String(cantBase) : f.cantidadProducida,
      unidadProducida: receta.unidadProducida || (receta.productoResultado?.unidadUso ?? f.unidadProducida),
      ingredientes: newIngredientes.length > 0 ? newIngredientes : f.ingredientes,
    }));
  };

  // When cantidadProducida changes, proportionally update ingredient quantities IF a recipe is loaded
  const handleCantidadChange = (val: string) => {
    const newCant = Number(val);
    if (form.recetaId && newCant > 0) {
      const receta = recetas.find(r => r.id === form.recetaId);
      if (receta && receta.cantidadProducida) {
        const ratio = newCant / receta.cantidadProducida;
        const newIngredientes = receta.ingredientes.map((ing: any) => ({
          productoId: ing.productoId,
          cantidad: +(Number(ing.cantidad) * ratio * (1 + Number(ing.mermaEsperada) / 100)).toFixed(3),
          unidad: ing.unidad,
          depositoOrigenId: (form.ingredientes.find(fi => fi.productoId === ing.productoId)?.depositoOrigenId) ?? null,
        }));
        setForm(f => ({ ...f, cantidadProducida: val, ingredientes: newIngredientes }));
        return;
      }
    }
    setForm(f => ({ ...f, cantidadProducida: val }));
  };

  const handleProductoResultadoChange = (v: string) => {
    const prod = productos.find(p => p.id === Number(v));
    setForm(f => ({
      ...f,
      productoResultadoId: v ? Number(v) : null,
      unidadProducida: prod?.unidadUso ?? f.unidadProducida,
    }));
  };

  const agregarIngrediente = () => {
    setForm(f => ({ ...f, ingredientes: [...f.ingredientes, { ...emptyIngrediente }] }));
  };

  const quitarIngrediente = (idx: number) => {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.filter((_, i) => i !== idx) }));
  };

  const actualizarIngrediente = (idx: number, campo: keyof IngredienteRow, valor: any) => {
    const nuevos = [...form.ingredientes];
    nuevos[idx] = { ...nuevos[idx], [campo]: valor };
    if (campo === 'productoId' && valor) {
      const prod = productos.find(p => p.id === Number(valor));
      if (prod) nuevos[idx].unidad = prod.unidadUso;
    }
    setForm(f => ({ ...f, ingredientes: nuevos }));
  };

  // Merma calculation
  const totalInput = form.ingredientes.reduce((acc, ing) => acc + Number(ing.cantidad || 0), 0);
  const totalOutput = Number(form.cantidadProducida || 0);
  const mermaImplicita = totalInput > 0 && totalOutput > 0 && form.ingredientes.length === 1
    ? Math.max(0, totalInput - totalOutput)
    : null;
  const mermaPorc = mermaImplicita !== null && totalInput > 0
    ? ((mermaImplicita / totalInput) * 100).toFixed(1)
    : null;

  const guardar = async () => {
    if (!form.productoResultadoId) {
      addToast('Seleccioná el producto a elaborar', 'error');
      return;
    }
    if (!form.cantidadProducida || Number(form.cantidadProducida) <= 0) {
      addToast('Ingresá la cantidad producida', 'error');
      return;
    }
    if (!form.ingredientes.length || form.ingredientes.every(i => !i.productoId)) {
      addToast('Agregá al menos un ingrediente', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.createElaboracion({
        productoResultadoId: form.productoResultadoId,
        cantidadProducida: Number(form.cantidadProducida),
        unidadProducida: form.unidadProducida || 'unidad',
        depositoDestinoId: form.depositoDestinoId,
        recetaId: form.recetaId,
        sector: form.sector || null,
        usuarioId: user!.id,
        fecha: form.fecha,
        hora: form.hora,
        observacion: form.observacion || null,
        ingredientes: form.ingredientes
          .filter(i => i.productoId && Number(i.cantidad) > 0)
          .map(i => ({
            productoId: i.productoId,
            cantidad: Number(i.cantidad),
            unidad: i.unidad,
            depositoOrigenId: i.depositoOrigenId,
          })),
      });
      addToast('Elaboración registrada', 'success');
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      addToast(e.message || 'Error al registrar', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Porcionado functions ──
  const cargarPorcionados = () => {
    api.getPorcionados().then(setPorcionados).catch(console.error);
  };
  useEffect(() => { if (tab === 'porcionado') cargarPorcionados(); }, [tab]);

  const abrirPorcionado = () => {
    setPorcForm({
      productoOrigenId: null, cantidadOrigen: '', unidadOrigen: '',
      depositoOrigenId: null, merma: '', observacion: '',
      items: [{ productoId: null, cantidad: '', pesoUnidad: '', unidad: '', depositoDestinoId: null }],
    });
    setPorcionadoOpen(true);
  };

  const porcAddItem = () => setPorcForm(f => ({
    ...f,
    items: [...f.items, { productoId: null, cantidad: '', pesoUnidad: '', unidad: '', depositoDestinoId: null }],
  }));
  const porcRemoveItem = (idx: number) => setPorcForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const porcUpdateItem = (idx: number, field: string, value: any) => {
    setPorcForm(f => ({
      ...f,
      items: f.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === 'productoId' && value) {
          const prod = productos.find(p => p.id === Number(value));
          if (prod) updated.unidad = prod.unidadUso || 'kg';
        }
        return updated;
      }),
    }));
  };

  const guardarPorcionado = async () => {
    if (!porcForm.productoOrigenId) { addToast('Seleccioná el producto a porcionar', 'error'); return; }
    if (!porcForm.cantidadOrigen || Number(porcForm.cantidadOrigen) <= 0) { addToast('Ingresá la cantidad de entrada', 'error'); return; }
    const validItems = porcForm.items.filter(i => i.productoId && Number(i.cantidad) > 0 && Number(i.pesoUnidad) > 0);
    if (!validItems.length) { addToast('Agregá al menos un sub-producto con cantidad y peso', 'error'); return; }

    setPorcionadoLoading(true);
    try {
      await api.createPorcionado({
        productoOrigenId: porcForm.productoOrigenId,
        cantidadOrigen: Number(porcForm.cantidadOrigen),
        unidadOrigen: porcForm.unidadOrigen || 'kg',
        depositoOrigenId: porcForm.depositoOrigenId,
        merma: Number(porcForm.merma || 0),
        observacion: porcForm.observacion || null,
        usuarioId: user!.id,
        items: validItems.map(i => ({
          productoId: Number(i.productoId),
          cantidad: Number(i.cantidad),
          pesoUnidad: Number(i.pesoUnidad),
          unidad: i.unidad || 'kg',
          depositoDestinoId: i.depositoDestinoId,
        })),
      });
      addToast('Porcionado registrado', 'success');
      setPorcionadoOpen(false);
      cargarPorcionados();
    } catch (e: any) {
      addToast(e.message || 'Error al registrar porcionado', 'error');
    } finally {
      setPorcionadoLoading(false);
    }
  };

  // Cálculo de rendimiento del porcionado
  const porcTotalSalida = porcForm.items.reduce((acc, i) => acc + (Number(i.cantidad) * Number(i.pesoUnidad || 0)), 0);
  const porcEntrada = Number(porcForm.cantidadOrigen || 0);
  const porcMermaCalc = porcEntrada > 0 && porcTotalSalida > 0 ? Math.max(0, porcEntrada - porcTotalSalida - Number(porcForm.merma || 0)) : 0;

  const productoResultado = productos.find(p => p.id === form.productoResultadoId);

  return (
    <div>
      <PageTour pageKey="elaboraciones" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Producción</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Elaboraciones</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            {tab === 'elaboracion'
              ? 'Transformación de ingredientes en productos elaborados — ej: Nalga 5kg → Milanesa 3kg'
              : 'Dividí un producto elaborado en sub-productos — ej: 10kg Masa → 30 bollos'}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'elaboracion' ? (
            <Button onClick={abrirModal}><Plus size={16} /> Registrar elaboración</Button>
          ) : (
            <Button onClick={abrirPorcionado}><Scissors size={16} /> Registrar porcionado</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-high rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('elaboracion')}
          className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'elaboracion' ? 'bg-primary text-background shadow-sm' : 'text-on-surface-variant hover:text-foreground'}`}
        >
          <FlaskConical size={14} className="inline mr-1.5" />Elaboraciones
        </button>
        <button
          onClick={() => setTab('porcionado')}
          className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === 'porcionado' ? 'bg-primary text-background shadow-sm' : 'text-on-surface-variant hover:text-foreground'}`}
        >
          <Scissors size={14} className="inline mr-1.5" />Porcionado
        </button>
      </div>

      {/* ── Tab: Elaboraciones ── */}
      {tab === 'elaboracion' && <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Sector</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto elaborado</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Ingredientes consumidos</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Depósito destino</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Registró</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingList && (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-on-surface-variant">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm font-medium">Cargando elaboraciones...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loadingList && lotes.map(lote => (
                <tr key={lote.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 font-mono text-xs text-primary">{lote.codigo}</td>
                  <td className="p-3 text-on-surface-variant text-xs">{lote.fecha}</td>
                  <td className="p-3 hidden sm:table-cell">
                    {lote.sector
                      ? <Badge variant="default">{SECTORES.find(s => s.value === lote.sector)?.label || lote.sector}</Badge>
                      : <span className="text-on-surface-variant/50 text-xs">—</span>
                    }
                  </td>
                  <td className="p-3 font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <FlaskConical size={14} className="text-primary shrink-0" />
                      {lote.productoResultado?.nombre}
                    </div>
                    {lote.receta && (
                      <div className="text-xs text-on-surface-variant mt-0.5">Receta: {lote.receta.nombre}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="font-bold text-emerald-400">{lote.cantidadProducida}</span>
                    <span className="text-on-surface-variant ml-1 text-xs">{lote.unidadProducida}</span>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <div className="space-y-0.5">
                      {lote.movimientos?.map((mov: any, i: number) => (
                        <div key={mov.id || i} className="text-xs text-on-surface-variant">
                          <span className="text-orange-400 font-semibold">{mov.cantidad} {mov.unidad}</span>
                          {' '}{mov.producto?.nombre}
                          {mov.depositoOrigen && <span className="text-[10px]"> ({mov.depositoOrigen.nombre})</span>}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-on-surface-variant text-xs">
                    {lote.depositoDestino?.nombre ?? '—'}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-on-surface-variant text-xs">
                    {lote.usuario?.nombre}
                  </td>
                </tr>
              ))}
              {!loadingList && lotes.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-on-surface-variant font-medium">
                    No hay elaboraciones registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Tab: Porcionado ── */}
      {tab === 'porcionado' && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto origen</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Entrada</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Sub-productos</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Merma</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Registró</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porcionados.map(p => (
                  <tr key={p.id} className="hover:bg-surface-high/50 transition-colors">
                    <td className="p-3 font-mono text-xs text-primary">{p.codigo}</td>
                    <td className="p-3 text-on-surface-variant text-xs">{p.fecha}</td>
                    <td className="p-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Scissors size={14} className="text-primary shrink-0" />
                        {p.productoOrigen?.nombre}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-orange-400">{p.cantidadOrigen}</span>
                      <span className="text-on-surface-variant ml-1 text-xs">{p.unidadOrigen}</span>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {p.items?.map((item: any, i: number) => (
                          <div key={i} className="text-xs text-on-surface-variant">
                            <span className="text-emerald-400 font-semibold">{item.cantidad}x</span>
                            {' '}{item.producto?.nombre}
                            <span className="text-[10px] ml-1">({item.pesoUnidad} {item.unidad} c/u)</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 hidden lg:table-cell">
                      {p.merma > 0
                        ? <span className="text-amber-400 font-semibold text-xs">{p.merma} {p.unidadOrigen}</span>
                        : <span className="text-on-surface-variant/50 text-xs">—</span>
                      }
                    </td>
                    <td className="p-3 hidden lg:table-cell text-on-surface-variant text-xs">{p.usuario?.nombre}</td>
                  </tr>
                ))}
                {porcionados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">
                      No hay porcionados registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nueva elaboración */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar elaboración"
      >
        <div className="space-y-4">
          {/* Fecha/hora */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Fecha"
              id="fecha"
              type="date"
              value={form.fecha}
              onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
            />
            <Input
              label="Hora"
              id="hora"
              type="time"
              value={form.hora}
              onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
            />
          </div>

          {/* Sector */}
          <Select
            label="Sector"
            id="sector"
            value={form.sector}
            onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
            options={SECTORES}
          />

          {/* Recipe selector */}
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Receta (opcional)</p>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <SearchableSelect
                  value={form.recetaId?.toString() || ''}
                  onChange={handleRecetaChange}
                  options={[
                    { value: '', label: 'Sin receta' },
                    ...recetas.map(r => ({
                      value: r.id.toString(),
                      label: r.nombre + (r.productoResultado ? ` → ${r.productoResultado.nombre}` : ''),
                    }))
                  ]}
                  placeholder="Seleccionar receta..."
                />
              </div>
              {form.recetaId && (
                <button
                  onClick={() => setForm(f => ({ ...f, recetaId: null }))}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {form.recetaId && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                <Wand2 size={10} />
                Ingredientes cargados desde receta
              </p>
            )}
          </div>

          {/* Output section */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 mb-0.5">
              <ArrowRight size={14} className="text-emerald-400" />
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Lo que sale / se produce (output)</p>
            </div>
            <p className="text-[10px] text-on-surface-variant mb-3">Ej: NALGA entra → sale MILANESA o NALGA LIMPIA</p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant mb-1">Producto resultado</p>
                <SearchableSelect
                  value={form.productoResultadoId?.toString() || ''}
                  onChange={handleProductoResultadoChange}
                  options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                  placeholder="Seleccionar producto..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Cantidad producida"
                  id="cantidadProducida"
                  type="number"
                  value={form.cantidadProducida}
                  onChange={e => handleCantidadChange(e.target.value)}
                  placeholder="0"
                />
                <Input
                  label="Unidad"
                  id="unidadProducida"
                  value={form.unidadProducida}
                  onChange={e => setForm(f => ({ ...f, unidadProducida: e.target.value }))}
                  placeholder="kg, lt, unidad..."
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant mb-1">Depósito destino</p>
                <Select
                  id="depositoDestino"
                  value={form.depositoDestinoId?.toString() || ''}
                  onChange={e => setForm(f => ({ ...f, depositoDestinoId: e.target.value ? Number(e.target.value) : null }))}
                  options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                  placeholder="Sin asignar"
                />
              </div>
            </div>
          </div>

          {/* Input section */}
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <ArrowLeft size={14} className="text-orange-400" />
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Lo que entra / se consume (input)</p>
              </div>
            </div>
            <p className="text-[10px] text-on-surface-variant mb-3">Ej: NALGA 5 kg que se transforma — esta cantidad baja del stock</p>
            <div className="space-y-2">
              {form.ingredientes.map((ing, idx) => (
                <div key={idx} className="bg-surface-high/50 rounded-lg p-2">
                  <div className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-4">
                      <SearchableSelect
                        value={ing.productoId?.toString() || ''}
                        onChange={v => actualizarIngrediente(idx, 'productoId', v ? Number(v) : null)}
                        options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                        placeholder="Producto..."
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="Cant."
                        value={ing.cantidad}
                        onChange={e => actualizarIngrediente(idx, 'cantidad', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Unidad"
                        value={ing.unidad}
                        onChange={e => actualizarIngrediente(idx, 'unidad', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg bg-surface-high border-0 text-on-surface-variant text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                        readOnly
                      />
                    </div>
                    <div className="col-span-3">
                      <Select
                        id={`dep-origen-${idx}`}
                        value={ing.depositoOrigenId?.toString() || ''}
                        onChange={e => actualizarIngrediente(idx, 'depositoOrigenId', e.target.value ? Number(e.target.value) : null)}
                        options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                        placeholder="Depósito..."
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pt-1">
                      <button
                        onClick={() => quitarIngrediente(idx)}
                        className="p-1 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={agregarIngrediente}
                className="flex items-center gap-1 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors"
              >
                <Plus size={13} /> Agregar ingrediente
              </button>
            </div>
          </div>

          {/* Preview / merma panel */}
          {(form.productoResultadoId || form.ingredientes.some(i => i.productoId)) && (
            <div className="rounded-xl border border-border bg-surface-high/30 p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Package size={11} /> Vista previa de movimientos
              </p>
              {form.productoResultadoId && Number(form.cantidadProducida) > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <ArrowRight size={12} className="text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-bold">+{form.cantidadProducida} {form.unidadProducida}</span>
                  <span className="text-on-surface-variant">elaboración de</span>
                  <span className="font-semibold text-foreground">{productoResultado?.nombre}</span>
                  {form.depositoDestinoId && (
                    <span className="text-on-surface-variant">→ {depositos.find(d => d.id === form.depositoDestinoId)?.nombre}</span>
                  )}
                </div>
              )}
              {form.ingredientes.filter(i => i.productoId && Number(i.cantidad) > 0).map((ing, idx) => {
                const prod = productos.find(p => p.id === ing.productoId);
                const dep = depositos.find(d => d.id === ing.depositoOrigenId);
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <ArrowLeft size={12} className="text-orange-400 shrink-0" />
                    <span className="text-orange-400 font-bold">-{ing.cantidad} {ing.unidad}</span>
                    <span className="text-on-surface-variant">consumo de</span>
                    <span className="font-semibold text-foreground">{prod?.nombre}</span>
                    {dep && <span className="text-on-surface-variant">(de {dep.nombre})</span>}
                  </div>
                );
              })}
              {mermaImplicita !== null && mermaImplicita > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="font-bold text-amber-400">Merma implícita: {mermaImplicita.toFixed(3)} {form.ingredientes[0]?.unidad}</span>
                    <Badge>{mermaPorc}%</Badge>
                    <span className="text-[10px]">(input - output, no genera movimiento extra)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Observacion */}
          <Input
            label="Observación (opcional)"
            id="observacion"
            value={form.observacion}
            onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
            placeholder="Notas adicionales..."
          />

          <div className="flex gap-2 pt-1">
            <Button onClick={guardar} disabled={loading} className="flex-1">
              {loading ? 'Guardando...' : 'Registrar elaboración'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
      {/* Modal porcionado */}
      <Modal open={porcionadoOpen} onClose={() => setPorcionadoOpen(false)} title="Registrar porcionado">
        <div className="space-y-4">
          <p className="text-xs text-on-surface-variant">
            Dividí un producto elaborado (ej: masa, nalga) en sub-productos (ej: bollos, milanesas) con peso por unidad.
          </p>

          {/* Producto origen (input) */}
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <ArrowLeft size={14} className="text-orange-400" />
              <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Producto a porcionar (entrada)</p>
            </div>
            <SearchableSelect
              label="Producto"
              value={porcForm.productoOrigenId?.toString() || ''}
              onChange={v => {
                const prod = productos.find(p => p.id === Number(v));
                setPorcForm(f => ({ ...f, productoOrigenId: v ? Number(v) : null, unidadOrigen: prod?.unidadUso || f.unidadOrigen }));
              }}
              options={productos.filter(p => ['elaborado', 'semielaborado'].includes(p.tipo)).map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
              placeholder="Seleccionar producto elaborado..."
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Cantidad"
                type="number"
                value={porcForm.cantidadOrigen}
                onChange={e => setPorcForm(f => ({ ...f, cantidadOrigen: e.target.value }))}
                placeholder="0"
              />
              <Input
                label="Unidad"
                value={porcForm.unidadOrigen}
                onChange={e => setPorcForm(f => ({ ...f, unidadOrigen: e.target.value }))}
                placeholder="kg"
              />
              <Select
                label="Depósito origen"
                value={porcForm.depositoOrigenId?.toString() || ''}
                onChange={e => setPorcForm(f => ({ ...f, depositoOrigenId: e.target.value ? Number(e.target.value) : null }))}
                options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                placeholder="Sin asignar"
              />
            </div>
          </div>

          {/* Sub-productos (output) */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <ArrowRight size={14} className="text-emerald-400" />
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Sub-productos que salen</p>
              </div>
              <button onClick={porcAddItem} className="text-xs font-bold text-emerald-400 hover:text-emerald-300">+ Agregar</button>
            </div>
            {porcForm.items.map((item, idx) => (
              <div key={idx} className="bg-surface-high/50 rounded-lg p-2">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <SearchableSelect
                      label={idx === 0 ? 'Producto' : undefined}
                      value={item.productoId?.toString() || ''}
                      onChange={v => porcUpdateItem(idx, 'productoId', v ? Number(v) : null)}
                      options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                      placeholder="Producto..."
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Unidades' : undefined}
                      type="number"
                      value={item.cantidad}
                      onChange={e => porcUpdateItem(idx, 'cantidad', e.target.value)}
                      placeholder="30"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Peso/u' : undefined}
                      type="number"
                      step="0.01"
                      value={item.pesoUnidad}
                      onChange={e => porcUpdateItem(idx, 'pesoUnidad', e.target.value)}
                      placeholder="0.3"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      label={idx === 0 ? 'Ud' : undefined}
                      value={item.unidad}
                      onChange={e => porcUpdateItem(idx, 'unidad', e.target.value)}
                      placeholder="kg"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      label={idx === 0 ? 'Depósito' : undefined}
                      value={item.depositoDestinoId?.toString() || ''}
                      onChange={e => porcUpdateItem(idx, 'depositoDestinoId', e.target.value ? Number(e.target.value) : null)}
                      options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                      placeholder="Dep..."
                    />
                  </div>
                  <div className="col-span-1 flex justify-end pt-1">
                    {porcForm.items.length > 1 && (
                      <button onClick={() => porcRemoveItem(idx)} className="p-1 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Merma */}
          <Input
            label="Merma (opcional)"
            type="number"
            step="0.01"
            value={porcForm.merma}
            onChange={e => setPorcForm(f => ({ ...f, merma: e.target.value }))}
            placeholder="0"
          />

          {/* Preview rendimiento */}
          {porcEntrada > 0 && porcTotalSalida > 0 && (
            <div className="rounded-xl border border-border bg-surface-high/30 p-3 space-y-1">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Rendimiento</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-orange-400 font-bold">Entrada: {porcEntrada} {porcForm.unidadOrigen}</span>
                <span className="text-primary">→</span>
                <span className="text-emerald-400 font-bold">Salida: {porcTotalSalida.toFixed(2)} {porcForm.unidadOrigen}</span>
                {Number(porcForm.merma) > 0 && (
                  <span className="text-amber-400 font-bold">Merma: {porcForm.merma}</span>
                )}
              </div>
              {porcMermaCalc > 0.01 && (
                <p className="text-[10px] text-amber-400">
                  Diferencia sin asignar: {porcMermaCalc.toFixed(3)} {porcForm.unidadOrigen} ({((porcMermaCalc / porcEntrada) * 100).toFixed(1)}%)
                </p>
              )}
            </div>
          )}

          <Input
            label="Observación (opcional)"
            value={porcForm.observacion}
            onChange={e => setPorcForm(f => ({ ...f, observacion: e.target.value }))}
            placeholder="Notas adicionales..."
          />

          <div className="flex gap-2 pt-1">
            <Button onClick={guardarPorcionado} disabled={porcionadoLoading} className="flex-1">
              {porcionadoLoading ? 'Guardando...' : 'Registrar porcionado'}
            </Button>
            <Button variant="secondary" onClick={() => setPorcionadoOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
