import { useEffect, useState } from 'react';
import PageTour from '../components/PageTour';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Plus, Pencil, Trash2, ChefHat, DollarSign, X, Package, Calculator, Info } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { factorDesperdicio, porcentajeDesperdicio } from '../lib/merma';

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
  // Precios unitarios en vivo (último costo de compra por producto) para previsualizar costo en el form
  const [preciosUnit, setPreciosUnit] = useState<Record<number, number>>({});
  // Mini-calculadora de % desperdicio (peso bruto + peso desperdicio)
  const [calcMermaIndex, setCalcMermaIndex] = useState<number | null>(null);
  const [calcBruto, setCalcBruto] = useState('');
  const [calcDesp, setCalcDesp] = useState('');

  const cargar = () => {
    api.getRecetas({ activo: 'true' }).then(setRecetas).catch(console.error);
  };

  useEffect(() => {
    cargar();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
  }, []);

  const abrir = (receta?: any) => {
    if (receta) {
      setEditId(receta.id);
      setForm({
        codigo: receta.codigo,
        nombre: receta.nombre,
        categoria: receta.categoria,
        sector: receta.sector || '',
        porciones: receta.porciones,
        productoResultadoId: receta.productoResultadoId ?? null,
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
    } catch (e: any) {
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
    }
  };

  const agregarIngrediente = () => {
    setForm({ ...form, ingredientes: [...form.ingredientes, { ...emptyIngrediente }] });
  };

  const quitarIngrediente = (index: number) => {
    setForm({ ...form, ingredientes: form.ingredientes.filter((_, i) => i !== index) });
  };

  const actualizarIngrediente = (index: number, campo: keyof Ingrediente, valor: any) => {
    const nuevos = [...form.ingredientes];
    nuevos[index] = { ...nuevos[index], [campo]: valor };

    // Auto-fill unidad when selecting a product
    if (campo === 'productoId' && valor) {
      const prod = productos.find(p => p.id === Number(valor));
      if (prod) {
        nuevos[index].unidad = prod.unidadUso;
      }
    }

    setForm({ ...form, ingredientes: nuevos });
  };

  // Cargar últimos precios cada vez que cambian los productos seleccionados en el form
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

  return (
    <div>
      <PageTour pageKey="recetas" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Cocina</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Recetas</h1>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nueva receta
        </Button>
      </div>

      {/* Tabla */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Categoría</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Sector</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Porciones</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recetas.map(r => (
                <tr key={r.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 font-mono text-xs text-primary">{r.codigo}</td>
                  <td className="p-3 font-semibold text-foreground">{r.nombre}</td>
                  <td className="p-3 hidden sm:table-cell">
                    <Badge>{r.categoria}</Badge>
                  </td>
                  <td className="p-3 hidden sm:table-cell text-xs text-on-surface-variant">
                    {r.sector ? (SECTORES.find(s => s.value === r.sector)?.label || r.sector) : '—'}
                  </td>
                  <td className="p-3 hidden md:table-cell text-on-surface-variant">{r.porciones}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => verCosto(r.id)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Ver costo">
                        <DollarSign size={14} />
                      </button>
                      <button onClick={() => abrir(r)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => eliminar(r.id, r.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {recetas.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">
                    No se encontraron recetas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar receta' : 'Nueva receta'}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código"
              id="codigo"
              value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })}
              placeholder="REC-001"
            />
            <Input
              label="Nombre"
              id="nombre"
              value={form.nombre}
              onChange={e => setForm({ ...form, nombre: e.target.value })}
              placeholder="Nombre de la receta"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Categoría"
              id="categoria"
              value={form.categoria}
              onChange={e => setForm({ ...form, categoria: e.target.value })}
              options={CATEGORIAS}
              placeholder="Seleccionar..."
            />
            <Select
              label="Sector"
              id="sector"
              value={form.sector}
              onChange={e => setForm({ ...form, sector: e.target.value })}
              options={SECTORES}
            />
            <Input
              label="Porciones"
              id="porciones"
              type="number"
              value={form.porciones}
              onChange={e => setForm({ ...form, porciones: Number(e.target.value) })}
            />
          </div>

          {/* Producto resultado para elaboraciones */}
          <div className="rounded-xl border border-border bg-surface-high/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Package size={13} className="text-primary" />
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto que produce esta receta (para elaboraciones)</p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant mb-1">Producto resultado</p>
                <SearchableSelect
                  value={form.productoResultadoId?.toString() || ''}
                  onChange={v => {
                    const prod = productos.find(p => p.id === Number(v));
                    setForm(f => ({
                      ...f,
                      productoResultadoId: v ? Number(v) : null,
                      unidadProducida: prod?.unidadUso ?? f.unidadProducida,
                    }));
                  }}
                  options={[
                    { value: '', label: 'Sin producto resultado' },
                    ...productos.map(p => ({ value: p.id.toString(), label: p.nombre }))
                  ]}
                  placeholder="Seleccionar producto elaborado..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Cantidad producida"
                  id="cantidadProducida"
                  type="number"
                  value={form.cantidadProducida}
                  onChange={e => setForm(f => ({ ...f, cantidadProducida: e.target.value }))}
                  placeholder="ej: 7"
                />
                <Input
                  label="Unidad producida"
                  id="unidadProducida"
                  value={form.unidadProducida}
                  onChange={e => setForm(f => ({ ...f, unidadProducida: e.target.value }))}
                  placeholder="kg, lt, unidad..."
                />
              </div>
            </div>
          </div>

          {/* Ingredientes — planilla tipo cocinero */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ChefHat size={14} className="text-primary" />
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingredientes</p>
            </div>

            {/* Ayuda metodológica */}
            <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
              <Info size={13} className="text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                Cargá la <span className="font-bold text-foreground">cantidad neta</span> que va al plato y el <span className="font-bold text-foreground">% de desperdicio</span> del producto.
                La app calcula el <span className="font-bold text-foreground">factor</span>, la <span className="font-bold text-foreground">cantidad bruta</span> a comprar y el <span className="font-bold text-foreground">costo exacto</span>.
              </p>
            </div>

            {form.ingredientes.length === 0 && (
              <p className="text-xs text-on-surface-variant italic mb-2">Sin ingredientes. Agregá uno para empezar.</p>
            )}

            <div className="space-y-2">
              {form.ingredientes.map((ing, index) => {
                const merma = Number(ing.mermaEsperada) || 0;
                const factor = factorDesperdicio(merma);
                const cantNeta = Number(ing.cantidad) || 0;
                const cantBruta = cantNeta * factor;
                const precioUnit = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
                const costoTotal = cantBruta * precioUnit;

                return (
                  <div key={index} className="rounded-xl bg-surface-high/40 border border-border/60 p-3 space-y-2">
                    {/* Fila 1: producto + eliminar */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Ingrediente</p>
                        <SearchableSelect
                          value={ing.productoId?.toString() || ''}
                          onChange={v => actualizarIngrediente(index, 'productoId', v ? Number(v) : null)}
                          options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                          placeholder="Buscar producto..."
                        />
                      </div>
                      <button
                        onClick={() => quitarIngrediente(index)}
                        className="mt-5 p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors shrink-0"
                        title="Quitar ingrediente"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Fila 2: planilla del cocinero — cant. neta | %desp | factor | cant. bruta | precio | costo */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {/* Cantidad neta */}
                      <div>
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tight mb-1">Cant. neta</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="0"
                            value={ing.cantidad || ''}
                            onChange={e => actualizarIngrediente(index, 'cantidad', e.target.value)}
                            className="w-full min-w-0 px-2 py-1.5 rounded-lg bg-surface border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                          <span className="text-[10px] font-bold text-on-surface-variant shrink-0">{ing.unidad || '—'}</span>
                        </div>
                      </div>

                      {/* % desperdicio */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">% desp.</p>
                          <button
                            type="button"
                            onClick={() => abrirCalcMerma(index)}
                            className="text-primary hover:text-primary/80"
                            title="Calcular desde peso bruto y desperdicio"
                          >
                            <Calculator size={10} />
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={ing.mermaEsperada || ''}
                          onChange={e => actualizarIngrediente(index, 'mermaEsperada', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-surface border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>

                      {/* Factor (auto) */}
                      <div>
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tight mb-1">Factor</p>
                        <div className="w-full px-2 py-1.5 rounded-lg bg-surface/40 text-on-surface-variant text-sm font-mono tabular-nums truncate" title={factor.toFixed(4)}>
                          {factor.toFixed(3)}
                        </div>
                      </div>

                      {/* Cant. bruta (auto) */}
                      <div>
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tight mb-1">Cant. bruta</p>
                        <div className="w-full px-2 py-1.5 rounded-lg bg-surface/40 text-foreground text-sm font-mono tabular-nums font-semibold truncate" title={`${cantBruta.toFixed(4)} ${ing.unidad}`}>
                          {cantBruta > 0 ? cantBruta.toFixed(3) : '—'}
                        </div>
                      </div>

                      {/* Precio unit. (del último ingreso) */}
                      <div>
                        <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tight mb-1">Precio /{ing.unidad || 'u'}</p>
                        <div className="w-full px-2 py-1.5 rounded-lg bg-surface/40 text-on-surface-variant text-sm font-mono tabular-nums truncate" title={`$${precioUnit.toFixed(2)} última compra`}>
                          {precioUnit > 0 ? `$${precioUnit.toFixed(2)}` : '—'}
                        </div>
                      </div>

                      {/* Costo total del ingrediente */}
                      <div>
                        <p className="text-[9px] font-bold text-primary uppercase tracking-tight mb-1">Costo</p>
                        <div className="w-full px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-mono tabular-nums font-bold truncate" title={`$${costoTotal.toFixed(2)}`}>
                          {costoTotal > 0 ? `$${costoTotal.toFixed(2)}` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={agregarIngrediente}
              className="mt-2 flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={14} /> Agregar ingrediente
            </button>

            {/* Subtotal en vivo del form */}
            {form.ingredientes.length > 0 && (() => {
              const total = form.ingredientes.reduce((sum, ing) => {
                const merma = Number(ing.mermaEsperada) || 0;
                const factor = factorDesperdicio(merma);
                const cantNeta = Number(ing.cantidad) || 0;
                const precio = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
                return sum + cantNeta * factor * precio;
              }, 0);
              const porcion = form.porciones > 0 ? total / form.porciones : 0;
              return (
                <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Costo estimado</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-on-surface-variant">por receta</span>
                    <span className="font-mono text-sm font-bold text-foreground tabular-nums">${total.toFixed(2)}</span>
                    <span className="text-xs text-on-surface-variant">·</span>
                    <span className="text-xs text-on-surface-variant">por porción</span>
                    <span className="font-mono text-sm font-bold text-primary tabular-nums">${porcion.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar cambios' : 'Crear receta'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal costo — planilla completa del cocinero */}
      <Modal
        open={costoModal}
        onClose={() => setCostoModal(false)}
        title="Costo de receta"
      >
        {costoData && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Receta</p>
                <p className="font-semibold text-foreground">{costoData.nombre}</p>
                {costoData.porciones > 0 && (
                  <p className="text-xs text-on-surface-variant mt-0.5">{costoData.porciones} porción{costoData.porciones === 1 ? '' : 'es'}</p>
                )}
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Ingrediente</th>
                    <th className="text-left p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Unidad</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Cant.</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">% desp.</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Factor</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Cant. bruta</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Precio</th>
                    <th className="text-right p-2 text-[9px] font-bold text-on-surface-variant uppercase tracking-tight">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {costoData.ingredientes?.map((ing: any, i: number) => (
                    <tr key={i} className="hover:bg-surface-high/50 transition-colors">
                      <td className="p-2 font-semibold text-foreground">{ing.nombre}</td>
                      <td className="p-2 text-on-surface-variant">{ing.unidad}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-foreground">{Number(ing.cantidad).toFixed(3)}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-on-surface-variant">
                        {ing.mermaEsperada > 0 ? `${Number(ing.mermaEsperada).toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums text-on-surface-variant">
                        {Number(ing.factor || 1).toFixed(3)}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums text-foreground font-semibold">
                        {Number(ing.cantidadBruta || ing.cantidad).toFixed(3)}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums text-on-surface-variant">
                        ${Number(ing.costoUnitario).toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums text-primary font-bold">
                        ${Number(ing.costoTotal).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-surface-high/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-on-surface-variant">Costo total</span>
                <span className="font-mono text-sm font-bold text-foreground tabular-nums">${costoData.costoTotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-on-surface-variant">Costo por porción</span>
                <span className="font-mono text-sm font-bold text-primary tabular-nums">${costoData.costoPorPorcion?.toFixed(2)}</span>
              </div>
            </div>

            <Button variant="secondary" onClick={() => setCostoModal(false)} className="w-full">
              Cerrar
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal calculadora de % de desperdicio */}
      <Modal
        open={calcMermaIndex != null}
        onClose={() => setCalcMermaIndex(null)}
        title="Calcular % de desperdicio"
      >
        <div className="space-y-4">
          <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
            <Info size={13} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Pesá el <span className="font-bold text-foreground">producto entero</span> (peso bruto) y lo que <span className="font-bold text-foreground">descartás</span> (cáscara, hueso, recorte). La app calcula el % de desperdicio real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Peso bruto</label>
              <input
                type="number"
                step="0.001"
                placeholder="ej: 1.000"
                value={calcBruto}
                onChange={e => setCalcBruto(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Desperdicio</label>
              <input
                type="number"
                step="0.001"
                placeholder="ej: 0.300"
                value={calcDesp}
                onChange={e => setCalcDesp(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                  <span className="text-xs font-semibold text-on-surface-variant">% de desperdicio</span>
                  <span className="font-mono text-base font-bold text-primary tabular-nums">{pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant">Factor resultante</span>
                  <span className="font-mono text-foreground tabular-nums">×{factor.toFixed(3)}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex gap-2">
            <Button
              onClick={aplicarCalcMerma}
              className="flex-1"
              disabled={!calcBruto || Number(calcBruto) <= 0}
            >
              Aplicar al ingrediente
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
