import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import { useToast } from '../context/ToastContext';
import { useRecentProducts } from '../hooks/useRecentProducts';
import { Plus } from 'lucide-react';

const TIPOS_MOV = [
  { value: 'ingreso', label: 'Ingreso / Compra' },
  { value: 'elaboracion', label: 'Elaboración' },
  { value: 'merma', label: 'Merma' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'consumo_interno', label: 'Consumo interno' },
  { value: 'devolucion', label: 'Devolución' },
];

const MOTIVOS_MERMA = ['Vencimiento', 'Rotura', 'Deterioro', 'Error de elaboración', 'Derrame', 'Otro'];

const tipoBadge: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
  ingreso: 'success', elaboracion: 'info', merma: 'danger',
  transferencia: 'warning', ajuste: 'default', consumo_interno: 'default', devolucion: 'warning',
};

export default function Movimientos() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { getRecents, addRecent } = useRecentProducts(user?.id || 0);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: 'ingreso', productoId: '', depositoOrigenId: '', depositoDestinoId: '',
    cantidad: '', unidad: '', lote: '', motivo: '', observacion: '', responsableId: ''
  });
  const [error, setError] = useState('');

  const cargar = () => {
    const params: Record<string, string> = {};
    if (filtroTipo) params.tipo = filtroTipo;
    api.getMovimientos(params).then(setMovimientos).catch(console.error);
  };

  useEffect(() => { cargar(); }, [filtroTipo]);
  useEffect(() => {
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
    api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(console.error);
  }, []);

  const abrirNuevo = () => {
    setForm({
      tipo: 'ingreso', productoId: '', depositoOrigenId: '', depositoDestinoId: '',
      cantidad: '', unidad: '', lote: '', motivo: '', observacion: '', responsableId: ''
    });
    setError('');
    setModalOpen(true);
  };

  const onProductoChange = (productoId: string) => {
    const prod = productos.find(p => p.id === Number(productoId));
    setForm(f => ({
      ...f,
      productoId,
      unidad: prod?.unidadUso || f.unidad,
      depositoDestinoId: prod?.depositoDefectoId?.toString() || f.depositoDestinoId,
    }));
  };

  const guardar = async () => {
    setError('');
    const now = new Date();
    try {
      await api.createMovimiento({
        tipo: form.tipo,
        productoId: Number(form.productoId),
        usuarioId: user!.id,
        fecha: now.toISOString().split('T')[0],
        hora: now.toTimeString().slice(0, 5),
        depositoOrigenId: form.depositoOrigenId ? Number(form.depositoOrigenId) : null,
        depositoDestinoId: form.depositoDestinoId ? Number(form.depositoDestinoId) : null,
        cantidad: Number(form.cantidad),
        unidad: form.unidad,
        lote: form.lote || null,
        motivo: form.motivo || null,
        observacion: form.observacion || null,
        responsableId: form.responsableId ? Number(form.responsableId) : null,
      });
      const prod = productos.find(p => p.id === Number(form.productoId));
      addRecent(form.productoId);
      addToast(`Registrado: ${form.cantidad} ${form.unidad} de ${prod?.nombre}`);
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
      addToast('Error al registrar el movimiento', 'error');
    }
  };

  const needsOrigen = ['merma', 'transferencia', 'consumo_interno'].includes(form.tipo);
  const needsDestino = ['ingreso', 'elaboracion', 'transferencia', 'ajuste', 'devolucion'].includes(form.tipo);

  return (
    <div>
      <PageTour pageKey="movimientos" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Operaciones</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Movimientos</h1>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus size={16} /> Registrar movimiento
        </Button>
      </div>

      <div className="mb-4">
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_MOV.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Cantidad</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Depósito</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Registró</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movimientos.map(m => (
                <tr key={m.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 text-xs text-on-surface-variant">{m.fecha} {m.hora}</td>
                  <td className="p-3">
                    <Badge variant={tipoBadge[m.tipo]}>
                      {TIPOS_MOV.find(t => t.value === m.tipo)?.label || m.tipo}
                    </Badge>
                  </td>
                  <td className="p-3 font-semibold text-foreground">{m.producto?.nombre}</td>
                  <td className="p-3 hidden sm:table-cell text-foreground font-semibold">{m.cantidad} <span className="text-on-surface-variant font-normal">{m.unidad}</span></td>
                  <td className="p-3 hidden md:table-cell text-xs text-on-surface-variant">
                    {m.depositoOrigen?.nombre && <span>{m.depositoOrigen.nombre}</span>}
                    {m.depositoOrigen?.nombre && m.depositoDestino?.nombre && <span className="text-primary mx-1">&rarr;</span>}
                    {m.depositoDestino?.nombre && <span>{m.depositoDestino.nombre}</span>}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-xs text-on-surface-variant">{m.usuario?.nombre}</td>
                  <td className="p-3 hidden lg:table-cell text-xs">
                    {m.responsable
                      ? <span className="font-semibold text-warning">{m.responsable.nombre}</span>
                      : <span className="text-on-surface-variant/50">—</span>
                    }
                  </td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                    Sin movimientos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar movimiento">
        <div className="space-y-3">
          <Select
            label="Tipo de movimiento"
            id="tipo"
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value, motivo: '' })}
            options={TIPOS_MOV}
          />
          <SearchableSelect
            label="Producto"
            id="productoId"
            value={form.productoId}
            onChange={v => onProductoChange(v)}
            options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
            placeholder="Seleccionar producto..."
            pinnedValues={getRecents()}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Cantidad"
              id="cantidad"
              type="number"
              step="0.01"
              value={form.cantidad}
              onChange={e => setForm({ ...form, cantidad: e.target.value })}
            />
            <Input
              label="Unidad"
              id="unidad"
              value={form.unidad}
              onChange={e => setForm({ ...form, unidad: e.target.value })}
            />
          </div>
          {needsOrigen && (
            <Select
              label="Depósito origen"
              id="depositoOrigen"
              value={form.depositoOrigenId}
              onChange={e => setForm({ ...form, depositoOrigenId: e.target.value })}
              options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
              placeholder="Seleccionar..."
            />
          )}
          {needsDestino && (
            <Select
              label="Depósito destino"
              id="depositoDestino"
              value={form.depositoDestinoId}
              onChange={e => setForm({ ...form, depositoDestinoId: e.target.value })}
              options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
              placeholder="Seleccionar..."
            />
          )}
          {form.tipo === 'merma' && (
            <Select
              label="Motivo"
              id="motivo"
              value={form.motivo}
              onChange={e => setForm({ ...form, motivo: e.target.value })}
              options={MOTIVOS_MERMA.map(m => ({ value: m, label: m }))}
              placeholder="Seleccionar motivo..."
            />
          )}
          <Input
            label="Lote (opcional)"
            id="lote"
            value={form.lote}
            onChange={e => setForm({ ...form, lote: e.target.value })}
            placeholder="Ej: LOTE-2024-03"
          />
          <Select
            label="Responsable (opcional)"
            id="responsableId"
            value={form.responsableId}
            onChange={e => setForm({ ...form, responsableId: e.target.value })}
            placeholder={`Sin asignar (responsable: ${user?.nombre})`}
          >
            <option value="">Sin asignar — responsable: {user?.nombre}</option>
            {usuarios.filter(u => u.id !== user?.id).map(u => (
              <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>
            ))}
          </Select>
          <Input
            label="Observación (opcional)"
            id="observacion"
            value={form.observacion}
            onChange={e => setForm({ ...form, observacion: e.target.value })}
            placeholder="Notas adicionales..."
          />
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">Registrar</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
