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
  Wifi, Copy, Check, Smartphone
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

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">
          {esBar ? 'Barra' : 'Cocina'}
        </p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
      </div>

      {/* Acciones principales — botones grandes */}
      <div className="grid grid-cols-2 gap-3 mb-6">
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
      </div>

      {/* Mis últimos movimientos */}
      {misMov.length > 0 && (
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
  const [misPendientes, setMisPendientes] = useState<any[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.getOrdenesCompra({ responsableId: String(user.id), activas: 'true' }).then(setMisPendientes).catch(() => {});
  }, [user?.id]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Depósito</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
      </div>

      {/* Mis tareas pendientes */}
      {misPendientes.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-warning/20 flex items-center gap-2">
            <Bell size={16} className="text-warning animate-pulse" />
            <p className="text-sm font-extrabold text-warning flex-1">
              {misPendientes.length} {misPendientes.length === 1 ? 'entrega pendiente' : 'entregas pendientes'}
            </p>
            <button onClick={() => navigate('/ordenes-compra')} className="text-xs font-bold text-warning">
              Ver <ChevronRight size={12} className="inline" />
            </button>
          </div>
          {misPendientes.slice(0, 3).map(oc => (
            <button
              key={oc.id}
              onClick={() => navigate('/ordenes-compra')}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-warning/5 text-left border-b border-warning/10 last:border-0"
            >
              <ShoppingCart size={14} className="text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{oc.codigo} — {oc.proveedor?.nombre}</p>
                <p className="text-xs text-on-surface-variant">{oc.fecha}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${oc.estado === 'parcial' ? 'bg-blue-500/10 text-blue-400' : 'bg-warning/10 text-warning'}`}>
                {oc.estado}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Acciones principales */}
      <div className="grid grid-cols-2 gap-3 mb-6">
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
      </div>

      <QuickMovimiento open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

// ─── Trend helper ─────────────────────────────────────────────────────────────
function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-success"><ArrowUpRight size={10} /> nuevo</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
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
function DashboardAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [discrepancias, setDiscrepancias] = useState<any[]>([]);
  const [ocPendientes, setOcPendientes] = useState<any[]>([]);
  const [misPendientes, setMisPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [networkUrl, setNetworkUrl] = useState<string | null>(null);
  const [networkAllUrls, setNetworkAllUrls] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.getOrdenesCompra({ responsableId: String(user.id), activas: 'true' }).then(setMisPendientes).catch(() => {});
    if (user.rol === 'admin' || user.rol === 'compras') {
      api.getDiscrepancias().then(setDiscrepancias).catch(() => {});
      api.getOrdenesCompra({ activas: 'true' }).then(setOcPendientes).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    fetch('/api/network-url')
      .then(r => r.json())
      .then(d => {
        setNetworkUrl(d.url);
        setNetworkAllUrls(d.allUrls ?? []);
      })
      .catch(() => {});
  }, []);

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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Dashboard</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Hola, {user?.nombre}</h1>
        </div>
        <button
          onClick={() => setQuickOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/20 transition-colors"
        >
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* ── Link WiFi para el equipo ──────────────────────────────────────── */}
      {networkUrl && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={16} className="text-primary" />
            <p className="text-xs font-bold text-primary uppercase tracking-widest">Acceso desde celular / tablet</p>
          </div>
          <p className="text-[11px] text-on-surface-variant mb-3">
            Conectados a la misma WiFi, el equipo puede abrir la app en el navegador con este link:
          </p>

          {/* URL principal grande y copiable */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 bg-surface rounded-xl px-3 py-2 border border-border font-mono text-sm text-foreground truncate">
              {networkUrl}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(networkUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="shrink-0 p-2 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
          </div>

          {/* QR code */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 bg-white rounded-xl p-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(networkUrl)}`}
                alt="QR de acceso"
                width={100}
                height={100}
                className="rounded-lg"
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <Smartphone size={12} />
                <span>Escaneá el QR o copiá el link</span>
              </div>
              {networkAllUrls.length > 1 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">Otras IPs disponibles:</p>
                  {networkAllUrls.slice(1).map(u => (
                    <p key={u} className="font-mono text-xs text-on-surface-variant">{u}</p>
                  ))}
                </div>
              )}
              {copied && (
                <p className="text-xs text-success font-semibold">✓ Link copiado al portapapeles</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Alertas: solo si hay algo que atender ─────────────────────────── */}
      {(misPendientes.length > 0 || ocPendientes.length > 0 || discGraves > 0) && (
        <div className="space-y-2 mb-6">
          {misPendientes.length > 0 && (
            <button onClick={() => navigate('/ordenes-compra')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/40 bg-warning/5 hover:bg-warning/10 transition-colors text-left">
              <Bell size={16} className="text-warning animate-pulse shrink-0" />
              <p className="text-sm font-bold text-warning flex-1">
                {misPendientes.length} entrega{misPendientes.length > 1 ? 's' : ''} pendiente{misPendientes.length > 1 ? 's' : ''} asignada{misPendientes.length > 1 ? 's' : ''} a vos
              </p>
              <ChevronRight size={14} className="text-warning" />
            </button>
          )}
          {user?.rol === 'admin' && ocPendientes.length > 0 && (
            <button onClick={() => navigate('/ordenes-compra')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-high/50 transition-colors text-left">
              <ShoppingCart size={16} className="text-warning shrink-0" />
              <p className="text-sm font-semibold text-foreground flex-1">
                {ocPendientes.length} OC pendiente{ocPendientes.length > 1 ? 's' : ''}
              </p>
              <ChevronRight size={14} className="text-on-surface-variant" />
            </button>
          )}
          {user?.rol === 'admin' && discGraves > 0 && (
            <button onClick={() => navigate('/discrepancias')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left">
              <AlertTriangle size={16} className="text-destructive shrink-0" />
              <p className="text-sm font-semibold text-foreground flex-1">
                {discGraves} depósito{discGraves > 1 ? 's' : ''} con discrepancias graves
              </p>
              <ChevronRight size={14} className="text-destructive" />
            </button>
          )}
        </div>
      )}

      {/* ── KPIs clickables con tendencia ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(card => (
          <button
            key={card.label}
            onClick={() => card.to && navigate(card.to)}
            className="glass rounded-xl p-4 text-left hover:bg-surface-high/50 active:scale-[0.98] transition-all"
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

      {/* ── Actividad del equipo hoy ──────────────────────────────────────── */}
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
          <div className="divide-y divide-border">
            {stats.actividadEquipo.map((u: any) => (
              <div key={u.id} className="p-4 flex items-center gap-3">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Últimos movimientos ─────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-border">
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
      </div>

      <QuickMovimiento open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.rol === 'cocina' || user.rol === 'barra') return <DashboardSimple rol={user.rol} />;
  if (user.rol === 'deposito') return <DashboardDeposito />;
  return <DashboardAdmin />;
}
