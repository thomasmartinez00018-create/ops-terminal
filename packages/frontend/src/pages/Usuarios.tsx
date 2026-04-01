import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'barra', label: 'Barra' },
  { value: 'compras', label: 'Compras' },
];

const emptyForm = { codigo: '', nombre: '', rol: 'cocina', pin: '' };

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const cargar = () => {
    api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(console.error);
  };

  useEffect(() => { cargar(); }, []);

  const abrir = (u?: any) => {
    if (u) {
      setEditId(u.id);
      setForm({ codigo: u.codigo, nombre: u.nombre, rol: u.rol, pin: '' });
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
      const data: any = { ...form };
      if (!data.pin) delete data.pin;
      if (editId) {
        await api.updateUsuario(editId, data);
      } else {
        await api.createUsuario(data);
      }
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const eliminar = async (id: number) => {
    if (!confirm('Desactivar este usuario?')) return;
    await api.deleteUsuario(id);
    cargar();
  };

  const rolBadge = (rol: string) => {
    const variants: Record<string, 'success' | 'info' | 'warning' | 'default' | 'primary'> = {
      admin: 'primary', cocina: 'info', deposito: 'warning', barra: 'default', compras: 'success'
    };
    return <Badge variant={variants[rol] || 'default'}>{ROLES.find(r => r.value === rol)?.label || rol}</Badge>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Gestión</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Usuarios</h1>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nuevo usuario
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rol</th>
              <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-surface-high/50 transition-colors">
                <td className="p-3 font-mono text-xs text-primary">{u.codigo}</td>
                <td className="p-3 font-semibold text-foreground">{u.nombre}</td>
                <td className="p-3">{rolBadge(u.rol)}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => abrir(u)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => eliminar(u.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar usuario' : 'Nuevo usuario'}
      >
        <div className="space-y-3">
          <Input
            label="Código"
            id="codigo"
            value={form.codigo}
            onChange={e => setForm({ ...form, codigo: e.target.value })}
            placeholder="COC-01"
          />
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo"
          />
          <Select
            label="Rol"
            id="rol"
            value={form.rol}
            onChange={e => setForm({ ...form, rol: e.target.value })}
            options={ROLES}
          />
          <Input
            label={editId ? "Nuevo PIN (dejar vacío para no cambiar)" : "PIN (4 dígitos)"}
            id="pin"
            type="password"
            maxLength={4}
            value={form.pin}
            onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
            placeholder="1234"
          />
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar' : 'Crear usuario'}
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
