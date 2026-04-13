import { useEffect, useState } from 'react';
import PageTour from '../components/PageTour';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Plus, Pencil, Trash2, ChefHat, DollarSign, X, Package } from 'lucide-react';
import { useToast } from '../context/ToastContext';

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

          {/* Ingredientes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ChefHat size={14} className="text-primary" />
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingredientes</p>
            </div>
            <div className="space-y-2">
              {form.ingredientes.map((ing, index) => (
                <div key={index} className="flex items-start gap-2 bg-surface-high/50 rounded-lg p-2">
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <SearchableSelect
                        value={ing.productoId?.toString() || ''}
                        onChange={v => actualizarIngrediente(index, 'productoId', v ? Number(v) : null)}
                        options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                        placeholder="Producto..."
                      />
                    </div>
                    <input
                      type="number"
                      placeholder="Cant."
                      value={ing.cantidad || ''}
                      onChange={e => actualizarIngrediente(index, 'cantidad', e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="text"
                      placeholder="Unidad"
                      value={ing.unidad}
                      onChange={e => actualizarIngrediente(index, 'unidad', e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-surface-high border-0 text-on-surface-variant text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                      readOnly
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Merma %"
                      value={ing.mermaEsperada || ''}
                      onChange={e => actualizarIngrediente(index, 'mermaEsperada', e.target.value)}
                      className="w-20 px-2 py-1.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => quitarIngrediente(index)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={agregarIngrediente}
              className="mt-2 flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Plus size={14} /> Agregar ingrediente
            </button>
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

      {/* Modal costo */}
      <Modal
        open={costoModal}
        onClose={() => setCostoModal(false)}
        title="Costo de receta"
      >
        {costoData && (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Receta</p>
              <p className="font-semibold text-foreground">{costoData.nombre}</p>
            </div>

            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingrediente</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cantidad</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Costo unit.</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Costo total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {costoData.ingredientes?.map((ing: any, i: number) => (
                    <tr key={i} className="hover:bg-surface-high/50 transition-colors">
                      <td className="p-3 font-semibold text-foreground">{ing.nombre}</td>
                      <td className="p-3 text-right text-on-surface-variant">{ing.cantidad} {ing.unidad}</td>
                      <td className="p-3 text-right font-mono text-xs text-on-surface-variant">${ing.costoUnitario?.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-xs text-primary">${ing.costoTotal?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-surface-high/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-on-surface-variant">Costo total</span>
                <span className="font-mono text-sm font-bold text-foreground">${costoData.costoTotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-on-surface-variant">Costo por porción</span>
                <span className="font-mono text-sm font-bold text-primary">${costoData.costoPorPorcion?.toFixed(2)}</span>
              </div>
            </div>

            <Button variant="secondary" onClick={() => setCostoModal(false)} className="w-full">
              Cerrar
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
