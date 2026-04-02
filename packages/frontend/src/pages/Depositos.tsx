import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, Warehouse } from 'lucide-react';
import PageTour from '../components/PageTour';

const TIPOS_DEPOSITO = [
  { value: 'almacen', label: 'Almacén' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'barra', label: 'Barra' },
  { value: 'camara', label: 'Cámara fría' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'seco', label: 'Seco' },
  { value: 'garage', label: 'Garage' },
  { value: 'otro', label: 'Otro' },
];

const emptyForm = { codigo: '', nombre: '', tipo: '' };

export default function Depositos() {
  const [depositos, setDepositos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const cargar = () => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  };

  useEffect(() => { cargar(); }, []);

  const abrir = (dep?: any) => {
    if (dep) {
      setEditId(dep.id);
      setForm({ codigo: dep.codigo, nombre: dep.nombre, tipo: dep.tipo || '' });
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
      if (editId) {
        await api.updateDeposito(editId, form);
      } else {
        await api.createDeposito(form);
      }
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const eliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar el depósito "${nombre}"? Esta acción se puede revertir.`)) return;
    await api.deleteDeposito(id);
    cargar();
  };

  const tipoLabel = (tipo: string) =>
    TIPOS_DEPOSITO.find(t => t.value === tipo)?.label || tipo;

  return (
    <div>
      <PageTour pageKey="depositos" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Gestión</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Depósitos</h1>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nuevo depósito
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {depositos.map(dep => (
          <div key={dep.id} className="glass rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <Warehouse size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-mono text-xs text-primary">{dep.codigo}</p>
                  <p className="font-semibold text-foreground mt-0.5">{dep.nombre}</p>
                  {dep.tipo && <Badge variant="info" >{tipoLabel(dep.tipo)}</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => abrir(dep)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => eliminar(dep.id, dep.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar depósito' : 'Nuevo depósito'}
      >
        <div className="space-y-3">
          <Input
            label="Código"
            id="codigo"
            value={form.codigo}
            onChange={e => setForm({ ...form, codigo: e.target.value })}
            placeholder="DEP-01"
          />
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre del depósito"
          />
          <Select
            label="Tipo"
            id="tipo"
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value })}
            options={TIPOS_DEPOSITO}
            placeholder="Seleccionar tipo..."
          />
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar' : 'Crear depósito'}
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
