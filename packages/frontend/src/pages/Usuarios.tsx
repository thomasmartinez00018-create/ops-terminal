import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PageTour from '../components/PageTour';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, Pencil, Trash2, ShieldCheck, QrCode, LayoutDashboard, Link2, Copy, Check, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardConfig } from '../context/AuthContext';
import { isPairedDevice } from '../lib/api';

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
  { key: 'contabilidad', label: 'Contabilidad' },
  { key: 'importar', label: 'Importar datos' },
  { key: 'vincular', label: 'Vincular' },
];

// Permisos por defecto según rol
const PERMISOS_POR_ROL: Record<string, string[]> = {
  admin: PERMISOS_DISPONIBLES.map(p => p.key),
  cocina: ['movimientos', 'stock', 'recetas'],
  deposito: ['ordenes-compra', 'control-scanner', 'movimientos', 'stock', 'inventarios'],
  barra: ['stock', 'movimientos'],
  compras: ['ordenes-compra', 'control-scanner', 'movimientos', 'stock', 'productos', 'proveedores', 'reportes', 'contabilidad'],
};

const DASHBOARD_TIPOS = [
  { value: 'auto', label: 'Automático (según rol)' },
  { value: 'admin', label: 'Panel completo (admin)' },
  { value: 'dueno', label: 'Panel del dueño (ejecutivo)' },
  { value: 'simple', label: 'Panel simple (cocina/barra)' },
  { value: 'deposito', label: 'Panel de depósito' },
];

const DASHBOARD_WIDGETS_ADMIN = [
  { key: 'wifi', label: 'Acceso WiFi' },
  { key: 'tareas', label: 'Tareas pendientes' },
  { key: 'alertas', label: 'Alertas (OC + Discrepancias)' },
  { key: 'kpis', label: 'KPIs (tarjetas de métricas)' },
  { key: 'equipo-hoy', label: 'Actividad del equipo hoy' },
  { key: 'ultimos-movimientos', label: 'Últimos movimientos' },
];

// Widgets para el "panel del dueño" — vista ejecutiva, no técnica.
const DASHBOARD_WIDGETS_DUENO = [
  { key: 'alertas', label: 'Alertas (precio + discrepancias)' },
  { key: 'pulso', label: 'Pulso del negocio (4 KPIs)' },
  { key: 'cuentas', label: 'Deuda con proveedores (top 5)' },
  { key: 'equipo-hoy', label: 'Equipo hoy' },
  { key: 'shortcuts', label: 'Accesos a reportes' },
  { key: 'ultimos-movimientos', label: 'Últimos movimientos' },
];

const DASHBOARD_ACCIONES_SIMPLE = [
  { key: 'uso', label: 'Registrar uso' },
  { key: 'merma', label: 'Registrar merma' },
  { key: 'stock', label: 'Ver stock' },
  { key: 'ingreso', label: 'Registrar ingreso' },
  { key: 'factura', label: 'Escanear factura' },
  { key: 'mis-movimientos', label: 'Mis movimientos recientes' },
];

const DASHBOARD_ACCIONES_DEPOSITO = [
  { key: 'ordenes', label: 'Recibir mercadería (OC)' },
  { key: 'scanner', label: 'Control scanner' },
  { key: 'movimiento-rapido', label: 'Movimiento rápido' },
  { key: 'stock', label: 'Ver stock' },
];

const emptyForm = { codigo: '', nombre: '', rol: 'cocina', pin: '', depositoDefectoId: '' };
const emptyDashConfig: DashboardConfig = { tipo: 'auto' };

export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [dashConfig, setDashConfig] = useState<DashboardConfig>(emptyDashConfig);
  const [error, setError] = useState('');

  // Device pairing
  const pairingBloqueado = isPairedDevice();
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiraEn, setPairingExpiraEn] = useState<number>(0);
  const [pairingTtl, setPairingTtl] = useState<number>(0);
  const [pairingCopiado, setPairingCopiado] = useState(false);
  // Contexto del pairing: si viene de crear un usuario, guardamos su nombre
  // para adaptar el copy del modal ("compartile este código a Juan").
  const [pairingParaUsuario, setPairingParaUsuario] = useState<{ nombre: string; codigo: string } | null>(null);

  // Countdown del código
  useEffect(() => {
    if (!pairingOpen || !pairingExpiraEn) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((pairingExpiraEn - Date.now()) / 1000));
      setPairingTtl(left);
      if (left === 0) setPairingCode(null);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [pairingOpen, pairingExpiraEn]);

  const generarPairingCode = async () => {
    setPairingError('');
    setPairingCode(null);
    setPairingCopiado(false);
    setPairingBusy(true);
    try {
      const res = await api.pairGenerate();
      setPairingCode(res.codigo);
      setPairingExpiraEn(new Date(res.expiraEn).getTime());
    } catch (err: any) {
      setPairingError(err?.message || 'Error al generar código');
    } finally {
      setPairingBusy(false);
    }
  };

  const copiarPairingCode = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setPairingCopiado(true);
      setTimeout(() => setPairingCopiado(false), 1500);
    } catch {}
  };

  const abrirPairingModal = () => {
    setPairingCode(null);
    setPairingError('');
    setPairingCopiado(false);
    setPairingParaUsuario(null); // Modal standalone — sin contexto de usuario
    setPairingOpen(true);
    // Generamos automáticamente al abrir
    generarPairingCode();
  };

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
      setDashConfig(u.configuracion || emptyDashConfig);
    } else {
      setEditId(null);
      setForm(emptyForm);
      setPermisos(PERMISOS_POR_ROL['cocina']);
      setDashConfig(emptyDashConfig);
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
      const confToSave: DashboardConfig | null = dashConfig.tipo === 'auto' ? null : dashConfig;
      const data: any = { ...form, permisos: JSON.stringify(permisos), configuracion: confToSave };
      if (!data.pin) delete data.pin;
      data.depositoDefectoId = data.depositoDefectoId ? parseInt(data.depositoDefectoId) : null;

      const esCreacion = !editId;
      const esNoAdmin = form.rol !== 'admin';
      const nombreUsuario = form.nombre;

      if (editId) {
        await api.updateUsuario(editId, data);
      } else {
        await api.createUsuario(data);
      }
      setModalOpen(false);
      cargar();

      // Al crear un empleado no-admin, encadenamos el flujo de pairing para
      // que el admin no tenga que ir a buscar el botón después. Sin esto,
      // el usuario queda creado pero sin forma obvia de darle acceso.
      if (esCreacion && esNoAdmin && !pairingBloqueado) {
        setPairingCode(null);
        setPairingError('');
        setPairingCopiado(false);
        setPairingParaUsuario({ nombre: nombreUsuario, codigo: form.codigo });
        setPairingOpen(true);
        try {
          const res = await api.pairGenerate();
          setPairingCode(res.codigo);
          setPairingExpiraEn(new Date(res.expiraEn).getTime());
        } catch (err: any) {
          setPairingError(err?.message || 'Error al generar código');
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleDashItem = (key: string, field: 'widgets' | 'acciones', allItems: {key: string}[]) => {
    setDashConfig(prev => {
      const current = prev[field] ?? allItems.map(i => i.key);
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...prev, [field]: next };
    });
  };

  const isDashItemOn = (key: string, field: 'widgets' | 'acciones') => {
    const list = dashConfig[field];
    if (!list) return true; // undefined = todos activos
    return list.includes(key);
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
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => navigate('/acceso-red')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
            title="Ver QR para que el equipo acceda desde el celular"
          >
            <QrCode size={15} /> QR de acceso
          </button>
          {!pairingBloqueado && (
            <button
              onClick={abrirPairingModal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success/10 border border-success/30 text-sm font-bold text-success hover:bg-success/20 transition-colors"
              title="Generar un código para vincular el dispositivo de un empleado sin compartir tu email/contraseña"
            >
              <Link2 size={15} /> Vincular dispositivo
            </button>
          )}
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

          {/* ── Dashboard personalizado ─────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <LayoutDashboard size={13} className="text-primary" />
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                Vista de inicio
              </p>
            </div>
            <div className="bg-surface-high rounded-lg p-3 space-y-3">
              {/* Tipo de dashboard */}
              <div className="grid grid-cols-2 gap-1.5">
                {DASHBOARD_TIPOS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setDashConfig(prev => ({ ...prev, tipo: t.value as DashboardConfig['tipo'] }))}
                    className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-colors ${
                      (dashConfig.tipo || 'auto') === t.value
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'bg-surface text-on-surface-variant hover:bg-surface/80'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Widgets del panel admin */}
              {(dashConfig.tipo === 'admin' || (dashConfig.tipo === 'auto' && (form.rol === 'admin' || form.rol === 'compras'))) && (
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Secciones visibles en el panel
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DASHBOARD_WIDGETS_ADMIN.map(w => (
                      <label key={w.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isDashItemOn(w.key, 'widgets')
                          ? 'bg-primary/10 text-foreground'
                          : 'text-on-surface-variant hover:bg-surface'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isDashItemOn(w.key, 'widgets')}
                          onChange={() => toggleDashItem(w.key, 'widgets', DASHBOARD_WIDGETS_ADMIN)}
                          className="accent-[#D4AF37] w-3.5 h-3.5"
                        />
                        <span className="text-xs font-semibold">{w.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Widgets del panel dueño */}
              {dashConfig.tipo === 'dueno' && (
                <div>
                  <p className="text-[10px] font-bold text-primary/80 uppercase tracking-wider mb-1">
                    Vista ejecutiva — sin operativa
                  </p>
                  <p className="text-[10px] text-on-surface-variant mb-2 leading-relaxed">
                    El usuario ve solo métricas, alertas y reportes. Se ocultan productos,
                    depósitos, recetas, usuarios y configuración en el menú.
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DASHBOARD_WIDGETS_DUENO.map(w => (
                      <label key={w.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isDashItemOn(w.key, 'widgets')
                          ? 'bg-primary/10 text-foreground'
                          : 'text-on-surface-variant hover:bg-surface'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isDashItemOn(w.key, 'widgets')}
                          onChange={() => toggleDashItem(w.key, 'widgets', DASHBOARD_WIDGETS_DUENO)}
                          className="accent-[#D4AF37] w-3.5 h-3.5"
                        />
                        <span className="text-xs font-semibold">{w.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones del panel simple */}
              {(dashConfig.tipo === 'simple' || (dashConfig.tipo === 'auto' && (form.rol === 'cocina' || form.rol === 'barra'))) && (
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Botones de acción visibles
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DASHBOARD_ACCIONES_SIMPLE.map(a => (
                      <label key={a.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isDashItemOn(a.key, 'acciones')
                          ? 'bg-primary/10 text-foreground'
                          : 'text-on-surface-variant hover:bg-surface'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isDashItemOn(a.key, 'acciones')}
                          onChange={() => toggleDashItem(a.key, 'acciones', DASHBOARD_ACCIONES_SIMPLE)}
                          className="accent-[#D4AF37] w-3.5 h-3.5"
                        />
                        <span className="text-xs font-semibold">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones del panel depósito */}
              {(dashConfig.tipo === 'deposito' || (dashConfig.tipo === 'auto' && form.rol === 'deposito')) && (
                <div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Botones de acción visibles
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {DASHBOARD_ACCIONES_DEPOSITO.map(a => (
                      <label key={a.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                        isDashItemOn(a.key, 'acciones')
                          ? 'bg-primary/10 text-foreground'
                          : 'text-on-surface-variant hover:bg-surface'
                      }`}>
                        <input
                          type="checkbox"
                          checked={isDashItemOn(a.key, 'acciones')}
                          onChange={() => toggleDashItem(a.key, 'acciones', DASHBOARD_ACCIONES_DEPOSITO)}
                          className="accent-[#D4AF37] w-3.5 h-3.5"
                        />
                        <span className="text-xs font-semibold">{a.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

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

      {/* ── Modal de Device Pairing — generar código de 6 dígitos ───────── */}
      <Modal
        open={pairingOpen}
        onClose={() => { setPairingOpen(false); setPairingParaUsuario(null); }}
        title={pairingParaUsuario
          ? `Compartí el acceso con ${pairingParaUsuario.nombre}`
          : 'Vincular un dispositivo'}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
            <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-on-surface-variant leading-relaxed">
              {pairingParaUsuario ? (
                <>
                  <p className="font-bold text-foreground mb-1">Paso siguiente</p>
                  <p>
                    Ya creaste a <span className="font-bold text-primary">{pairingParaUsuario.nombre}</span>
                    {' '}(código <span className="font-mono font-bold">{pairingParaUsuario.codigo}</span>).
                    Compartile el código de abajo por WhatsApp. Al abrir la app,
                    toca <span className="font-bold text-primary">"Vincular dispositivo con un código"</span>,
                    ingresa los 6 dígitos y queda vinculado al local sin ver tu email.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-foreground mb-1">¿Cómo funciona?</p>
                  <p>
                    Generás un código de 6 dígitos. El empleado entra a la app desde su
                    celular, tap en <span className="font-bold text-primary">"Vincular dispositivo con un código"</span>,
                    ingresa los dígitos y queda bindeado al local <span className="font-bold">sin ver tu email ni contraseña</span>.
                    Después ingresa con su código+PIN propio.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Display del código */}
          <div className="relative">
            <div className={`
              rounded-2xl border-2 p-6 text-center transition-all
              ${pairingCode
                ? 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/40'
                : 'bg-surface-high border-border'}
            `}>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                Código de 6 dígitos
              </p>
              {pairingBusy && !pairingCode ? (
                <div className="py-4">
                  <p className="text-sm text-on-surface-variant font-semibold animate-pulse">
                    Generando...
                  </p>
                </div>
              ) : pairingCode ? (
                <>
                  <div
                    className="font-mono-alt text-5xl md:text-6xl font-extrabold text-primary tracking-[0.25em] tabular-nums select-all cursor-pointer"
                    onClick={copiarPairingCode}
                    title="Tap para copiar"
                  >
                    {pairingCode}
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-bold mt-3">
                    {pairingTtl > 0
                      ? <>Expira en <span className="text-primary tabular-nums">{Math.floor(pairingTtl / 60)}:{String(pairingTtl % 60).padStart(2, '0')}</span></>
                      : <span className="text-destructive">Expirado — generá uno nuevo</span>}
                  </p>
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  Tocá "Generar código" para empezar
                </p>
              )}
            </div>
          </div>

          {pairingError && (
            <p className="text-xs text-destructive font-semibold text-center">
              {pairingError}
            </p>
          )}

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={copiarPairingCode}
              disabled={!pairingCode || pairingTtl === 0}
            >
              {pairingCopiado ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar</>}
            </Button>
            <Button
              onClick={generarPairingCode}
              disabled={pairingBusy}
            >
              <RefreshCw size={16} className={pairingBusy ? 'animate-spin' : ''} />
              {pairingCode ? 'Nuevo código' : 'Generar código'}
            </Button>
          </div>

          <div className="text-[11px] text-on-surface-variant/80 leading-relaxed pt-2 border-t border-border">
            <p>
              <span className="font-bold text-on-surface-variant">Seguridad:</span> el código es de un solo uso,
              expira en 10 minutos y solo funciona en un dispositivo. El empleado que lo canjee quedará
              limitado al login staff con su PIN — no podrá cambiar workspace ni ver datos de cuenta.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => setPairingOpen(false)}
            className="w-full"
          >
            Cerrar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
