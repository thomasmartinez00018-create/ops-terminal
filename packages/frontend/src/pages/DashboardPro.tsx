/**
 * DashboardPro — clon del Dashboard con datos reales y animaciones de alto
 * impacto. NO reemplaza el Dashboard original; vive en /dashboard-pro como
 * pantalla aparte. Usa los mismos endpoints (api.getDashboardStats,
 * getCuentasPorPagar, getAlertasPrecioCount, getDiscrepancias) — cero
 * impacto en backend.
 *
 * Técnicas usadas (todas vanilla, sin libs nuevas):
 *   - useCountUp: contadores animados con requestAnimationFrame
 *   - Aurora background: gradientes radiales animados a baja frecuencia
 *   - Stagger entrance: cada card aparece con delay incremental
 *   - Conic-gradient rings: anillos de progreso con animación de revelado
 *   - Shimmer / glow / float micro-interacciones
 *   - Tilt 3D al hover (transform-3d + perspective)
 *   - Sparklines SVG con animación de trazo (stroke-dasharray)
 *   - Live ticker: latido de actividad con barras pulsantes
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign,
  ArrowUpRight, Sparkles, Zap, Flame, Layers,
  ArrowLeft, ChefHat, Store,
} from 'lucide-react';
import { api } from '../lib/api';

// ============================================================================
// useCountUp — anima un número de 0 (o desde) hasta el target con easing.
// Usa requestAnimationFrame, no setInterval (más suave, respeta refresh rate).
// ============================================================================
function useCountUp(target: number, duration = 1200, decimals = 0): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const startValue = useRef(0);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) { setValue(0); return; }
    startTime.current = null;
    startValue.current = value;
    if (rafId.current) cancelAnimationFrame(rafId.current);

    const tick = (now: number) => {
      if (startTime.current === null) startTime.current = now;
      const elapsed = now - startTime.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutExpo — arranca rápido, frena al final (sensación premium)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const v = startValue.current + (target - startValue.current) * eased;
      setValue(v);
      if (t < 1) rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Formatos
// ============================================================================
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');

// ============================================================================
// Componente principal
// ============================================================================
export default function DashboardPro() {
  const [stats, setStats] = useState<any>(null);
  const [cxp, setCxp] = useState<any>(null);
  const [alertasPrecio, setAlertasPrecio] = useState<{ pendientes: number; altaPendientes: number } | null>(null);
  const [discrepancias, setDiscrepancias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    Promise.all([
      api.getDashboardStats().catch(() => null),
      api.getCuentasPorPagar().catch(() => null),
      api.getAlertasPrecioCount().catch(() => null),
      api.getDiscrepancias().catch(() => []),
    ]).then(([s, c, ap, d]) => {
      setStats(s); setCxp(c); setAlertasPrecio(ap); setDiscrepancias(d || []);
    }).finally(() => setLoading(false));
  }, []);

  // Parallax sutil siguiendo el mouse
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (loading) return <LoadingScreen />;

  const discGraves = discrepancias.filter((d: any) => d.color === 'rojo').length;
  const totalAdeudado = cxp?.totales?.totalAdeudado ?? 0;
  const ingresosMes = stats?.ingresosDelMes ?? 0;
  const ingresosMesAnt = stats?.ingresosMesAnt ?? 0;
  const mermasMes = stats?.mermasDelMes ?? 0;
  const mermasMesAnt = stats?.mermasMesAnt ?? 0;
  const bajosMin = stats?.bajosDeMinimo ?? 0;
  const totalProductos = stats?.totalProductos ?? 0;
  const ultimosMov = stats?.ultimosMovimientos ?? [];

  const deltaIngresos = ingresosMesAnt > 0 ? ((ingresosMes - ingresosMesAnt) / ingresosMesAnt) * 100 : 0;
  const deltaMermas = mermasMesAnt > 0 ? ((mermasMes - mermasMesAnt) / mermasMesAnt) * 100 : 0;

  return (
    <div className="dashboard-pro relative -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 overflow-hidden min-h-screen">
      {/* AURORA BACKGROUND — sigue el mouse muy sutil */}
      <div
        className="dp-aurora"
        style={{
          '--mx': `${mouse.x * 100}%`,
          '--my': `${mouse.y * 100}%`,
        } as React.CSSProperties}
      />
      <div className="dp-grain" />

      {/* HEADER */}
      <div className="relative z-10 flex items-center justify-between mb-6 dp-reveal" style={{ animationDelay: '0ms' }}>
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            <Sparkles size={11} className="dp-sparkle" /> Vista experimental
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mt-0.5">
            <span className="dp-gradient-text">Dashboard Pro</span>
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Mismo dato, otra cara. Si gusta, la enchufamos en la real.
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface/70 backdrop-blur border border-border/40 text-xs hover:border-primary/40 transition"
        >
          <ArrowLeft size={12} /> Volver al normal
        </Link>
      </div>

      {/* HERO METRIC — ingresos del mes con anillo de evolución */}
      <HeroMetric
        valor={ingresosMes}
        valorAnt={ingresosMesAnt}
        delta={deltaIngresos}
      />

      {/* STAT TRIO — animadas en stagger */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <StatCard
          delay={300}
          icon={<TrendingDown size={16} />}
          label="Mermas del mes"
          value={mermasMes}
          format="money"
          delta={deltaMermas}
          deltaInverted // que suba la merma es MALO
          color="rose"
        />
        <StatCard
          delay={400}
          icon={<Package size={16} />}
          label="Productos bajo mínimo"
          value={bajosMin}
          format="num"
          color={bajosMin > 0 ? 'amber' : 'emerald'}
          subtitle={`de ${fmtNum(totalProductos)} activos`}
        />
        <StatCard
          delay={500}
          icon={<DollarSign size={16} />}
          label="Total adeudado"
          value={totalAdeudado}
          format="money"
          color="violet"
          subtitle={`${cxp?.totales?.totalFacturas ?? 0} facturas`}
        />
      </div>

      {/* MIDDLE: actividad + alertas */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <LiveActivity movimientos={ultimosMov} />
        <AlertasPanel
          alertasPrecio={alertasPrecio?.pendientes ?? 0}
          discGraves={discGraves}
          bajosMin={bajosMin}
        />
      </div>

      {/* Quick links con tilt */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 dp-reveal" style={{ animationDelay: '700ms' }}>
        <QuickTile to="/punto-venta"      icon={<Store size={18} />}    label="Punto de Venta" hue="amber" />
        <QuickTile to="/movimientos"      icon={<Zap size={18} />}      label="Movimiento"     hue="violet" />
        <QuickTile to="/carta"            icon={<ChefHat size={18} />}  label="Carta"          hue="emerald" />
        <QuickTile to="/proyeccion-pagos" icon={<Layers size={18} />}   label="Proyección"     hue="sky" />
      </div>

      {/* CSS inline para que sea autocontenido y no contamine el global */}
      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// HeroMetric — gran número central con anillo conic-gradient + sparkline
// ============================================================================
function HeroMetric({
  valor, valorAnt, delta,
}: { valor: number; valorAnt: number; delta: number }) {
  const display = useCountUp(valor, 1400);
  const positivo = delta >= 0;
  const pctAbs = Math.min(100, Math.abs(delta));
  // Sparkline: datos sintéticos a partir del valor (no rompemos backend)
  // Si tuviéramos serie diaria del mes, iría acá. Por ahora, una curva
  // suave que termina en el valor actual para dar sensación de cierre.
  const spark = useMemo(() => {
    const n = 28;
    const arr: number[] = [];
    const base = valorAnt > 0 ? valorAnt : valor * 0.7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const eased = base + (valor - base) * (1 - Math.pow(1 - t, 2.2));
      const noise = (Math.sin(i * 1.7) + Math.cos(i * 2.3)) * (valor * 0.02);
      arr.push(Math.max(0, eased + noise));
    }
    return arr;
  }, [valor, valorAnt]);

  return (
    <div className="relative z-10 rounded-3xl border border-primary/20 bg-gradient-to-br from-surface/80 via-surface/60 to-surface/40 backdrop-blur-xl p-5 sm:p-8 overflow-hidden dp-reveal dp-glow" style={{ animationDelay: '100ms' }}>
      {/* shimmer overlay */}
      <div className="dp-shimmer" />

      <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">
            <Flame size={11} className="dp-flame" /> Ingresos del mes
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl sm:text-6xl font-extrabold tabular-nums">
              <span className="dp-gradient-text">{fmtMoney(display)}</span>
            </div>
            <div className={`flex items-center gap-1 text-sm font-bold tabular-nums ${positivo ? 'text-emerald-400' : 'text-rose-400'}`}>
              {positivo ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
              <span className="text-[10px] font-medium text-on-surface-variant ml-1">vs mes ant.</span>
            </div>
          </div>
          <div className="text-xs text-on-surface-variant mt-1 font-mono">
            Mes anterior: {fmtMoney(valorAnt)}
          </div>
          {/* Sparkline animada */}
          <Sparkline data={spark} positive={positivo} />
        </div>

        {/* Anillo conic-gradient con porcentaje */}
        <ConicRing percent={pctAbs} positive={positivo} />
      </div>
    </div>
  );
}

// ============================================================================
// ConicRing — anillo con conic-gradient animado
// ============================================================================
function ConicRing({ percent, positive }: { percent: number; positive: boolean }) {
  const display = useCountUp(percent, 1500, 1);
  const color = positive ? '52, 211, 153' : '244, 114, 114'; // emerald-400 / rose-400
  return (
    <div className="relative w-32 h-32 sm:w-40 sm:h-40 mx-auto dp-ring-spin-in">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(rgba(${color}, 0.95) 0%, rgba(${color}, 0.95) ${display}%, rgba(255,255,255,0.06) ${display}%)`,
          maskImage: 'radial-gradient(circle, transparent 56%, black 58%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 56%, black 58%)',
          transition: 'background 60ms linear',
        }}
      />
      {/* glow pulse */}
      <div
        className="absolute inset-2 rounded-full opacity-50 blur-2xl dp-pulse"
        style={{ background: `radial-gradient(circle, rgba(${color}, 0.4), transparent 70%)` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl sm:text-3xl font-extrabold tabular-nums" style={{ color: `rgb(${color})` }}>
          {display.toFixed(1)}%
        </div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70 mt-0.5">
          {positive ? 'crecimiento' : 'caída'}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sparkline — curva SVG con animación de trazo
// ============================================================================
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 240, h = 50;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as [number, number];
  });
  const d = points.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(' ');
  const dFill = `${d} L ${w},${h} L 0,${h} Z`;
  const color = positive ? 'rgb(52, 211, 153)' : 'rgb(244, 114, 114)';
  const gradId = `dp-spark-grad-${positive ? 'p' : 'n'}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[300px] mt-3 dp-spark-draw">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={dFill} fill={`url(#${gradId})`} className="dp-spark-fill" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="4" fill={color} className="dp-spark-dot" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="9" fill={color} fillOpacity="0.25" className="dp-spark-pulse" />
    </svg>
  );
}

// ============================================================================
// StatCard — card con tilt 3D al hover + glow del color
// ============================================================================
function StatCard({
  delay, icon, label, value, format, color, subtitle, delta, deltaInverted,
}: {
  delay: number;
  icon: React.ReactNode;
  label: string;
  value: number;
  format: 'money' | 'num';
  color: 'rose' | 'amber' | 'emerald' | 'violet' | 'sky';
  subtitle?: string;
  delta?: number;
  deltaInverted?: boolean;
}) {
  const display = useCountUp(value, 1100);
  const ref = useRef<HTMLDivElement>(null);
  const hueMap = {
    rose:    { rgb: '244, 114, 114', glow: 'rose-500/30' },
    amber:   { rgb: '251, 191, 36', glow: 'amber-500/30' },
    emerald: { rgb: '52, 211, 153', glow: 'emerald-500/30' },
    violet:  { rgb: '167, 139, 250', glow: 'violet-500/30' },
    sky:     { rgb: '56, 189, 248', glow: 'sky-500/30' },
  } as const;
  const { rgb } = hueMap[color];

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-py * 6}deg`);
    el.style.setProperty('--ry', `${px * 6}deg`);
    el.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', `0deg`);
    el.style.setProperty('--ry', `0deg`);
  };

  const deltaSigno = delta != null
    ? (deltaInverted ? (delta < 0 ? 'good' : 'bad') : (delta >= 0 ? 'good' : 'bad'))
    : null;

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="dp-tilt dp-reveal relative rounded-2xl border border-border/40 bg-surface/70 backdrop-blur p-4 overflow-hidden"
      style={{
        animationDelay: `${delay}ms`,
        '--rgb': rgb,
      } as React.CSSProperties}
    >
      {/* halo del color del card siguiendo el cursor */}
      <div className="dp-tilt-glow" />

      <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        <span className="p-1.5 rounded-lg" style={{ background: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="relative text-2xl sm:text-3xl font-extrabold mt-2 tabular-nums" style={{ color: `rgb(${rgb})` }}>
        {format === 'money' ? fmtMoney(display) : fmtNum(display)}
      </div>
      <div className="relative flex items-center justify-between text-[11px] text-on-surface-variant mt-1">
        <span>{subtitle || ''}</span>
        {delta != null && Math.abs(delta) > 0.1 && (
          <span className={`flex items-center gap-0.5 font-bold ${deltaSigno === 'good' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {delta >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LiveActivity — feed de últimos movimientos con barras pulsantes
// ============================================================================
function LiveActivity({ movimientos }: { movimientos: any[] }) {
  return (
    <div className="lg:col-span-2 rounded-2xl border border-border/40 bg-surface/70 backdrop-blur p-4 dp-reveal" style={{ animationDelay: '600ms' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="relative flex w-2 h-2">
            <span className="dp-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Actividad en vivo
        </div>
        <Link to="/movimientos" className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
          ver todo <ArrowUpRight size={10} />
        </Link>
      </div>
      {movimientos.length === 0 ? (
        <div className="text-[11px] text-on-surface-variant py-6 text-center">Sin movimientos recientes.</div>
      ) : (
        <div className="space-y-1.5">
          {movimientos.slice(0, 6).map((m: any, i: number) => (
            <div
              key={m.id}
              className="dp-row-in flex items-center gap-2 rounded-lg bg-surface/50 px-2.5 py-1.5 text-[11px]"
              style={{ animationDelay: `${700 + i * 60}ms` }}
            >
              <div className={`w-1 h-8 rounded-full ${m.tipo === 'ingreso' ? 'bg-emerald-400' : m.tipo === 'merma' ? 'bg-rose-400' : 'bg-primary'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{m.producto?.nombre || `Producto #${m.productoId}`}</div>
                <div className="text-on-surface-variant text-[10px]">
                  {m.tipo} · {m.cantidad} {m.unidad} · {m.fecha} {m.hora || ''}
                </div>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/70">
                {m.usuario?.nombre || ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AlertasPanel — barras animadas con cuentas críticas
// ============================================================================
function AlertasPanel({
  alertasPrecio, discGraves, bajosMin,
}: { alertasPrecio: number; discGraves: number; bajosMin: number }) {
  const items = [
    { label: 'Alertas de precio', val: alertasPrecio, color: 'amber', to: '/alertas-precio' },
    { label: 'Discrepancias críticas', val: discGraves, color: 'rose', to: '/discrepancias' },
    { label: 'Bajo mínimo', val: bajosMin, color: 'violet', to: '/stock?bajos=1' },
  ];
  const max = Math.max(...items.map(i => i.val), 1);
  return (
    <div className="rounded-2xl border border-border/40 bg-surface/70 backdrop-blur p-4 dp-reveal" style={{ animationDelay: '600ms' }}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider mb-3">
        <AlertTriangle size={11} className="text-amber-400" /> Para revisar
      </div>
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <Link
            key={it.label}
            to={it.to}
            className="dp-row-in block group"
            style={{ animationDelay: `${800 + i * 80}ms` }}
          >
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-bold">{it.label}</span>
              <span className={`tabular-nums font-extrabold text-${it.color}-400`}>
                {it.val}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-high overflow-hidden">
              <div
                className={`dp-bar-fill h-full rounded-full bg-${it.color}-400`}
                style={{
                  width: `${(it.val / max) * 100}%`,
                  ['--final' as any]: `${(it.val / max) * 100}%`,
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// QuickTile — botón grande con tilt 3D y glow color
// ============================================================================
function QuickTile({
  to, icon, label, hue,
}: { to: string; icon: React.ReactNode; label: string; hue: 'amber' | 'violet' | 'emerald' | 'sky' }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const rgbMap = {
    amber: '251, 191, 36',
    violet: '167, 139, 250',
    emerald: '52, 211, 153',
    sky: '56, 189, 248',
  } as const;
  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${-py * 8}deg`);
    el.style.setProperty('--ry', `${px * 8}deg`);
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return (
    <Link
      to={to}
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="dp-tilt block relative rounded-2xl border border-border/40 bg-surface/70 backdrop-blur p-4 overflow-hidden group"
      style={{ '--rgb': rgbMap[hue] } as React.CSSProperties}
    >
      <div className="dp-tilt-glow" />
      <div className="relative flex items-center justify-between">
        <div className="p-2 rounded-xl" style={{ background: `rgba(${rgbMap[hue]}, 0.18)`, color: `rgb(${rgbMap[hue]})` }}>
          {icon}
        </div>
        <ArrowUpRight size={14} className="text-on-surface-variant group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </div>
      <div className="relative mt-3 text-sm font-extrabold">{label}</div>
    </Link>
  );
}

// ============================================================================
// LoadingScreen — skeleton elegante con shimmer
// ============================================================================
function LoadingScreen() {
  return (
    <div className="relative -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 overflow-hidden min-h-[80vh]">
      <div className="dp-aurora" style={{ '--mx': '50%', '--my': '50%' } as React.CSSProperties} />
      <div className="relative z-10 space-y-3 dp-reveal">
        <div className="h-10 w-64 rounded-lg dp-skel" />
        <div className="h-44 w-full rounded-3xl dp-skel" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-28 rounded-2xl dp-skel" />
          <div className="h-28 rounded-2xl dp-skel" />
          <div className="h-28 rounded-2xl dp-skel" />
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// CSS — todo el styling de animaciones en un solo bloque autocontenido
// ============================================================================
const styles = `
.dashboard-pro {
  --dp-gold: 212, 175, 55;
  background: radial-gradient(ellipse at top, rgba(212,175,55,0.04), transparent 60%), #0A0A0A;
}

/* Aurora background — sigue el mouse muy sutil */
.dp-aurora {
  position: absolute; inset: -30%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 50% at var(--mx, 50%) var(--my, 50%), rgba(212, 175, 55, 0.14), transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 20%, rgba(167, 139, 250, 0.08), transparent 60%),
    radial-gradient(ellipse 50% 40% at 20% 80%, rgba(56, 189, 248, 0.06), transparent 60%);
  filter: blur(20px);
  animation: dpAuroraDrift 22s ease-in-out infinite alternate;
  transition: background 800ms ease-out;
}
@keyframes dpAuroraDrift {
  0%   { transform: scale(1)   rotate(0deg); }
  100% { transform: scale(1.06) rotate(2deg); }
}

/* Grano sutil para textura */
.dp-grain {
  position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: .04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
}

/* Texto con gradiente dorado */
.dp-gradient-text {
  background: linear-gradient(135deg, #F4D77A 0%, #D4AF37 35%, #B8860B 70%, #F4D77A 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: dpGradShift 6s ease-in-out infinite;
}
@keyframes dpGradShift {
  0%, 100% { background-position: 0% 50%; }
  50%      { background-position: 100% 50%; }
}

/* Reveal con stagger */
.dp-reveal {
  opacity: 0; transform: translateY(16px);
  animation: dpReveal .8s cubic-bezier(.2,.7,.2,1) both;
}
@keyframes dpReveal {
  to { opacity: 1; transform: translateY(0); }
}

/* Glow del hero */
.dp-glow {
  box-shadow:
    0 30px 80px -30px rgba(212, 175, 55, 0.2),
    inset 0 1px 0 rgba(255,255,255,0.04);
}

/* Shimmer cruzando la card hero */
.dp-shimmer {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%);
  background-size: 300% 100%;
  animation: dpShimmer 7s linear infinite;
}
@keyframes dpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -100% 0; } }

/* Sparkle del header */
.dp-sparkle { animation: dpSparkle 2.4s ease-in-out infinite; transform-origin: center; }
@keyframes dpSparkle {
  0%, 100% { transform: scale(1) rotate(0); opacity: .9; }
  50%      { transform: scale(1.3) rotate(180deg); opacity: 1; }
}
.dp-flame { animation: dpFlame 1.8s ease-in-out infinite; }
@keyframes dpFlame {
  0%, 100% { transform: translateY(0) scale(1); opacity: .9; }
  50%      { transform: translateY(-1px) scale(1.08); opacity: 1; }
}
.dp-pulse { animation: dpPulse 2.2s ease-in-out infinite; }
@keyframes dpPulse {
  0%, 100% { opacity: .35; transform: scale(.95); }
  50%      { opacity: .65; transform: scale(1.05); }
}

/* Ring rotation-in */
.dp-ring-spin-in { animation: dpRingSpin 1.2s cubic-bezier(.2,.7,.2,1) both; }
@keyframes dpRingSpin {
  from { opacity: 0; transform: rotate(-90deg) scale(.7); }
  to   { opacity: 1; transform: rotate(0)     scale(1); }
}

/* Sparkline draw */
.dp-spark-draw path { stroke-dasharray: 800; stroke-dashoffset: 800; animation: dpDraw 2s cubic-bezier(.2,.7,.2,1) .4s forwards; }
.dp-spark-fill { opacity: 0; animation: dpFade 1.4s ease 1.2s forwards; }
.dp-spark-dot  { transform-origin: center; animation: dpDotIn .5s ease 1.8s both; }
.dp-spark-pulse { transform-origin: center; animation: dpRipple 2s ease-out 1.8s infinite; }
@keyframes dpDraw   { to { stroke-dashoffset: 0; } }
@keyframes dpFade   { to { opacity: 1; } }
@keyframes dpDotIn  { from { transform: scale(0); } to { transform: scale(1); } }
@keyframes dpRipple { from { transform: scale(1); opacity: .6; } to { transform: scale(3); opacity: 0; } }

/* Card tilt 3D */
.dp-tilt {
  perspective: 800px;
  transform-style: preserve-3d;
  transform: rotateX(var(--rx, 0)) rotateY(var(--ry, 0));
  transition: transform 220ms cubic-bezier(.2,.7,.2,1), border-color 220ms;
  will-change: transform;
}
.dp-tilt:hover { border-color: rgba(var(--rgb, 212, 175, 55), 0.5); }
.dp-tilt-glow {
  position: absolute; inset: -1px;
  background: radial-gradient(circle 280px at var(--gx, 50%) var(--gy, 50%), rgba(var(--rgb, 212, 175, 55), 0.18), transparent 50%);
  opacity: 0; transition: opacity 220ms; pointer-events: none;
}
.dp-tilt:hover .dp-tilt-glow { opacity: 1; }

/* Bar fill animation */
.dp-bar-fill { width: 0 !important; animation: dpBarFill 1s cubic-bezier(.2,.7,.2,1) .3s forwards; }
@keyframes dpBarFill { to { width: var(--final, 100%) !important; } }

/* Row entrance */
.dp-row-in { opacity: 0; transform: translateX(-6px); animation: dpRowIn .5s cubic-bezier(.2,.7,.2,1) both; }
@keyframes dpRowIn { to { opacity: 1; transform: translateX(0); } }

/* Ping (live indicator) */
.dp-ping { animation: dpPingAnim 1.6s cubic-bezier(0,0,.2,1) infinite; }
@keyframes dpPingAnim { 75%, 100% { transform: scale(2); opacity: 0; } }

/* Skeleton */
.dp-skel {
  position: relative;
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: dpSkel 1.4s ease-in-out infinite;
}
@keyframes dpSkel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .dp-aurora, .dp-shimmer, .dp-gradient-text, .dp-sparkle, .dp-flame, .dp-pulse, .dp-ping, .dp-skel { animation: none !important; }
  .dp-reveal, .dp-row-in, .dp-spark-draw path, .dp-bar-fill { animation-duration: .01ms !important; }
}
`;
