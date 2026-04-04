import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PageTour from '../components/PageTour';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, ShieldCheck, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'barra', label: 'Barra' },
  { value: 'compras', label: 'Compras' },
];

const PERMISOS_DISPONIBLES = [
  { key: 'ordenes-compra', label: 'Órdenes de Compra' },
  { key: 'control-scanner', label: 'Control Scanner' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'stock', label: 'Stock' },
  { key: 'productos', label: 'Maestro de Productos' },
  { key: 'depositos', label: 'Depósitos' },
  { key: 'recetas', label: 'Recetas' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'inventarios', label: 'Inventarios' },
  { key: 'discrepancias', label: 'Discrepancias' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'importar', label: 'Importar datos' },
  { key: 'vincular', label: 'Vincular' },
];

// Permisos por defecto según rol
const PERMISOS_POR_ROL: Record<string, string[]> = {
  admin: PERMISOS_DISPONIBLES.map(p => p.key),
  cocina: ['movimientos', 'stock', 'recetas'],
  deposito: ['ordenes-compra', 'control-scanner', 'movimientos', 'stock', 'inventarios'],
  barra: ['stock', 'movimientos'],
  compras: ['ordenes-compra', 'control-scanner', 'movimientos', 'stock', 'productos', 'proveedores', 'reportes'],
};

const emptyForm = { codigo: '', nombre: '', rol: 'cocina', pin: '', depositoDefectoId: '' };

export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [error, setError] = useState('');

  const cargar = () => {
    api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(console.error);
  };

  useEffect(() => {
    cargar();
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  }, []);

  const abrir = (u?: any) => {
    if (u) {
      setEditId(u.id);
      setForm({ codigo: u.codigo, nombre: u.nombre, rol: u.rol, pin: '', depositoDefectoId: u.depositoDefectoId?.toString() || '' });
      try {
        setPermisos(u.permisos ? JSON.parse(u.permisos) : PERMISOS_POR_ROL[u.rol] || []);
      } catch {
        setPermisos(PERMISOS_POR_ROL[u.rol] || []);
      }
    } else {
      setEditId(null);
      setForm(emptyForm);
      setPermisos(PERMISOS_POR_ROL['cocina']);
    }
    setError('');
    setModalOpen(true);
  };

  const togglePermiso = (key: string) => {
    setPermisos(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const toggleTodos = () => {
    if (permisos.length === PERMISOS_DISPONIBLES.length) {
      setPermisos([]);
    } else {
      setPermisos(PERMISOS_DISPONIBLES.map(p => p.key));
    }
  };

  const handleRolChange = (nuevoRol: string) => {
    setForm(f => ({ ...f, rol: nuevoRol }));
    // Sugerir permisos típicos del rol (solo si no es edición)
    if (!editId) {
      setPermisos(PERMISOS_POR_ROL[nuevoRol] || []);
    }
  };

  const guardar = async () => {
    setError('');
    try {
      const data: any = { ...form, permisos: JSON.stringify(permisos) };
      if (!data.pin) delete data.pin;
      data.depositoDefectoId = data.depositoDefectoId ? parseInt(data.depositoDefectoId) : null;
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

  const eliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar al usuario "${nombre}"? Esta acción se puede revertir.`)) return;
    await api.deleteUsuario(id);
    cargar();
  };

  const rolBadge = (rol: string) => {
    const variants: Record<string, 'success' | 'info' | 'warning' | 'default' | 'primary'> = {
      admin: 'primary', cocina: 'info', deposito: 'warning', barra: 'default', compras: 'success'
    };
    return <Badge variant={variants[rol] || 'default'}>{ROLES.find(r => r.value === rol)?.label || rol}</Badge>;
  };

  const contarPermisos = (u: any) => {
    if (u.rol === 'admin') return 'Total';
    try {
      const p = JSON.parse(u.permisos || '[]');
      return `${p.length} secciones`;
    } catch { return '0 secciones'; }
  };

  return (
    <div>
      <PageTour pageKey="usuarios" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Gestión</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Usuarios</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/acceso-red')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
            title="Ver QR para que el equipo acceda desde el celular"
          >
            <QrCode size={15} /> QR de acceso
          </button>
          <Button onClick={() => abrir()}>
            <Plus size={16} /> Nuevo usuario
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Rol</th>
              <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acceso</th>
              <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-surface-high/50 transition-colors">
                <td className="p-3 font-mono text-xs text-primary">{u.codigo}</td>
                <td className="p-3 font-semibold text-foreground">{u.nombre}</td>
                <td className="p-3">{rolBadge(u.rol)}</td>
                <td className="p-3">
                  <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <ShieldCheck size={13} className={u.rol === 'admin' ? 'text-primary' : 'text-on-surface-variant'} />
                    {contarPermisos(u)}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => abrir(u)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => eliminar(u.id, u.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors">
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
            onChange={e => handleRolChange(e.target.value)}
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

          <Select
            label="Depósito por defecto (opcional)"
            id="depositoDefectoId"
            value={form.depositoDefectoId}
            onChange={e => setForm({ ...form, depositoDefectoId: e.target.value })}
            placeholder="Sin depósito asignado"
            options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
          />

          {/* Permisos — solo si no es admin */}
          {form.rol !== 'admin' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Secciones habilitadas
                </p>
                <button
                  onClick={toggleTodos}
                  className="text-[10px] font-bold text-primary hover:text-primary/80 uppercase tracking-wider"
                >
                  {permisos.length === PERMISOS_DISPONIBLES.length ? 'Quitar todos' : 'Seleccionar todos'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-surface-high rounded-lg p-3">
                {PERMISOS_DISPONIBLES.map(p => (
                  <label
                    key={p.key}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      permisos.includes(p.key)
                        ? 'bg-primary/10 text-foreground'
                        : 'text-on-surface-variant hover:bg-surface'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={permisos.includes(p.key)}
                      onChange={() => togglePermiso(p.key)}
                      className="accent-[#D4AF37] w-3.5 h-3.5"
                    />
                    <span className="text-xs font-semibold">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.rol === 'admin' && (
            <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
              <ShieldCheck size={16} className="text-primary" />
              <p className="text-xs font-bold text-primary">Admin: acceso total a todas las secciones</p>
            </div>
          )}

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
