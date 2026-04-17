import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import QuickMovimiento from '../components/QuickMovimiento';
import {
  Package, Warehouse, ArrowRightLeft, AlertTriangle,
  TrendingDown, TrendingUp, ClipboardCheck, Activity,
  ShoppingCart, ScanBarcode, Bell, ChevronRight, Plus,
  Utensils, Wine, ClipboardList, Users, ArrowUpRight, ArrowDownRight, Minus,
  ScanLine, DollarSign, LineChart, Receipt, Eye, Flame
} from 'lucide-react';

const tipoBadge: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
  ingreso: 'success', elaboracion: 'info', merma: 'danger',
  transferencia: 'warning', ajuste: 'default', consumo_interno: 'default',
  devolucion: 'warning', conteo: 'info',
};
const tipoLabels: Record<string, string> = {
  ingreso: 'Ingreso', elaboracion: 'Elaboración', merma: 'Merma',
  transferencia: 'Transferencia', ajuste: 'Ajuste', conteo: 'Conteo',
  consumo_interno: 'Consumo int.', devolucion: 'Devolución',
};

// ─── Toggle admin ↔ dueño (vista ejecutiva) ─────────────────────────────────
// El admin puede "verse" como dueño sin crear otro usuario — útil para mostrar
// a clientes no técnicos cómo se ve su panel sin romper su propia sesión.
function VistaToggleDueno({ hacia }: { hacia: 'dueno' | 'admin' }) {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user || user.rol !== 'admin') return null;

  const activar = async () => {
    setBusy(true);
    try {
      const nuevaConfig = hacia === 'dueno'
        ? { ...(user.configuracion || {}), tipo: 'dueno' as const }
        : { ...(user.configuracion || {}), tipo: 'admin' as const };
      await api.updateUsuario(user.id, { configuracion: nuevaConfig });
      await refreshUser();
    } catch (e) {
      console.error('[VistaToggleDueno]', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={activar}
      disabled={busy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border ${
        hacia === 'dueno'
          ? 'bg-surface-high text-on-surface-variant border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30'
          : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
      } ${busy ? 'opacity-50' : ''}`}
      title={hacia === 'dueno' ? 'Ver el panel que verían tus dueños' : 'Volver a tu vista admin'}
    >
      <Eye size={12} />
      {hacia === 'dueno' ? 'Vista dueño' : 'Volver a admin'}
    </button>
  );
}

// ─── Banner de tareas pendientes (para TODOS los roles) ─────────────────────
function MisTareasPendientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    api.getMisPendientes(user.id).then(setData).catch(() => {});
  }, [user?.id]);

  if (!data?.pendientes?.length) return null;

  const { pendientes } = data;
  const urgentes = pendientes.filter((p: any) => p.prioridad === 'urgente' || p.vencida);

  return (
    <div className="mb-6 space-y-2">
      {/* Banner principal */}
      <button
        onClick={() => navigate('/tareas')}
        className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left hover:bg-amber-500/15 transition group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Bell size={18} className="text-amber-500 animate-pulse" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                {pendientes.length === 1 ? 'Tenes 1 tarea pendiente' : `Tenes ${pendientes.length} tareas pendientes`}
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {pendientes.slice(0, 2).map((t: any) => t.titulo).join(' · ')}
                {pendientes.length > 2 ? ` y ${pendientes.length - 2} mas` : ''}
              </p>
            </div>
          </div>
          <ChevronRight size={20} className="text-amber-500 group-hover:translate-x-1 transition-transform" />
        </div>
      </button>

      {/* Urgentes/vencidas — se muestran individualmente */}
      {urgentes.map((t: any) => (
        <button
          key={`${t.origen}-${t.id}`}
          onClick={() => navigate(t.origen === 'orden_compra' ? '/ordenes-compra' : '/tareas')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/5 hover:bg-red-500/10 transition text-left"
        >
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-400 flex-1">
            {t.vencida ? 'VENCIDA: ' : 'URGENTE: '}{t.titulo}
          </p>
          <ChevronRight size={14} className="text-red-500" />
        </button>
      ))}
    </div>
  );
}

// ─── Dashboard simplificado para cocina/barra ───────────────────────────────
function DashboardSimple({ rol }: { rol: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const [tipoInicial, setTipoInicial] = useState('consumo_interno');
  const [misMov, setMisMov] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getMovimientos({ usuarioId: String(user.id), limit: '8' }).then(setMisMov).catch(() => {});
  }, [user?.id]);

  const abrirQuick = (tipo: string) => {
    setTipoInicial(tipo);
    setQuickOpen(true);
  };

  const esBar = rol === 'barra';
  const acciones = user?.configuracion?.acciones;
  const showAccion = (key: string) => !acciones || acciones.includes(key);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">
          {esBar ? 'Barra' : 'Cocina'}
        </p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
      </div>

      <MisTareasPendientes />

      {/* Acciones principales — botones grandes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {showAccion('uso') && (
          <button
            onClick={() => abrirQuick('consumo_interno')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-blue-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
              {esBar ? <Wine size={20} className="text-blue-400" /> : <Utensils size={20} className="text-blue-400" />}
            </div>
            <p className="text-sm font-extrabold text-foreground">Registrar uso</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {esBar ? 'Bebidas consumidas' : 'Ingredientes usados'}
            </p>
          </button>
        )}

        {showAccion('merma') && (
          <button
            onClick={() => abrirQuick('merma')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-destructive/20"
          >
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
              <TrendingDown size={20} className="text-destructive" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Registrar merma</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Vencidos o rotos</p>
          </button>
        )}

        {showAccion('stock') && (
          <button
            onClick={() => navigate('/stock')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mb-3">
              <ClipboardList size={20} className="text-success" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Ver stock</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Qué hay disponible</p>
          </button>
        )}

        {showAccion('ingreso') && (
          <button
            onClick={() => abrirQuick('ingreso')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-success/20"
          >
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mb-3">
              <Plus size={20} className="text-success" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Registrar ingreso</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Llegó mercadería</p>
          </button>
        )}

        {showAccion('factura') && (
          <button
            onClick={() => navigate('/escanear-factura')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-amber-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
              <ScanLine size={20} className="text-amber-500" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Escanear factura</p>
            <p className="text-xs text-on-surface-variant mt-0.5">IA extrae productos</p>
          </button>
        )}
      </div>

      {/* Mis últimos movimientos */}
      {showAccion('mis-movimientos') && misMov.length > 0 && (
        <div className="bg-surface rounded-xl border border-border">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Mis registros de hoy</h2>
            <button onClick={() => navigate('/movimientos')} className="text-[10px] text-primary font-bold uppercase tracking-wider">
              Ver todos
            </button>
          </div>
          <div className="divide-y divide-border">
            {misMov.map((mov: any) => (
              <div key={mov.id} className="p-3 flex items-center gap-3">
                <Badge variant={tipoBadge[mov.tipo]}>{tipoLabels[mov.tipo] || mov.tipo}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{mov.producto?.nombre}</p>
                  <p className="text-xs text-on-surface-variant">{mov.cantidad} {mov.unidad} · {mov.hora}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickMovimiento open={quickOpen} onClose={() => setQuickOpen(false)} tipoInicial={tipoInicial} />
    </div>
  );
}

// ─── Dashboard depósito ──────────────────────────────────────────────────────
function DashboardDeposito() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);

  const acciones = user?.configuracion?.acciones;
  const showAccion = (key: string) => !acciones || acciones.includes(key);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Deposito</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
      </div>

      <MisTareasPendientes />

      {/* Acciones principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {showAccion('ordenes') && (
        <button
          onClick={() => navigate('/ordenes-compra')}
          className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-warning/20"
        >
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center mb-3">
            <ShoppingCart size={20} className="text-warning" />
          </div>
          <p className="text-sm font-extrabold text-foreground">Recibir mercadería</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Confirmar entregas</p>
        </button>
        )}

        {showAccion('scanner') && (
        <button
          onClick={() => navigate('/control-scanner')}
          className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-primary/20"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <ScanBarcode size={20} className="text-primary" />
          </div>
          <p className="text-sm font-extrabold text-foreground">Control scanner</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Contar con lector</p>
        </button>
        )}

        {showAccion('movimiento-rapido') && (
        <button
          onClick={() => setQuickOpen(true)}
          className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-blue-500/20"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <ArrowRightLeft size={20} className="text-blue-400" />
          </div>
          <p className="text-sm font-extrabold text-foreground">Movimiento rápido</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Ingreso o salida</p>
        </button>
        )}

        {showAccion('stock') && (
        <button
          onClick={() => navigate('/stock')}
          className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mb-3">
            <ClipboardList size={20} className="text-success" />
          </div>
          <p className="text-sm font-extrabold text-foreground">Ver stock</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Todos los depósitos</p>
        </button>
        )}
      </div>

      <QuickMovimiento open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

// ─── Trend helper ─────────────────────────────────────────────────────────────
// Compara dos números y muestra el % de cambio con flecha + color.
// Guards contra casos raros: non-finite (null/undefined/NaN), division por
// cero, Infinity cuando previous=0 y current>0.
function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const cur = Number.isFinite(current) ? current : 0;
  const prev = Number.isFinite(previous) ? previous : 0;
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-success"><ArrowUpRight size={10} /> nuevo</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-on-surface-variant"><Minus size={10} /> igual</span>;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-bold ${up ? 'text-success' : 'text-destructive'}`}>
      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct)}%
    </span>
  );
}

// ─── Dashboard admin / compras (completo) ────────────────────────────────────
// ─── Equipo hoy — expandible con detalles por usuario ───────────────────────
function EquipoHoyList({ equipo, movimientos }: { equipo: any[]; movimientos: any[] }) {
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  return (
    <div className="divide-y divide-border">
      {equipo.map((u: any) => {
        const expanded = expandedUser === u.id;
        const userMov = movimientos.filter((m: any) => m.usuarioId === u.id || m.usuario?.id === u.id);

        return (
          <div key={u.id}>
            <button
              onClick={() => setExpandedUser(expanded ? null : u.id)}
              className="w-full p-4 flex items-center gap-3 hover:bg-surface-high/30 transition text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-extrabold text-primary">{u.nombre.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground truncate">{u.nombre}</p>
                  <span className="text-[10px] font-semibold text-on-surface-variant bg-surface-high px-1.5 py-0.5 rounded">{u.rol}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {Object.entries(u.tipos as Record<string, number>).map(([tipo, count]) => (
                    <Badge key={tipo} variant={tipoBadge[tipo] || 'default'}>
                      {count} {tipoLabels[tipo] || tipo}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-lg font-extrabold text-foreground shrink-0">{u.total}</p>
              <ChevronRight size={14} className={`text-zinc-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>

            {expanded && userMov.length > 0 && (
              <div className="px-4 pb-3 space-y-1.5">
                {userMov.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 text-xs bg-surface-high/50 rounded-lg px-3 py-2">
                    <Badge variant={tipoBadge[m.tipo] || 'default'}>
                      {tipoLabels[m.tipo] || m.tipo}
                    </Badge>
                    <span className="font-semibold text-foreground truncate">{m.producto?.nombre || '—'}</span>
                    <span className="text-on-surface-variant">{m.cantidad} {m.unidad}</span>
                    {m.depositoDestino && <span className="text-zinc-600">→ {m.depositoDestino.nombre}</span>}
                    <span className="ml-auto text-zinc-600 shrink-0">{m.hora}</span>
                  </div>
                ))}
              </div>
            )}
            {expanded && userMov.length === 0 && (
              <p className="px-4 pb-3 text-xs text-on-surface-variant">Sin detalle disponible</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Dashboard dueño — vista ejecutiva, no operativa ────────────────────────
// Pensado para el dueño del restaurante que NO carga datos, solo quiere ver
// cómo va el negocio: pulso, alertas, plata a pagar, actividad del equipo y
// accesos a reportes. Deliberadamente NO tiene botones de "registrar" para
// no confundir con el flujo operativo — si el dueño quiere cargar algo igual
// puede, pero desde el sidebar (sigue siendo rol admin).
function DashboardDueno() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [cxp, setCxp] = useState<any>(null);
  const [alertasPrecio, setAlertasPrecio] = useState<{ pendientes: number; altaPendientes: number } | null>(null);
  const [discrepancias, setDiscrepancias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboardStats().catch(() => null),
      api.getCuentasPorPagar().catch(() => null),
      api.getAlertasPrecioCount().catch(() => null),
      api.getDiscrepancias().catch(() => []),
    ]).then(([s, c, ap, d]) => {
      setStats(s);
      setCxp(c);
      setAlertasPrecio(ap);
      setDiscrepancias(d || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-on-surface-variant font-semibold">Cargando dashboard...</p>
      </div>
    );
  }

  const widgets = user?.configuracion?.widgets;
  const showWidget = (key: string) => !widgets || widgets.includes(key);

  const discGraves = discrepancias.filter((d: any) => d.color === 'rojo').length;
  const alertasTotal = (alertasPrecio?.pendientes ?? 0) + discGraves;

  // Formato de plata argentino con miles
  const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

  // Top 5 proveedores con más saldo a pagar
  const topDeuda = Array.isArray(cxp?.proveedores)
    ? [...cxp.proveedores]
        .filter((p: any) => (p.saldoPendiente || 0) > 0)
        .sort((a: any, b: any) => (b.saldoPendiente || 0) - (a.saldoPendiente || 0))
        .slice(0, 5)
    : [];

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Panel del dueño</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">Cómo va el negocio, de un vistazo.</p>
        </div>
        <VistaToggleDueno hacia="admin" />
      </div>

      {/* ── Alertas unificadas (arriba de todo, porque acá querés mirar) ── */}
      {showWidget('alertas') && alertasTotal > 0 && (
        <div className="space-y-2 mb-6">
          {(alertasPrecio?.pendientes ?? 0) > 0 && (
            <button
              onClick={() => navigate('/alertas-precio')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning/5 hover:bg-warning/10 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                <Flame size={18} className="text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {alertasPrecio!.pendientes} variación{alertasPrecio!.pendientes > 1 ? 'es' : ''} de precio para revisar
                </p>
                <p className="text-xs text-on-surface-variant">
                  {alertasPrecio!.altaPendientes > 0 ? `${alertasPrecio!.altaPendientes} urgentes — ` : ''}
                  un proveedor subió más de lo normal
                </p>
              </div>
              <ChevronRight size={14} className="text-warning" />
            </button>
          )}
          {discGraves > 0 && (
            <button
              onClick={() => navigate('/discrepancias')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">
                  {discGraves} depósito{discGraves > 1 ? 's' : ''} con discrepancias graves
                </p>
                <p className="text-xs text-on-surface-variant">Faltante real vs lo que registró el equipo</p>
              </div>
              <ChevronRight size={14} className="text-destructive" />
            </button>
          )}
        </div>
      )}

      {/* ── Pulso del negocio — 4 KPIs grandes, clickables ──────────────── */}
      {showWidget('pulso') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 stagger-children">
          <button
            onClick={() => navigate('/reportes-costos')}
            className="glass card-glow rounded-2xl p-5 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <DollarSign size={18} className="text-primary" />
              </div>
              <TrendBadge current={stats.ingresosDelMes} previous={stats.ingresosMesAnt} />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{stats.ingresosDelMes}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">Ingresos del mes</p>
            <p className="text-[9px] text-on-surface-variant/70 mt-0.5">vs mes anterior</p>
          </button>

          <button
            onClick={() => navigate('/reportes')}
            className="glass card-glow rounded-2xl p-5 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-destructive/10">
                <TrendingDown size={18} className="text-destructive" />
              </div>
              <div className="[&_.text-success]:text-destructive [&_.text-destructive]:text-success">
                <TrendBadge current={stats.mermasDelMes} previous={stats.mermasMesAnt} />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-destructive">{stats.mermasDelMes}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">Mermas del mes</p>
            <p className="text-[9px] text-on-surface-variant/70 mt-0.5">plata que se pierde</p>
          </button>

          <button
            onClick={() => navigate('/stock?filter=bajoMinimo')}
            className="glass card-glow rounded-2xl p-5 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${stats.bajosDeMinimo > 0 ? 'bg-warning/10' : 'bg-success/10'}`}>
                <AlertTriangle size={18} className={stats.bajosDeMinimo > 0 ? 'text-warning' : 'text-success'} />
              </div>
            </div>
            <p className={`text-2xl font-extrabold ${stats.bajosDeMinimo > 0 ? 'text-warning' : 'text-success'}`}>
              {stats.bajosDeMinimo}
            </p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">Bajo mínimo</p>
            <p className="text-[9px] text-on-surface-variant/70 mt-0.5">hay que reponer</p>
          </button>

          <button
            onClick={() => navigate('/cuentas-por-pagar')}
            className="glass card-glow rounded-2xl p-5 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Receipt size={18} className="text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-foreground">
              {cxp?.totalPendiente != null ? fmt$(cxp.totalPendiente) : '—'}
            </p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">A pagar</p>
            <p className="text-[9px] text-on-surface-variant/70 mt-0.5">total a proveedores</p>
          </button>
        </div>
      )}

      {/* ── Deuda con proveedores (top 5) ───────────────────────────────── */}
      {showWidget('cuentas') && topDeuda.length > 0 && (
        <div className="bg-surface rounded-xl border border-border mb-6">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={14} className="text-primary" />
              <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Proveedores por pagar</h2>
            </div>
            <button onClick={() => navigate('/cuentas-por-pagar')} className="text-[10px] text-primary font-bold uppercase tracking-wider hover:text-primary/80">
              Ver todos
            </button>
          </div>
          <div className="divide-y divide-border">
            {topDeuda.map((p: any) => (
              <button
                key={p.proveedorId || p.id}
                onClick={() => navigate('/cuentas-por-pagar')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-high/50 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{p.nombre}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {p.facturasPendientes || 0} factura{(p.facturasPendientes || 0) !== 1 ? 's' : ''} pendiente{(p.facturasPendientes || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <p className="text-sm font-extrabold text-foreground shrink-0 ml-3">
                  {fmt$(p.saldoPendiente || 0)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Equipo hoy ──────────────────────────────────────────────────── */}
      {showWidget('equipo-hoy') && (
        <div className="bg-surface rounded-xl border border-border mb-6">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-primary" />
              <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Equipo hoy</h2>
            </div>
            <button onClick={() => navigate('/movimientos')} className="text-[10px] text-primary font-bold uppercase tracking-wider hover:text-primary/80">
              Ver movimientos
            </button>
          </div>
          {(!stats.actividadEquipo || stats.actividadEquipo.length === 0) ? (
            <div className="p-6 text-center">
              <p className="text-sm text-on-surface-variant font-medium">Nadie registró movimientos hoy todavía</p>
            </div>
          ) : (
            <EquipoHoyList equipo={stats.actividadEquipo} movimientos={stats.ultimosMovimientos || []} />
          )}
        </div>
      )}

      {/* ── Accesos rápidos a reportes ─────────────────────────────────── */}
      {showWidget('shortcuts') && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => navigate('/reportes')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-primary/20"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <LineChart size={20} className="text-primary" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Reportes del mes</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Movimientos, mermas, tendencias</p>
          </button>

          <button
            onClick={() => navigate('/reportes-costos')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-success/20"
          >
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mb-3">
              <DollarSign size={20} className="text-success" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Costos y márgenes</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Qué te está costando</p>
          </button>

          <button
            onClick={() => navigate('/comparador')}
            className="glass rounded-2xl p-5 text-left hover:scale-[1.02] active:scale-[0.98] transition-all border border-blue-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
              <Eye size={20} className="text-blue-400" />
            </div>
            <p className="text-sm font-extrabold text-foreground">Comparar precios</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Proveedor más barato por ítem</p>
          </button>
        </div>
      )}

      {/* ── Últimos movimientos — opcional, al final ───────────────────── */}
      {showWidget('ultimos-movimientos') && stats.ultimosMovimientos && stats.ultimosMovimientos.length > 0 && (
        <div className="bg-surface rounded-xl border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Últimos movimientos</h2>
          </div>
          <div className="divide-y divide-border">
            {stats.ultimosMovimientos.slice(0, 8).map((mov: any) => (
              <div key={mov.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={tipoBadge[mov.tipo]}>{tipoLabels[mov.tipo] || mov.tipo}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{mov.producto?.nombre}</p>
                    <p className="text-xs text-on-surface-variant">{mov.cantidad} {mov.unidad} · {mov.hora || mov.fecha}</p>
                  </div>
                </div>
                <p className="text-[10px] text-on-surface-variant shrink-0 ml-3">{mov.usuario?.nombre}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [discrepancias, setDiscrepancias] = useState<any[]>([]);
  const [ocPendientes, setOcPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.rol === 'admin' || user.rol === 'compras') {
      api.getDiscrepancias().then(setDiscrepancias).catch(() => {});
      api.getOrdenesCompra({ activas: 'true' }).then(setOcPendientes).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    api.getDashboardStats()
      .then(setStats)
      .catch(() => {
        Promise.all([
          api.getProductos({ activo: 'true' }),
          api.getDepositos({ activo: 'true' }),
          api.getMovimientos({ limit: '10' }),
          api.getStock({ bajosDeMinimo: 'true' }),
        ]).then(([productos, depositos, movimientos, stockBajo]) => {
          setStats({
            productosActivos: productos.length,
            depositos: depositos.length,
            movimientosHoy: 0, movimientosAyer: 0,
            movimientosSemana: movimientos.length, movimientosSemanaAnt: 0,
            bajosDeMinimo: stockBajo.length,
            mermasDelMes: 0, mermasMesAnt: 0,
            ingresosDelMes: 0, ingresosMesAnt: 0,
            inventariosAbiertos: 0,
            ultimosMovimientos: movimientos,
            actividadEquipo: [],
          });
        }).catch(() => {
          setStats({
            productosActivos: 0, depositos: 0,
            movimientosHoy: 0, movimientosAyer: 0,
            movimientosSemana: 0, movimientosSemanaAnt: 0,
            bajosDeMinimo: 0,
            mermasDelMes: 0, mermasMesAnt: 0,
            ingresosDelMes: 0, ingresosMesAnt: 0,
            inventariosAbiertos: 0,
            ultimosMovimientos: [],
            actividadEquipo: [],
          });
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-on-surface-variant font-semibold">Cargando dashboard...</p>
      </div>
    );
  }

  const discGraves = discrepancias.filter(d => d.color === 'rojo').length;
  const widgets = user?.configuracion?.widgets;
  const showWidget = (key: string) => !widgets || widgets.includes(key);

  const kpis: {
    label: string; value: number; prev: number; icon: typeof Package;
    accent: string; bg: string; to?: string; invertTrend?: boolean;
  }[] = [
    { label: 'Mov. hoy', value: stats.movimientosHoy, prev: stats.movimientosAyer, icon: Activity, accent: 'text-purple-400', bg: 'bg-purple-500/10', to: '/movimientos' },
    { label: 'Mov. semana', value: stats.movimientosSemana, prev: stats.movimientosSemanaAnt, icon: ArrowRightLeft, accent: 'text-primary', bg: 'bg-primary/10', to: '/movimientos' },
    { label: 'Bajo mínimo', value: stats.bajosDeMinimo, prev: 0, icon: AlertTriangle, accent: stats.bajosDeMinimo > 0 ? 'text-destructive' : 'text-on-surface-variant', bg: stats.bajosDeMinimo > 0 ? 'bg-destructive/10' : 'bg-surface-high', to: '/stock' },
    { label: 'Inventarios abiertos', value: stats.inventariosAbiertos, prev: 0, icon: ClipboardCheck, accent: stats.inventariosAbiertos > 0 ? 'text-warning' : 'text-on-surface-variant', bg: stats.inventariosAbiertos > 0 ? 'bg-warning/10' : 'bg-surface-high', to: '/inventarios' },
    { label: 'Mermas del mes', value: stats.mermasDelMes, prev: stats.mermasMesAnt, icon: TrendingDown, accent: 'text-destructive', bg: 'bg-destructive/10', to: '/reportes', invertTrend: true },
    { label: 'Ingresos del mes', value: stats.ingresosDelMes, prev: stats.ingresosMesAnt, icon: TrendingUp, accent: 'text-success', bg: 'bg-success/10', to: '/reportes' },
    { label: 'Productos activos', value: stats.productosActivos, prev: 0, icon: Package, accent: 'text-blue-400', bg: 'bg-blue-500/10', to: '/productos' },
    { label: 'Depósitos', value: stats.depositos, prev: 0, icon: Warehouse, accent: 'text-success', bg: 'bg-success/10', to: '/depositos' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Dashboard</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <VistaToggleDueno hacia="dueno" />
          <button
            onClick={() => setQuickOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/20 transition-colors"
          >
            <Plus size={16} /> Registrar
          </button>
        </div>
      </div>

      {/* ── Tareas + responsabilidades pendientes (unificado) ─────────── */}
      {showWidget('tareas') && <MisTareasPendientes />}

      {/* ── Alertas admin ─────────────────────────────────────────────── */}
      {showWidget('alertas') && ((user?.rol === 'admin' && ocPendientes.length > 0) || discGraves > 0) && (
        <div className="space-y-2 mb-6">
          {user?.rol === 'admin' && ocPendientes.length > 0 && (
            <button onClick={() => navigate('/ordenes-compra')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-high/50 transition-colors text-left">
              <ShoppingCart size={16} className="text-warning shrink-0" />
              <p className="text-sm font-semibold text-foreground flex-1">
                {ocPendientes.length} OC pendiente{ocPendientes.length > 1 ? 's' : ''} del equipo
              </p>
              <ChevronRight size={14} className="text-on-surface-variant" />
            </button>
          )}
          {user?.rol === 'admin' && discGraves > 0 && (
            <button onClick={() => navigate('/discrepancias')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left">
              <AlertTriangle size={16} className="text-destructive shrink-0" />
              <p className="text-sm font-semibold text-foreground flex-1">
                {discGraves} deposito{discGraves > 1 ? 's' : ''} con discrepancias graves
              </p>
              <ChevronRight size={14} className="text-destructive" />
            </button>
          )}
        </div>
      )}

      {/* ── KPIs clickables con tendencia ─────────────────────────────────── */}
      {showWidget('kpis') && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        {kpis.map(card => (
          <button
            key={card.label}
            onClick={() => card.to && navigate(card.to)}
            className="glass card-glow rounded-xl p-4 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-lg ${card.bg}`}><card.icon size={16} className={card.accent} /></div>
              {card.prev > 0 && (
                <div className={card.invertTrend ? '[&_.text-success]:text-destructive [&_.text-destructive]:text-success' : ''}>
                  <TrendBadge current={card.value} previous={card.prev} />
                </div>
              )}
            </div>
            <p className="text-2xl font-extrabold text-foreground">{typeof card.value === 'number' && card.value % 1 !== 0 ? card.value.toFixed(1) : card.value}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-0.5">{card.label}</p>
          </button>
        ))}
      </div>
      )}

      {/* ── Actividad del equipo hoy ──────────────────────────────────────── */}
      {showWidget('equipo-hoy') && (
      <div className="bg-surface rounded-xl border border-border mb-6">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary" />
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Equipo hoy</h2>
          </div>
          <button onClick={() => navigate('/movimientos')} className="text-[10px] text-primary font-bold uppercase tracking-wider hover:text-primary/80">
            Ver movimientos
          </button>
        </div>
        {(!stats.actividadEquipo || stats.actividadEquipo.length === 0) ? (
          <div className="p-6 text-center">
            <p className="text-sm text-on-surface-variant font-medium">Nadie registró movimientos hoy todavía</p>
          </div>
        ) : (
          <EquipoHoyList equipo={stats.actividadEquipo} movimientos={stats.ultimosMovimientos || []} />
        )}
      </div>
      )}

      {/* ── Últimos movimientos ─────────────────────────────────────────── */}
      {showWidget('ultimos-movimientos') && <div className="bg-surface rounded-xl border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Últimos movimientos</h2>
        </div>
        {(!stats.ultimosMovimientos || stats.ultimosMovimientos.length === 0) ? (
          <p className="p-4 text-sm text-on-surface-variant font-medium">Sin movimientos registrados</p>
        ) : (
          <div className="divide-y divide-border">
            {stats.ultimosMovimientos.map((mov: any) => (
              <div key={mov.id} className="px-4 py-3 flex items-center justify-between hover:bg-surface-high/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={tipoBadge[mov.tipo]}>{tipoLabels[mov.tipo] || mov.tipo}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{mov.producto?.nombre}</p>
                    <p className="text-xs text-on-surface-variant">{mov.cantidad} {mov.unidad} &middot; {mov.hora || mov.fecha}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs font-semibold text-foreground">{mov.usuario?.nombre}</p>
                  {mov.responsable?.nombre && mov.responsable.nombre !== mov.usuario?.nombre && (
                    <p className="text-[10px] text-warning font-semibold">→ {mov.responsable.nombre}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>}

      <QuickMovimiento open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  // Si el admin configuró un tipo de vista específico, usarlo
  const tipoOverride = user.configuracion?.tipo;
  if (tipoOverride && tipoOverride !== 'auto') {
    if (tipoOverride === 'simple') return <DashboardSimple rol={user.rol} />;
    if (tipoOverride === 'deposito') return <DashboardDeposito />;
    if (tipoOverride === 'dueno') return <DashboardDueno />;
    return <DashboardAdmin />;
  }

  // Comportamiento por defecto según rol
  if (user.rol === 'cocina' || user.rol === 'barra') return <DashboardSimple rol={user.rol} />;
  if (user.rol === 'deposito') return <DashboardDeposito />;
  return <DashboardAdmin />;
}
