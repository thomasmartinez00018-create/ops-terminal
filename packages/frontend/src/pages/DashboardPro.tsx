/**
 * DashboardPro v2 — rediseño aplicando las 20 correcciones identificadas:
 *
 *  1. Hero con auto-diagnóstico (detecta números absurdos)
 *  2. Delta contextual con voz semántica (cap. deltaContextual.ts)
 *  3. Sistema de coherencia: detecta y muestra inconsistencias
 *  4. Anomaly detection visible (endpoint /insights)
 *  5. Sparkline REAL del mes con tooltips por día
 *  6. Polling con feedback "actualizado hace Xs"
 *  7. Barras de progreso con stack semántico, no decorativas
 *  8. Time-ago + agrupación por día en el feed
 *  9. Frescura del dato visible
 * 10. Sin aurora: sobriedad ganadora
 * 11. Jerarquía corregida: número manda, delta acompaña, anillo desaparece
 * 12. Animaciones solo cuando comunican un evento
 * 13. useCountUpMemo: no se repite en cada render
 * 14. Modos según estado del negocio (normal/atención/crítico)
 * 15. Design tokens semánticos (good/warn/alert/neutral)
 * 16. Coherente con sidebar (sobrio, no glow)
 * 17. Etiqueta "Nueva" (no "experimental")
 * 18. Saludo dinámico + insight del día
 * 19. Cada métrica clickeable, NBA arriba
 * 20. Mobile-first
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign,
  ArrowUpRight, Sparkles, ArrowLeft, ChefHat, Store, RefreshCw,
  Calendar, ChevronRight, CheckCircle2, Info,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { calcularDelta, esAnomalia } from '../lib/deltaContextual';
import { tiempoRelativo, grupoFecha, saludo } from '../lib/tiempoRelativo';
import { useCountUpMemo } from '../hooks/useCountUpMemo';

// ============================================================================
// Formatos
// ============================================================================
const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');
/** Formato compacto $1.2M / $356k para hero number cuando es grande */
const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return fmt$(n);
};

// ============================================================================
// Tipos
// ============================================================================
type Insight = {
  severidad: 'info' | 'atencion' | 'critico';
  tipo: string;
  titulo: string;
  detalle: string;
  cta?: { label: string; to: string };
};

type DataState = {
  stats: any | null;
  cxp: any | null;
  alertasPrecio: { pendientes: number; altaPendientes: number } | null;
  discrepancias: any[];
  serieDiaria: Awaited<ReturnType<typeof api.getSerieDiariaIngresos>> | null;
  insights: Insight[];
  evaluadoAt: string | null;
  loaded: boolean;
};

// ============================================================================
// Componente principal
// ============================================================================
export default function DashboardPro() {
  const { user } = useAuth();
  const [data, setData] = useState<DataState>({
    stats: null, cxp: null, alertasPrecio: null, discrepancias: [],
    serieDiaria: null, insights: [], evaluadoAt: null, loaded: false,
  });
  const [ultimoFetch, setUltimoFetch] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tickHora, setTickHora] = useState(new Date());

  // Polling soft: cada 60s actualiza solo si la tab está visible
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefreshing(true);
    try {
      const [s, c, ap, d, sd, ins] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.getCuentasPorPagar().catch(() => null),
        api.getAlertasPrecioCount().catch(() => null),
        api.getDiscrepancias().catch(() => []),
        api.getSerieDiariaIngresos().catch(() => null),
        api.getInsights().catch(() => ({ insights: [], meta: { evaluadoAt: new Date().toISOString() } })),
      ]);
      setData({
        stats: s,
        cxp: c,
        alertasPrecio: ap,
        discrepancias: d || [],
        serieDiaria: sd,
        insights: ins.insights,
        evaluadoAt: ins.meta?.evaluadoAt ?? new Date().toISOString(),
        loaded: true,
      });
      setUltimoFetch(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') cargar(true);
    }, 60_000);
    return () => clearInterval(id);
  }, [cargar]);
  // Tick para "hace X seg" cada 5s
  useEffect(() => {
    const id = setInterval(() => setTickHora(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  if (!data.loaded) return <LoadingScreen />;

  // ── Extracciones ──────────────────────────────────────────────────────
  const ingresosMes = data.stats?.ingresosDelMes ?? 0;
  const ingresosMesAnt = data.stats?.ingresosMesAnt ?? 0;
  const mermasMes = data.stats?.mermasDelMes ?? 0;
  const mermasMesAnt = data.stats?.mermasMesAnt ?? 0;
  const bajosMin = data.stats?.bajosDeMinimo ?? 0;
  const totalProductos = data.stats?.totalProductos ?? 0;
  const totalAdeudado = data.cxp?.totales?.totalAdeudado ?? 0;
  const totalFacturas = data.cxp?.totales?.totalFacturas ?? 0;
  const alertasPrecio = data.alertasPrecio?.pendientes ?? 0;
  const discGraves = data.discrepancias.filter((d: any) => d.color === 'rojo').length;
  const ultimosMov = data.stats?.ultimosMovimientos ?? [];
  const serie = data.serieDiaria;

  // Coherencia: 1 bajo mínimo si hay 0 activos = inconsistencia
  const incoherencias: string[] = [];
  if (bajosMin > totalProductos) {
    incoherencias.push(
      `Tenés ${bajosMin} productos bajo mínimo pero solo ${totalProductos} activos. Probablemente hay productos inactivos con stock — revisalos.`
    );
  }
  // Deuda absurda vs ingresos del mes
  if (totalAdeudado > 0 && ingresosMes > 0 && totalAdeudado / ingresosMes > 100) {
    incoherencias.push(
      `La deuda es ${Math.round(totalAdeudado / ingresosMes)}× los ingresos del mes. ¿Estás cargando todos los movimientos?`
    );
  }

  // Estado del negocio: critico si hay insights críticos o vencidos
  const criticos = data.insights.filter(i => i.severidad === 'critico').length;
  const atencion = data.insights.filter(i => i.severidad === 'atencion').length;
  const estado: 'normal' | 'atencion' | 'critico' =
    criticos > 0 ? 'critico' : atencion > 0 ? 'atencion' : 'normal';

  // Frescura del dato
  const segundos = ultimoFetch ? Math.floor((tickHora.getTime() - ultimoFetch.getTime()) / 1000) : null;
  const frescuraTxt = segundos == null ? '' :
    segundos < 60 ? `actualizado hace ${segundos}s` :
    segundos < 3600 ? `actualizado hace ${Math.floor(segundos / 60)} min` :
    `actualizado hace ${Math.floor(segundos / 3600)} h`;

  return (
    <div className="dp2 -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 min-h-screen">
      {/* Header sobrio */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-[9px]">
              NUEVA
            </span>
            Panel del dueño · v2
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 text-foreground">
            {saludo()}, {user?.nombre || 'Andy'}
          </h1>
          <InsightDelDia
            insights={data.insights}
            estado={estado}
            fallbackTxt={fallbackInsight({ ingresosMes, mermasMes, bajosMin, totalAdeudado })}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => cargar(false)}
            disabled={refreshing}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-surface border border-border/60 hover:border-primary/40 transition disabled:opacity-50"
            title={frescuraTxt}
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando…' : frescuraTxt}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-surface border border-border/60 hover:border-primary/40 transition"
          >
            <ArrowLeft size={11} /> Vista clásica
          </Link>
        </div>
      </div>

      {/* Banner de incoherencias (siempre arriba si las hay) */}
      {incoherencias.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-amber-500 mb-1">
                {incoherencias.length === 1 ? 'Detecté algo raro en tus datos' : 'Detecté inconsistencias'}
              </div>
              <ul className="space-y-0.5 text-on-surface-variant">
                {incoherencias.map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Insights (Next Best Actions) */}
      {data.insights.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {data.insights.slice(0, 3).map((ins, i) => (
            <InsightRow key={i} insight={ins} delay={i * 80} />
          ))}
        </div>
      )}

      {/* HERO — ingresos con sparkline real */}
      <HeroIngresos
        valor={ingresosMes}
        valorAnt={ingresosMesAnt}
        serie={serie}
      />

      {/* STAT TRIO con deltas contextuales y clickeable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <MetricCard
          to="/reportes?tab=mermas"
          icon={<TrendingDown size={14} />}
          label="Mermas del mes"
          value={mermasMes}
          format="money"
          color="rose"
          polaridad="menos_es_mejor"
          actual={mermasMes}
          anterior={mermasMesAnt}
          memoKey="metric.mermas"
        />
        <MetricCard
          to="/stock?bajos=1"
          icon={<Package size={14} />}
          label="Bajo mínimo"
          value={bajosMin}
          format="num"
          color={bajosMin > 0 ? 'amber' : 'emerald'}
          subtitle={`de ${fmtNum(totalProductos)} productos activos`}
          memoKey="metric.bajosmin"
        />
        <MetricCard
          to="/cuentas-por-pagar"
          icon={<DollarSign size={14} />}
          label="Total adeudado"
          value={totalAdeudado}
          format="money"
          color="violet"
          subtitle={`${totalFacturas} factura${totalFacturas === 1 ? '' : 's'}`}
          memoKey="metric.deuda"
        />
      </div>

      {/* Actividad + Para revisar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <FeedActividad movimientos={ultimosMov} />
        <PanelRevisar
          alertasPrecio={alertasPrecio}
          discGraves={discGraves}
          bajosMin={bajosMin}
        />
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
        <QuickAction to="/punto-venta"      icon={<Store size={16} />}    label="Vender" />
        <QuickAction to="/movimientos"      icon={<Package size={16} />}  label="Cargar mov." />
        <QuickAction to="/carta"            icon={<ChefHat size={16} />}  label="Carta" />
        <QuickAction to="/proyeccion-pagos" icon={<Calendar size={16} />} label="Pagos" />
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// HeroIngresos — número grande + delta contextual + sparkline REAL
// ============================================================================
function HeroIngresos({
  valor, valorAnt, serie,
}: {
  valor: number;
  valorAnt: number;
  serie: Awaited<ReturnType<typeof api.getSerieDiariaIngresos>> | null;
}) {
  const display = useCountUpMemo('hero.ingresos', valor, 1100);
  const delta = useMemo(() => calcularDelta(valor, valorAnt, 'mas_es_mejor'), [valor, valorAnt]);
  // ¿Anomalía? Si el valor es muy bajo vs lo que esperaríamos, alerta
  const sospechoso = valor > 0 && valorAnt > 0 && esAnomalia(valor, valorAnt, 0.3);
  const usaCompact = valor >= 1_000_000;

  const dias = serie?.dias ?? [];
  const promedio = serie?.resumen.promedioDiario ?? 0;

  return (
    <div className="rounded-2xl border border-border/40 bg-surface/60 p-5 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-center">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
            Ingresos del mes
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <div className="text-4xl sm:text-5xl font-extrabold tabular-nums text-foreground">
              {usaCompact ? fmtCompact(display) : fmt$(display)}
            </div>
            <DeltaChip delta={delta} />
          </div>
          <div className="text-[11px] text-on-surface-variant mt-1.5 font-mono flex items-center gap-3 flex-wrap">
            <span>Mes anterior: {fmt$(valorAnt)}</span>
            {promedio > 0 && (
              <span>· Promedio diario: {fmt$(promedio)}</span>
            )}
            {sospechoso && (
              <span className="text-amber-500 font-bold">⚠ Bajo vs lo esperado</span>
            )}
          </div>
        </div>
      </div>

      {/* Sparkline real con tooltip por día */}
      {dias.length > 0 && (
        <SparklineReal dias={dias} promedio={promedio} />
      )}
    </div>
  );
}

// ============================================================================
// DeltaChip — el chip de variación, sin gritos
// ============================================================================
function DeltaChip({ delta }: { delta: ReturnType<typeof calcularDelta> }) {
  if (!delta.flecha && delta.tono === 'neutral') {
    return <span className="text-xs text-on-surface-variant">{delta.mensaje}</span>;
  }
  const color = delta.tono === 'good' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
              : delta.tono === 'bad'  ? 'text-rose-400  bg-rose-500/10 border-rose-500/30'
              : 'text-on-surface-variant bg-surface-high border-border/60';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${color}`}>
      {delta.flecha === 'up' ? <TrendingUp size={11} /> : delta.flecha === 'down' ? <TrendingDown size={11} /> : null}
      {delta.mensaje}
    </span>
  );
}

// ============================================================================
// SparklineReal — datos reales del mes con hover por día
// ============================================================================
function SparklineReal({
  dias, promedio,
}: { dias: Array<{ fecha: string; total: number; cantidad: number }>; promedio: number }) {
  const w = 600, h = 60;
  const max = Math.max(...dias.map(d => d.total), 1);
  const points = dias.map((d, i) => {
    const x = (i / (dias.length - 1)) * w;
    const y = h - (d.total / max) * (h - 6) - 3;
    return { x, y, dia: d };
  });
  const [hover, setHover] = useState<number | null>(null);
  const path = points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');
  const promY = h - (promedio / max) * (h - 6) - 3;

  return (
    <div className="mt-4 -mx-1 relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-12 sm:h-14"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="dp2-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(212, 175, 55)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Línea de promedio */}
        {promedio > 0 && (
          <line x1="0" x2={w} y1={promY} y2={promY}
            stroke="rgb(160, 160, 165)" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.5" />
        )}
        {/* Área */}
        <path d={`${path} L ${w},${h} L 0,${h} Z`} fill="url(#dp2-spark)" />
        {/* Línea */}
        <path d={path} fill="none" stroke="rgb(212, 175, 55)" strokeWidth="1.6" strokeLinecap="round" />
        {/* Puntos invisibles para hover */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - 8}
            y={0}
            width={16}
            height={h}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            className="cursor-crosshair"
          />
        ))}
        {hover !== null && (
          <>
            <line x1={points[hover].x} x2={points[hover].x} y1={0} y2={h}
              stroke="rgb(212, 175, 55)" strokeWidth="0.8" opacity="0.5" />
            <circle cx={points[hover].x} cy={points[hover].y} r="3" fill="rgb(212, 175, 55)" />
          </>
        )}
      </svg>
      {hover !== null && (
        <div
          className="absolute -top-12 px-2 py-1 rounded bg-surface-high border border-primary/40 text-[10px] pointer-events-none whitespace-nowrap"
          style={{
            left: `calc(${(points[hover].x / w) * 100}% - 60px)`,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-bold text-foreground">{fmt$(points[hover].dia.total)}</div>
          <div className="text-on-surface-variant">
            {points[hover].dia.fecha} · {points[hover].dia.cantidad} ingreso{points[hover].dia.cantidad === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MetricCard — card simple, clickeable, con delta contextual
// ============================================================================
function MetricCard({
  to, icon, label, value, format, color, subtitle, polaridad, actual, anterior, memoKey,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  format: 'money' | 'num';
  color: 'rose' | 'amber' | 'emerald' | 'violet' | 'sky';
  subtitle?: string;
  polaridad?: 'mas_es_mejor' | 'menos_es_mejor';
  actual?: number;
  anterior?: number;
  memoKey: string;
}) {
  const display = useCountUpMemo(memoKey, value, 1000);
  const colorMap = {
    rose:    'text-rose-400',
    amber:   'text-amber-400',
    emerald: 'text-emerald-400',
    violet:  'text-violet-400',
    sky:     'text-sky-400',
  } as const;
  const delta = (polaridad && actual !== undefined && anterior !== undefined)
    ? calcularDelta(actual, anterior, polaridad)
    : null;

  return (
    <Link
      to={to}
      className="group rounded-xl border border-border/40 bg-surface/60 p-4 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          <span className={colorMap[color]}>{icon}</span>
          {label}
        </div>
        <ChevronRight size={12} className="text-on-surface-variant/40 group-hover:text-primary group-hover:translate-x-0.5 transition" />
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${colorMap[color]}`}>
        {format === 'money' ? fmt$(display) : fmtNum(display)}
      </div>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {subtitle && <span className="text-[11px] text-on-surface-variant">{subtitle}</span>}
        {delta && <DeltaChip delta={delta} />}
      </div>
    </Link>
  );
}

// ============================================================================
// InsightDelDia — el primer insight crítico o un fallback
// ============================================================================
function InsightDelDia({
  insights, estado, fallbackTxt,
}: { insights: Insight[]; estado: 'normal' | 'atencion' | 'critico'; fallbackTxt: string }) {
  const primero = insights[0];
  if (!primero) {
    return (
      <p className="text-xs text-on-surface-variant mt-1.5 max-w-2xl">
        <CheckCircle2 size={11} className="inline -mt-0.5 mr-1 text-emerald-400" />
        {fallbackTxt}
      </p>
    );
  }
  const color = estado === 'critico' ? 'text-rose-400' : estado === 'atencion' ? 'text-amber-400' : 'text-on-surface-variant';
  return (
    <p className={`text-xs mt-1.5 max-w-2xl ${color}`}>
      <Sparkles size={11} className="inline -mt-0.5 mr-1" />
      <span className="font-bold">{primero.titulo}.</span>
      <span className="text-on-surface-variant"> {primero.detalle}</span>
    </p>
  );
}

function fallbackInsight({
  ingresosMes, mermasMes, bajosMin, totalAdeudado,
}: { ingresosMes: number; mermasMes: number; bajosMin: number; totalAdeudado: number }): string {
  if (ingresosMes === 0 && mermasMes === 0 && bajosMin === 0 && totalAdeudado === 0) {
    return 'Tu día arranca limpio. Cargá un movimiento para que las métricas se llenen.';
  }
  if (mermasMes === 0 && bajosMin === 0) {
    return 'Sin alertas operativas. Buen momento para revisar la carta y costos.';
  }
  return 'Mirá las métricas debajo y arrancá por las alertas.';
}

// ============================================================================
// InsightRow — card de un insight con CTA accionable
// ============================================================================
function InsightRow({ insight, delay }: { insight: Insight; delay: number }) {
  const cfg = {
    critico:  { color: 'rose',    icon: <AlertTriangle size={13} /> },
    atencion: { color: 'amber',   icon: <AlertTriangle size={13} /> },
    info:     { color: 'sky',     icon: <Info size={13} /> },
  } as const;
  const { color, icon } = cfg[insight.severidad];

  const Wrap: any = insight.cta ? Link : 'div';
  const wrapProps: any = insight.cta ? { to: insight.cta.to } : {};

  return (
    <Wrap
      {...wrapProps}
      className={`dp2-fade-in flex items-center gap-2.5 rounded-lg px-3 py-2 border bg-${color}-500/5 border-${color}-500/30 hover:bg-${color}-500/10 transition group`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={`text-${color}-400 shrink-0`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-foreground truncate">{insight.titulo}</div>
        <div className="text-[11px] text-on-surface-variant truncate">{insight.detalle}</div>
      </div>
      {insight.cta && (
        <span className={`text-[10px] font-bold text-${color}-400 shrink-0 hidden sm:flex items-center gap-1 opacity-70 group-hover:opacity-100`}>
          {insight.cta.label}
          <ArrowUpRight size={10} />
        </span>
      )}
    </Wrap>
  );
}

// ============================================================================
// FeedActividad — agrupado por día con time-ago
// ============================================================================
function FeedActividad({ movimientos }: { movimientos: any[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const mov of movimientos.slice(0, 12)) {
      const fechaCompleta = (mov.fecha || '') + (mov.hora ? `T${mov.hora}` : 'T00:00');
      const g = grupoFecha(fechaCompleta);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push({ ...mov, _fechaCompleta: fechaCompleta });
    }
    return Array.from(m.entries());
  }, [movimientos]);

  return (
    <div className="lg:col-span-2 rounded-xl border border-border/40 bg-surface/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          Actividad reciente
        </div>
        <Link to="/movimientos" className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5">
          ver todo <ArrowUpRight size={10} />
        </Link>
      </div>
      {movimientos.length === 0 ? (
        <div className="text-[11px] text-on-surface-variant py-6 text-center">
          Sin movimientos recientes.
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(([g, items]) => (
            <div key={g}>
              <div className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-1">
                {g}
              </div>
              <div className="space-y-1">
                {items.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-high/40 text-[11px]">
                    <div className={`w-1 h-7 rounded-full ${
                      m.tipo === 'ingreso' ? 'bg-emerald-400' :
                      m.tipo === 'merma' || m.tipo === 'consumo_interno' ? 'bg-rose-400' :
                      'bg-primary'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-foreground">{m.producto?.nombre || `Producto #${m.productoId}`}</div>
                      <div className="text-on-surface-variant text-[10px]">
                        <span className="capitalize">{m.tipo.replace('_', ' ')}</span> · {m.cantidad} {m.unidad}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-on-surface-variant">
                        {tiempoRelativo(m._fechaCompleta)}
                      </div>
                      {m.usuario?.nombre && (
                        <div className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                          {m.usuario.nombre}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PanelRevisar — alertas con stack bar semántico
// ============================================================================
function PanelRevisar({
  alertasPrecio, discGraves, bajosMin,
}: { alertasPrecio: number; discGraves: number; bajosMin: number }) {
  const items = [
    { label: 'Alertas de precio', val: alertasPrecio, color: 'amber',  to: '/alertas-precio' },
    { label: 'Discrepancias',     val: discGraves,    color: 'rose',   to: '/discrepancias' },
    { label: 'Bajo mínimo',       val: bajosMin,      color: 'violet', to: '/stock?bajos=1' },
  ];
  const total = items.reduce((s, x) => s + x.val, 0);

  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
          <AlertTriangle size={11} className="text-amber-400" /> Para revisar
        </div>
        <span className="text-[10px] font-bold tabular-nums">{total}</span>
      </div>
      {total === 0 ? (
        <div className="text-[11px] text-emerald-400 py-2 flex items-center gap-1">
          <CheckCircle2 size={11} /> Sin pendientes ✓
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map(it => (
            <Link
              key={it.label}
              to={it.to}
              className="block group"
            >
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-foreground group-hover:text-primary transition">
                  {it.label}
                </span>
                <span className={`tabular-nums font-extrabold text-${it.color}-400`}>
                  {it.val}
                </span>
              </div>
              <div className="h-1 rounded-full bg-surface-high overflow-hidden">
                <div
                  className={`h-full rounded-full bg-${it.color}-400 transition-all duration-700`}
                  style={{ width: total > 0 ? `${(it.val / total) * 100}%` : '0%' }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QuickAction — tile sobrio (sin tilt 3D ni glow)
// ============================================================================
function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border/40 bg-surface/60 p-3 hover:border-primary/40 hover:bg-primary/5 transition flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</span>
        <span className="text-xs font-bold">{label}</span>
      </div>
      <ArrowUpRight size={12} className="text-on-surface-variant/40 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

// ============================================================================
// LoadingScreen
// ============================================================================
function LoadingScreen() {
  return (
    <div className="dp2 -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 min-h-screen space-y-3">
      <div className="h-10 w-2/3 rounded-lg dp2-skel" />
      <div className="h-32 w-full rounded-2xl dp2-skel" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-24 rounded-xl dp2-skel" />
        <div className="h-24 rounded-xl dp2-skel" />
        <div className="h-24 rounded-xl dp2-skel" />
      </div>
      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// CSS — austero. Solo animaciones que comunican.
// ============================================================================
const styles = `
.dp2 { background: #0A0A0A; }

/* Fade-in para los insights que llegan (un evento real: dato nuevo) */
.dp2-fade-in {
  opacity: 0;
  transform: translateY(4px);
  animation: dp2Fade .4s cubic-bezier(.2,.7,.2,1) both;
}
@keyframes dp2Fade { to { opacity: 1; transform: translateY(0); } }

/* Skeleton sobrio */
.dp2-skel {
  position: relative;
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%);
  background-size: 200% 100%;
  animation: dp2Skel 1.4s ease-in-out infinite;
}
@keyframes dp2Skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .dp2-fade-in, .dp2-skel { animation-duration: .01ms !important; }
}
`;
