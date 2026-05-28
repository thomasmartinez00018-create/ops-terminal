/**
 * ProyeccionPagos — vista forward-looking del cash-flow.
 *
 * Complemento de /cuentas-por-pagar (que es backward, aging). Acá se ve
 * QUÉ HAY QUE PAGAR Y CUÁNDO, en formato calendario mensual.
 *
 * Layout:
 *   - Desktop: calendario (5/7 cols) + sidebar resumen (2/7 cols).
 *     Lista del día seleccionado abajo a todo el ancho.
 *   - Mobile: header con totales + agenda (lista cronológica) en lugar
 *     de calendario. Sidebar se vuelve sticky bottom-bar de stats.
 *
 * Features:
 *   - Calendario coloreado por urgencia (vencido/hoy/cerca/futuro)
 *   - Click en día → resalta y muestra facturas en panel inferior
 *   - Mini chart de cash-flow 30 días (barras)
 *   - Alerta de concentración (1 día > 40% del cash mensual)
 *   - Inferencia de vencimiento si la factura no tiene fecha
 *   - Marcar pagado inline con modal compacto (multi-medio)
 *   - Filtro por proveedor
 *   - Imprimible (window.print con CSS print-friendly)
 */
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, AlertTriangle, Calendar, Wallet,
  TrendingUp, Printer, X, Check, Filter, Clock, Sparkles,
  FileText, Trash2, ExternalLink, Image as ImageIcon, Package,
  CreditCard, Receipt, Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';

// ============================================================================
// Tipos derivados de la respuesta del backend
// ============================================================================
type Factura = {
  id: number; codigo: string; numero: string; tipoComprobante: string;
  fecha: string; fechaVencimiento: string | null; fechaPago: string;
  fechaPagoInferida: boolean;
  total: number; pagado: number; saldo: number;
  estado: string; diasVencido: number;
  proveedorId: number; proveedorNombre: string;
};

type Proyeccion = Awaited<ReturnType<typeof api.getProyeccionPagos>>;

const MEDIOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mp', label: 'Mercado Pago' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
];

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}
function fmtDay(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}
function diasEntre(a: string, b: string): number {
  return Math.floor((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

// ============================================================================
// Componente principal
// ============================================================================
export default function ProyeccionPagos() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Proyeccion | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [filtroProveedor, setFiltroProveedor] = useState<string>('');
  const [pagoActivo, setPagoActivo] = useState<Factura | null>(null);
  const [detalleFacturaId, setDetalleFacturaId] = useState<number | null>(null);
  const [vistaListaCompleta, setVistaListaCompleta] = useState(false);

  // ── Cargar proveedores para el filtro ──────────────────────────────────
  useEffect(() => {
    api.getProveedores().then(setProveedores).catch(() => {});
  }, []);

  // ── Cargar proyección cada vez que cambia mes o filtro ─────────────────
  // Token-guard: cambiar de mes/proveedor rápido no debe dejar el calendario
  // mostrando un mes anterior (respuesta lenta pisando la actual).
  const fetchTokenRef = useRef(0);
  async function cargar() {
    const myToken = ++fetchTokenRef.current;
    setLoading(true);
    try {
      const params: any = { mes };
      if (filtroProveedor) params.proveedorId = parseInt(filtroProveedor);
      const d = await api.getProyeccionPagos(params);
      if (myToken !== fetchTokenRef.current) return;
      setData(d);
      // Auto-select today if it's in the current month
      if (d.mesActual.hoy >= d.mesActual.inicioMes && d.mesActual.hoy <= d.mesActual.finMes) {
        setDiaSeleccionado(d.mesActual.hoy);
      }
    } catch (e: any) {
      if (myToken === fetchTokenRef.current) addToast(e?.message || 'Error cargando proyección', 'error');
    } finally {
      if (myToken === fetchTokenRef.current) setLoading(false);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [mes, filtroProveedor]);

  // ── Navegación entre meses ─────────────────────────────────────────────
  function cambiarMes(delta: number) {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setDiaSeleccionado(null);
  }
  function irHoy() {
    const d = new Date();
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setDiaSeleccionado(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  // ── Map fecha → datos del día ──────────────────────────────────────────
  const porDiaMap = useMemo(() => {
    const m = new Map<string, { total: number; cantidad: number }>();
    for (const d of data?.porDia || []) m.set(d.fecha, { total: d.total, cantidad: d.cantidad });
    return m;
  }, [data?.porDia]);

  // ── Facturas del día seleccionado ──────────────────────────────────────
  const facturasDia = useMemo(() => {
    if (!diaSeleccionado || !data) return [];
    return data.facturas.filter(f => f.fechaPago === diaSeleccionado).sort((a, b) => b.saldo - a.saldo);
  }, [diaSeleccionado, data]);

  // ── Vencidas (todas, sin importar día seleccionado) ────────────────────
  const vencidasTodas = useMemo(() => {
    if (!data) return [];
    return data.facturas
      .filter(f => f.diasVencido > 0)
      .sort((a, b) => b.diasVencido - a.diasVencido);
  }, [data]);

  // ── Después de registrar un pago, refrescar ────────────────────────────
  async function onPagoOk() {
    setPagoActivo(null);
    await cargar();
    addToast('Pago registrado', 'success');
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading && !data) {
    return <div className="p-8 text-center text-on-surface-variant">Cargando proyección…</div>;
  }
  if (!data) return null;

  const [year, month] = mes.split('-').map(Number);

  return (
    <div className="proyeccion-pagos p-4 sm:p-6 print:p-0">
      <Header
        mes={mes}
        nombreMes={NOMBRES_MES[month - 1]}
        ano={year}
        onPrev={() => cambiarMes(-1)}
        onNext={() => cambiarMes(1)}
        onHoy={irHoy}
        proveedores={proveedores}
        filtroProveedor={filtroProveedor}
        onFiltroProveedor={setFiltroProveedor}
        exportSlot={
          <ExportMenu
            size="sm"
            disabled={!data || data.facturas.length === 0}
            getConfig={(): ExportConfig => {
              const facturas = [...data.facturas].sort((a, b) =>
                a.fechaPago.localeCompare(b.fechaPago));
              const totalSaldo = facturas.reduce((s, f) => s + f.saldo, 0);
              return {
                title: 'Proyección de pagos',
                subtitle: `${NOMBRES_MES[month - 1]} ${year} · ${data.facturas.length} facturas pendientes`,
                filename: `proyeccion-pagos-${mes}`,
                headers: ['Vence', 'Proveedor', 'Comprobante', 'Estado', 'Total', 'Pagado', 'Saldo', 'Días venc.'],
                rows: facturas.map(f => [
                  f.fechaPago + (f.fechaPagoInferida ? ' (est.)' : ''),
                  f.proveedorNombre,
                  `${f.tipoComprobante} ${f.numero}`,
                  f.estado,
                  f.total,
                  f.pagado,
                  f.saldo,
                  f.diasVencido > 0 ? `${f.diasVencido} vencido` : '—',
                ]),
                totalRow: ['', '', '', 'TOTAL', '', '', totalSaldo, ''],
                summary: [
                  { label: 'A pagar (mes)', value: `$${data.resumen.totalMes.toLocaleString('es-AR')}` },
                  { label: 'Vencido', value: `$${data.resumen.totalVencido.toLocaleString('es-AR')}` },
                  { label: 'Facturas', value: data.facturas.length },
                  { label: 'Días con pagos', value: data.resumen.diasConPagos },
                ],
                currencyColumns: [4, 5, 6],
              };
            }}
          />
        }
      />

      {/* Stats hero */}
      <StatsHero
        data={data}
        onClickVencido={() => {
          // Scroll a la sección de vencidas
          setDiaSeleccionado(null);
          setTimeout(() => {
            document.getElementById('seccion-vencidas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }}
        onClickProximo={() => {
          const fecha = data.resumen.proximos3[0]?.fechaPago;
          if (!fecha) return;
          const m = fecha.slice(0, 7);
          if (m !== mes) setMes(m);
          setDiaSeleccionado(fecha);
        }}
        onClickDiasMes={() => setVistaListaCompleta(true)}
      />

      {/* Alerta concentración */}
      {data.alertaConcentracion && (
        <button
          onClick={() => setDiaSeleccionado(data.alertaConcentracion!.fecha)}
          className="w-full mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left hover:bg-amber-500/15 transition-colors print:hidden"
        >
          <Sparkles className="text-amber-500 shrink-0" size={20} />
          <div className="flex-1">
            <div className="text-sm font-bold text-amber-600">
              ⚠ Pico de pagos: el {fmtDay(data.alertaConcentracion.fecha)} concentra el{' '}
              {data.alertaConcentracion.pct}% del cash del mes
            </div>
            <div className="text-[11px] text-on-surface-variant">
              {fmt(data.alertaConcentracion.total)} en un solo día. Hacé caja extra ese día.
            </div>
          </div>
          <ChevronRight size={16} className="text-amber-500" />
        </button>
      )}

      {/* Layout principal: calendario + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 mb-4">
        {/* Calendario */}
        <div className="lg:col-span-5 print:col-span-7">
          {/* Desktop calendar */}
          <div className="hidden sm:block">
            <Calendario
              year={year}
              month={month}
              hoy={data.mesActual.hoy}
              ultimoDia={data.mesActual.ultimoDia}
              porDiaMap={porDiaMap}
              diaSeleccionado={diaSeleccionado}
              onSeleccionar={setDiaSeleccionado}
            />
          </div>
          {/* Mobile agenda */}
          <div className="sm:hidden">
            <Agenda
              data={data}
              onSeleccionarFactura={f => setPagoActivo(f)}
              onVerFactura={id => setDetalleFacturaId(id)}
              hoy={data.mesActual.hoy}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-3 print:hidden">
          <CashFlowChart
            cashFlow30d={data.cashFlow30d}
            hoy={data.mesActual.hoy}
            onSeleccionarDia={(fecha) => {
              // Si la fecha cae en otro mes, navegar y seleccionar
              const m = fecha.slice(0, 7);
              if (m !== mes) setMes(m);
              setDiaSeleccionado(fecha);
            }}
          />
          <ProximosPagos proximos={data.resumen.proximos3} onVer={(id) => {
            const f = data.facturas.find(x => x.id === id);
            if (f) setDiaSeleccionado(f.fechaPago);
          }} />
        </div>
      </div>

      {/* Vencidas (siempre visible si hay) */}
      {vencidasTodas.length > 0 && (
        <div id="seccion-vencidas" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/5 overflow-hidden print:break-inside-avoid">
          <div className="px-4 py-3 border-b border-rose-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-500" />
              <span className="text-sm font-bold text-rose-500">
                Vencidas sin pagar — {vencidasTodas.length} {vencidasTodas.length === 1 ? 'factura' : 'facturas'}
              </span>
            </div>
            <span className="text-sm font-bold text-rose-500 tabular-nums">{fmt(data.resumen.totalVencido)}</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {vencidasTodas.slice(0, 30).map(f => (
              <FacturaRow
                key={f.id}
                factura={f}
                onPagar={() => setPagoActivo(f)}
                onVer={() => setDetalleFacturaId(f.id)}
                vencida
              />
            ))}
          </div>
        </div>
      )}

      {/* Facturas del día seleccionado */}
      {diaSeleccionado && (
        <div className="rounded-xl border border-border/60 bg-surface overflow-hidden print:break-before-page">
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm font-bold">
                Pagos del día seleccionado <span className="text-on-surface-variant font-normal">·</span>{' '}
                <span className="text-primary">{fmtDay(diaSeleccionado)}</span>
              </div>
              <div className="text-[11px] text-on-surface-variant">
                {facturasDia.length} {facturasDia.length === 1 ? 'factura' : 'facturas'}
                {' · '}total {fmt(facturasDia.reduce((s, f) => s + f.saldo, 0))}
              </div>
            </div>
            <button
              onClick={() => setDiaSeleccionado(null)}
              className="text-[11px] text-primary hover:underline print:hidden"
            >
              Cerrar
            </button>
          </div>
          {facturasDia.length === 0 ? (
            <div className="text-center text-sm text-on-surface-variant py-8">
              Sin pagos programados para este día.
            </div>
          ) : (
            <div>
              {facturasDia.map(f => (
                <FacturaRow
                  key={f.id}
                  factura={f}
                  onPagar={() => setPagoActivo(f)}
                  onVer={() => setDetalleFacturaId(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de pago */}
      {pagoActivo && user && (
        <ModalPago
          factura={pagoActivo}
          operadorId={user.id}
          onClose={() => setPagoActivo(null)}
          onOk={onPagoOk}
        />
      )}

      {/* Modal detalle de factura — interactivo: ver items, pagos, imagen */}
      {detalleFacturaId && (
        <ModalDetalleFactura
          facturaId={detalleFacturaId}
          onClose={() => setDetalleFacturaId(null)}
          onPagar={(f) => {
            setDetalleFacturaId(null);
            // Buscar la versión de proyección para el modal de pago
            const enProyeccion = data.facturas.find(x => x.id === f.id);
            if (enProyeccion) setPagoActivo(enProyeccion);
          }}
          onPagoEliminado={cargar}
          onIrAFactura={(id) => navigate(`/facturas?id=${id}`)}
        />
      )}

      {/* Vista lista completa del mes */}
      {vistaListaCompleta && (
        <ModalListaMes
          facturas={data.facturas.filter(f => f.fechaPago >= data.mesActual.inicioMes && f.fechaPago <= data.mesActual.finMes)}
          mes={mes}
          onClose={() => setVistaListaCompleta(false)}
          onVer={(id) => { setVistaListaCompleta(false); setDetalleFacturaId(id); }}
          onPagar={(f) => { setVistaListaCompleta(false); setPagoActivo(f); }}
        />
      )}

      {/* Print-only styles inline */}
      <style>{`
        @media print {
          .proyeccion-pagos { color: #000; background: #fff; }
          .proyeccion-pagos button { color: inherit !important; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Header — título + nav meses + filtros + imprimir
// ============================================================================
function Header({
  nombreMes, ano, onPrev, onNext, onHoy,
  proveedores, filtroProveedor, onFiltroProveedor, exportSlot,
}: {
  mes?: string; nombreMes: string; ano: number;
  onPrev: () => void; onNext: () => void; onHoy: () => void;
  proveedores: any[]; filtroProveedor: string; onFiltroProveedor: (v: string) => void;
  exportSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Contabilidad</p>
        <h1 className="text-2xl font-extrabold text-foreground mt-0.5">Proyección de pagos</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Visualizá y administrá los pagos programados por día.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        {proveedores.length > 0 && (
          <div className="relative">
            <Filter size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <select
              value={filtroProveedor}
              onChange={e => onFiltroProveedor(e.target.value)}
              className="pl-7 pr-2 py-1.5 text-xs rounded-lg bg-surface border border-border/60 focus:outline-none focus:border-primary/50"
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        )}
        {exportSlot}
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 text-xs rounded-lg bg-surface border border-border/60 hover:border-primary/60 flex items-center gap-1.5"
        >
          <Printer size={14} /> Imprimir
        </button>
        <div className="flex items-center rounded-lg border border-border/60 bg-surface overflow-hidden">
          <button onClick={onPrev} className="p-2 hover:bg-surface-high">
            <ChevronLeft size={16} />
          </button>
          <button onClick={onHoy} className="px-3 py-2 text-xs font-bold border-x border-border/60 hover:bg-surface-high">
            Hoy
          </button>
          <button onClick={onNext} className="p-2 hover:bg-surface-high">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="text-sm font-bold tabular-nums">{nombreMes} {ano}</div>
      </div>
    </div>
  );
}

// ============================================================================
// StatsHero — 4 cards con totales
// ============================================================================
function StatsHero({
  data, onClickVencido, onClickProximo, onClickDiasMes,
}: {
  data: Proyeccion;
  onClickVencido: () => void;
  onClickProximo: () => void;
  onClickDiasMes: () => void;
}) {
  const r = data.resumen;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 print:break-inside-avoid">
      <button onClick={onClickDiasMes} className="text-left group" title="Ver lista completa del mes">
        <Card
          accent="text-primary"
          bg="bg-primary/5 border-primary/30 group-hover:border-primary/60 transition-colors"
          icon={<Wallet size={16} />}
          label="Total a pagar (mes)"
          value={fmt(r.totalMes)}
          sub={`${r.cantFacturasMes} ${r.cantFacturasMes === 1 ? 'factura' : 'facturas'} →`}
        />
      </button>
      <button onClick={onClickVencido} className="text-left group" title="Ver vencidas sin pagar">
        <Card
          accent={r.totalVencido > 0 ? 'text-rose-500' : 'text-emerald-500'}
          bg={`${r.totalVencido > 0 ? 'bg-rose-500/5 border-rose-500/30 group-hover:border-rose-500/60' : 'bg-emerald-500/5 border-emerald-500/30 group-hover:border-emerald-500/60'} transition-colors`}
          icon={<AlertTriangle size={16} />}
          label="Vencidas sin pagar"
          value={fmt(r.totalVencido)}
          sub={r.cantVencidas > 0 ? `${r.cantVencidas} ${r.cantVencidas === 1 ? 'factura' : 'facturas'} →` : 'Al día ✓'}
        />
      </button>
      <button onClick={onClickDiasMes} className="text-left group" title="Ver lista completa del mes">
        <Card
          accent="text-foreground"
          bg="bg-surface border-border/60 group-hover:border-primary/40 transition-colors"
          icon={<Calendar size={16} />}
          label="Días con pagos"
          value={String(r.diasConPagos)}
          sub={`${r.diasSinPagos} sin pagos →`}
        />
      </button>
      <button onClick={onClickProximo} disabled={!r.proximos3[0]} className="text-left group disabled:cursor-default" title="Ir al próximo día">
        <Card
          accent="text-foreground"
          bg={`bg-surface border-border/60 ${r.proximos3[0] ? 'group-hover:border-primary/40' : ''} transition-colors`}
          icon={<Clock size={16} />}
          label="Próximo vencimiento"
          value={r.proximos3[0] ? fmtDay(r.proximos3[0].fechaPago) : '—'}
          sub={r.proximos3[0] ? `${fmt(r.proximos3[0].saldo)} →` : 'Sin próximos'}
        />
      </button>
    </div>
  );
}

function Card({
  icon, label, value, sub, accent, bg,
}: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string; bg: string }) {
  return (
    <div className={`w-full rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        {icon} {label}
      </div>
      <div className={`text-xl sm:text-2xl font-extrabold mt-1 ${accent}`}>{value}</div>
      <div className="text-[11px] text-on-surface-variant mt-0.5">{sub}</div>
    </div>
  );
}

// ============================================================================
// Calendario mensual (desktop)
// ============================================================================
function Calendario({
  year, month, hoy, ultimoDia, porDiaMap, diaSeleccionado, onSeleccionar,
}: {
  year: number; month: number; hoy: string; ultimoDia: number;
  porDiaMap: Map<string, { total: number; cantidad: number }>;
  diaSeleccionado: string | null; onSeleccionar: (fecha: string) => void;
}) {
  const primerDiaSemana = new Date(year, month - 1, 1).getDay(); // 0=Dom
  const celdas: Array<{ dia: number | null; fecha: string | null }> = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push({ dia: null, fecha: null });
  for (let d = 1; d <= ultimoDia; d++) {
    const fecha = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    celdas.push({ dia: d, fecha });
  }
  while (celdas.length % 7 !== 0) celdas.push({ dia: null, fecha: null });

  return (
    <div className="rounded-xl border border-border/60 bg-surface overflow-hidden">
      {/* Header días semana */}
      <div className="grid grid-cols-7 bg-surface-high">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-on-surface-variant py-2">
            {d}
          </div>
        ))}
      </div>
      {/* Celdas */}
      <div className="grid grid-cols-7">
        {celdas.map((c, i) => {
          if (!c.fecha) return <div key={i} className="h-20 sm:h-24 border-t border-l border-border/40 bg-surface/40" />;
          const info = porDiaMap.get(c.fecha);
          const esHoy = c.fecha === hoy;
          const esSeleccionado = c.fecha === diaSeleccionado;
          const esPasado = c.fecha < hoy;
          const tienePagos = !!info && info.total > 0;
          const enRiesgo = tienePagos && esPasado;
          const proximo7 = tienePagos && !esPasado && diasEntre(hoy, c.fecha) <= 7;

          let bg = 'bg-surface';
          let textColor = '';
          if (esSeleccionado) bg = 'bg-primary/15';
          else if (enRiesgo) bg = 'bg-rose-500/10';
          else if (proximo7 && tienePagos) bg = 'bg-amber-500/8';

          if (enRiesgo) textColor = 'text-rose-500';
          else if (proximo7 && tienePagos) textColor = 'text-amber-500';
          else if (tienePagos) textColor = 'text-primary';

          return (
            <button
              key={i}
              onClick={() => onSeleccionar(c.fecha!)}
              className={`h-20 sm:h-24 border-t border-l border-border/40 p-1.5 sm:p-2 text-left transition-colors hover:bg-primary/5 ${bg} ${
                esSeleccionado ? 'ring-2 ring-primary ring-inset' : ''
              }`}
            >
              <div className={`text-[11px] sm:text-xs font-bold flex items-center gap-1 ${esHoy ? 'text-primary' : ''}`}>
                {c.dia}
                {esHoy && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </div>
              {tienePagos && (
                <div className={`mt-1 ${textColor}`}>
                  <div className="text-[11px] sm:text-xs font-bold tabular-nums leading-tight">
                    {fmt(info!.total)}
                  </div>
                  <div className="text-[9px] sm:text-[10px] opacity-70">
                    {info!.cantidad} {info!.cantidad === 1 ? 'fac.' : 'fac.'}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Agenda (mobile) — lista cronológica
// ============================================================================
function Agenda({
  data, onSeleccionarFactura, onVerFactura, hoy,
}: { data: Proyeccion; onSeleccionarFactura: (f: Factura) => void; onVerFactura: (id: number) => void; hoy: string }) {
  // Agrupar facturas por fecha
  const grupos = useMemo(() => {
    const m = new Map<string, Factura[]>();
    for (const f of data.facturas) {
      const arr = m.get(f.fechaPago) || [];
      arr.push(f);
      m.set(f.fechaPago, arr);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, facs]) => ({ fecha, facturas: facs.sort((a, b) => b.saldo - a.saldo) }));
  }, [data.facturas]);

  return (
    <div className="space-y-3">
      {grupos.length === 0 && (
        <div className="text-center text-sm text-on-surface-variant py-12">
          No hay pagos programados.
        </div>
      )}
      {grupos.map(g => {
        const total = g.facturas.reduce((s, f) => s + f.saldo, 0);
        const vencido = g.fecha < hoy;
        const esHoy = g.fecha === hoy;
        return (
          <div key={g.fecha} className={`rounded-xl border overflow-hidden ${
            vencido ? 'border-rose-500/40 bg-rose-500/5'
              : esHoy ? 'border-primary/40 bg-primary/5'
              : 'border-border/60 bg-surface'
          }`}>
            <div className="px-3 py-2 flex items-center justify-between border-b border-border/40">
              <div className="text-sm font-bold capitalize">
                {fmtDay(g.fecha)}
                {esHoy && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-extrabold uppercase">Hoy</span>}
                {vencido && <span className="ml-2 text-[10px] bg-rose-500/20 text-rose-500 px-1.5 py-0.5 rounded font-extrabold uppercase">Vencido</span>}
              </div>
              <div className="text-sm font-bold tabular-nums">{fmt(total)}</div>
            </div>
            <div>
              {g.facturas.map(f => (
                <FacturaRow
                  key={f.id}
                  factura={f}
                  onPagar={() => onSeleccionarFactura(f)}
                  onVer={() => onVerFactura(f.id)}
                  vencida={vencido}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// CashFlowChart — barras 30 días
// ============================================================================
function CashFlowChart({
  cashFlow30d, hoy, onSeleccionarDia,
}: {
  cashFlow30d: Array<{ fecha: string; total: number }>;
  hoy: string;
  onSeleccionarDia: (fecha: string) => void;
}) {
  const max = Math.max(...cashFlow30d.map(c => c.total), 1);
  const total = cashFlow30d.reduce((s, c) => s + c.total, 0);
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={14} className="text-primary" />
        <div className="text-sm font-bold">Próximos 30 días</div>
      </div>
      <div className="text-2xl font-extrabold text-primary mb-2">{fmt(total)}</div>
      <div className="h-20 flex items-end gap-[1.5px] print:hidden">
        {cashFlow30d.map((c, i) => {
          const h = Math.max((c.total / max) * 100, c.total > 0 ? 4 : 0);
          const isHoy = c.fecha === hoy;
          const tienePagos = c.total > 0;
          return (
            <button
              key={i}
              onClick={() => tienePagos && onSeleccionarDia(c.fecha)}
              disabled={!tienePagos}
              className={`flex-1 rounded-t-sm transition-all ${
                tienePagos ? 'hover:opacity-80 hover:scale-y-110 origin-bottom cursor-pointer' : 'cursor-default'
              }`}
              style={{
                height: `${h}%`,
                backgroundColor: isHoy
                  ? 'rgb(var(--primary) / 1)'
                  : tienePagos
                  ? 'rgb(var(--primary) / 0.4)'
                  : 'rgb(var(--border) / 0.5)',
                minHeight: tienePagos ? '3px' : '0',
              }}
              title={tienePagos ? `${fmtDay(c.fecha)}: ${fmt(c.total)} — click para ver` : c.fecha}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-on-surface-variant mt-1">
        <span>Hoy</span>
        <span>+15d</span>
        <span>+30d</span>
      </div>
    </div>
  );
}

// ============================================================================
// ProximosPagos — top 3
// ============================================================================
function ProximosPagos({
  proximos, onVer,
}: {
  proximos: Array<{ id: number; proveedorNombre: string; fechaPago: string; saldo: number; codigo: string }>;
  onVer: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <Clock size={14} className="text-primary" />
        <div className="text-sm font-bold">Próximos pagos</div>
      </div>
      {proximos.length === 0 && (
        <div className="text-[11px] text-on-surface-variant py-2">No hay pagos próximos.</div>
      )}
      <div className="space-y-1">
        {proximos.map(p => (
          <button
            key={p.id}
            onClick={() => onVer(p.id)}
            className="w-full text-left rounded-lg p-2 hover:bg-surface-high transition-colors flex items-center gap-2"
          >
            <div className="w-1.5 h-8 rounded-full bg-primary/40" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{p.proveedorNombre}</div>
              <div className="text-[10px] text-on-surface-variant capitalize">{fmtDay(p.fechaPago)}</div>
            </div>
            <div className="text-xs font-bold text-primary tabular-nums">{fmt(p.saldo)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// FacturaRow — fila de factura (en lista de día o en vencidas)
// ============================================================================
function FacturaRow({
  factura, onPagar, onVer, vencida = false,
}: { factura: Factura; onPagar: () => void; onVer: () => void; vencida?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onVer}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onVer()}
      className="px-4 py-2.5 border-b border-border/30 last:border-0 flex items-center gap-3 hover:bg-surface-high/70 active:bg-surface-high transition-colors cursor-pointer group"
      title="Click para ver detalle de la factura"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate flex items-center gap-1.5">
          {factura.proveedorNombre}
          <Eye size={12} className="opacity-0 group-hover:opacity-60 transition-opacity text-on-surface-variant" />
        </div>
        <div className="text-[11px] text-on-surface-variant flex items-center gap-2 flex-wrap">
          <span>{factura.tipoComprobante} {factura.numero}</span>
          {factura.fechaPagoInferida && (
            <span title="Fecha estimada (sin vencimiento explícito)" className="text-[9px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase">
              estimado
            </span>
          )}
          {vencida && factura.diasVencido > 0 && (
            <span className="text-[9px] bg-rose-500/15 text-rose-500 px-1.5 py-0.5 rounded font-bold uppercase">
              {factura.diasVencido}d vencido
            </span>
          )}
          {factura.estado === 'parcial' && (
            <span className="text-[9px] bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase">parcial</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold tabular-nums text-primary">{fmt(factura.saldo)}</div>
        {factura.pagado > 0 && (
          <div className="text-[10px] text-on-surface-variant">
            de {fmt(factura.total)}
          </div>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onPagar(); }}
        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-primary text-on-primary hover:bg-primary/90 print:hidden"
      >
        Pagar
      </button>
    </div>
  );
}

// ============================================================================
// ModalPago — registrar pago contra factura
// ============================================================================
function ModalPago({
  factura, operadorId, onClose, onOk,
}: { factura: Factura; operadorId: number; onClose: () => void; onOk: () => void }) {
  const { addToast } = useToast();
  const [monto, setMonto] = useState(String(factura.saldo.toFixed(2)));
  const [medio, setMedio] = useState('transferencia');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const m = parseFloat(monto);
    if (!isFinite(m) || m <= 0) {
      addToast('Monto inválido', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.crearPagoFactura(factura.id, {
        fecha,
        monto: m,
        medioPago: medio,
        referencia: referencia || undefined,
        observacion: observacion || undefined,
        creadoPorId: operadorId,
      });
      onOk();
    } catch (e: any) {
      addToast(e?.message || 'Error registrando pago', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const totalPagado = factura.pagado + (parseFloat(monto) || 0);
  const seraTotal = totalPagado >= factura.total - 0.001;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-primary rounded-2xl border border-border/60 w-full sm:max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-base font-bold">Registrar pago</div>
            <div className="text-xs text-on-surface-variant mt-0.5">
              {factura.proveedorNombre} · {factura.tipoComprobante} {factura.numero}
            </div>
          </div>
          <button onClick={onClose} className="p-1 -m-1"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
          <div className="rounded bg-surface p-2">
            <div className="text-[10px] uppercase text-on-surface-variant">Total</div>
            <div className="font-bold">{fmt(factura.total)}</div>
          </div>
          <div className="rounded bg-surface p-2">
            <div className="text-[10px] uppercase text-on-surface-variant">Pagado</div>
            <div className="font-bold">{fmt(factura.pagado)}</div>
          </div>
          <div className="rounded bg-primary/5 border border-primary/30 p-2">
            <div className="text-[10px] uppercase text-on-surface-variant">Saldo</div>
            <div className="font-bold text-primary">{fmt(factura.saldo)}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Monto a pagar
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
              <input
                type="number"
                step="0.01"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-surface-high border-0 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setMonto(String(factura.saldo.toFixed(2)))}
                className="text-[10px] px-2 py-1 rounded bg-surface border border-border/60 hover:border-primary/60"
              >
                Total saldo ({fmt(factura.saldo)})
              </button>
              <button
                type="button"
                onClick={() => setMonto(String((factura.saldo / 2).toFixed(2)))}
                className="text-[10px] px-2 py-1 rounded bg-surface border border-border/60 hover:border-primary/60"
              >
                50%
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Medio
              </label>
              <select
                value={medio}
                onChange={e => setMedio(e.target.value)}
                className="w-full mt-1 px-2 py-2 rounded-lg bg-surface-high border-0 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full mt-1 px-2 py-2 rounded-lg bg-surface-high border-0 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Referencia (opcional)
            </label>
            <input
              type="text"
              placeholder="Nº de transferencia, cheque…"
              value={referencia}
              onChange={e => setReferencia(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-high border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Observación (opcional)
            </label>
            <textarea
              rows={2}
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-high border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {seraTotal && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-500 font-bold">
            <Check size={14} /> Esta factura quedará marcada como pagada
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Confirmar pago'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg bg-surface border border-border/60 text-sm font-bold"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ModalDetalleFactura — vista interactiva completa de la factura
// ============================================================================
function ModalDetalleFactura({
  facturaId, onClose, onPagar, onPagoEliminado, onIrAFactura,
}: {
  facturaId: number;
  onClose: () => void;
  onPagar: (f: { id: number }) => void;
  onPagoEliminado: () => void;
  onIrAFactura: (id: number) => void;
}) {
  const { addToast } = useToast();
  const [factura, setFactura] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verImagen, setVerImagen] = useState(false);
  const [eliminandoPagoId, setEliminandoPagoId] = useState<number | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const f = await api.getFactura(facturaId);
      setFactura(f);
    } catch (e: any) {
      addToast(e?.message || 'Error cargando factura', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [facturaId]);

  async function eliminarPago(pagoId: number, monto: number) {
    if (!confirm(`¿Eliminar el pago de ${fmt(monto)}? Esta acción no se puede deshacer.`)) return;
    setEliminandoPagoId(pagoId);
    try {
      await api.eliminarPago(pagoId);
      addToast('Pago eliminado', 'success');
      await cargar();
      onPagoEliminado();
    } catch (e: any) {
      addToast(e?.message || 'No se pudo eliminar', 'error');
    } finally {
      setEliminandoPagoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto print:hidden" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-t-2xl sm:rounded-2xl border border-border/60 w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className="sticky top-0 bg-bg-primary border-b border-border/60 px-4 sm:px-5 py-3 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
              <FileText size={11} /> Factura
            </div>
            <div className="text-base font-extrabold mt-0.5 truncate">
              {loading ? 'Cargando…' : factura?.proveedor?.nombre || '—'}
            </div>
            {!loading && factura && (
              <div className="text-[11px] text-on-surface-variant truncate">
                {factura.tipoComprobante} {factura.numero} · {factura.codigo}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 -m-1 hover:bg-surface rounded shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="p-12 text-center text-sm text-on-surface-variant">Cargando factura…</div>
        )}

        {!loading && factura && (
          <div className="p-4 sm:p-5 space-y-5">
            {/* Banda de totales — clickeable para registrar pago */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-surface border border-border/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Total factura</div>
                <div className="text-lg font-extrabold">{fmt(factura.total)}</div>
              </div>
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Pagado</div>
                <div className="text-lg font-extrabold text-emerald-500">{fmt(factura.totalPagado)}</div>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/30 p-3">
                <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">Saldo</div>
                <div className="text-lg font-extrabold text-primary">{fmt(factura.saldoPendiente)}</div>
              </div>
            </div>

            {/* Acciones rápidas */}
            <div className="flex gap-2 flex-wrap">
              {factura.saldoPendiente > 0.001 && (
                <button
                  onClick={() => onPagar({ id: factura.id })}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90"
                >
                  <CreditCard size={14} /> Registrar pago
                </button>
              )}
              {factura.saldoPendiente <= 0.001 && (
                <div className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-500 text-sm font-bold flex items-center justify-center gap-2">
                  <Check size={14} /> Factura pagada
                </div>
              )}
              <button
                onClick={() => onIrAFactura(factura.id)}
                className="px-3 py-2.5 rounded-lg bg-surface border border-border/60 hover:border-primary/60 text-sm font-bold flex items-center gap-2"
                title="Abrir factura completa"
              >
                <ExternalLink size={14} /> Ir a factura
              </button>
              {factura.imagenBase64 && (
                <button
                  onClick={() => setVerImagen(v => !v)}
                  className="px-3 py-2.5 rounded-lg bg-surface border border-border/60 hover:border-primary/60 text-sm font-bold flex items-center gap-2"
                >
                  <ImageIcon size={14} /> {verImagen ? 'Ocultar' : 'Ver'} imagen
                </button>
              )}
            </div>

            {/* Imagen escaneada (toggle) */}
            {verImagen && factura.imagenBase64 && (
              <div className="rounded-lg overflow-hidden border border-border/60 bg-surface">
                <img
                  src={factura.imagenBase64.startsWith('data:') ? factura.imagenBase64 : `data:image/jpeg;base64,${factura.imagenBase64}`}
                  alt="Factura escaneada"
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Datos básicos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Info label="Fecha emisión" value={factura.fecha} />
              <Info
                label="Vencimiento"
                value={factura.fechaVencimiento || '—'}
                accent={factura.fechaVencimiento ? undefined : 'text-amber-500'}
              />
              <Info
                label="Estado"
                value={factura.estado}
                accent={
                  factura.estado === 'pagada' ? 'text-emerald-500' :
                  factura.estado === 'parcial' ? 'text-amber-500' :
                  factura.estado === 'pendiente' ? 'text-primary' : 'text-rose-500'
                }
              />
              <Info label="Cargada por" value={factura.creadoPor?.nombre || '—'} />
            </div>

            {/* Items de la factura */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} className="text-primary" />
                <div className="text-sm font-bold">
                  Items ({factura.items?.length || 0})
                </div>
              </div>
              {factura.items?.length > 0 ? (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="divide-y divide-border/30">
                    {factura.items.map((it: any) => (
                      <div key={it.id} className="px-3 py-2 flex items-center gap-3 hover:bg-surface-high/50 transition-colors text-xs">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{it.producto?.nombre || it.descripcion}</div>
                          {it.producto && (
                            <div className="text-[10px] text-on-surface-variant font-mono">{it.producto.codigo}</div>
                          )}
                        </div>
                        <div className="text-on-surface-variant w-20 text-right tabular-nums">
                          {it.cantidad} {it.unidad}
                        </div>
                        <div className="text-on-surface-variant w-20 text-right tabular-nums">
                          {fmt(it.precioUnitario)}
                        </div>
                        <div className="font-bold w-24 text-right tabular-nums text-primary">
                          {fmt(it.subtotal)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-on-surface-variant py-2">Sin items detallados.</div>
              )}
              {/* Totales factura */}
              <div className="flex justify-end gap-6 mt-2 text-xs">
                <div className="text-on-surface-variant">
                  Subtotal: <span className="font-bold text-foreground tabular-nums">{fmt(factura.subtotal)}</span>
                </div>
                <div className="text-on-surface-variant">
                  IVA: <span className="font-bold text-foreground tabular-nums">{fmt(factura.iva)}</span>
                </div>
                {factura.otrosImpuestos > 0 && (
                  <div className="text-on-surface-variant">
                    Otros: <span className="font-bold text-foreground tabular-nums">{fmt(factura.otrosImpuestos)}</span>
                  </div>
                )}
                <div className="text-foreground font-extrabold">
                  Total: <span className="text-primary tabular-nums">{fmt(factura.total)}</span>
                </div>
              </div>
            </div>

            {/* Historial de pagos */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Receipt size={14} className="text-primary" />
                <div className="text-sm font-bold">
                  Historial de pagos ({factura.pagos?.length || 0})
                </div>
              </div>
              {factura.pagos?.length > 0 ? (
                <div className="rounded-lg border border-border/60 overflow-hidden">
                  <div className="divide-y divide-border/30">
                    {factura.pagos.map((p: any) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <div className="w-1.5 h-8 rounded-full bg-emerald-500/40 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold flex items-center gap-2">
                            <span className="capitalize">{p.medioPago}</span>
                            {p.referencia && (
                              <span className="text-[10px] font-mono text-on-surface-variant truncate">
                                ref: {p.referencia}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-on-surface-variant">
                            {p.fecha} · {p.creadoPor?.nombre || '—'}
                            {p.observacion && <> · {p.observacion}</>}
                          </div>
                        </div>
                        <div className="font-bold tabular-nums text-emerald-500">
                          {fmt(p.monto)}
                        </div>
                        <button
                          onClick={() => eliminarPago(p.id, p.monto)}
                          disabled={eliminandoPagoId === p.id}
                          className="p-1.5 rounded hover:bg-rose-500/10 text-rose-500 disabled:opacity-50"
                          title="Eliminar pago"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-on-surface-variant py-2">
                  Esta factura no tiene pagos registrados todavía.
                </div>
              )}
            </div>

            {/* Observaciones */}
            {factura.observacion && (
              <div className="rounded-lg bg-surface border border-border/60 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                  Observación
                </div>
                <div className="text-xs">{factura.observacion}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border/40 p-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</div>
      <div className={`text-xs font-bold capitalize mt-0.5 ${accent || ''}`}>{value}</div>
    </div>
  );
}

// ============================================================================
// ModalListaMes — vista lista completa del mes con todas las facturas
// ============================================================================
function ModalListaMes({
  facturas, mes, onClose, onVer, onPagar,
}: {
  facturas: Factura[];
  mes: string;
  onClose: () => void;
  onVer: (id: number) => void;
  onPagar: (f: Factura) => void;
}) {
  const [yearStr, monthStr] = mes.split('-');
  const nombreMes = NOMBRES_MES[parseInt(monthStr) - 1];

  // Agrupar por día
  const porDia = useMemo(() => {
    const m = new Map<string, Factura[]>();
    for (const f of facturas) {
      const arr = m.get(f.fechaPago) || [];
      arr.push(f);
      m.set(f.fechaPago, arr);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, facs]) => ({ fecha, facturas: facs.sort((a, b) => b.saldo - a.saldo) }));
  }, [facturas]);

  const total = facturas.reduce((s, f) => s + f.saldo, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto print:hidden" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-t-2xl sm:rounded-2xl border border-border/60 w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-bg-primary border-b border-border/60 px-4 sm:px-5 py-3 flex items-start justify-between gap-3 z-10">
          <div>
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Lista completa del mes
            </div>
            <div className="text-base font-extrabold mt-0.5">
              {nombreMes} {yearStr}
            </div>
            <div className="text-[11px] text-on-surface-variant">
              {facturas.length} {facturas.length === 1 ? 'factura' : 'facturas'} · total {fmt(total)}
            </div>
          </div>
          <button onClick={onClose} className="p-1 -m-1 hover:bg-surface rounded">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3">
          {porDia.length === 0 && (
            <div className="text-center text-sm text-on-surface-variant py-12">
              Sin facturas en este mes.
            </div>
          )}
          {porDia.map(g => {
            const totalDia = g.facturas.reduce((s, f) => s + f.saldo, 0);
            return (
              <div key={g.fecha} className="rounded-lg border border-border/60 overflow-hidden">
                <div className="px-3 py-2 bg-surface-high/40 border-b border-border/30 flex items-center justify-between">
                  <div className="text-xs font-bold capitalize">{fmtDay(g.fecha)}</div>
                  <div className="text-xs text-on-surface-variant">
                    {g.facturas.length} · <span className="font-bold text-primary tabular-nums">{fmt(totalDia)}</span>
                  </div>
                </div>
                <div>
                  {g.facturas.map(f => (
                    <FacturaRow
                      key={f.id}
                      factura={f}
                      onVer={() => onVer(f.id)}
                      onPagar={() => onPagar(f)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
