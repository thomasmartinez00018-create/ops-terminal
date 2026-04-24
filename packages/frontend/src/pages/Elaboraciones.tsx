import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import PageTour from '../components/PageTour';
import {
  Plus, FlaskConical, X, Wand2, ArrowRight, ArrowLeft, Package, Scissors,
  Flame, Utensils, TrendingDown, Activity, Clock, Save,
} from 'lucide-react';
import { factorDesperdicio } from '../lib/merma';

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
  // Splits UI-only para el mockup "var-c2-elaboracion": el chef declara
  // cuánto se fue en merma / reutilizable / desecho. No se persisten por
  // separado (el modelo actual solo guarda ingredientes y resultado), pero
  // el cálculo sirve para mostrar rendimiento en vivo y para que el chef
  // vea qué cantidad limpia queda efectivamente.
  const [splits, setSplits] = useState({ merma: '' as string | number, reuti: '' as string | number, desecho: '' as string | number });
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
    setSplits({ merma: '', reuti: '', desecho: '' });
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
      cantidad: +(Number(ing.cantidad) * ratio * factorDesperdicio(Number(ing.mermaEsperada))).toFixed(3),
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
          cantidad: +(Number(ing.cantidad) * ratio * factorDesperdicio(Number(ing.mermaEsperada))).toFixed(3),
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
  // mermaImplicita queda disponible para futura UI de "merma sin asignar".
  // Mantengo el cálculo aunque la UI nueva no lo muestre explícito (el split3
  // de Merma/Reuti/Desecho lo absorbió).
  const mermaImplicita = totalInput > 0 && totalOutput > 0 && form.ingredientes.length === 1
    ? Math.max(0, totalInput - totalOutput)
    : null;
  void mermaImplicita;

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

  // Cálculo de rendimiento del porcionado (legacy — la UI nueva del modal
  // calcula su propio rendimiento dentro del IIFE del modal usando los
  // valores de `porcForm` directamente, pero mantengo estas vars por si
  // otra parte del archivo las consume en el futuro).
  const porcTotalSalida = porcForm.items.reduce((acc, i) => acc + (Number(i.cantidad) * Number(i.pesoUnidad || 0)), 0);
  const porcEntrada = Number(porcForm.cantidadOrigen || 0);
  void porcTotalSalida; void porcEntrada;

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
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Costo estimado</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Depósito destino</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Registró</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingList && (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
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
                  <td className="p-3 hidden md:table-cell">
                    {lote.costoTotal != null
                      ? <span className="font-bold font-mono text-primary text-xs">
                          $ {lote.costoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      : <span className="text-on-surface-variant/50 text-xs">—</span>
                    }
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
                  <td colSpan={9} className="p-8 text-center text-on-surface-variant font-medium">
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

      {/* ═══════════════════════════════════════════════════════════════════
          Modal nueva elaboración — rediseñado FIELMENTE al mockup
          "var-c2-elaboracion.jsx" del bundle de Claude Design.
          Estructura: Flow Hero → plato-card + precio-card (Cantidad+KPIs) →
          Split3 Merma/Reutilizable/Desecho → Result row → Sticky foot.
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar elaboración"
      >
        {(() => {
          // ── Cálculos en vivo ─────────────────────────────────────────────
          const primerIng = form.ingredientes[0];
          const brutoProd = primerIng?.productoId ? productos.find(p => p.id === primerIng.productoId) : null;
          const entrada = Number(primerIng?.cantidad) || 0;
          const mermaKg = Number(splits.merma) || 0;
          const reutiKg = Number(splits.reuti) || 0;
          const desechoKg = Number(splits.desecho) || 0;
          const perdido = mermaKg + reutiKg + desechoKg;
          const limpioCalc = Math.max(0, entrada - perdido);
          // Si el chef ya ingresó cantidadProducida, usamos eso; si no, el calculado.
          const limpio = Number(form.cantidadProducida) > 0 ? Number(form.cantidadProducida) : limpioCalc;
          const rend = entrada > 0 ? (limpio / entrada) * 100 : 0;
          const unidad = primerIng?.unidad || form.unidadProducida || 'kg';
          const fmtNum = (n: number, dec = 2) => Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: dec }) : '—';

          return (
        <div className="space-y-4">

          {/* ── FLOW HERO — 4 nodos. Elaborado activo, Bruto done (tocando
              ingredientes), Porción/Receta pendientes. */}
          <div className="rounded-xl border border-border/60 bg-surface-high/20 p-4">
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">
                  Circuito de producción
                </p>
                <p className="text-base font-semibold text-foreground mt-0.5">
                  Trazabilidad del elaborado
                </p>
              </div>
              <p className="text-[10px] text-on-surface-variant/70 italic">Tocá un paso para ir</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { lbl: 'Bruto',     sub: brutoProd?.nombre || 'Producto bruto', val: entrada > 0 ? `${fmtNum(entrada)} ${unidad}` : '—', icon: <Package size={22}/>, state: 'done' as const },
                { lbl: 'Elaborado', sub: 'Limpio',                              val: limpio > 0 ? `${fmtNum(limpio)} ${unidad} · ${rend.toFixed(0)}%` : 'En edición', icon: <Flame size={22}/>, state: 'active' as const },
                { lbl: 'Porción',   sub: 'Pendiente',                           val: '—', icon: <Scissors size={22}/>, state: 'idle' as const },
                { lbl: 'Receta',    sub: 'Pendiente',                           val: '—', icon: <Utensils size={22}/>, state: 'idle' as const },
              ].map((n, i) => (
                <div key={i}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    n.state === 'active' ? 'bg-primary/10 border-primary/50'
                    : n.state === 'done' ? 'bg-primary/5 border-primary/20'
                    : 'bg-surface border-border/60'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 ${
                    n.state === 'active' ? 'bg-primary/20 border-primary text-primary'
                    : n.state === 'done' ? 'bg-primary/10 border-primary/40 text-primary/80'
                    : 'bg-surface-high border-border/60 text-on-surface-variant'
                  }`}>{n.icon}</div>
                  <p className={`text-[9px] font-bold uppercase tracking-[0.15em] ${n.state === 'active' ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {n.lbl}
                  </p>
                  <p className={`text-xs font-semibold mt-0.5 truncate ${n.state === 'active' ? 'text-foreground' : 'text-on-surface-variant'}`}>
                    {n.sub}
                  </p>
                  <p className={`text-[10px] mt-1 tabular-nums ${n.state === 'active' ? 'text-primary/80' : 'text-on-surface-variant/70'}`}>
                    {n.val}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Receta selector opcional (colapsado arriba, plegable) ──── */}
          <details className="rounded-xl border border-border bg-surface-high/20" open={!!form.recetaId}>
            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
              <Wand2 size={13} className="text-primary" />
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                Receta <span className="normal-case font-normal">(opcional — autocompleta ingredientes)</span>
              </p>
              {form.recetaId && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">Aplicada</span>}
            </summary>
            <div className="p-3 pt-0">
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
          </details>

          {/* ── RECIPE TOP — plato-card + precio-card en grid 1.2fr/1fr. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">

            {/* ──── PLATO CARD (producto bruto) ──── */}
            <div className="rounded-xl border border-border bg-surface p-4 grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] gap-4">
              {/* Foto del producto bruto (icono tipo "Fish" grande) */}
              <div className="relative aspect-square rounded-lg border border-border/60 overflow-hidden flex flex-col items-center justify-center gap-1.5 text-primary/70"
                style={{ background: 'radial-gradient(circle at 30% 30%, rgba(212,175,55,.14), transparent 60%), linear-gradient(135deg, #1A1714, #0F0D0A)' }}
              >
                <Package size={38} />
                <span className="text-[9px] font-bold uppercase tracking-[0.15em]">Producto bruto</span>
              </div>

              {/* Info del bruto */}
              <div className="flex flex-col gap-2 justify-center min-w-0">
                {/* Chips: rubro + stock disponible + depósito */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {brutoProd?.rubro && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider">
                      <Package size={10}/> {brutoProd.rubro}
                    </span>
                  )}
                  {primerIng?.depositoOrigenId && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent border border-border text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                      {depositos.find(d => d.id === primerIng.depositoOrigenId)?.nombre}
                    </span>
                  )}
                  {form.sector && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-high border border-border text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                      {SECTORES.find(s => s.value === form.sector)?.label}
                    </span>
                  )}
                </div>

                {/* Selector del producto bruto como nombre grande. */}
                <div className="-ml-0.5">
                  <SearchableSelect
                    value={primerIng?.productoId?.toString() || ''}
                    onChange={v => actualizarIngrediente(0, 'productoId', v ? Number(v) : null)}
                    options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                    placeholder="Seleccionar producto bruto..."
                  />
                </div>

                {/* Subtitulo con operario + fecha + hora como mockup */}
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-on-surface-variant">
                  <span>Operario <b className="text-foreground font-semibold">{user?.nombre}</b></span>
                  <span className="w-1 h-1 rounded-full bg-on-surface-variant/40"></span>
                  <span><Clock size={10} className="inline text-primary mr-1"/> <b className="text-foreground font-semibold">{form.fecha} · {form.hora}</b></span>
                </div>

                {/* Depósito origen + sector compactos */}
                <div className="grid grid-cols-2 gap-2 mt-1.5 pt-2 border-t border-border/30">
                  <div>
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em]">Depósito origen</label>
                    <select
                      value={primerIng?.depositoOrigenId?.toString() || ''}
                      onChange={e => actualizarIngrediente(0, 'depositoOrigenId', e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-2 py-1 mt-0.5 rounded bg-surface-high border border-border/60 text-xs font-semibold focus:outline-none focus:border-primary/50"
                    >
                      <option value="">—</option>
                      {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em]">Sector</label>
                    <select
                      value={form.sector}
                      onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
                      className="w-full px-2 py-1 mt-0.5 rounded bg-surface-high border border-border/60 text-xs font-semibold focus:outline-none focus:border-primary/50"
                    >
                      {SECTORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ──── PRECIO CARD (Cantidad a elaborar + KPIs) ──── */}
            <div className="rounded-xl border border-primary/30 p-4 space-y-3"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(212,175,55,.08), transparent 60%), var(--color-surface-high)' }}
            >
              <p className="text-[10px] font-bold text-primary uppercase tracking-[0.22em]">
                Cantidad a elaborar
              </p>

              {/* Input gigante con unidad sufijo (estilo mockup "precio-input") */}
              <div className={`flex items-baseline gap-2 px-4 py-3 rounded-lg bg-background border transition-all ${
                entrada > 0 ? 'border-primary/40' : 'border-border/60'
              }`}>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={primerIng?.cantidad || ''}
                  onChange={e => actualizarIngrediente(0, 'cantidad', e.target.value)}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums tracking-tight"
                />
                <span className="text-sm font-semibold text-on-surface-variant">{unidad}</span>
              </div>

              {/* Grid 2 KPIs: Rendimiento + Costo kg limpio (placeholder) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="px-2 py-2 rounded-md bg-surface border border-border/40">
                  <p className="text-[8.5px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-1">Rendimiento</p>
                  <p className={`font-mono text-lg font-extrabold tabular-nums ${
                    rend >= 75 ? 'text-success' : rend >= 60 ? 'text-amber-500' : rend > 0 ? 'text-destructive' : 'text-on-surface-variant'
                  }`}>
                    {entrada > 0 && limpio > 0 ? `${rend.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className="px-2 py-2 rounded-md bg-surface border border-border/40">
                  <p className="text-[8.5px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-1">Producto limpio</p>
                  <p className={`font-mono text-lg font-extrabold tabular-nums ${limpio > 0 ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {limpio > 0 ? `${fmtNum(limpio)} ${unidad}` : '—'}
                  </p>
                </div>
              </div>

              {/* Barra visual de rendimiento con markers 0/60/75/100 */}
              {entrada > 0 && (
                <div className="relative pt-1">
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        rend >= 75 ? 'bg-success' : rend >= 60 ? 'bg-amber-500' : 'bg-destructive'
                      }`}
                      style={{ width: `${Math.min(100, rend)}%` }}
                    />
                  </div>
                  <div className="relative text-[9px] tabular-nums text-on-surface-variant/70 mt-1 h-3">
                    <span className="absolute left-0">0%</span>
                    <span className="absolute" style={{ left: '60%', transform: 'translateX(-50%)' }}>60%</span>
                    <span className="absolute" style={{ left: '75%', transform: 'translateX(-50%)' }}>75%</span>
                    <span className="absolute right-0">100%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── SPLIT3 — Desglose Merma/Reutilizable/Desecho como mockup ── */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Desglose del proceso</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">¿Qué se pierde y qué se aprovecha?</p>
              </div>
              {entrada > 0 && perdido > 0 && (
                <span className="text-sm font-semibold tabular-nums text-on-surface-variant">
                  {fmtNum(perdido)} {unidad} · <span className="text-destructive">{((perdido/entrada)*100).toFixed(0)}%</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { key: 'merma' as const,   label: 'Merma',        hint: 'Descarte inevitable (piel, cartílagos)',        icon: <TrendingDown size={16}/>, color: 'warn' },
                { key: 'reuti' as const,   label: 'Reutilizable', hint: 'Se va a otro proceso (fumet, rellenos)',        icon: <Activity size={16}/>,    color: 'good' },
                { key: 'desecho' as const, label: 'Desecho',      hint: 'Descarte definitivo',                            icon: <X size={16}/>,           color: 'bad'  },
              ].map(s => {
                const val = Number(splits[s.key]) || 0;
                const pct = entrada > 0 ? (val / entrada) * 100 : 0;
                const colorIcon = s.color === 'warn' ? 'bg-amber-500/10 text-amber-500'
                  : s.color === 'good' ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive';
                const colorBar = s.color === 'warn' ? 'bg-amber-500'
                  : s.color === 'good' ? 'bg-success'
                  : 'bg-destructive';
                return (
                  <div key={s.key} className="rounded-lg border border-border/60 bg-surface-high/40 p-3 space-y-2 hover:border-border transition-colors focus-within:border-primary/50">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${colorIcon}`}>
                        {s.icon}
                      </div>
                      <span className="flex-1 text-sm font-semibold">{s.label}</span>
                      <span className="text-[10px] font-bold tabular-nums text-on-surface-variant bg-surface px-2 py-0.5 rounded-full">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 px-3 py-2 rounded bg-surface border border-border/60">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={splits[s.key]}
                        onChange={e => setSplits(prev => ({ ...prev, [s.key]: e.target.value }))}
                        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xl font-bold tabular-nums focus:outline-none"
                      />
                      <span className="text-xs text-on-surface-variant">{unidad}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant/70 leading-snug">{s.hint}</p>
                    <div className="h-0.5 rounded-full bg-surface overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${colorBar}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RESULTADO: Producto limpio generado ── */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Resultado</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">Producto limpio generado</p>
              </div>
              <span className="font-mono text-lg font-extrabold tabular-nums text-primary">
                {limpio > 0 ? `${fmtNum(limpio)} ${unidad}` : '—'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 py-3 bg-surface-high/40 rounded-lg border border-border/60">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Producto</p>
                <div className="mt-0.5">
                  <SearchableSelect
                    value={form.productoResultadoId?.toString() || ''}
                    onChange={handleProductoResultadoChange}
                    options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                    placeholder="Seleccionar..."
                  />
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Cantidad limpia</p>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={limpioCalc > 0 ? fmtNum(limpioCalc) : '0'}
                  value={form.cantidadProducida}
                  onChange={e => handleCantidadChange(e.target.value)}
                  className="w-full mt-0.5 px-2 py-2 rounded bg-surface border border-border/60 text-base font-bold tabular-nums focus:outline-none focus:border-primary/50"
                />
                {limpioCalc > 0 && Number(form.cantidadProducida) !== limpioCalc && (
                  <p className="text-[9px] text-primary/70 italic mt-0.5">
                    Calculado: {fmtNum(limpioCalc)} {unidad}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Destino</p>
                <select
                  value={form.depositoDestinoId?.toString() || ''}
                  onChange={e => setForm(f => ({ ...f, depositoDestinoId: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full mt-0.5 px-2 py-2 rounded bg-surface border border-border/60 text-sm font-semibold focus:outline-none focus:border-primary/50"
                >
                  <option value="">Sin asignar</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-1 text-primary text-xs font-bold hover:gap-2 transition-all cursor-pointer"
                  onClick={() => { setModalOpen(false); setTab('porcionado'); }}
                  title="Continuar a Porcionado tras guardar"
                >
                  Ir a porcionado <ArrowRight size={13}/>
                </div>
              </div>
            </div>
          </div>

          {/* Ingredientes adicionales — colapsable, solo si hay múltiples */}
          {form.ingredientes.length > 1 && (
            <details className="rounded-xl border border-border bg-surface-high/20" open>
              <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
                <ArrowLeft size={13} className="text-orange-400" />
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                  Co-insumos <span className="normal-case font-normal">({form.ingredientes.length - 1} adicionales)</span>
                </p>
              </summary>
              <div className="p-3 pt-0 space-y-2">
                {form.ingredientes.slice(1).map((ing, idx) => {
                  const realIdx = idx + 1;
                  return (
                    <div key={realIdx} className="grid grid-cols-12 gap-2 items-start bg-surface rounded-lg p-2 border border-border/40">
                      <div className="col-span-5">
                        <SearchableSelect
                          value={ing.productoId?.toString() || ''}
                          onChange={v => actualizarIngrediente(realIdx, 'productoId', v ? Number(v) : null)}
                          options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                          placeholder="Producto..."
                        />
                      </div>
                      <input type="number" placeholder="Cant." value={ing.cantidad}
                        onChange={e => actualizarIngrediente(realIdx, 'cantidad', e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm font-semibold focus:outline-none focus:border-primary/50"/>
                      <input type="text" readOnly value={ing.unidad}
                        className="col-span-2 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm text-on-surface-variant"/>
                      <select value={ing.depositoOrigenId?.toString() || ''}
                        onChange={e => actualizarIngrediente(realIdx, 'depositoOrigenId', e.target.value ? Number(e.target.value) : null)}
                        className="col-span-2 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm font-semibold focus:outline-none focus:border-primary/50"
                      >
                        <option value="">—</option>
                        {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                      </select>
                      <button onClick={() => quitarIngrediente(realIdx)}
                        className="col-span-1 p-1 rounded hover:bg-destructive/10 text-on-surface-variant hover:text-destructive justify-self-end">
                        <X size={13}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <button
            onClick={agregarIngrediente}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            <Plus size={13}/> Agregar co-insumo
          </button>

          {/* Observación compacta */}
          <Input
            label="Observación (opcional)"
            id="observacion"
            value={form.observacion}
            onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
            placeholder="Notas adicionales..."
          />

          {/* ── STICKY FOOT — autoguardado pulso + botones grandes ── */}
          <div
            className="sticky bottom-0 -mx-4 sm:-mx-6 mt-4 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border/60"
            style={{ background: 'linear-gradient(to top, var(--color-background) 60%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant min-w-0">
              <span className="shrink-0 w-2 h-2 rounded-full bg-success"
                style={{ boxShadow: '0 0 8px var(--color-success)', animation: 'pulseGlow 2s ease-in-out infinite' }}
              />
              <span className="truncate">
                {entrada > 0 && limpio > 0
                  ? <>Rendimiento <b className="text-foreground font-mono">{rend.toFixed(1)}%</b> · {fmtNum(limpio)} {unidad} limpios</>
                  : <>Cargá producto y cantidad para calcular rendimiento</>}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={guardar} disabled={loading} className="min-w-[160px]">
                <Save size={14}/> {loading ? 'Guardando...' : 'Guardar elaboración'}
              </Button>
            </div>
          </div>
        </div>
          );
        })()}
      </Modal>
      {/* ═══════════════════════════════════════════════════════════════════
          Modal porcionado — rediseñado FIELMENTE al mockup
          "var-c2-porcionado.jsx" del bundle de Claude Design.
          Estructura: Flow Hero → plato-card (limpio) + precio-card (Cantidad
          a porcionar + KPIs Rendimiento/Costo) → Tamaño porción (slider +
          presets) → Resultado (grilla visual + result-row) → Sticky foot.
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal open={porcionadoOpen} onClose={() => setPorcionadoOpen(false)} title="Registrar porcionado">
        {(() => {
          // ── Cálculos en vivo ─────────────────────────────────────────────
          const principal = porcForm.items[0];
          const origenProd = porcForm.productoOrigenId ? productos.find(p => p.id === porcForm.productoOrigenId) : null;
          const total = Number(porcForm.cantidadOrigen) || 0;
          const peso = Number(principal?.pesoUnidad) || 0;
          // Porciones calculadas: floor(total/peso). Resto = sobrante.
          const porcionesCalc = peso > 0 ? Math.floor(total / peso) : 0;
          // Si el chef ingresó "cantidad" manualmente, usamos eso; si no, el calculado.
          const porcionesUsuario = Number(principal?.cantidad) || 0;
          const porciones = porcionesUsuario > 0 ? porcionesUsuario : porcionesCalc;
          const resto = peso > 0 ? Math.max(0, total - porciones * peso) : 0;
          const rend = total > 0 && peso > 0 ? ((porciones * peso) / total) * 100 : 0;
          const unidad = porcForm.unidadOrigen || 'kg';
          const fmtN = (n: number, dec = 2) => Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: dec }) : '—';
          const PRESETS_KG = [0.1, 0.15, 0.2, 0.25, 0.3];

          return (
        <div className="space-y-4">

          {/* ── FLOW HERO — 4 nodos. Bruto/Elaborado done, Porción ACTIVE,
              Receta pendiente. */}
          <div className="rounded-xl border border-border/60 bg-surface-high/20 p-4">
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Circuito de producción</p>
                <p className="text-base font-semibold text-foreground mt-0.5">Trazabilidad del porcionado</p>
              </div>
              <p className="text-[10px] text-on-surface-variant/70 italic">Tocá un paso para ir</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { lbl: 'Bruto',     sub: 'Producto bruto',                       val: '—',                                                                                  icon: <Package size={22}/>,  state: 'done' as const },
                { lbl: 'Elaborado', sub: origenProd?.nombre || 'Producto limpio', val: total > 0 ? `${fmtN(total)} ${unidad}` : '—',                                          icon: <Flame size={22}/>,    state: 'done' as const },
                { lbl: 'Porción',   sub: peso > 0 ? `Porción ${(peso*1000).toFixed(0)}g` : 'Configurando',                            val: porciones > 0 ? `${porciones} u · ${rend.toFixed(0)}%` : 'En edición', icon: <Scissors size={22}/>, state: 'active' as const },
                { lbl: 'Receta',    sub: 'Pendiente',                            val: '—',                                                                                  icon: <Utensils size={22}/>, state: 'idle' as const },
              ].map((n, i) => (
                <div key={i}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    n.state === 'active' ? 'bg-primary/10 border-primary/50'
                    : n.state === 'done' ? 'bg-primary/5 border-primary/20'
                    : 'bg-surface border-border/60'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-2 ${
                    n.state === 'active' ? 'bg-primary/20 border-primary text-primary'
                    : n.state === 'done' ? 'bg-primary/10 border-primary/40 text-primary/80'
                    : 'bg-surface-high border-border/60 text-on-surface-variant'
                  }`}>{n.icon}</div>
                  <p className={`text-[9px] font-bold uppercase tracking-[0.15em] ${n.state === 'active' ? 'text-primary' : 'text-on-surface-variant'}`}>{n.lbl}</p>
                  <p className={`text-xs font-semibold mt-0.5 truncate ${n.state === 'active' ? 'text-foreground' : 'text-on-surface-variant'}`}>{n.sub}</p>
                  <p className={`text-[10px] mt-1 tabular-nums ${n.state === 'active' ? 'text-primary/80' : 'text-on-surface-variant/70'}`}>{n.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── RECIPE TOP — plato-card (limpio) + precio-card (a porcionar) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">

            {/* Plato card del producto LIMPIO de origen */}
            <div className="rounded-xl border border-border bg-surface p-4 grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] gap-4">
              <div className="relative aspect-square rounded-lg border border-border/60 overflow-hidden flex flex-col items-center justify-center gap-1.5 text-primary/70"
                style={{ background: 'radial-gradient(circle at 30% 30%, rgba(212,175,55,.14), transparent 60%), linear-gradient(135deg, #1A1714, #0F0D0A)' }}
              >
                <Flame size={38} />
                <span className="text-[9px] font-bold uppercase tracking-[0.15em]">Producto limpio</span>
              </div>

              <div className="flex flex-col gap-2 justify-center min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {origenProd?.rubro && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider">
                      <Package size={10}/> {origenProd.rubro}
                    </span>
                  )}
                  {porcForm.depositoOrigenId && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-transparent border border-border text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                      {depositos.find(d => d.id === porcForm.depositoOrigenId)?.nombre}
                    </span>
                  )}
                </div>

                {/* Selector del producto limpio como nombre grande */}
                <div className="-ml-0.5">
                  <SearchableSelect
                    value={porcForm.productoOrigenId?.toString() || ''}
                    onChange={v => {
                      const prod = productos.find(p => p.id === Number(v));
                      setPorcForm(f => ({ ...f, productoOrigenId: v ? Number(v) : null, unidadOrigen: prod?.unidadUso || f.unidadOrigen }));
                    }}
                    options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
                    placeholder="Seleccionar producto limpio..."
                  />
                </div>

                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-on-surface-variant">
                  <span>Operario <b className="text-foreground font-semibold">{user?.nombre}</b></span>
                  <span className="w-1 h-1 rounded-full bg-on-surface-variant/40"></span>
                  <span><Clock size={10} className="inline text-primary mr-1"/> <b className="text-foreground font-semibold">{new Date().toLocaleDateString('es-AR')}</b></span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1.5 pt-2 border-t border-border/30">
                  <div>
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em]">Depósito origen</label>
                    <select
                      value={porcForm.depositoOrigenId?.toString() || ''}
                      onChange={e => setPorcForm(f => ({ ...f, depositoOrigenId: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full px-2 py-1 mt-0.5 rounded bg-surface-high border border-border/60 text-xs font-semibold focus:outline-none focus:border-primary/50"
                    >
                      <option value="">—</option>
                      {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em]">Unidad</label>
                    <input
                      type="text"
                      value={porcForm.unidadOrigen}
                      onChange={e => setPorcForm(f => ({ ...f, unidadOrigen: e.target.value }))}
                      placeholder="kg"
                      className="w-full px-2 py-1 mt-0.5 rounded bg-surface-high border border-border/60 text-xs font-semibold focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Precio card: Cantidad a porcionar + KPIs */}
            <div className="rounded-xl border border-primary/30 p-4 space-y-3"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(212,175,55,.08), transparent 60%), var(--color-surface-high)' }}
            >
              <p className="text-[10px] font-bold text-primary uppercase tracking-[0.22em]">
                Cantidad a porcionar
              </p>

              <div className={`flex items-baseline gap-2 px-4 py-3 rounded-lg bg-background border transition-all ${
                total > 0 ? 'border-primary/40' : 'border-border/60'
              }`}>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={porcForm.cantidadOrigen}
                  onChange={e => setPorcForm(f => ({ ...f, cantidadOrigen: e.target.value }))}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums tracking-tight"
                />
                <span className="text-sm font-semibold text-on-surface-variant">{unidad}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="px-2 py-2 rounded-md bg-surface border border-border/40">
                  <p className="text-[8.5px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-1">Rendimiento</p>
                  <p className={`font-mono text-lg font-extrabold tabular-nums ${
                    rend >= 95 ? 'text-success' : rend >= 80 ? 'text-amber-500' : rend > 0 ? 'text-destructive' : 'text-on-surface-variant'
                  }`}>
                    {total > 0 && porciones > 0 ? `${rend.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className="px-2 py-2 rounded-md bg-surface border border-border/40">
                  <p className="text-[8.5px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-1">Resto sin usar</p>
                  <p className={`font-mono text-lg font-extrabold tabular-nums ${
                    resto > 0 ? 'text-amber-500' : total > 0 && porciones > 0 ? 'text-success' : 'text-on-surface-variant'
                  }`}>
                    {total > 0 && peso > 0 ? `${(resto*1000).toFixed(0)} g` : '—'}
                  </p>
                </div>
              </div>

              {/* Barra visual con marker 95% */}
              {total > 0 && peso > 0 && (
                <div className="relative pt-1">
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${rend >= 95 ? 'bg-success' : rend >= 80 ? 'bg-amber-500' : 'bg-destructive'}`}
                      style={{ width: `${Math.min(100, rend)}%` }}
                    />
                  </div>
                  <div className="relative text-[9px] tabular-nums text-on-surface-variant/70 mt-1 h-3">
                    <span className="absolute left-0">0%</span>
                    <span className="absolute" style={{ left: '95%', transform: 'translateX(-50%)' }}>95%</span>
                    <span className="absolute right-0">100%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── TAMAÑO DE LA PORCIÓN — slider + presets, como mockup ── */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Tamaño de la porción</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">¿De cuánto es cada pieza?</p>
              </div>
              <span className="font-mono text-lg font-extrabold tabular-nums text-primary">
                {peso > 0 ? `${(peso*1000).toFixed(0)} g` : '—'}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 items-center">
              {/* Slider visual con marks 50g/200g/500g */}
              <div>
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="text-xs text-on-surface-variant font-semibold">Peso por porción</span>
                  <span className="font-mono text-2xl font-bold text-primary tabular-nums">
                    {(peso*1000).toFixed(0)}<span className="text-xs text-on-surface-variant ml-1">gramos</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={peso || 0.05}
                  onChange={e => porcUpdateItem(0, 'pesoUnidad', e.target.value)}
                  className="w-full h-2 rounded-full bg-surface-high appearance-none cursor-pointer accent-primary"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <div className="flex justify-between text-[10px] tabular-nums text-on-surface-variant/70 mt-2 tracking-wider">
                  <span>50 g</span>
                  <span>200 g</span>
                  <span>500 g</span>
                </div>
              </div>

              {/* Presets de pesos comunes */}
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em] mb-2">Presets</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESETS_KG.map(v => {
                    const selected = Math.abs(peso - v) < 0.001;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => porcUpdateItem(0, 'pesoUnidad', v)}
                        className={`px-1 py-2.5 rounded font-mono font-bold tabular-nums text-xs transition-all active:scale-95 ${
                          selected
                            ? 'bg-primary text-background border border-primary'
                            : 'bg-surface-high border border-border/60 text-on-surface-variant hover:border-primary/40 hover:text-foreground'
                        }`}
                      >
                        {(v*1000).toFixed(0)} g
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selector del producto porción + depósito destino */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/40">
              <div>
                <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Producto porción generado</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={principal?.productoId?.toString() || ''}
                    onChange={v => porcUpdateItem(0, 'productoId', v ? Number(v) : null)}
                    options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                    placeholder="Ej: Salmón porción 200g..."
                  />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Depósito destino</label>
                <select
                  value={principal?.depositoDestinoId?.toString() || ''}
                  onChange={e => porcUpdateItem(0, 'depositoDestinoId', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-2 mt-1 rounded bg-surface-high border border-border/60 text-sm font-semibold focus:outline-none focus:border-primary/50"
                >
                  <option value="">Sin asignar</option>
                  {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── RESULTADO — porciones generadas con grilla visual + result-row ── */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Resultado</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">
                  {porciones > 0 ? `${porciones} porciones generadas` : 'Configurá peso y cantidad para generar porciones'}
                </p>
              </div>
              <span className="font-mono text-lg font-extrabold tabular-nums text-primary">
                {porciones > 0 ? `${porciones} u` : '—'}
              </span>
            </div>

            {/* Grilla visual de porciones (max 80 visibles) — como mockup */}
            {porciones > 0 && peso > 0 && (
              <div className="bg-surface-high/40 rounded-lg p-3 mb-3 max-h-[280px] overflow-y-auto">
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}>
                  {Array.from({ length: Math.min(porciones, 80) }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-surface border border-border/60 rounded p-1.5 flex flex-col items-center justify-center gap-0.5"
                      style={{ animation: `fadeInUp 0.3s ease-out ${i * 12}ms backwards` }}
                    >
                      <span className="font-mono text-[8.5px] text-on-surface-variant/70 tracking-wider">
                        {String(i+1).padStart(2,'0')}
                      </span>
                      <span className="font-mono text-[11px] font-bold text-primary tabular-nums">
                        {(peso*1000).toFixed(0)}g
                      </span>
                    </div>
                  ))}
                  {porciones > 80 && (
                    <div className="col-span-full text-center text-xs text-on-surface-variant italic py-2 border border-dashed border-border/60 rounded-md">
                      + {porciones - 80} porciones más
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Result row: 4 cells horizontal como mockup */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-3 py-3 bg-surface-high/40 rounded-lg border border-border/60">
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Genera producto</p>
                <p className="text-sm font-semibold text-foreground mt-1 truncate">
                  {principal?.productoId ? productos.find(p => p.id === principal.productoId)?.nombre : '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Resto</p>
                <p className={`text-sm font-semibold mt-1 ${resto > 0 ? 'text-amber-500' : total > 0 && porciones > 0 ? 'text-success' : 'text-on-surface-variant'}`}>
                  {total > 0 && peso > 0
                    ? (resto > 0 ? `${(resto*1000).toFixed(0)} g sobrante` : 'Sin resto')
                    : '—'
                  }
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Destino</p>
                <p className="text-sm font-semibold mt-1 truncate">
                  {principal?.depositoDestinoId ? depositos.find(d => d.id === principal.depositoDestinoId)?.nombre : '—'}
                </p>
              </div>
              <div className="flex items-end">
                <div
                  className="flex items-center gap-1 text-primary text-xs font-bold hover:gap-2 transition-all cursor-pointer"
                  title="Continuar a Receta tras guardar"
                  onClick={() => setPorcionadoOpen(false)}
                >
                  Usar en receta <ArrowRight size={13}/>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-productos secundarios (colapsable, solo si hay >1) */}
          {porcForm.items.length > 1 && (
            <details className="rounded-xl border border-border bg-surface-high/20" open>
              <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
                <Scissors size={13} className="text-emerald-400" />
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                  Sub-productos secundarios <span className="normal-case font-normal">({porcForm.items.length - 1})</span>
                </p>
              </summary>
              <div className="p-3 pt-0 space-y-2">
                {porcForm.items.slice(1).map((item, idx) => {
                  const realIdx = idx + 1;
                  return (
                    <div key={realIdx} className="grid grid-cols-12 gap-2 items-start bg-surface rounded-lg p-2 border border-border/40">
                      <div className="col-span-4">
                        <SearchableSelect
                          value={item.productoId?.toString() || ''}
                          onChange={v => porcUpdateItem(realIdx, 'productoId', v ? Number(v) : null)}
                          options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                          placeholder="Producto..."
                        />
                      </div>
                      <input type="number" placeholder="Unid." value={item.cantidad}
                        onChange={e => porcUpdateItem(realIdx, 'cantidad', e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm font-semibold tabular-nums focus:outline-none focus:border-primary/50"/>
                      <input type="number" step="0.01" placeholder="Peso/u" value={item.pesoUnidad}
                        onChange={e => porcUpdateItem(realIdx, 'pesoUnidad', e.target.value)}
                        className="col-span-2 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm font-semibold tabular-nums focus:outline-none focus:border-primary/50"/>
                      <select value={item.depositoDestinoId?.toString() || ''}
                        onChange={e => porcUpdateItem(realIdx, 'depositoDestinoId', e.target.value ? Number(e.target.value) : null)}
                        className="col-span-3 px-2 py-1.5 rounded bg-surface-high border border-border/60 text-sm font-semibold focus:outline-none focus:border-primary/50"
                      >
                        <option value="">—</option>
                        {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                      </select>
                      <button onClick={() => porcRemoveItem(realIdx)}
                        className="col-span-1 p-1 rounded hover:bg-destructive/10 text-on-surface-variant hover:text-destructive justify-self-end">
                        <X size={13}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          <button
            onClick={porcAddItem}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            <Plus size={13}/> Agregar sub-producto secundario
          </button>

          {/* Merma compacta + observación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.22em]">Merma adicional <span className="normal-case font-normal text-[10px]">(opcional)</span></label>
              <div className={`flex items-baseline gap-1.5 px-3 py-2 mt-1 rounded bg-surface border transition-colors ${Number(porcForm.merma) > 0 ? 'border-amber-500/40' : 'border-border/60'}`}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={porcForm.merma}
                  onChange={e => setPorcForm(f => ({ ...f, merma: e.target.value }))}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base font-bold tabular-nums focus:outline-none"
                />
                <span className="text-xs text-on-surface-variant">{unidad}</span>
              </div>
            </div>
            <Input
              label="Observación (opcional)"
              value={porcForm.observacion}
              onChange={e => setPorcForm(f => ({ ...f, observacion: e.target.value }))}
              placeholder="Notas adicionales..."
            />
          </div>

          {/* Sticky foot */}
          <div
            className="sticky bottom-0 -mx-4 sm:-mx-6 mt-4 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border/60"
            style={{ background: 'linear-gradient(to top, var(--color-background) 60%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant min-w-0">
              <span className="shrink-0 w-2 h-2 rounded-full bg-success"
                style={{ boxShadow: '0 0 8px var(--color-success)', animation: 'pulseGlow 2s ease-in-out infinite' }}
              />
              <span className="truncate">
                {porciones > 0 && peso > 0
                  ? <>Saldrán <b className="text-foreground font-mono">{porciones}</b> porciones de <b className="text-foreground font-mono">{(peso*1000).toFixed(0)}g</b> · rendimiento <b className="text-foreground font-mono">{rend.toFixed(1)}%</b></>
                  : <>Configurá peso por porción y cantidad para calcular</>}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" onClick={() => setPorcionadoOpen(false)}>Cancelar</Button>
              <Button onClick={guardarPorcionado} disabled={porcionadoLoading} className="min-w-[160px]">
                <Save size={14}/> {porcionadoLoading ? 'Guardando...' : 'Guardar porcionado'}
              </Button>
            </div>
          </div>
        </div>
          );
        })()}
      </Modal>
    </div>
  );
}
