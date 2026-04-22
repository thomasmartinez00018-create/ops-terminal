import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import ConfirmDialog, { useConfirm } from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { todayStr } from '../lib/exportUtils';
import { Plus, Pencil, Trash2, Search, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const RUBROS = [
  'Verduras', 'Frutas', 'Carnes', 'Pescados', 'Lácteos', 'Fiambres',
  'Panadería', 'Aceites', 'Condimentos', 'Bebidas', 'Vinos', 'Limpieza',
  'Descartables', 'Elaborados', 'Otros'
];

const TIPOS = [
  { value: 'crudo', label: 'Crudo' },
  { value: 'elaborado', label: 'Elaborado' },
  { value: 'semielaborado', label: 'Semielaborado' },
  { value: 'insumo', label: 'Insumo' },
];

const UNIDADES = [
  { value: 'kg', label: 'Kilogramos (kg)' },
  { value: 'lt', label: 'Litros (lt)' },
  { value: 'unidad', label: 'Unidad' },
  { value: 'caja', label: 'Caja' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'porcion', label: 'Porción' },
  { value: 'botella', label: 'Botella' },
  { value: 'lata', label: 'Lata' },
];

const emptyForm = {
  codigo: '', nombre: '', rubro: '', subrubro: '', tipo: 'crudo',
  unidadCompra: 'kg', unidadUso: 'kg', factorConversion: 1,
  codigoBarras: '', stockMinimo: 0, stockIdeal: 0, depositoDefectoId: null as number | null,
};

export default function Productos() {
  const navigate = useNavigate();
  const { confirm, dialogProps } = useConfirm();
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [buscar, setBuscar] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [filtroSubrubro, setFiltroSubrubro] = useState('');
  const [subrubrosDisponibles, setSubrubrosDisponibles] = useState<string[]>([]);
  // Subrubros para autocompletado en el form (según rubro seleccionado)
  const [subrubrosForm, setSubrubrosForm] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  // Debounced search: evita disparar una request por cada tecla al tipear.
  // Además, un "token" monotónico descarta respuestas stale (si el usuario
  // sigue tipeando y llega primero la respuesta vieja, la ignoramos).
  const buscarDebounced = useDebounce(buscar, 300);
  const fetchTokenRef = useRef(0);

  const cargar = () => {
    const params: Record<string, string> = { activo: 'true' };
    if (buscarDebounced) params.buscar = buscarDebounced;
    if (filtroRubro) params.rubro = filtroRubro;
    if (filtroSubrubro) params.subrubro = filtroSubrubro;
    const myToken = ++fetchTokenRef.current;
    api.getProductos(params)
      .then((data) => {
        // Descarta respuestas stale de una búsqueda anterior.
        if (myToken === fetchTokenRef.current) setProductos(data);
      })
      .catch(console.error);
  };

  // Cuando cambia el filtro de rubro, recargar los subrubros disponibles
  useEffect(() => {
    if (filtroRubro) {
      api.getSubrubros(filtroRubro).then(setSubrubrosDisponibles).catch(() => setSubrubrosDisponibles([]));
    } else {
      api.getSubrubros().then(setSubrubrosDisponibles).catch(() => setSubrubrosDisponibles([]));
    }
    setFiltroSubrubro('');
  }, [filtroRubro]);

  useEffect(() => { cargar(); }, [buscarDebounced, filtroRubro, filtroSubrubro]);
  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
    api.getSubrubros().then(setSubrubrosDisponibles).catch(() => {});
  }, []);

  const abrir = (producto?: any) => {
    if (producto) {
      setEditId(producto.id);
      const rubroActual = producto.rubro;
      setForm({
        codigo: producto.codigo,
        nombre: producto.nombre,
        rubro: rubroActual,
        subrubro: producto.subrubro || '',
        tipo: producto.tipo,
        unidadCompra: producto.unidadCompra,
        unidadUso: producto.unidadUso,
        factorConversion: producto.factorConversion,
        codigoBarras: producto.codigoBarras || '',
        stockMinimo: producto.stockMinimo,
        stockIdeal: producto.stockIdeal,
        depositoDefectoId: producto.depositoDefectoId,
      });
      if (rubroActual) {
        api.getSubrubros(rubroActual).then(setSubrubrosForm).catch(() => setSubrubrosForm([]));
      }
    } else {
      setEditId(null);
      setForm(emptyForm);
      setSubrubrosForm([]);
    }
    setError('');
    setModalOpen(true);
  };

  const guardar = async () => {
    setError('');
    // Validación mínima antes de mandar: factor > 0 porque lo usamos como
    // divisor al convertir unidadCompra → unidadUso. Sin este guard, guardar
    // con factor=0 rompía los cálculos de stock y de recetas cuando ese
    // producto aparecía (NaN/Infinity).
    const factor = Number(form.factorConversion);
    if (!Number.isFinite(factor) || factor <= 0) {
      setError(`La equivalencia entre ${form.unidadCompra} y ${form.unidadUso} debe ser mayor a cero. Ej: 1 caja = 12 unidades, no 0.`);
      return;
    }
    if (!form.nombre.trim()) {
      setError('El nombre del producto es obligatorio.');
      return;
    }
    try {
      const data = {
        ...form,
        subrubro: form.subrubro.trim() || null,
        factorConversion: factor,
        stockMinimo: Number(form.stockMinimo) || 0,
        stockIdeal: Number(form.stockIdeal) || 0,
        depositoDefectoId: form.depositoDefectoId || null,
        codigoBarras: form.codigoBarras || null,
      };
      if (editId) {
        await api.updateProducto(editId, data);
      } else {
        await api.createProducto(data);
      }
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const eliminar = async (id: number, nombre: string) => {
    const ok = await confirm({
      title: `¿Desactivar el producto "${nombre}"?`,
      detalle: 'Va a dejar de aparecer en movimientos nuevos y en la lista. Lo podés reactivar después desde los filtros si aparece de nuevo.',
      variant: 'warning',
      confirmLabel: 'Sí, desactivar',
    });
    if (!ok) return;
    await api.deleteProducto(id);
    cargar();
  };

  const getExportConfig = (): ExportConfig => ({
    title: 'Productos',
    filename: `productos-${todayStr()}`,
    subtitle: filtroRubro ? `Rubro: ${filtroRubro}${filtroSubrubro ? ` > ${filtroSubrubro}` : ''}` : undefined,
    headers: ['Codigo', 'Nombre', 'Rubro', 'Sub-rubro', 'Tipo', 'Ud. Compra', 'Ud. Uso', 'Stock Min', 'Stock Ideal', 'Cod. Barras'],
    rows: productos.map(p => [
      p.codigo, p.nombre, p.rubro, p.subrubro || '', p.tipo,
      p.unidadCompra, p.unidadUso, p.stockMinimo, p.stockIdeal, p.codigoBarras || '',
    ]),
    summary: [
      { label: 'Total productos', value: productos.length },
      { label: 'Rubros', value: new Set(productos.map(p => p.rubro)).size },
      { label: 'Activos', value: productos.filter(p => p.activo !== false).length },
    ],
    numberColumns: [7, 8],
  });

  return (
    <div>
      <PageTour pageKey="productos" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Maestro</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Productos</h1>
        </div>
        <div className="flex gap-2">
          <ExportMenu getConfig={getExportConfig} disabled={productos.length === 0} size="sm" />
          <Button onClick={() => abrir()}>
            <Plus size={16} /> Nuevo producto
          </Button>
        </div>
      </div>

      {/* Mini-stats */}
      {productos.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <button
            onClick={() => { setBuscar(''); setFiltroRubro(''); setFiltroSubrubro(''); }}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            <span className="text-sm font-extrabold text-foreground">{productos.length}</span>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">productos</span>
            <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">↺</span>
          </button>
          {(() => {
            const rubros = new Set(productos.map(p => p.rubro)).size;
            return rubros > 0 ? (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border">
                <span className="text-sm font-extrabold text-foreground">{rubros}</span>
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">rubros</span>
              </span>
            ) : null;
          })()}
          <button
            onClick={() => navigate('/stock')}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
          >
            <BarChart2 size={13} className="text-primary" />
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider group-hover:text-primary transition-colors">Ver stock</span>
            <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-bold">→</span>
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={filtroRubro}
          onChange={e => setFiltroRubro(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los rubros</option>
          {RUBROS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {subrubrosDisponibles.length > 0 && (
          <select
            value={filtroSubrubro}
            onChange={e => setFiltroSubrubro(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todos los sub-rubros</option>
            {subrubrosDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Empty state compartido entre mobile/desktop */}
      {productos.length === 0 && (
        <div className="bg-surface rounded-xl border border-border p-10 text-center text-on-surface-variant font-medium">
          No se encontraron productos
        </div>
      )}

      {/* Mobile: cards con info densa pero legible en 375px */}
      {productos.length > 0 && (
        <div className="sm:hidden space-y-2">
          {productos.map(p => (
            <div key={p.id} className="bg-surface rounded-xl border border-border p-3.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-primary">{p.codigo}</p>
                  <p className="font-bold text-foreground text-sm leading-tight mt-0.5 truncate">{p.nombre}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <Badge>{p.rubro}</Badge>
                    {p.subrubro && <Badge variant="secondary">{p.subrubro}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => abrir(p)}
                    className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:text-foreground"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => eliminar(p.id, p.nombre)}
                    className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:bg-destructive/10 active:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-on-surface-variant pt-2 border-t border-border/50">
                <span className="capitalize">{p.tipo}</span>
                <span>· {p.unidadUso}</span>
                {p.stockMinimo > 0 && <span>· mín {p.stockMinimo}</span>}
                {p.codigoBarras && <span className="font-mono">· {p.codigoBarras}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Desktop: tabla */}
      {productos.length > 0 && (
        <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rubro</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Tipo</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Unidad</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Stock mín.</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {productos.map(p => (
                  <tr key={p.id} className="hover:bg-surface-high/50 transition-colors">
                    <td className="p-3 font-mono text-xs text-primary">{p.codigo}</td>
                    <td className="p-3 font-semibold text-foreground">{p.nombre}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge>{p.rubro}</Badge>
                        {p.subrubro && <Badge variant="secondary">{p.subrubro}</Badge>}
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell capitalize text-on-surface-variant">{p.tipo}</td>
                    <td className="p-3 hidden lg:table-cell text-on-surface-variant">{p.unidadUso}</td>
                    <td className="p-3 hidden lg:table-cell text-on-surface-variant">{p.stockMinimo}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrir(p)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => eliminar(p.id, p.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar producto' : 'Nuevo producto'}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código"
              id="codigo"
              value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })}
              placeholder="INS-001"
            />
            <Input
              label="Código de barras"
              id="codigoBarras"
              value={form.codigoBarras}
              onChange={e => setForm({ ...form, codigoBarras: e.target.value })}
              placeholder="Opcional"
            />
          </div>
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre del producto"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">Rubro</label>
              <input
                type="text"
                list="rubros-productos-list"
                value={form.rubro}
                onChange={e => {
                  const nuevoRubro = e.target.value;
                  setForm({ ...form, rubro: nuevoRubro, subrubro: '' });
                  if (nuevoRubro) {
                    api.getSubrubros(nuevoRubro).then(setSubrubrosForm).catch(() => setSubrubrosForm([]));
                  } else {
                    setSubrubrosForm([]);
                  }
                }}
                placeholder="Ej: Verduras, Carnes..."
                className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <datalist id="rubros-productos-list">
                {RUBROS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
            <Select
              label="Tipo"
              id="tipo"
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value })}
              options={TIPOS}
            />
          </div>
          <div className="relative">
            <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Sub-rubro <span className="text-on-surface-variant/50 normal-case font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              list="subrubros-list"
              value={form.subrubro}
              onChange={e => setForm({ ...form, subrubro: e.target.value })}
              placeholder={form.rubro ? `Ej: Chardonnay, Malbec...` : 'Primero seleccioná un rubro'}
              disabled={!form.rubro}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <datalist id="subrubros-list">
              {subrubrosForm.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Unidad compra"
              id="unidadCompra"
              value={form.unidadCompra}
              onChange={e => setForm({ ...form, unidadCompra: e.target.value })}
              options={UNIDADES}
            />
            <Select
              label="Unidad uso"
              id="unidadUso"
              value={form.unidadUso}
              onChange={e => setForm({ ...form, unidadUso: e.target.value })}
              options={UNIDADES}
            />
            <div>
              <Input
                label={`1 ${form.unidadCompra} = ? ${form.unidadUso}`}
                id="factorConversion"
                type="number"
                value={form.factorConversion}
                onChange={e => setForm({ ...form, factorConversion: Number(e.target.value) })}
              />
              {form.unidadCompra !== form.unidadUso && form.factorConversion > 1 && (
                <p className="text-[10px] text-primary font-semibold mt-1">
                  1 {form.unidadCompra} = {form.factorConversion} {form.unidadUso}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Stock mínimo"
              id="stockMinimo"
              type="number"
              value={form.stockMinimo}
              onChange={e => setForm({ ...form, stockMinimo: Number(e.target.value) })}
            />
            <Input
              label="Stock ideal"
              id="stockIdeal"
              type="number"
              value={form.stockIdeal}
              onChange={e => setForm({ ...form, stockIdeal: Number(e.target.value) })}
            />
          </div>
          <Select
            label="Depósito por defecto"
            id="depositoDefecto"
            value={form.depositoDefectoId?.toString() || ''}
            onChange={e => setForm({ ...form, depositoDefectoId: e.target.value ? Number(e.target.value) : null })}
            options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
            placeholder="Sin depósito por defecto"
          />

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar cambios' : 'Crear producto'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
