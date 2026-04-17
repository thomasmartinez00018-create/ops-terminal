import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageTour from '../components/PageTour';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import {
  Plus, Check, AlertTriangle, User, Calendar, ChevronRight,
  CheckCircle2, Circle, ShoppingCart
} from 'lucide-react';

const TIPOS = [
  { value: 'general', label: 'General' },
  { value: 'recibir_mercaderia', label: 'Recibir mercaderia' },
  { value: 'inventario', label: 'Inventario' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'prep', label: 'Mise en place / Prep' },
  { value: 'cierre', label: 'Cierre de caja / turno' },
  { value: 'traspaso', label: 'Traspaso de responsabilidad' },
];

const PRIORIDADES = [
  { value: 'baja', label: 'Baja', color: 'text-zinc-500' },
  { value: 'normal', label: 'Normal', color: 'text-blue-400' },
  { value: 'alta', label: 'Alta', color: 'text-amber-500' },
  { value: 'urgente', label: 'Urgente', color: 'text-red-500' },
];

const prioridadBadge: Record<string, 'default' | 'info' | 'warning' | 'danger'> = {
  baja: 'default', normal: 'info', alta: 'warning', urgente: 'danger',
};

export default function Tareas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [tareas, setTareas] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [filtro, setFiltro] = useState<'mis' | 'creadas' | 'todas'>('mis');
  const [filtroEstado, setFiltroEstado] = useState('pendientes');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalCompletar, setModalCompletar] = useState<any>(null);
  const [obsCompletar, setObsCompletar] = useState('');
  const [form, setForm] = useState({
    titulo: '', descripcion: '', tipo: 'general', prioridad: 'normal',
    fecha: new Date().toISOString().split('T')[0], horaLimite: '', asignadoAId: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(() => {});
  }, []);

  const cargar = () => {
    if (filtro === 'mis' && user && filtroEstado === 'pendientes') {
      // Unificado: tareas + ordenes de compra asignadas
      api.getMisPendientes(user.id).then((data: any) => {
        setTareas(data.pendientes || []);
      }).catch(console.error);
    } else {
      const params: Record<string, string> = {};
      if (filtro === 'mis' && user) params.asignadoAId = String(user.id);
      if (filtro === 'creadas' && user) params.creadoPorId = String(user.id);
      if (filtroEstado === 'pendientes') params.pendientes = 'true';
      if (filtroEstado !== 'pendientes' && filtroEstado) params.estado = filtroEstado;
      api.getTareas(params).then(setTareas).catch(console.error);
    }
  };

  useEffect(() => { cargar(); }, [filtro, filtroEstado, user?.id]);

  const crear = async () => {
    setError('');
    if (!user) {
      setError('Debés estar logueado para crear una tarea');
      return;
    }
    if (!form.titulo || !form.asignadoAId) {
      setError('Titulo y asignado son requeridos');
      return;
    }
    if (!form.fecha) {
      setError('La fecha es requerida');
      return;
    }
    try {
      await api.createTarea({
        titulo: form.titulo,
        descripcion: form.descripcion || null,
        tipo: form.tipo,
        prioridad: form.prioridad,
        fecha: form.fecha,
        asignadoAId: Number(form.asignadoAId),
        creadoPorId: user.id,
        horaLimite: form.horaLimite || null,
      });
      setModalCrear(false);
      setForm({ titulo: '', descripcion: '', tipo: 'general', prioridad: 'normal', fecha: new Date().toISOString().split('T')[0], horaLimite: '', asignadoAId: '' });
      addToast('Tarea creada');
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const completar = async () => {
    if (!modalCompletar) return;
    try {
      await api.completarTarea(modalCompletar.id, obsCompletar);
      setModalCompletar(null);
      setObsCompletar('');
      addToast('Tarea completada');
      cargar();
    } catch (e: any) {
      addToast('Error: ' + e.message, 'error');
    }
  };

  const hoy = new Date().toISOString().split('T')[0];

  return (
    <div>
      <PageTour pageKey="tareas" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Equipo</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Tareas</h1>
        </div>
        <Button onClick={() => setModalCrear(true)}>
          <Plus size={16} /> Nueva tarea
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-border">
          {(['mis', 'creadas', 'todas'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 text-sm font-semibold transition ${filtro === f ? 'bg-primary text-black' : 'bg-surface text-on-surface-variant hover:bg-surface-high'}`}
            >
              {f === 'mis' ? 'Mis tareas' : f === 'creadas' ? 'Delegadas por mi' : 'Todas'}
            </button>
          ))}
        </div>
        <Select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="w-44">
          <option value="pendientes">Pendientes</option>
          <option value="completada">Completadas</option>
          <option value="">Todas</option>
        </Select>
      </div>

      {/* Lista de tareas */}
      <div className="space-y-2">
        {tareas.map(t => {
          const vencida = t.vencida || (t.fecha < hoy && ['pendiente', 'en_progreso', 'parcial'].includes(t.estado));
          const esMia = (t.asignadoAId === user?.id) || (t.origen === 'orden_compra');
          const esOC = t.origen === 'orden_compra';
          const key = `${t.origen || 'tarea'}-${t.id}`;
          const expanded = expandedId === key;

          return (
            <div
              key={key}
              className={`bg-surface border rounded-xl overflow-hidden transition ${
                vencida ? 'border-red-500/40 bg-red-500/5' :
                t.estado === 'completada' ? 'border-emerald-500/20' :
                esMia ? 'border-amber-500/30 bg-amber-500/5' :
                'border-border'
              }`}
            >
              {/* Fila principal — dividida: área expandir a la izq, acción rápida a la der */}
              <div className="w-full p-4 flex items-start gap-3">
                {/* Icono */}
                {esOC ? (
                  <ShoppingCart size={20} className="mt-0.5 shrink-0 text-amber-500" />
                ) : t.estado === 'completada' ? (
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle size={20} className="mt-0.5 shrink-0 text-zinc-600" />
                )}

                <button
                  onClick={() => setExpandedId(expanded ? null : key)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-bold text-sm ${t.estado === 'completada' ? 'line-through text-on-surface-variant' : 'text-foreground'}`}>
                      {t.titulo}
                    </p>
                    {/* Si está vencida, ocultamos el badge de prioridad para no
                        competir visualmente — lo rojo manda. */}
                    {!vencida && (
                      <Badge variant={prioridadBadge[t.prioridad] || 'default'}>
                        {t.prioridad}
                      </Badge>
                    )}
                    {esOC && <Badge variant="warning">OC</Badge>}
                    {vencida && <Badge variant="danger">Vencida</Badge>}
                    {t.estado === 'completada' && <Badge variant="success">Completada</Badge>}
                  </div>

                  <div className="flex items-center gap-4 mt-1.5 text-xs text-on-surface-variant">
                    {t.asignadoA && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        <span className={esMia ? 'text-amber-500 font-semibold' : ''}>{t.asignadoA?.nombre}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {t.fecha}
                    </span>
                    {t.creadoPor && <span className="text-zinc-600">por {t.creadoPor.nombre}</span>}
                  </div>
                </button>

                {/* Acción rápida: botón ✓ inline sin expandir — le ahorra al
                    cocinero/depósito 2 taps por cada tarea completada. El modal
                    completar pide la nota opcional igual. */}
                <div className="flex items-center gap-1 shrink-0">
                  {!esOC && t.estado !== 'completada' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalCompletar(t);
                        setObsCompletar('');
                      }}
                      className="p-2 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 active:bg-emerald-600/40 text-emerald-500 transition-colors"
                      title="Marcar completada"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedId(expanded ? null : key)}
                    className="p-2 rounded-lg hover:bg-surface-high text-zinc-500"
                    title={expanded ? 'Contraer' : 'Ver detalle'}
                  >
                    <ChevronRight size={16} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Panel expandido */}
              {expanded && (
                <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-3">
                  {/* Detalles */}
                  <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                    {t.descripcion && (
                      <div className="col-span-2">
                        <p className="text-zinc-500 font-semibold mb-0.5">Descripcion</p>
                        <p className="text-on-surface-variant">{t.descripcion}</p>
                      </div>
                    )}
                    {t.tipo && t.tipo !== 'general' && (
                      <div>
                        <p className="text-zinc-500 font-semibold mb-0.5">Tipo</p>
                        <p>{TIPOS.find(tp => tp.value === t.tipo)?.label || t.tipo}</p>
                      </div>
                    )}
                    {t.horaLimite && (
                      <div>
                        <p className="text-zinc-500 font-semibold mb-0.5">Hora limite</p>
                        <p>{t.horaLimite}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-zinc-500 font-semibold mb-0.5">Estado</p>
                      <p className="capitalize">{t.estado}</p>
                    </div>
                    {t.creadoPor && (
                      <div>
                        <p className="text-zinc-500 font-semibold mb-0.5">Creada por</p>
                        <p>{t.creadoPor.nombre}</p>
                      </div>
                    )}
                    {t.estado === 'completada' && t.completadaAt && (
                      <div>
                        <p className="text-zinc-500 font-semibold mb-0.5">Completada</p>
                        <p>{new Date(t.completadaAt).toLocaleString('es-AR')}</p>
                      </div>
                    )}
                    {t.estado === 'completada' && t.observacion && (
                      <div className="col-span-2">
                        <p className="text-zinc-500 font-semibold mb-0.5">Nota de resolucion</p>
                        <p className="text-emerald-400">{t.observacion}</p>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-2">
                    {esOC && (
                      <button
                        onClick={() => navigate('/ordenes-compra')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs rounded-lg transition"
                      >
                        <ShoppingCart size={14} /> Ir a Ordenes de Compra
                      </button>
                    )}
                    {!esOC && t.estado !== 'completada' && (
                      <button
                        onClick={() => { setModalCompletar(t); setObsCompletar(''); }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                      >
                        <Check size={14} /> Marcar completada
                      </button>
                    )}
                    {!esOC && t.estado === 'pendiente' && (
                      <button
                        onClick={async () => {
                          await api.updateTarea(t.id, { estado: 'en_progreso' });
                          addToast('En progreso');
                          cargar();
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition"
                      >
                        <AlertTriangle size={14} /> En progreso
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {tareas.length === 0 && (
          <div className="text-center py-12 text-on-surface-variant">
            <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">
              {filtro === 'mis' && filtroEstado === 'pendientes' ? 'No tenes tareas pendientes' :
               filtroEstado === 'completada' ? 'No hay tareas completadas' : 'Sin tareas'}
            </p>
          </div>
        )}
      </div>

      {/* Modal Crear Tarea */}
      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nueva Tarea">
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <Input label="Titulo *" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Recibir pedido de verduras" />

          <Input label="Descripcion" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalles adicionales..." />

          <Select label="Asignar a *" value={form.asignadoAId} onChange={e => setForm({ ...form, asignadoAId: e.target.value })}>
            <option value="">Seleccionar persona...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            <Select label="Prioridad" value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}>
              {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha *" type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            <Input label="Hora limite" type="time" value={form.horaLimite} onChange={e => setForm({ ...form, horaLimite: e.target.value })} />
          </div>

          <Button onClick={crear} className="w-full">
            <Plus size={16} /> Crear y asignar tarea
          </Button>
        </div>
      </Modal>

      {/* Modal Completar Tarea */}
      <Modal open={!!modalCompletar} onClose={() => setModalCompletar(null)} title="Completar tarea">
        <div className="space-y-4">
          <p className="font-bold text-foreground">{modalCompletar?.titulo}</p>
          {modalCompletar?.descripcion && (
            <p className="text-sm text-on-surface-variant">{modalCompletar.descripcion}</p>
          )}

          {/* Textarea en vez de Input — en cocina la nota suele ser "Recibí 18
              de 20 cajas, faltan las bebidas y 2 cajas de tomate (están vencidas
              las que sí llegaron)". No entra en un input de 1 línea. */}
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
              Nota al completar <span className="normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              value={obsCompletar}
              onChange={e => setObsCompletar(e.target.value)}
              placeholder="Ej: Se recibieron 18 de 20 cajas — faltan las bebidas."
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <Button onClick={completar} className="w-full bg-emerald-600 hover:bg-emerald-500">
            <Check size={16} /> Marcar como completada
          </Button>
        </div>
      </Modal>
    </div>
  );
}
