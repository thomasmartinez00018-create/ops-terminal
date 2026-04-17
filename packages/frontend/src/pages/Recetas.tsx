import { useEffect, useMemo, useState } from 'react';
import PageTour from '../components/PageTour';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import DrawerModal from '../components/ui/DrawerModal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import HelpHint from '../components/ui/HelpHint';
import {
  Plus, Pencil, Trash2, ChefHat, DollarSign, X, Package, Calculator, Info,
  Copy, ChevronDown, ChevronUp, Send, Sliders, Search,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { factorDesperdicio, porcentajeDesperdicio } from '../lib/merma';

// ============================================================================
// RECETAS — rediseño pensado para el barro de la cocina
// ----------------------------------------------------------------------------
// Prioridades de esta versión, en orden:
//   1. El dato que importa (costo por porción) es SIEMPRE lo más grande y visible.
//   2. Mobile first — cards verticales, no grids de 6 columnas que se cortan.
//   3. Modo simple por default (sin merma). Merma es opcional, se activa con
//      un chip por ingrediente → cocinas que no la usan no ven ruido.
//   4. Un ingrediente se carga tap-tap-número: producto + cantidad, listo.
//   5. Duplicar receta en 1 click — la mayoría de recetas son variaciones.
//   6. La lista en mobile son cards grandes con el costo por porción arriba.
// No saca ninguna función previa: solo reordena, colapsa lo complejo y
// destaca lo útil.
// ============================================================================

const CATEGORIAS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'plato', label: 'Plato' },
  { value: 'postre', label: 'Postre' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'guarnicion', label: 'Guarnición' },
];

const SECTORES = [
  { value: '', label: 'Sin sector' },
  { value: 'pizzeria', label: 'Pizzería' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'pasteleria', label: 'Pastelería' },
  { value: 'pastas', label: 'Pastas' },
];

interface Ingrediente {
  productoId: number | null;
  cantidad: number;
  unidad: string;
  mermaEsperada: number;
}

const emptyIngrediente: Ingrediente = {
  productoId: null,
  cantidad: 0,
  unidad: '',
  mermaEsperada: 0,
};

const emptyForm = {
  codigo: '',
  nombre: '',
  categoria: '',
  sector: '',
  porciones: 1,
  productoResultadoId: null as number | null,
  cantidadProducida: '' as string | number,
  unidadProducida: '',
  ingredientes: [] as Ingrediente[],
};

// Formato de dinero corto pensado para etiquetas ("$3.250" sin decimales si
// es redondo, con 2 si es chiquito). Ahorra espacio en cards mobile.
function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = abs >= 100
    ? { maximumFractionDigits: 0 }
    : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
  return `$${n.toLocaleString('es-AR', opts)}`;
}
function fmtNum(n: number, dec = 3): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { maximumFractionDigits: dec });
}

export default function Recetas() {
  const { addToast } = useToast();
  const [recetas, setRecetas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [costoModal, setCostoModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [costoData, setCostoData] = useState<any>(null);
  const [error, setError] = useState('');
  // Precios unitarios en vivo (último costo de compra por producto)
  const [preciosUnit, setPreciosUnit] = useState<Record<number, number>>({});
  // Mini-calculadora de % desperdicio (peso bruto + peso desperdicio)
  const [calcMermaIndex, setCalcMermaIndex] = useState<number | null>(null);
  const [calcBruto, setCalcBruto] = useState('');
  const [calcDesp, setCalcDesp] = useState('');
  // Ingrediente cuyos "detalles" (merma/factor/precio unit) están expandidos.
  // Se colapsa por default para no asustar con números al que solo quiere
  // cargar una receta simple.
  const [expandedIng, setExpandedIng] = useState<number | null>(null);
  // Filtros de la lista
  const [buscar, setBuscar] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

  const cargar = () => {
    api.getRecetas({ activo: 'true' }).then(setRecetas).catch(console.error);
  };

  useEffect(() => {
    cargar();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
  }, []);

  // Productos indexados por id — mucho más rápido que productos.find en cada
  // render de cada ingrediente.
  const productosById = useMemo(() => {
    const m = new Map<number, any>();
    for (const p of productos) m.set(p.id, p);
    return m;
  }, [productos]);

  // Lista filtrada (búsqueda + categoría). Se calcula en cliente — las
  // recetas rara vez superan 200.
  const recetasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return recetas.filter((r: any) => {
      if (filtroCat && r.categoria !== filtroCat) return false;
      if (!q) return true;
      return (r.nombre || '').toLowerCase().includes(q)
        || (r.codigo || '').toLowerCase().includes(q);
    });
  }, [recetas, buscar, filtroCat]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const abrir = (receta?: any, opts?: { duplicar?: boolean }) => {
    if (receta) {
      setEditId(opts?.duplicar ? null : receta.id);
      setForm({
        codigo: opts?.duplicar ? `${receta.codigo}-COPIA` : receta.codigo,
        nombre: opts?.duplicar ? `${receta.nombre} (copia)` : receta.nombre,
        categoria: receta.categoria,
        sector: receta.sector || '',
        porciones: receta.porciones,
        productoResultadoId: opts?.duplicar ? null : (receta.productoResultadoId ?? null),
        cantidadProducida: receta.cantidadProducida ?? '',
        unidadProducida: receta.unidadProducida ?? '',
        ingredientes: receta.ingredientes?.map((ing: any) => ({
          productoId: ing.productoId,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          mermaEsperada: ing.mermaEsperada || 0,
        })) || [],
      });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setExpandedIng(null);
    setError('');
    setModalOpen(true);
  };

  const guardar = async () => {
    setError('');
    try {
      const data = {
        codigo: form.codigo,
        nombre: form.nombre,
        categoria: form.categoria,
        sector: form.sector || null,
        porciones: Number(form.porciones),
        productoResultadoId: form.productoResultadoId ?? null,
        cantidadProducida: form.cantidadProducida !== '' ? Number(form.cantidadProducida) : null,
        unidadProducida: form.unidadProducida || null,
        ingredientes: form.ingredientes.map(ing => ({
          productoId: ing.productoId,
          cantidad: Number(ing.cantidad),
          unidad: ing.unidad,
          mermaEsperada: Number(ing.mermaEsperada),
        })),
      };
      if (editId) {
        await api.updateReceta(editId, data);
        addToast('Receta actualizada correctamente');
      } else {
        await api.createReceta(data);
        addToast('Receta creada correctamente');
      }
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
      addToast('Error al guardar la receta', 'error');
    }
  };

  const eliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar la receta "${nombre}"? Esta acción se puede revertir.`)) return;
    try {
      await api.deleteReceta(id);
      addToast('Receta desactivada');
      cargar();
    } catch {
      addToast('Error al desactivar la receta', 'error');
    }
  };

  const verCosto = async (id: number) => {
    try {
      const data = await api.getRecetaCosto(id);
      setCostoData(data);
      setCostoModal(true);
    } catch (e: any) {
      console.error(e);
      addToast('No pudimos calcular el costo ahora', 'error');
    }
  };

  const agregarIngrediente = () => {
    const nuevoIdx = form.ingredientes.length;
    setForm({ ...form, ingredientes: [...form.ingredientes, { ...emptyIngrediente }] });
    // Expandimos el recién agregado para que el usuario lo vea en foco.
    setExpandedIng(nuevoIdx);
  };

  const quitarIngrediente = (index: number) => {
    setForm({ ...form, ingredientes: form.ingredientes.filter((_, i) => i !== index) });
    if (expandedIng === index) setExpandedIng(null);
  };

  const actualizarIngrediente = (index: number, campo: keyof Ingrediente, valor: any) => {
    const nuevos = [...form.ingredientes];
    nuevos[index] = { ...nuevos[index], [campo]: valor };
    if (campo === 'productoId' && valor) {
      const prod = productosById.get(Number(valor));
      if (prod) nuevos[index].unidad = prod.unidadUso;
    }
    setForm({ ...form, ingredientes: nuevos });
  };

  // Cargar últimos precios cada vez que cambian los productos seleccionados
  useEffect(() => {
    if (!modalOpen) return;
    const ids = Array.from(
      new Set(
        form.ingredientes
          .map(ing => ing.productoId)
          .filter((id): id is number => id != null)
      )
    );
    const faltan = ids.filter(id => !(id in preciosUnit));
    if (faltan.length === 0) return;
    api.getUltimosCostos(faltan)
      .then(resp => {
        setPreciosUnit(prev => {
          const next = { ...prev };
          for (const id of faltan) {
            next[id] = resp[id]?.costoUnitario ?? 0;
          }
          return next;
        });
      })
      .catch(() => { });
  }, [form.ingredientes, modalOpen]);

  const abrirCalcMerma = (index: number) => {
    setCalcMermaIndex(index);
    setCalcBruto('');
    setCalcDesp('');
  };

  const aplicarCalcMerma = () => {
    if (calcMermaIndex == null) return;
    const bruto = Number(calcBruto);
    const desp = Number(calcDesp);
    if (!bruto || bruto <= 0 || desp < 0) return;
    const pct = porcentajeDesperdicio(bruto, desp);
    actualizarIngrediente(calcMermaIndex, 'mermaEsperada', +pct.toFixed(2));
    setCalcMermaIndex(null);
  };

  // ── Cálculos en vivo del form ─────────────────────────────────────────────
  const { costoTotal, costoPorPorcion } = useMemo(() => {
    let total = 0;
    for (const ing of form.ingredientes) {
      const merma = Number(ing.mermaEsperada) || 0;
      const factor = factorDesperdicio(merma);
      const cantNeta = Number(ing.cantidad) || 0;
      const precio = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
      total += cantNeta * factor * precio;
    }
    const porc = form.porciones > 0 ? total / form.porciones : 0;
    return { costoTotal: total, costoPorPorcion: porc };
  }, [form.ingredientes, form.porciones, preciosUnit]);

  // Costo por porción de una receta guardada — la pre-calculamos para las
  // cards de la lista. Usa los precios del último ingreso cargado via
  // /ultimos-costos. Si no hay, el número queda en null y la card muestra
  // "—" con link "Ver costo" que refresca desde el backend.
  const [costosListaCache, setCostosListaCache] = useState<Record<number, number | null>>({});
  useEffect(() => {
    if (!recetas.length) return;
    // Juntamos todos los productoId que aparecen en todas las recetas.
    const pids = new Set<number>();
    for (const r of recetas) {
      for (const ing of r.ingredientes || []) {
        if (ing.productoId) pids.add(ing.productoId);
      }
    }
    if (pids.size === 0) return;
    const faltan = Array.from(pids).filter(id => !(id in preciosUnit));
    if (faltan.length) {
      api.getUltimosCostos(faltan)
        .then(resp => {
          setPreciosUnit(prev => {
            const next = { ...prev };
            for (const id of faltan) next[id] = resp[id]?.costoUnitario ?? 0;
            return next;
          });
        })
        .catch(() => {});
    }
    // Calcular costos por receta con los precios disponibles (aunque sean 0).
    const nuevos: Record<number, number | null> = {};
    for (const r of recetas) {
      if (!r.ingredientes?.length) { nuevos[r.id] = null; continue; }
      let total = 0;
      let tieneAlgunPrecio = false;
      for (const ing of r.ingredientes) {
        const cantNeta = Number(ing.cantidad) || 0;
        const merma = Number(ing.mermaEsperada) || 0;
        const factor = factorDesperdicio(merma);
        const precio = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
        if (precio > 0) tieneAlgunPrecio = true;
        total += cantNeta * factor * precio;
      }
      nuevos[r.id] = tieneAlgunPrecio && r.porciones > 0 ? total / r.porciones : null;
    }
    setCostosListaCache(nuevos);
  }, [recetas, preciosUnit]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageTour pageKey="recetas" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Cocina</p>
            <HelpHint
              title="¿Cómo funcionan las recetas?"
              bullets={[
                'Cargás cada plato una sola vez con sus ingredientes y cuánto lleva de cada uno.',
                'Cuando subís una factura nueva del proveedor, el costo de cada plato se actualiza solo.',
                'El número grande en dorado es el costo por porción — lo que te cuesta hacer un plato. Cobrá mínimo 3× ese número.',
                'Si un ingrediente se descarta (cáscara, hueso), usá el chip "Detalle" para poner el % de merma. Si no, dejalo en 0.',
              ]}
            />
          </div>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Recetas</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {recetas.length} receta{recetas.length === 1 ? '' : 's'} — costo por porción al día con los últimos precios de proveedor.
          </p>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nueva receta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <Input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar receta por nombre o código…"
            className="pl-9"
          />
        </div>
        <Select
          value={filtroCat}
          onChange={e => setFiltroCat(e.target.value)}
          options={[{ value: '', label: 'Todas las categorías' }, ...CATEGORIAS]}
        />
      </div>

      {/* Lista — cards en mobile, tabla en desktop */}
      {/* Mobile: cards grandes, tocables, costo por porción gigante */}
      <div className="sm:hidden space-y-2.5">
        {recetasFiltradas.map(r => {
          const costo = costosListaCache[r.id];
          return (
            <div key={r.id} className="bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-primary">{r.codigo}</p>
                  <p className="font-bold text-foreground text-base leading-tight mt-0.5 truncate">{r.nombre}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge>{r.categoria}</Badge>
                    <span className="text-[10px] text-on-surface-variant">
                      {r.porciones} porción{r.porciones === 1 ? '' : 'es'}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Por porción</p>
                  <p className="font-mono text-xl font-extrabold text-primary tabular-nums leading-tight">
                    {costo != null ? fmtMoney(costo) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => abrir(r)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-high text-xs font-bold text-foreground active:bg-surface-high/70"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  onClick={() => verCosto(r.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-xs font-bold text-primary active:bg-primary/20"
                >
                  <DollarSign size={13} /> Ver detalle
                </button>
                <button
                  onClick={() => abrir(r, { duplicar: true })}
                  className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:bg-surface-high/70"
                  title="Duplicar receta"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => eliminar(r.id, r.nombre)}
                  className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:bg-destructive/10 active:text-destructive"
                  title="Eliminar receta"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {recetasFiltradas.length === 0 && (
          <div className="bg-surface rounded-xl border border-border p-10 text-center">
            <ChefHat size={28} className="mx-auto text-on-surface-variant mb-2" />
            <p className="text-sm text-on-surface-variant font-medium">
              {recetas.length === 0 ? 'Todavía no hay recetas.' : 'Sin resultados con ese filtro.'}
            </p>
            {recetas.length === 0 && (
              <Button size="sm" onClick={() => abrir()} className="mt-3">
                <Plus size={14} /> Crear la primera
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Desktop: tabla con costo por porción destacado */}
      <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Categoría</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Sector</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Porciones</th>
                <th className="text-right p-3 text-[10px] font-bold text-primary uppercase tracking-widest">Costo / porción</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recetasFiltradas.map(r => {
                const costo = costosListaCache[r.id];
                return (
                  <tr key={r.id} className="hover:bg-surface-high/50 transition-colors">
                    <td className="p-3 font-mono text-xs text-primary">{r.codigo}</td>
                    <td className="p-3 font-semibold text-foreground">{r.nombre}</td>
                    <td className="p-3"><Badge>{r.categoria}</Badge></td>
                    <td className="p-3 hidden md:table-cell text-xs text-on-surface-variant">
                      {r.sector ? (SECTORES.find(s => s.value === r.sector)?.label || r.sector) : '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-right text-on-surface-variant">{r.porciones}</td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-base font-extrabold text-primary tabular-nums">
                        {costo != null ? fmtMoney(costo) : '—'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => verCosto(r.id)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-primary transition-colors" title="Ver detalle de costo">
                          <DollarSign size={14} />
                        </button>
                        <button onClick={() => abrir(r)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => abrir(r, { duplicar: true })} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Duplicar">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => eliminar(r.id, r.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {recetasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-on-surface-variant font-medium">
                    {recetas.length === 0 ? 'Todavía no hay recetas. Creá la primera con el botón de arriba.' : 'Sin resultados con ese filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal crear/editar — layout mobile-first con costo visible arriba
          y cards verticales por ingrediente.
          ═══════════════════════════════════════════════════════════════════ */}
      <DrawerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar receta' : 'Nueva receta'}
        size="xl"
      >
        <div className="space-y-4">
          {/* Hero del costo — SIEMPRE visible, es la razón de ser de esta pantalla */}
          <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Costo por porción</p>
                <p className="font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums leading-tight">
                  {costoPorPorcion > 0 ? fmtMoney(costoPorPorcion) : '$0'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total receta</p>
                <p className="font-mono text-lg font-bold text-foreground tabular-nums">
                  {fmtMoney(costoTotal)}
                </p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  {form.porciones} porción{form.porciones === 1 ? '' : 'es'} · {form.ingredientes.length} ingrediente{form.ingredientes.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>

          {/* Datos básicos */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código"
              id="codigo"
              value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })}
              placeholder="REC-001"
            />
            <Input
              label="Porciones"
              id="porciones"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.porciones}
              onChange={e => setForm({ ...form, porciones: Number(e.target.value) || 1 })}
            />
          </div>
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: Pizza napolitana, Milanesa con puré…"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Categoría"
              id="categoria"
              value={form.categoria}
              onChange={e => setForm({ ...form, categoria: e.target.value })}
              options={CATEGORIAS}
              placeholder="Elegir…"
            />
            <Select
              label="Sector"
              id="sector"
              value={form.sector}
              onChange={e => setForm({ ...form, sector: e.target.value })}
              options={SECTORES}
            />
          </div>

          {/* Producto elaborado — solo si la receta también produce stock */}
          <details className="rounded-xl border border-border bg-surface-high/20 group">
            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
              <Package size={13} className="text-primary" />
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                Producto elaborado <span className="normal-case font-normal">(opcional)</span>
              </p>
              {form.productoResultadoId && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Configurado
                </span>
              )}
              <ChevronDown size={14} className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-3 pt-0 space-y-2">
              <p className="text-[11px] text-on-surface-variant">
                Solo si esta receta produce un producto con stock propio (ej: masa madre, caldo, salsa base).
                Al elaborar, se consume los ingredientes y se ingresa al stock lo producido.
              </p>
              <SearchableSelect
                value={form.productoResultadoId?.toString() || ''}
                onChange={v => {
                  const prod = productosById.get(Number(v));
                  setForm(f => ({
                    ...f,
                    productoResultadoId: v ? Number(v) : null,
                    unidadProducida: prod?.unidadUso ?? f.unidadProducida,
                  }));
                }}
                options={[
                  { value: '', label: 'Sin producto resultado' },
                  ...productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} · ${p.nombre}` })),
                ]}
                placeholder="Buscar producto elaborado…"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Cantidad producida"
                  id="cantidadProducida"
                  type="number"
                  inputMode="decimal"
                  value={form.cantidadProducida}
                  onChange={e => setForm(f => ({ ...f, cantidadProducida: e.target.value }))}
                  placeholder="ej: 7"
                />
                <Input
                  label="Unidad"
                  id="unidadProducida"
                  value={form.unidadProducida}
                  onChange={e => setForm(f => ({ ...f, unidadProducida: e.target.value }))}
                  placeholder="kg, lt, unidad…"
                />
              </div>
            </div>
          </details>

          {/* Ingredientes — cards verticales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ChefHat size={14} className="text-primary" />
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Ingredientes <span className="text-primary">({form.ingredientes.length})</span>
                </p>
              </div>
              <button
                onClick={agregarIngrediente}
                className="flex items-center gap-1 text-xs font-bold text-primary active:text-primary/70 px-2 py-1 rounded-lg hover:bg-primary/10"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            {form.ingredientes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-xs text-on-surface-variant italic mb-3">
                  Sin ingredientes todavía. Tocá "Agregar" para empezar.
                </p>
                <Button size="sm" onClick={agregarIngrediente}>
                  <Plus size={14} /> Primer ingrediente
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {form.ingredientes.map((ing, index) => {
                  const merma = Number(ing.mermaEsperada) || 0;
                  const factor = factorDesperdicio(merma);
                  const cantNeta = Number(ing.cantidad) || 0;
                  const cantBruta = cantNeta * factor;
                  const precioUnit = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
                  const costoTotalIng = cantBruta * precioUnit;
                  const tieneMerma = merma > 0;
                  const isExpanded = expandedIng === index;
                  const prod = ing.productoId ? productosById.get(ing.productoId) : null;

                  return (
                    <div
                      key={index}
                      className={`rounded-xl bg-surface-high/40 border transition-all ${
                        isExpanded ? 'border-primary/40' : 'border-border/60'
                      }`}
                    >
                      {/* Fila principal: producto + cantidad + costo + quitar */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <SearchableSelect
                              value={ing.productoId?.toString() || ''}
                              onChange={v => actualizarIngrediente(index, 'productoId', v ? Number(v) : null)}
                              options={productos.map(p => ({ value: p.id.toString(), label: `${p.nombre}${p.codigo ? ` · ${p.codigo}` : ''}` }))}
                              placeholder="Buscar ingrediente…"
                            />
                          </div>
                          <button
                            onClick={() => quitarIngrediente(index)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors shrink-0"
                            title="Quitar ingrediente"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Cantidad + unidad */}
                          <div className="flex-1 flex items-stretch rounded-lg bg-surface overflow-hidden border border-border/40">
                            <input
                              type="number"
                              step="0.001"
                              inputMode="decimal"
                              placeholder="0"
                              value={ing.cantidad || ''}
                              onChange={e => actualizarIngrediente(index, 'cantidad', e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2.5 bg-transparent text-foreground text-base font-bold focus:outline-none"
                            />
                            <span className="flex items-center justify-center px-3 text-xs font-bold text-on-surface-variant bg-surface-high/60 min-w-[56px]">
                              {ing.unidad || '—'}
                            </span>
                          </div>

                          {/* Chip de merma — tap para toggle, muestra % si está */}
                          <button
                            onClick={() => setExpandedIng(isExpanded ? null : index)}
                            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                              tieneMerma
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                : 'bg-surface border-border/50 text-on-surface-variant'
                            }`}
                            title={tieneMerma ? `Merma ${merma}%` : 'Sin merma configurada'}
                          >
                            <Sliders size={11} />
                            {tieneMerma ? `${merma}%` : 'Detalle'}
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>

                        {/* Resumen — costo de este ingrediente siempre visible */}
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-on-surface-variant">
                            {precioUnit > 0 && prod
                              ? `${fmtMoney(precioUnit)}/${ing.unidad || 'u'} · último de ${prod.nombre.length > 18 ? prod.nombre.slice(0, 18) + '…' : prod.nombre}`
                              : prod
                                ? <span className="italic">Falta cargar el último precio (sin facturas de este producto)</span>
                                : <span className="italic">Elegí un ingrediente para ver su costo</span>}
                          </span>
                          <span className={`font-mono font-extrabold tabular-nums ${costoTotalIng > 0 ? 'text-primary text-sm' : 'text-on-surface-variant'}`}>
                            {costoTotalIng > 0 ? fmtMoney(costoTotalIng) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Panel expandido: merma + factor + bruto + precio */}
                      {isExpanded && (
                        <div className="border-t border-border/40 p-3 space-y-3 bg-surface/30">
                          <div className="flex items-start gap-2 px-2 py-2 rounded-lg bg-primary/5">
                            <Info size={12} className="text-primary shrink-0 mt-0.5" />
                            <p className="text-[11px] text-on-surface-variant leading-relaxed">
                              La <b className="text-foreground">merma</b> es lo que se descarta al limpiar un producto (cáscara, hueso, recorte).
                              Dejala en <b className="text-foreground">0</b> si comprás ya limpio (ej: muzzarella, harina). Si pelás 1kg de cebolla y tirás 200g, tenés 20% de merma.
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">% de merma</label>
                                <button
                                  type="button"
                                  onClick={() => abrirCalcMerma(index)}
                                  className="flex items-center gap-1 text-[10px] font-bold text-primary active:text-primary/70"
                                  title="Calcular con la balanza"
                                >
                                  <Calculator size={10} /> Calcular
                                </button>
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0"
                                value={ing.mermaEsperada || ''}
                                onChange={e => actualizarIngrediente(index, 'mermaEsperada', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-surface border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Hay que comprar</label>
                              <div className="w-full px-3 py-2 rounded-lg bg-surface/40 text-foreground text-base font-mono tabular-nums font-bold">
                                {cantBruta > 0 ? `${fmtNum(cantBruta)} ${ing.unidad || ''}` : '—'}
                              </div>
                              <p className="text-[9px] text-on-surface-variant mt-0.5">
                                {tieneMerma ? `cant. neta × ${factor.toFixed(3)} (factor)` : 'igual a la cantidad neta (sin merma)'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg bg-surface/40">
                            <span className="text-on-surface-variant">
                              Último precio de compra: <b className="text-foreground font-mono">{precioUnit > 0 ? fmtMoney(precioUnit) : '—'}</b> por {ing.unidad || 'unidad'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {form.ingredientes.length > 0 && (
              <button
                onClick={agregarIngrediente}
                className="mt-2 w-full flex items-center justify-center gap-1 py-2.5 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
              >
                <Plus size={14} /> Agregar otro ingrediente
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar cambios' : 'Crear receta'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>

          {/* Leyenda de ingrediente sin precio — se lista al final solo si hay casos */}
          {(() => {
            const sinPrecio = form.ingredientes.filter(ing =>
              ing.productoId && (preciosUnit[ing.productoId] ?? 0) <= 0
            ).length;
            if (sinPrecio === 0) return null;
            return (
              <div className="text-[11px] text-amber-500 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠ {sinPrecio} ingrediente{sinPrecio === 1 ? '' : 's'} sin precio cargado. El costo sube cuando confirmes una factura de ese proveedor.
              </div>
            );
          })()}
        </div>
      </DrawerModal>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal Ver Costo — desglose visual con barras de % de participación
          ═══════════════════════════════════════════════════════════════════ */}
      <DrawerModal
        open={costoModal}
        onClose={() => setCostoModal(false)}
        title="Costo de receta"
      >
        {costoData && (() => {
          const total = Number(costoData.costoTotal) || 0;
          const porPorcion = Number(costoData.costoPorPorcion) || 0;
          const items = (costoData.ingredientes || []) as any[];
          const ordenados = [...items].sort((a, b) => Number(b.costoTotal) - Number(a.costoTotal));

          const compartirWA = () => {
            const lines = [
              `📋 ${costoData.nombre} (${costoData.porciones} porc.)`,
              `💰 Costo total: ${fmtMoney(total)}`,
              `🎯 Por porción: ${fmtMoney(porPorcion)}`,
              '',
              'Ingredientes:',
              ...ordenados.map((ing: any) => {
                const pct = total > 0 ? (Number(ing.costoTotal) / total) * 100 : 0;
                return `• ${ing.nombre}: ${fmtMoney(Number(ing.costoTotal))} (${pct.toFixed(0)}%)`;
              }),
            ];
            const txt = encodeURIComponent(lines.join('\n'));
            window.open(`https://wa.me/?text=${txt}`, '_blank');
          };

          return (
            <div className="space-y-4">
              {/* Hero — dato que importa */}
              <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 p-4">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{costoData.nombre}</p>
                <p className="font-mono text-4xl font-extrabold text-primary tabular-nums leading-tight mt-1">
                  {fmtMoney(porPorcion)}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  por porción · total de la receta: <b className="text-foreground">{fmtMoney(total)}</b> ({costoData.porciones} porc.)
                </p>
              </div>

              {/* Ingredientes como barras de % */}
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Dónde está el costo
                </p>
                <div className="space-y-1.5">
                  {ordenados.map((ing: any, i: number) => {
                    const pct = total > 0 ? (Number(ing.costoTotal) / total) * 100 : 0;
                    const cantNeta = Number(ing.cantidad) || 0;
                    const cantBruta = Number(ing.cantidadBruta || ing.cantidad) || 0;
                    const merma = Number(ing.mermaEsperada) || 0;
                    return (
                      <div key={i} className="rounded-lg bg-surface-high/40 border border-border/40 p-2.5">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <p className="font-semibold text-foreground text-sm truncate flex-1">{ing.nombre}</p>
                          <span className="font-mono text-sm font-bold text-primary tabular-nums">
                            {fmtMoney(Number(ing.costoTotal))}
                          </span>
                        </div>
                        {/* Barra de % */}
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                          <span>
                            {fmtNum(cantNeta)} {ing.unidad}
                            {merma > 0 && (
                              <span className="text-amber-500"> · {merma}% merma → {fmtNum(cantBruta)} {ing.unidad}</span>
                            )}
                            <span className="text-on-surface-variant/70"> · {fmtMoney(Number(ing.costoUnitario))}/{ing.unidad}</span>
                          </span>
                          <span className="font-mono font-bold text-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button onClick={compartirWA} className="flex-1" variant="secondary">
                  <Send size={14} /> Compartir por WhatsApp
                </Button>
                <Button onClick={() => setCostoModal(false)}>Cerrar</Button>
              </div>
            </div>
          );
        })()}
      </DrawerModal>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal calculadora de % de desperdicio
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={calcMermaIndex != null}
        onClose={() => setCalcMermaIndex(null)}
        title="Calcular % de merma"
      >
        <div className="space-y-4">
          <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
            <Info size={13} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Poné en la balanza lo que tenés <b className="text-foreground">entero</b> (el peso bruto) y lo que <b className="text-foreground">descartás</b> (cáscara, hueso, recorte). La app calcula la merma real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Peso bruto</label>
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                placeholder="ej: 1.000"
                value={calcBruto}
                onChange={e => setCalcBruto(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Descarte</label>
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                placeholder="ej: 0.300"
                value={calcDesp}
                onChange={e => setCalcDesp(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {(() => {
            const bruto = Number(calcBruto) || 0;
            const desp = Number(calcDesp) || 0;
            if (bruto <= 0 || desp < 0) return null;
            const pct = porcentajeDesperdicio(bruto, desp);
            const factor = factorDesperdicio(pct);
            return (
              <div className="bg-surface-high/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-on-surface-variant">Merma real</span>
                  <span className="font-mono text-base font-extrabold text-primary tabular-nums">{pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant">Factor resultante</span>
                  <span className="font-mono text-foreground tabular-nums">×{factor.toFixed(3)}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant pt-1 border-t border-border/40">
                  Si necesitás {bruto} kg limpios, tenés que comprar {(bruto * factor).toFixed(3)} kg.
                </p>
              </div>
            );
          })()}

          <div className="flex gap-2">
            <Button onClick={aplicarCalcMerma} className="flex-1" disabled={!calcBruto || Number(calcBruto) <= 0}>
              Aplicar merma
            </Button>
            <Button variant="secondary" onClick={() => setCalcMermaIndex(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
