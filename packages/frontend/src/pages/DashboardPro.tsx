/**
 * DashboardPro v3 — "Historia primero".
 *
 * Filosofía: un nene de 5 años entiende qué pasa en el negocio en 3 segundos.
 *
 * Cambios sustanciales vs v2:
 *   1. Backend genera la NARRATIVA del día (1 endpoint /narrativa).
 *   2. Switch HOY / MES bien separado, no todo mezclado.
 *   3. Ventas REALES del PoS (no compras como antes).
 *   4. Margen bruto estimado calculado con costo de mercadería vendida.
 *   5. Ticket promedio, cant. tickets, top 3 productos del día.
 *   6. Drill-down IN-SITU: cada métrica se expande con detalle + acción.
 *   7. Comparativas siempre presentes (vs ayer / vs mismo día sem pas).
 *   8. Bajo mínimo con NOMBRE de producto (no número aislado).
 *   9. Lenguaje natural en cada texto.
 *  10. Animaciones con criterio: entrance + draw + live.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, AlertTriangle, Package,
  ArrowUpRight, Sparkles, ArrowLeft, Store, RefreshCw,
  Calendar, ChevronRight, ChevronDown, CheckCircle2, Receipt,
  ShoppingCart, Target, Coins, AlertCircle, Smile, Meh, Frown,
  Flame,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCountUpMemo } from '../hooks/useCountUpMemo';
import { saludo } from '../lib/tiempoRelativo';

// ============================================================================
// Tipos
// ============================================================================
type Narrativa = Awaited<ReturnType<typeof api.getDashboardNarrativa>>;
type Periodo = 'hoy' | 'mes';

// ============================================================================
// Formato
// ============================================================================
const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const fmtCompact = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return fmt$(n);
};
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

// ============================================================================
// Componente principal
// ============================================================================
export default function DashboardPro() {
  const { user } = useAuth();
  const [data, setData] = useState<Narrativa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [tick, setTick] = useState(new Date());
  const [ultimoFetch, setUltimoFetch] = useState<Date | null>(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefreshing(true);
    setError(null);
    try {
      const d = await api.getDashboardNarrativa();
      setData(d);
      setUltimoFetch(new Date());
      setLoading(false);
    } catch (e: any) {
      console.error('[dp3]', e);
      setError(e?.message || 'No pudimos cargar el dashboard. Probá de nuevo en un rato.');
      setLoading(false);
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
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen error={error || 'Sin datos'} onRetry={() => { setLoading(true); cargar(false); }} />;

  const estado = computarEstado(data);
  const frescuraTxt = ultimoFetch
    ? formatoFrescura(Math.floor((tick.getTime() - ultimoFetch.getTime()) / 1000))
    : '';

  return (
    <div
      className={`dp3 dp3-state-${estado} relative -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 min-h-screen overflow-hidden`}
    >
      <div className="dp3-aurora" aria-hidden />
      <div className="dp3-grain" aria-hidden />

      {/* HEADER · saludo + frescura */}
      <header className="relative z-10 flex items-start justify-between gap-3 mb-4 dp3-anim-header">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">
            <span className="dp3-live-dot inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-[9px] dp3-badge-shine">
              NUEVA
            </span>
            Panel del dueño
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1 text-foreground">
            {saludo()}, {user?.nombre || 'Andy'}
          </h1>
          {/* ── La historia en una oración ───────────────────────────── */}
          <p className="text-sm text-on-surface-variant mt-1.5 max-w-3xl leading-relaxed">
            <Sparkles size={12} className="inline -mt-0.5 mr-1 text-primary" />
            {data.tituloHistoria}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => cargar(false)}
            disabled={refreshing}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-surface/80 backdrop-blur border border-border/60 hover:border-primary/40 transition disabled:opacity-50"
            title={frescuraTxt}
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Actualizando…' : frescuraTxt}
          </button>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-surface/80 backdrop-blur border border-border/60 hover:border-primary/40 transition"
          >
            <ArrowLeft size={11} /> Vista clásica
          </Link>
        </div>
      </header>

      {/* SWITCH HOY / MES — decisión central */}
      <div className="relative z-10 inline-flex items-center bg-surface/70 backdrop-blur border border-border/60 rounded-full p-1 mb-4 dp3-anim-switch">
        <PeriodoBtn periodo={periodo} setPeriodo={setPeriodo} value="hoy" label="Hoy" />
        <PeriodoBtn periodo={periodo} setPeriodo={setPeriodo} value="mes" label="Este mes" />
      </div>

      {/* PANTALLA HOY */}
      {periodo === 'hoy' && <PanelHoy data={data} />}

      {/* PANTALLA MES */}
      {periodo === 'mes' && <PanelMes data={data} />}

      {/* ALERTAS — siempre visibles abajo, accionables */}
      <PanelAlertas data={data} />

      {/* ATAJOS rápidos */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 dp3-anim-tiles">
        <Atajo to="/punto-venta"      icon={<Store size={16} />}         label="Vender ahora" />
        <Atajo to="/movimientos"      icon={<Package size={16} />}       label="Cargar ingreso" />
        <Atajo to="/carta"            icon={<Receipt size={16} />}       label="Ver carta" />
        <Atajo to="/proyeccion-pagos" icon={<Calendar size={16} />}      label="Pagos por venir" />
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// PanelHoy — qué pasó/pasa HOY (lo más importante para el dueño operativo)
// ============================================================================
function PanelHoy({ data }: { data: Narrativa }) {
  const h = data.hoy;
  const c = h.comparativa;
  const cara = caraEmoticon(h.margen);

  return (
    <div className="relative z-10 space-y-3">
      {/* HERO — ventas del día con cara */}
      <div className="rounded-2xl border border-border/40 bg-surface/60 backdrop-blur p-5 sm:p-6 dp3-anim-hero">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-1.5">
              <Coins size={11} /> Lo que vendiste hoy
            </div>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-extrabold tabular-nums dp3-hero-num">
                {h.ventas >= 1_000_000 ? fmtCompact(h.ventas) : fmt$(h.ventas)}
              </span>
              <ComparativaChip delta={c.ayer.deltaPct} label="vs ayer" />
            </div>
            <div className="text-[12px] text-on-surface-variant mt-2 leading-relaxed">
              {h.tickets > 0 ? (
                <>
                  <strong className="text-foreground">{h.tickets}</strong> ticket{h.tickets === 1 ? '' : 's'} ·
                  ticket promedio <strong className="text-foreground">{fmt$(h.ticketPromedio)}</strong>
                  {h.itemsVendidos > 0 && (
                    <> · {fmtNum(h.itemsVendidos)} item{h.itemsVendidos === 1 ? '' : 's'}</>
                  )}
                </>
              ) : (
                <>Todavía no registraste ventas. {c.ayer.tickets > 0 && <>Ayer cerraste con <strong>{c.ayer.tickets}</strong> ticket{c.ayer.tickets === 1 ? '' : 's'}.</>}</>
              )}
            </div>
          </div>
          {h.ventas > 0 && (
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className={`text-5xl sm:text-6xl ${cara.color}`} title={`Margen ${h.margen.toFixed(0)}%`}>
                {cara.icon}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-extrabold tabular-nums ${cara.color}`}>
                  {h.margen.toFixed(0)}%
                </div>
                <div className="text-[9px] uppercase tracking-wider text-on-surface-variant">
                  margen estimado
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TRIO operativo del día */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 dp3-anim-stack">
        <CardConDrillDown
          icon={<Receipt size={14} />}
          label="Tickets"
          valor={h.tickets}
          formato="num"
          color="sky"
          subtitle={c.ayer.tickets > 0 ? `Ayer: ${c.ayer.tickets}` : undefined}
          deltaPct={c.ayer.deltaPct}
        />
        <CardConDrillDown
          icon={<ShoppingCart size={14} />}
          label="Ticket promedio"
          valor={h.ticketPromedio}
          formato="money"
          color="emerald"
          subtitle={c.ayer.tickets > 0
            ? `Ayer: ${fmt$(c.ayer.ventas / c.ayer.tickets)}`
            : 'Sin referencia'}
        />
        <CardConDrillDown
          icon={<Target size={14} />}
          label="Costo de venta"
          valor={h.costoMercaderia}
          formato="money"
          color="violet"
          subtitle={`Margen: ${h.margen.toFixed(0)}%`}
        />
      </div>

      {/* Top productos del día — accionable */}
      {h.topProductos.length > 0 && (
        <DrillDown
          titulo="🔥 Lo que más se vendió hoy"
          items={h.topProductos.map(p => ({
            key: String(p.id),
            label: p.nombre,
            valor: `${fmtNum(p.cantidad)} u.`,
            extra: fmt$(p.importe),
          }))}
        />
      )}

      {/* Vs misma semana pasada */}
      <Comparativa
        actual={h.ventas}
        anterior={c.mismaSemPasada.ventas}
        actualLabel="Hoy"
        anteriorLabel="Mismo día semana pasada"
      />
    </div>
  );
}

// ============================================================================
// PanelMes — la vista financiera (mes acumulado + proyección)
// ============================================================================
function PanelMes({ data }: { data: Narrativa }) {
  const m = data.mes;
  const cara = caraEmoticon(m.margen);
  const ahora = new Date();
  const diaMes = ahora.getDate();
  const ultDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const pctMes = (diaMes / ultDia) * 100;

  return (
    <div className="relative z-10 space-y-3">
      {/* HERO MES — ventas + proyección */}
      <div className="rounded-2xl border border-border/40 bg-surface/60 backdrop-blur p-5 sm:p-6 dp3-anim-hero">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-5 items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-1.5">
              <Coins size={11} /> Facturación del mes
            </div>
            <div className="mt-2 flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-extrabold tabular-nums dp3-hero-num">
                {fmtCompact(m.ventas)}
              </span>
              <ComparativaChip delta={m.deltaProyVsMesPasado} label="proyección vs mes pasado" />
            </div>
            <div className="text-[12px] text-on-surface-variant mt-2 leading-relaxed">
              <strong className="text-foreground">{m.tickets}</strong> tickets ·
              ticket promedio <strong className="text-foreground">{fmt$(m.ticketPromedio)}</strong>
              {m.proyeccionMes > 0 && (
                <> · <span className="text-primary">Si seguís así, cerrás en {fmtCompact(m.proyeccionMes)}</span></>
              )}
            </div>
            <ProgresoMes pct={pctMes} />
          </div>
          {m.ventas > 0 && (
            <div className="flex items-center gap-3 sm:flex-col sm:items-end">
              <div className={`text-5xl sm:text-6xl ${cara.color}`} title={`Margen ${m.margen.toFixed(0)}%`}>
                {cara.icon}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-extrabold tabular-nums ${cara.color}`}>
                  {m.margen.toFixed(0)}%
                </div>
                <div className="text-[9px] uppercase tracking-wider text-on-surface-variant">
                  margen
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sparkline 30 días */}
        {m.sparkline.length > 0 && <SparklineVentas serie={m.sparkline} />}
      </div>

      {/* Trio del mes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 dp3-anim-stack">
        <CardConDrillDown
          icon={<Receipt size={14} />}
          label="Tickets del mes"
          valor={m.tickets}
          formato="num"
          color="sky"
          subtitle={m.mesPasado.tickets > 0 ? `Mes pasado: ${m.mesPasado.tickets}` : undefined}
        />
        <CardConDrillDown
          icon={<ShoppingCart size={14} />}
          label="Costo mercadería"
          valor={m.costoMercaderia}
          formato="money"
          color="violet"
          subtitle={`de ${fmtCompact(m.ventas)} vendidos`}
        />
        <CardConDrillDown
          icon={<Flame size={14} />}
          label="Mermas del mes"
          valor={data.drilldowns.mermasMes}
          formato="money"
          color="rose"
          subtitle={data.drilldowns.topMermas[0]
            ? `Mayor: ${data.drilldowns.topMermas[0].nombre}`
            : 'Sin mermas ✓'}
        />
      </div>

      {/* Drill-downs del mes */}
      {m.topProductos.length > 0 && (
        <DrillDown
          titulo="📈 Top vendidos del mes"
          items={m.topProductos.map(p => ({
            key: String(p.id),
            label: p.nombre,
            valor: `${fmtNum(p.cantidad)} u.`,
            extra: fmt$(p.importe),
          }))}
        />
      )}

      {data.drilldowns.topAcreedores.length > 0 && (
        <DrillDown
          titulo="💰 A quién le debo más"
          items={data.drilldowns.topAcreedores.map(a => ({
            key: String(a.proveedorId),
            label: a.nombre,
            valor: fmt$(a.saldo),
            extra: '',
          }))}
          to="/cuentas-por-pagar"
        />
      )}

      {data.drilldowns.topMermas.length > 0 && (
        <DrillDown
          titulo="🗑 Mermas: qué se está perdiendo"
          items={data.drilldowns.topMermas.map(m => ({
            key: String(m.productoId),
            label: m.nombre,
            valor: fmt$(m.importe),
            extra: '',
          }))}
        />
      )}
    </div>
  );
}

// ============================================================================
// PanelAlertas — siempre al pie, accionable
// ============================================================================
function PanelAlertas({ data }: { data: Narrativa }) {
  const a = data.alertas;
  const total = a.vencidas.count + a.vencenPronto.count + a.bajosDeMinimo.length;
  if (total === 0) {
    return (
      <div className="relative z-10 mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 dp3-anim-section">
        <div className="flex items-center gap-2 text-sm text-emerald-400 font-bold">
          <CheckCircle2 size={16} /> Todo en orden — nada urgente por revisar
        </div>
      </div>
    );
  }
  return (
    <div className="relative z-10 mt-4 rounded-2xl border border-border/40 bg-surface/60 backdrop-blur overflow-hidden dp3-anim-section">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={11} /> Cosas para revisar
        </div>
        <span className="text-[10px] tabular-nums font-bold text-amber-400">
          {total}
        </span>
      </div>
      <div className="divide-y divide-border/30">
        {a.vencidas.count > 0 && (
          <AlertaFila
            color="rose"
            titulo={`${a.vencidas.count} factura${a.vencidas.count === 1 ? '' : 's'} vencida${a.vencidas.count === 1 ? '' : 's'}`}
            detalle={`${fmt$(a.vencidas.total)} en total — pagar urgente`}
            to="/proyeccion-pagos"
          />
        )}
        {a.vencenPronto.count > 0 && (
          <AlertaFila
            color="amber"
            titulo={`${a.vencenPronto.count} vencen en 7 días`}
            detalle={`${fmt$(a.vencenPronto.total)} a programar`}
            to="/proyeccion-pagos"
          />
        )}
        {a.bajosDeMinimo.length > 0 && (
          <AlertaBajosDeMinimo items={a.bajosDeMinimo} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

function PeriodoBtn({
  periodo, setPeriodo, value, label,
}: { periodo: Periodo; setPeriodo: (p: Periodo) => void; value: Periodo; label: string }) {
  const active = periodo === value;
  return (
    <button
      onClick={() => setPeriodo(value)}
      className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
        active
          ? 'bg-primary text-on-primary shadow-[0_4px_12px_-4px_rgba(212,175,55,0.5)]'
          : 'text-on-surface-variant hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function ComparativaChip({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) return null;
  const sube = delta > 0;
  const color = sube
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : delta < 0
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
      : 'text-on-surface-variant bg-surface-high border-border/60';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${color}`}>
      {sube ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : null}
      {fmtPct(delta)}
      <span className="font-medium opacity-70 ml-0.5">{label}</span>
    </span>
  );
}

function CardConDrillDown({
  icon, label, valor, formato, color, subtitle, deltaPct,
}: {
  icon: React.ReactNode;
  label: string;
  valor: number;
  formato: 'money' | 'num';
  color: 'rose' | 'amber' | 'emerald' | 'violet' | 'sky';
  subtitle?: string;
  deltaPct?: number | null;
}) {
  const display = useCountUpMemo(`dp3.${label}`, valor, 900);
  const colorClass = {
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    violet: 'text-violet-400',
    sky: 'text-sky-400',
  }[color];
  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 backdrop-blur p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">
        <span className={colorClass}>{icon}</span>
        {label}
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${colorClass}`}>
        {formato === 'money' ? fmt$(display) : fmtNum(display)}
      </div>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {subtitle && <span className="text-[11px] text-on-surface-variant">{subtitle}</span>}
        {deltaPct != null && <ComparativaChip delta={deltaPct} label="" />}
      </div>
    </div>
  );
}

function DrillDown({
  titulo, items, to,
}: {
  titulo: string;
  items: Array<{ key: string; label: string; valor: string; extra: string }>;
  to?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 backdrop-blur overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-high/30 transition"
      >
        <span className="text-sm font-bold text-foreground">{titulo}</span>
        <ChevronDown size={14} className={`text-on-surface-variant transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-4 pb-3 dp3-anim-content">
          <div className="space-y-1">
            {items.map((it, i) => (
              <div key={it.key} className="flex items-center gap-3 text-[12px] py-1.5">
                <span className="w-5 text-on-surface-variant/60 tabular-nums">#{i + 1}</span>
                <span className="flex-1 text-foreground truncate">{it.label}</span>
                <span className="font-bold text-primary tabular-nums">{it.valor}</span>
                {it.extra && <span className="text-on-surface-variant tabular-nums">{it.extra}</span>}
              </div>
            ))}
          </div>
          {to && (
            <Link
              to={to}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            >
              ver detalle completo <ArrowUpRight size={11} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Comparativa({
  actual, anterior, actualLabel, anteriorLabel,
}: { actual: number; anterior: number; actualLabel: string; anteriorLabel: string }) {
  if (actual === 0 && anterior === 0) return null;
  const max = Math.max(actual, anterior) || 1;
  return (
    <div className="rounded-xl border border-border/40 bg-surface/60 backdrop-blur p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">
        Comparación
      </div>
      <div className="space-y-2">
        {[
          { label: actualLabel, val: actual, color: 'primary' },
          { label: anteriorLabel, val: anterior, color: 'on-surface-variant' },
        ].map(b => (
          <div key={b.label}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-on-surface-variant">{b.label}</span>
              <span className="tabular-nums font-bold text-foreground">{fmt$(b.val)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-high overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 bg-${b.color}`}
                style={{ width: `${(b.val / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertaFila({
  color, titulo, detalle, to,
}: { color: 'rose' | 'amber' | 'sky'; titulo: string; detalle: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-high/30 transition group">
      <span className={`p-1.5 rounded-lg bg-${color}-500/15 text-${color}-400 shrink-0`}>
        <AlertCircle size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground truncate">{titulo}</div>
        <div className="text-[11px] text-on-surface-variant truncate">{detalle}</div>
      </div>
      <ChevronRight size={12} className="text-on-surface-variant/40 group-hover:text-primary group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

function AlertaBajosDeMinimo({
  items,
}: { items: Narrativa['alertas']['bajosDeMinimo'] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-high/30 transition"
      >
        <span className="p-1.5 rounded-lg bg-violet-500/15 text-violet-400 shrink-0">
          <Package size={14} />
        </span>
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-bold text-foreground">
            {items.length} producto{items.length === 1 ? '' : 's'} bajo mínimo
          </div>
          <div className="text-[11px] text-on-surface-variant truncate">
            {items.slice(0, 2).map(i => i.nombre).join(' · ')}
            {items.length > 2 && ` y ${items.length - 2} más`}
          </div>
        </div>
        <ChevronDown size={12} className={`text-on-surface-variant transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="px-4 pb-3 dp3-anim-content">
          <div className="space-y-1.5">
            {items.map(p => (
              <Link
                key={p.id}
                to={`/stock?productoId=${p.id}`}
                className="flex items-center gap-3 text-[12px] py-1.5 hover:text-primary group"
              >
                <span className="flex-1 truncate">{p.nombre}</span>
                <span className="text-rose-400 tabular-nums">
                  {fmtNum(p.stock)} / {fmtNum(p.minimo)} {p.unidad}
                </span>
                <span className="text-[10px] font-bold text-violet-400 tabular-nums">
                  faltan {fmtNum(p.falta)}
                </span>
              </Link>
            ))}
          </div>
          <Link
            to="/ordenes-compra"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
          >
            generar orden de compra <ArrowUpRight size={11} />
          </Link>
        </div>
      )}
    </div>
  );
}

function ProgresoMes({ pct }: { pct: number }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] text-on-surface-variant mb-1">
        <span>Día {Math.round(pct / 100 * 30) || 1} de 30 del mes</span>
        <span className="tabular-nums">{pct.toFixed(0)}% del mes</span>
      </div>
      <div className="h-1 rounded-full bg-surface-high overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SparklineVentas({
  serie,
}: { serie: Narrativa['mes']['sparkline'] }) {
  const w = 600, h = 60;
  const max = Math.max(...serie.map(s => s.total), 1);
  const points = serie.map((s, i) => ({
    x: (i / Math.max(serie.length - 1, 1)) * w,
    y: h - (s.total / max) * (h - 6) - 3,
    dia: s,
  }));
  const [hover, setHover] = useState<number | null>(null);
  const path = points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');

  return (
    <div className="mt-5 -mx-1 relative">
      <div className="text-[9px] uppercase tracking-wider text-on-surface-variant mb-1">
        Últimos 30 días — pasá el mouse para ver cada día
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 sm:h-14" preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="dp3-spk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(212, 175, 55)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${w},${h} L 0,${h} Z`} fill="url(#dp3-spk)" className="dp3-spk-area" />
        <path d={path} fill="none" stroke="rgb(212, 175, 55)" strokeWidth="1.6" strokeLinecap="round" className="dp3-spk-line" />
        {points.map((p, i) => (
          <rect key={i} x={p.x - 8} y={0} width={16} height={h} fill="transparent"
            onMouseEnter={() => setHover(i)} className="cursor-crosshair" />
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
        <div className="absolute -top-12 px-2 py-1 rounded bg-surface-high border border-primary/40 text-[10px] pointer-events-none whitespace-nowrap"
          style={{ left: `calc(${(points[hover].x / w) * 100}% - 60px)`, transform: 'translateY(-100%)' }}>
          <div className="font-bold text-foreground">{fmt$(points[hover].dia.total)}</div>
          <div className="text-on-surface-variant">
            {points[hover].dia.fecha} · {points[hover].dia.tickets} ticket{points[hover].dia.tickets === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </div>
  );
}

function Atajo({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to}
      className="group rounded-xl border border-border/40 bg-surface/60 backdrop-blur p-3 hover:border-primary/40 hover:bg-primary/5 transition flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</span>
        <span className="text-xs font-bold">{label}</span>
      </div>
      <ArrowUpRight size={12}
        className="text-on-surface-variant/40 group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="dp3 relative -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-12 lg:py-20 min-h-screen flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 mb-4">
          <AlertCircle className="text-rose-400" size={28} />
        </div>
        <h2 className="text-xl font-extrabold text-foreground mb-2">
          No pudimos cargar el dashboard
        </h2>
        <p className="text-sm text-on-surface-variant mb-4">
          {error}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> Reintentar
          </button>
          <Link
            to="/"
            className="px-4 py-2 rounded-lg bg-surface border border-border/60 text-xs font-bold flex items-center gap-1.5"
          >
            <ArrowLeft size={12} /> Volver a la vista clásica
          </Link>
        </div>
        <style>{styles}</style>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="dp3 relative -mx-4 sm:-mx-6 -my-4 lg:-my-6 px-4 sm:px-6 py-4 lg:py-6 min-h-screen space-y-3">
      <div className="h-10 w-2/3 rounded-lg dp3-skel" />
      <div className="h-5 w-1/2 rounded dp3-skel" />
      <div className="h-32 rounded-2xl dp3-skel" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-24 rounded-xl dp3-skel" />
        <div className="h-24 rounded-xl dp3-skel" />
        <div className="h-24 rounded-xl dp3-skel" />
      </div>
      <style>{styles}</style>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================
function caraEmoticon(margen: number): { icon: React.ReactNode; color: string } {
  if (margen >= 60) return { icon: <Smile />, color: 'text-emerald-400' };
  if (margen >= 40) return { icon: <Meh />,   color: 'text-amber-400' };
  return { icon: <Frown />, color: 'text-rose-400' };
}

function computarEstado(d: Narrativa): 'normal' | 'atencion' | 'critico' {
  if (d.alertas.vencidas.count > 0) return 'critico';
  if (d.alertas.vencenPronto.count > 0 || d.alertas.bajosDeMinimo.length > 0) return 'atencion';
  return 'normal';
}

function formatoFrescura(seg: number): string {
  if (seg < 60) return `actualizado hace ${seg}s`;
  if (seg < 3600) return `actualizado hace ${Math.floor(seg / 60)} min`;
  return `actualizado hace ${Math.floor(seg / 3600)} h`;
}

// ============================================================================
// CSS
// ============================================================================
const styles = `
.dp3 { background: #0A0A0A; }

.dp3-aurora {
  position: absolute; inset: -20%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 50% 40% at 75% 15%, var(--dp3-c1), transparent 60%),
    radial-gradient(ellipse 60% 50% at 20% 90%, var(--dp3-c2), transparent 60%),
    radial-gradient(ellipse 80% 50% at 50% 50%, var(--dp3-c3), transparent 70%);
  filter: blur(50px);
  animation: dp3AuroraDrift 18s ease-in-out infinite alternate;
  transition: background 1.2s ease-out;
}
.dp3-state-normal   { --dp3-c1: rgba(52, 211, 153, 0.08); --dp3-c2: rgba(212, 175, 55, 0.10); --dp3-c3: rgba(56, 189, 248, 0.04); }
.dp3-state-atencion { --dp3-c1: rgba(251, 191, 36, 0.14); --dp3-c2: rgba(212, 175, 55, 0.08); --dp3-c3: rgba(244, 114, 114, 0.05); }
.dp3-state-critico  { --dp3-c1: rgba(244, 114, 114, 0.16); --dp3-c2: rgba(251, 191, 36, 0.10); --dp3-c3: rgba(244, 114, 114, 0.06); }
@keyframes dp3AuroraDrift {
  0%   { transform: translate(0,0) scale(1)    rotate(0); }
  50%  { transform: translate(-1%,1%) scale(1.04) rotate(1deg); }
  100% { transform: translate(1%,-1%) scale(1.02) rotate(-1deg); }
}

.dp3-grain {
  position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: .035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

.dp3-anim-header  { opacity: 0; transform: translateY(-6px); animation: dp3In .55s cubic-bezier(.2,.7,.2,1) .05s both; }
.dp3-anim-switch  { opacity: 0; transform: translateY(4px);   animation: dp3In .45s cubic-bezier(.2,.7,.2,1) .25s both; }
.dp3-anim-hero    { opacity: 0; transform: translateY(10px) scale(.99); animation: dp3InHero .8s cubic-bezier(.2,.7,.2,1) .35s both; }
.dp3-anim-stack > *   { opacity: 0; transform: translateY(8px); animation: dp3In .5s cubic-bezier(.2,.7,.2,1) both; }
.dp3-anim-stack > *:nth-child(1) { animation-delay: .55s; }
.dp3-anim-stack > *:nth-child(2) { animation-delay: .62s; }
.dp3-anim-stack > *:nth-child(3) { animation-delay: .69s; }
.dp3-anim-section { opacity: 0; transform: translateY(8px); animation: dp3In .5s cubic-bezier(.2,.7,.2,1) .85s both; }
.dp3-anim-tiles > *   { opacity: 0; transform: translateY(6px); animation: dp3In .45s cubic-bezier(.2,.7,.2,1) both; }
.dp3-anim-tiles > *:nth-child(1) { animation-delay: 1.00s; }
.dp3-anim-tiles > *:nth-child(2) { animation-delay: 1.06s; }
.dp3-anim-tiles > *:nth-child(3) { animation-delay: 1.12s; }
.dp3-anim-tiles > *:nth-child(4) { animation-delay: 1.18s; }
.dp3-anim-content { opacity: 0; transform: translateY(-4px); animation: dp3In .3s ease both; }

@keyframes dp3In     { to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes dp3InHero { to { opacity: 1; transform: translateY(0) scale(1); } }

.dp3-live-dot {
  box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.6);
  animation: dp3LivePulse 2.4s ease-out infinite;
}
@keyframes dp3LivePulse {
  0%   { box-shadow: 0 0 0 0   rgba(212, 175, 55, 0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(212, 175, 55, 0); }
  100% { box-shadow: 0 0 0 0   rgba(212, 175, 55, 0); }
}

.dp3-badge-shine { position: relative; overflow: hidden; }
.dp3-badge-shine::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%);
  background-size: 300% 100%;
  animation: dp3Shine 9s ease-in-out infinite;
}
@keyframes dp3Shine { 0%,70%,100% { background-position: 200% 0; } 85% { background-position: -100% 0; } }

.dp3-hero-num {
  background: linear-gradient(135deg, #F4D77A 0%, #D4AF37 50%, #F4D77A 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: dp3Grad 7s ease-in-out infinite;
}
@keyframes dp3Grad { 0%,100% { background-position: 0 50%; } 50% { background-position: 100% 50%; } }

/* Sparkline draw */
.dp3-spk-line {
  stroke-dasharray: 1200; stroke-dashoffset: 1200;
  animation: dp3SpkDraw 1.6s cubic-bezier(.2,.7,.2,1) .7s forwards;
}
.dp3-spk-area { opacity: 0; animation: dp3SpkFade 1.2s ease-out 1.5s forwards; }
@keyframes dp3SpkDraw { to { stroke-dashoffset: 0; } }
@keyframes dp3SpkFade { to { opacity: 1; } }

.dp3 a[class*="rounded-xl"],
.dp3 a[class*="rounded-2xl"] {
  transition: transform .25s cubic-bezier(.2,.7,.2,1), border-color .2s, background-color .2s, box-shadow .25s;
}
.dp3 a[class*="rounded-xl"]:hover,
.dp3 a[class*="rounded-2xl"]:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -16px rgba(212, 175, 55, 0.35), 0 0 0 1px rgba(212, 175, 55, 0.18) inset;
}

.dp3-skel {
  position: relative;
  background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%);
  background-size: 200% 100%;
  animation: dp3Skel 1.4s ease-in-out infinite;
}
@keyframes dp3Skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .dp3-aurora, .dp3-live-dot, .dp3-badge-shine::after, .dp3-hero-num { animation: none !important; }
  .dp3-anim-header, .dp3-anim-switch, .dp3-anim-hero, .dp3-anim-stack > *,
  .dp3-anim-section, .dp3-anim-tiles > *, .dp3-anim-content,
  .dp3-spk-line, .dp3-spk-area, .dp3-skel {
    animation-duration: .01ms !important; animation-delay: 0s !important;
    opacity: 1 !important; transform: none !important;
  }
}
`;
