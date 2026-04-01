import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

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
  codigo: '', nombre: '', rubro: '', tipo: 'crudo',
  unidadCompra: 'kg', unidadUso: 'kg', factorConversion: 1,
  codigoBarras: '', stockMinimo: 0, stockIdeal: 0, depositoDefectoId: null as number | null,
};

export default function Productos() {
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [buscar, setBuscar] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const cargar = () => {
    const params: Record<string, string> = { activo: 'true' };
    if (buscar) params.buscar = buscar;
    if (filtroRubro) params.rubro = filtroRubro;
    api.getProductos(params).then(setProductos).catch(console.error);
  };

  useEffect(() => { cargar(); }, [buscar, filtroRubro]);
  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  }, []);

  const abrir = (producto?: any) => {
    if (producto) {
      setEditId(producto.id);
      setForm({
        codigo: producto.codigo,
        nombre: producto.nombre,
        rubro: producto.rubro,
        tipo: producto.tipo,
        unidadCompra: producto.unidadCompra,
        unidadUso: producto.unidadUso,
        factorConversion: producto.factorConversion,
        codigoBarras: producto.codigoBarras || '',
        stockMinimo: producto.stockMinimo,
        stockIdeal: producto.stockIdeal,
        depositoDefectoId: producto.depositoDefectoId,
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
        ...form,
        factorConversion: Number(form.factorConversion),
        stockMinimo: Number(form.stockMinimo),
        stockIdeal: Number(form.stockIdeal),
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

  const eliminar = async (id: number) => {
    if (!confirm('Desactivar este producto?')) return;
    await api.deleteProducto(id);
    cargar();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Maestro</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Productos</h1>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nuevo producto
        </Button>
      </div>

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
      </div>

      {/* Tabla */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Rubro</th>
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
                  <td className="p-3 hidden sm:table-cell">
                    <Badge>{p.rubro}</Badge>
                  </td>
                  <td className="p-3 hidden md:table-cell capitalize text-on-surface-variant">{p.tipo}</td>
                  <td className="p-3 hidden lg:table-cell text-on-surface-variant">{p.unidadUso}</td>
                  <td className="p-3 hidden lg:table-cell text-on-surface-variant">{p.stockMinimo}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => abrir(p)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => eliminar(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">
                    No se encontraron productos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
            <Select
              label="Rubro"
              id="rubro"
              value={form.rubro}
              onChange={e => setForm({ ...form, rubro: e.target.value })}
              options={RUBROS.map(r => ({ value: r, label: r }))}
              placeholder="Seleccionar..."
            />
            <Select
              label="Tipo"
              id="tipo"
              value={form.tipo}
              onChange={e => setForm({ ...form, tipo: e.target.value })}
              options={TIPOS}
            />
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
            <Input
              label="Factor conv."
              id="factorConversion"
              type="number"
              value={form.factorConversion}
              onChange={e => setForm({ ...form, factorConversion: Number(e.target.value) })}
            />
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
    </div>
  );
}
