import { useEffect, useMemo, useState } from 'react';
import { api, type AlertaPrecio, type AlertaPrecioHistorialItem } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import TabBar from '../components/ui/TabBar';
import {
  TrendingUp, TrendingDown, AlertTriangle, Check, X as XIcon,
  RefreshCw, Eye, FileText, History, Flame, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

// ============================================================================
// ALERTAS DE PRECIO — bandeja de variaciones
// ============================================================================
// Surfacea las variaciones de precio que el backend detectó al confirmar
// facturas. El cliente pidió: "cuando cargue una factura, que me compare
// con el precio anterior y me lo refleje en algún lugar" — este es ese
// "algún lugar".
//
// Estructura:
//   - Tabs por estado (pendientes / revisadas / descartadas)
//   - Tarjetas de resumen arriba (total, subas, bajas, severidad alta)
//   - Tabla con filtros rápidos por severidad
//   - Click en fila → modal con historial de precios del producto × proveedor
//   - Acciones: revisar (✓) y descartar (✗)
//   - Bulk: checkbox en header para marcar múltiples como revisadas a la vez
// ============================================================================

type EstadoTab = 'pendiente' | 'revisada' | 'descartada';

const SEVERIDAD_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  leve:  { bg: 'bg-surface-high',        text: 'text-on-surface-variant', border: 'border-border',               label: 'Leve'  },
  media: { bg: 'bg-warning/10',          text: 'text-warning',            border: 'border-warning/30',           label: 'Media' },
  alta:  { bg: 'bg-destructive/10',      text: 'text-destructive',        border: 'border-destructive/30',       label: 'Alta'  },
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtDateRel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays}d`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)}sem`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function AlertasPrecioPage() {
  const { user, tienePermiso } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<EstadoTab>('pendiente');
  const [alertas, setAlertas] = useState<AlertaPrecio[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroSeveridad, setFiltroSeveridad] = useState<'' | 'leve' | 'media' | 'alta'>('');
  const [filtroDireccion, setFiltroDireccion] = useState<'' | 'sube' | 'baja'>('');
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());

  // Modal detalle
  const [detalle, setDetalle] = useState<AlertaPrecio | null>(null);
  const [historial, setHistorial] = useState<AlertaPrecioHistorialItem[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [accionando, setAccionando] = useState(false);

  // Resumen (stats top)
  const [resumen, setResumen] = useState<{
    porEstado: Record<string, number>;
    porSeveridad: Record<string, number>;
    porDireccion: Record<string, number>;
  } | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { estado: tab };
      if (filtroSeveridad) params.severidad = filtroSeveridad;
      if (filtroDireccion) params.direccion = filtroDireccion;
      const data = await api.getAlertasPrecio(params);
      setAlertas(data.alertas);
    } catch (err: any) {
      addToast(err?.message || 'Error al cargar alertas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cargarResumen = async () => {
    try {
      const data = await api.getAlertasPrecioResumen();
      setResumen({
        porEstado: data.porEstado,
        porSeveridad: data.porSeveridad,
        porDireccion: data.porDireccion,
      });
    } catch {}
  };

  useEffect(() => {
    cargar();
    setSeleccionados(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroSeveridad, filtroDireccion]);

  useEffect(() => {
    cargarResumen();
  }, []);

  const abrirDetalle = async (alerta: AlertaPrecio) => {
    setDetalle(alerta);
    setObservacion(alerta.observacion || '');
    setCargandoDetalle(true);
    try {
      const data = await api.getAlertaPrecio(alerta.id);
      setDetalle(data.alerta);
      setHistorial(data.historial);
    } catch (err: any) {
      addToast(err?.message || 'Error al cargar detalle', 'error');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const cerrarDetalle = () => {
    setDetalle(null);
    setHistorial([]);
    setObservacion('');
  };

  const revisarAlerta = async () => {
    if (!detalle) return;
    setAccionando(true);
    try {
      await api.revisarAlertaPrecio(detalle.id, observacion || undefined);
      addToast('Alerta marcada como revisada', 'success');
      cerrarDetalle();
      await Promise.all([cargar(), cargarResumen()]);
    } catch (err: any) {
      addToast(err?.message || 'Error al revisar alerta', 'error');
    } finally {
      setAccionando(false);
    }
  };

  const descartarAlerta = async () => {
    if (!detalle) return;
    if (!confirm('Descartar esta alerta? Se usa cuando el precio está mal cargado o fue un error del OCR.')) return;
    setAccionando(true);
    try {
      await api.descartarAlertaPrecio(detalle.id, observacion || undefined);
      addToast('Alerta descartada', 'info');
      cerrarDetalle();
      await Promise.all([cargar(), cargarResumen()]);
    } catch (err: any) {
      addToast(err?.message || 'Error al descartar alerta', 'error');
    } finally {
      setAccionando(false);
    }
  };

  const bulkRevisar = async () => {
    if (seleccionados.size === 0) return;
    if (!confirm(`Marcar ${seleccionados.size} alertas como revisadas?`)) return;
    try {
      const res = await api.bulkRevisarAlertasPrecio(Array.from(seleccionados));
      addToast(`${res.actualizadas} alertas revisadas`, 'success');
      setSeleccionados(new Set());
      await Promise.all([cargar(), cargarResumen()]);
    } catch (err: any) {
      addToast(err?.message || 'Error al revisar en bulk', 'error');
    }
  };

  const toggleSeleccionado = (id: number) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSeleccionarTodos = () => {
    if (seleccionados.size === alertas.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(alertas.map(a => a.id)));
    }
  };

  // Stats para las cards de arriba
  const stats = useMemo(() => {
    const pend = resumen?.porEstado?.pendiente ?? 0;
    const alta = resumen?.porSeveridad?.alta ?? 0;
    const subas = resumen?.porDireccion?.sube ?? 0;
    const bajas = resumen?.porDireccion?.baja ?? 0;
    return { pend, alta, subas, bajas };
  }, [resumen]);

  // ¿Permite este rol revisar alertas?
  const puedeRevisar = tienePermiso('contabilidad') || user?.rol === 'admin';

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle size={22} className="text-warning" />
            Alertas de precio
          </h1>
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Variaciones detectadas al cargar facturas — revisá las que subieron mucho antes de pagarlas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { cargar(); cargarResumen(); }} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* ── Stats cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pendientes"
          value={stats.pend}
          icon={<AlertTriangle size={18} />}
          variant="warning"
        />
        <StatCard
          label="Severidad alta"
          value={stats.alta}
          icon={<Flame size={18} />}
          variant="danger"
          accent
        />
        <StatCard
          label="Subieron"
          value={stats.subas}
          icon={<ArrowUpRight size={18} />}
          variant="danger"
        />
        <StatCard
          label="Bajaron"
          value={stats.bajas}
          icon={<ArrowDownRight size={18} />}
          variant="success"
        />
      </div>

      {/* ── Tabs de estado ─────────────────────────────────────────── */}
      <TabBar
        tabs={[
          { key: 'pendiente', label: `Pendientes ${stats.pend ? `(${stats.pend})` : ''}`.trim() },
          { key: 'revisada', label: 'Revisadas' },
          { key: 'descartada', label: 'Descartadas' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as EstadoTab)}
      />

      {/* ── Filtros + bulk ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-1">
          <button
            onClick={() => setFiltroSeveridad('')}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroSeveridad === '' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-foreground'}`}
          >
            Todas
          </button>
          {(['leve', 'media', 'alta'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroSeveridad(s)}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroSeveridad === s ? `${SEVERIDAD_STYLES[s].bg} ${SEVERIDAD_STYLES[s].text}` : 'text-on-surface-variant hover:text-foreground'}`}
            >
              {SEVERIDAD_STYLES[s].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-1">
          <button
            onClick={() => setFiltroDireccion('')}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroDireccion === '' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-foreground'}`}
          >
            Todas
          </button>
          <button
            onClick={() => setFiltroDireccion('sube')}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroDireccion === 'sube' ? 'bg-destructive/10 text-destructive' : 'text-on-surface-variant hover:text-foreground'}`}
          >
            <TrendingUp size={12} className="inline mr-1" /> Subas
          </button>
          <button
            onClick={() => setFiltroDireccion('baja')}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroDireccion === 'baja' ? 'bg-success/10 text-success' : 'text-on-surface-variant hover:text-foreground'}`}
          >
            <TrendingDown size={12} className="inline mr-1" /> Bajas
          </button>
        </div>

        {tab === 'pendiente' && seleccionados.size > 0 && puedeRevisar && (
          <Button variant="primary" onClick={bulkRevisar}>
            <Check size={14} />
            Revisar {seleccionados.size}
          </Button>
        )}
      </div>

      {/* ── Tabla / Cards ──────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading && alertas.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant font-medium">Cargando...</div>
        ) : alertas.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant font-medium">
            {tab === 'pendiente' ? 'No hay alertas pendientes de revisar. 🎯' : `No hay alertas ${tab}s.`}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-high/60">
                  <tr>
                    {tab === 'pendiente' && puedeRevisar && (
                      <th className="p-3 w-8">
                        <input
                          type="checkbox"
                          checked={seleccionados.size === alertas.length && alertas.length > 0}
                          onChange={toggleSeleccionarTodos}
                          className="accent-primary w-4 h-4"
                        />
                      </th>
                    )}
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Proveedor</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Anterior</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nuevo</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Variación</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Severidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Cuándo</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alertas.map(alerta => {
                    const sev = SEVERIDAD_STYLES[alerta.severidad];
                    const esSuba = alerta.direccion === 'sube';
                    return (
                      <tr
                        key={alerta.id}
                        className="hover:bg-surface-high/40 transition-colors cursor-pointer"
                        onClick={() => abrirDetalle(alerta)}
                      >
                        {tab === 'pendiente' && puedeRevisar && (
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={seleccionados.has(alerta.id)}
                              onChange={() => toggleSeleccionado(alerta.id)}
                              className="accent-primary w-4 h-4"
                            />
                          </td>
                        )}
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-foreground">{alerta.producto?.nombre ?? `#${alerta.productoId}`}</span>
                            <span className="text-[10px] font-mono text-on-surface-variant">{alerta.producto?.codigo}</span>
                          </div>
                        </td>
                        <td className="p-3 text-xs text-on-surface-variant font-medium">
                          {alerta.proveedor?.nombre ?? '—'}
                        </td>
                        <td className="p-3 text-right font-mono text-xs text-on-surface-variant">
                          {fmtMoney(alerta.precioAnterior)}
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-bold text-foreground">
                          {fmtMoney(alerta.precioNuevo)}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`inline-flex items-center gap-1 font-mono font-bold text-sm ${esSuba ? 'text-destructive' : 'text-success'}`}>
                            {esSuba ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {fmtPct(alerta.variacionPct)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text} ${sev.border}`}>
                            {sev.label}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-on-surface-variant font-medium hidden lg:table-cell">
                          {fmtDateRel(alerta.createdAt)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => abrirDetalle(alerta)}
                              className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors"
                              title="Ver detalle e historial"
                            >
                              <Eye size={14} />
                            </button>
                            {alerta.facturaId && (
                              <button
                                onClick={() => navigate(`/facturas?open=${alerta.facturaId}`)}
                                className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-primary transition-colors"
                                title="Ver factura"
                              >
                                <FileText size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {alertas.map(alerta => {
                const sev = SEVERIDAD_STYLES[alerta.severidad];
                const esSuba = alerta.direccion === 'sube';
                return (
                  <button
                    key={alerta.id}
                    onClick={() => abrirDetalle(alerta)}
                    className="w-full text-left p-4 hover:bg-surface-high/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{alerta.producto?.nombre}</p>
                        <p className="text-[10px] font-mono text-on-surface-variant">{alerta.producto?.codigo}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${sev.bg} ${sev.text} ${sev.border} shrink-0`}>
                        {sev.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-on-surface-variant font-medium">
                        {alerta.proveedor?.nombre ?? '—'}
                      </div>
                      <div className={`flex items-center gap-1 font-mono font-bold text-sm ${esSuba ? 'text-destructive' : 'text-success'}`}>
                        {esSuba ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {fmtPct(alerta.variacionPct)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-on-surface-variant">
                      <span className="font-mono">{fmtMoney(alerta.precioAnterior)} → <span className="text-foreground font-bold">{fmtMoney(alerta.precioNuevo)}</span></span>
                      <span>{fmtDateRel(alerta.createdAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Modal detalle ──────────────────────────────────────────── */}
      <Modal
        open={detalle !== null}
        onClose={cerrarDetalle}
        title={detalle?.producto?.nombre || 'Detalle de alerta'}
        size="lg"
      >
        {detalle && (
          <div className="space-y-5">
            {/* Resumen variación */}
            <div className="rounded-lg bg-surface-high/50 border border-border p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Precio anterior</p>
                  <p className="text-lg font-mono font-bold text-on-surface-variant">{fmtMoney(detalle.precioAnterior)}</p>
                  {detalle.fechaAnterior && (
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      {detalle.fuenteAnterior === 'factura' ? 'Última factura:' : 'Registro anterior:'}{' '}
                      {detalle.fechaAnterior}
                    </p>
                  )}
                </div>
                <div className="hidden sm:block text-on-surface-variant">→</div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Precio nuevo</p>
                  <p className="text-lg font-mono font-bold text-foreground">{fmtMoney(detalle.precioNuevo)}</p>
                  {detalle.unidad && (
                    <p className="text-[10px] text-on-surface-variant mt-0.5">por {detalle.unidad}</p>
                  )}
                </div>
                <div className="flex-1 sm:text-right">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Variación</p>
                  <p className={`text-2xl font-mono font-extrabold ${detalle.direccion === 'sube' ? 'text-destructive' : 'text-success'}`}>
                    {fmtPct(detalle.variacionPct)}
                  </p>
                  <span className={`inline-flex mt-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${SEVERIDAD_STYLES[detalle.severidad].bg} ${SEVERIDAD_STYLES[detalle.severidad].text} ${SEVERIDAD_STYLES[detalle.severidad].border}`}>
                    {SEVERIDAD_STYLES[detalle.severidad].label}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Proveedor</p>
                <p className="font-semibold text-foreground">{detalle.proveedor?.nombre ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Factura origen</p>
                <p className="font-semibold text-foreground">
                  {detalle.factura ? (
                    <button
                      onClick={() => { cerrarDetalle(); navigate(`/facturas?open=${detalle.factura!.id}`); }}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <FileText size={12} /> {detalle.factura.numero || `#${detalle.factura.id}`}
                    </button>
                  ) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Fecha detección</p>
                <p className="font-semibold text-foreground">{new Date(detalle.createdAt).toLocaleString('es-AR')}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Estado</p>
                <Badge
                  variant={
                    detalle.estado === 'pendiente' ? 'warning'
                    : detalle.estado === 'revisada' ? 'success'
                    : 'default'
                  }
                >
                  {detalle.estado}
                </Badge>
              </div>
            </div>

            {/* Historial */}
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2 mb-2">
                <History size={12} />
                Historial del producto con {detalle.proveedor?.nombre ?? 'el proveedor'}
              </p>
              {cargandoDetalle ? (
                <p className="text-center text-on-surface-variant py-4 text-sm">Cargando historial...</p>
              ) : historial.length === 0 ? (
                <p className="text-center text-on-surface-variant py-4 text-sm">Sin historial anterior</p>
              ) : (
                <div className="bg-surface-high/30 rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-high/50">
                      <tr>
                        <th className="text-left p-2 font-bold text-on-surface-variant uppercase tracking-wider">Fecha</th>
                        <th className="text-left p-2 font-bold text-on-surface-variant uppercase tracking-wider">Factura</th>
                        <th className="text-right p-2 font-bold text-on-surface-variant uppercase tracking-wider">Cant</th>
                        <th className="text-right p-2 font-bold text-on-surface-variant uppercase tracking-wider">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historial.map((h, i) => {
                        const anterior = historial[i + 1];
                        const delta = anterior ? ((h.precio - anterior.precio) / anterior.precio) * 100 : null;
                        return (
                          <tr key={h.facturaItemId}>
                            <td className="p-2 text-foreground font-semibold">{h.fecha}</td>
                            <td className="p-2 font-mono text-on-surface-variant">{h.facturaNumero || `#${h.facturaId}`}</td>
                            <td className="p-2 text-right font-mono text-on-surface-variant">{h.cantidad} {h.unidad}</td>
                            <td className="p-2 text-right">
                              <div className="flex flex-col items-end">
                                <span className="font-mono font-bold text-foreground">{fmtMoney(h.precio)}</span>
                                {delta !== null && Math.abs(delta) >= 0.5 && (
                                  <span className={`text-[10px] font-mono ${delta > 0 ? 'text-destructive' : 'text-success'}`}>
                                    {fmtPct(delta)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Observación */}
            {detalle.estado === 'pendiente' && puedeRevisar && (
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">
                  Observación (opcional)
                </label>
                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder="Ej: confirmado con el proveedor por WhatsApp, aumentó la materia prima"
                  className="w-full bg-surface border border-border rounded-lg p-3 text-sm text-foreground placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                  rows={2}
                />
              </div>
            )}

            {/* Observación previa (si ya fue revisada/descartada) */}
            {detalle.estado !== 'pendiente' && detalle.observacion && (
              <div className="rounded-lg bg-surface-high/30 border border-border p-3">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">
                  Observación
                </p>
                <p className="text-sm text-foreground">{detalle.observacion}</p>
                {detalle.revisadoPor && (
                  <p className="text-[10px] text-on-surface-variant mt-2">
                    Por {detalle.revisadoPor.nombre}
                    {detalle.fechaRevision && ` • ${new Date(detalle.fechaRevision).toLocaleString('es-AR')}`}
                  </p>
                )}
              </div>
            )}

            {/* Acciones */}
            {detalle.estado === 'pendiente' && puedeRevisar && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                <Button
                  variant="secondary"
                  onClick={descartarAlerta}
                  disabled={accionando}
                  className="flex-1"
                >
                  <XIcon size={14} />
                  Descartar
                </Button>
                <Button
                  variant="primary"
                  onClick={revisarAlerta}
                  disabled={accionando}
                  className="flex-1"
                >
                  <Check size={14} />
                  {accionando ? 'Guardando...' : 'Marcar como revisada'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard — tarjeta de métrica con acento de color
// ---------------------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant: 'warning' | 'danger' | 'success' | 'info';
  accent?: boolean;
}

function StatCard({ label, value, icon, variant, accent }: StatCardProps) {
  const colors: Record<string, string> = {
    warning: 'text-warning bg-warning/10 border-warning/20',
    danger: 'text-destructive bg-destructive/10 border-destructive/20',
    success: 'text-success bg-success/10 border-success/20',
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 transition-all ${accent ? colors[variant] : 'bg-surface border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${accent ? '' : 'text-on-surface-variant'}`}>
          {label}
        </span>
        <span className={accent ? '' : colors[variant].split(' ')[0]}>{icon}</span>
      </div>
      <p className={`text-2xl font-extrabold ${accent ? '' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
