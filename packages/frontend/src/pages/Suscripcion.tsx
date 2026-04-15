import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Check, Crown, Zap, Building2, Sparkles, Calendar,
  CreditCard, Download, AlertTriangle, Loader2, ExternalLink,
  Pause, Play, XCircle, RefreshCw, ShieldCheck, Clock,
} from 'lucide-react';

interface Plan {
  id: string;
  nombre: string;
  tagline: string;
  precioMensual: number;
  precioAnual?: number;
  frecuencia: 'mensual' | 'anual';
  mesesCobrados: number;
  destacado?: boolean;
  orden: number;
  features: string[];
  limites: { usuarios: number; productos: number; depositos: number; locales: number };
}

interface SuscripcionActual {
  plan: string;
  estado: string;
  trialHasta: string | null;
  diasRestantesTrial: number | null;
  limites: { usuarios: number; productos: number; depositos: number };
  planCatalogo: Plan | null;
  suscripcion: {
    id: number;
    proveedor: string;
    precioMensual: number;
    moneda: string;
    frecuencia: string;
    proximoCobroEn: string | null;
    periodoActualFin: string | null;
    canceladaEn: string | null;
    mpInitPoint: string | null;
  } | null;
}

interface Pago {
  id: number;
  mpPaymentId: string | null;
  monto: number;
  moneda: string;
  estado: string;
  metodoPago: string | null;
  marca: string | null;
  ultimos4: string | null;
  fechaPago: string | null;
  facturado: boolean;
  cae: string | null;
  facturaNumero: string | null;
  facturaPdfUrl: string | null;
}

const iconoPorPlan: Record<string, any> = {
  starter: Zap,
  starter_anual: Zap,
  pro: Crown,
  pro_anual: Crown,
  multi: Building2,
  multi_anual: Building2,
};

function formatPrecio(v: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v);
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function Suscripcion() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [actual, setActual] = useState<SuscripcionActual | null>(null);
  const [mensuales, setMensuales] = useState<Plan[]>([]);
  const [anuales, setAnuales] = useState<Plan[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [facturaMode, setFacturaMode] = useState<'mensual' | 'anual'>('mensual');
  const [tab, setTab] = useState<'plan' | 'pagos' | 'upgrade'>('plan');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [act, planes, pg] = await Promise.all([
        api.getSuscripcionActual(),
        api.getPlanesPublicos(),
        api.getSuscripcionPagos().catch(() => ({ pagos: [] })),
      ]);
      setActual(act);
      setMensuales(planes.mensuales);
      setAnuales(planes.anuales);
      setPagos(pg.pagos || []);
    } catch (e: any) {
      addToast(e?.message || 'Error al cargar suscripción', 'error');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Si volvemos del checkout de MP con ?mp_return=1, forzar sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mp_return') === '1') {
      api.syncSuscripcion()
        .then(() => {
          addToast('Suscripción sincronizada con Mercado Pago', 'success');
          window.history.replaceState({}, '', window.location.pathname);
          loadAll();
        })
        .catch(() => {});
    }
  }, []);

  const handleSubscribe = async (plan: Plan) => {
    const email = window.prompt(
      `Email para facturar la suscripción al plan ${plan.nombre}:`,
      user?.nombre ? `${user.nombre.toLowerCase().replace(/\s+/g, '.')}@gmail.com` : '',
    );
    if (!email) return;

    setSubscribing(plan.id);
    try {
      const res = await api.subscribePlan(plan.id, email);
      // Redirigir al checkout de MP
      window.location.href = res.initPoint;
    } catch (e: any) {
      addToast(e?.message || 'No se pudo iniciar la suscripción', 'error');
      setSubscribing(null);
    }
  };

  const handlePause = async () => {
    if (!window.confirm('¿Pausar la suscripción? MP no cobrará el próximo ciclo hasta que la reactives.')) return;
    try {
      await api.pauseSuscripcion();
      addToast('Suscripción pausada', 'info');
      loadAll();
    } catch (e: any) {
      addToast(e?.message || 'Error al pausar', 'error');
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeSuscripcion();
      addToast('Suscripción reactivada', 'success');
      loadAll();
    } catch (e: any) {
      addToast(e?.message || 'Error al reactivar', 'error');
    }
  };

  const handleCancel = async () => {
    const motivo = window.prompt('¿Por qué cancelás? (opcional pero nos ayuda):');
    if (motivo === null) return;
    if (!window.confirm('¿Confirmás la cancelación? Mantenés acceso hasta el final del periodo pagado.')) return;
    try {
      await api.cancelSuscripcion(motivo);
      addToast('Suscripción cancelada. Mantenés acceso hasta el fin del periodo.', 'info');
      loadAll();
    } catch (e: any) {
      addToast(e?.message || 'Error al cancelar', 'error');
    }
  };

  const planesVisibles = facturaMode === 'mensual' ? mensuales : anuales;

  // Estado del trial
  const esTrial = actual?.estado === 'trialing';
  const trialExpira = actual?.diasRestantesTrial ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* ═══════ Hero / Estado actual ═══════ */}
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-black text-foreground mb-2">
          Tu suscripción
        </h1>
        <p className="text-on-surface-variant">
          Gestioná tu plan, métodos de pago y facturación
        </p>
      </div>

      {/* ═══════ Card de estado actual ═══════ */}
      {esTrial && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Clock className="text-amber-400" size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-xl font-bold text-foreground">Prueba gratuita</h2>
                <span className="text-sm text-on-surface-variant">· 14 días</span>
              </div>
              <p className="text-on-surface-variant mb-4">
                {trialExpira !== null && trialExpira > 0
                  ? `Te quedan ${trialExpira} día${trialExpira === 1 ? '' : 's'} de prueba. Al terminar, elegí un plan para seguir operando sin interrupciones.`
                  : 'Tu prueba gratuita terminó. Elegí un plan para reactivar tu cuenta.'}
              </p>
              <button
                onClick={() => setTab('upgrade')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition"
              >
                Elegir plan <Sparkles size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!esTrial && actual?.planCatalogo && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Crown className="text-primary" size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-xl font-bold text-foreground">
                  Plan {actual.planCatalogo.nombre}
                </h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  actual.estado === 'active' ? 'bg-emerald-500/20 text-emerald-400'
                  : actual.estado === 'past_due' ? 'bg-red-500/20 text-red-400'
                  : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {actual.estado === 'active' ? 'Activo'
                   : actual.estado === 'past_due' ? 'Pago pendiente'
                   : actual.estado === 'paused' ? 'Pausado'
                   : actual.estado === 'canceled' ? 'Cancelado'
                   : actual.estado}
                </span>
              </div>
              <p className="text-on-surface-variant mb-4">{actual.planCatalogo.tagline}</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Precio</div>
                  <div className="font-bold text-foreground">
                    {formatPrecio(actual.suscripcion?.precioMensual || actual.planCatalogo.precioMensual)}
                    <span className="text-xs text-on-surface-variant font-normal">/mes</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Próximo cobro</div>
                  <div className="font-bold text-foreground">{formatFecha(actual.suscripcion?.proximoCobroEn || null)}</div>
                </div>
                <div>
                  <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Ciclo</div>
                  <div className="font-bold text-foreground capitalize">
                    {actual.suscripcion?.frecuencia || 'Mensual'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Facturación</div>
                  <div className="font-bold text-foreground">Automática</div>
                </div>
              </div>
            </div>
          </div>

          {/* Acciones del plan activo */}
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
            {actual.estado === 'active' && (
              <>
                <button
                  onClick={handlePause}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-variant text-foreground text-sm hover:bg-surface-variant/70 transition"
                >
                  <Pause size={14} /> Pausar
                </button>
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 transition"
                >
                  <XCircle size={14} /> Cancelar
                </button>
              </>
            )}
            {actual.estado === 'paused' && (
              <button
                onClick={handleResume}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/30 transition"
              >
                <Play size={14} /> Reactivar
              </button>
            )}
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-variant text-foreground text-sm hover:bg-surface-variant/70 transition ml-auto"
            >
              <RefreshCw size={14} /> Refrescar
            </button>
          </div>
        </div>
      )}

      {/* ═══════ Tabs ═══════ */}
      <div className="mb-6 flex gap-1 bg-surface-variant/40 p-1 rounded-xl w-fit">
        {[
          { id: 'plan', label: 'Mi plan' },
          { id: 'upgrade', label: esTrial ? 'Elegir plan' : 'Cambiar plan' },
          { id: 'pagos', label: 'Historial' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.id
                ? 'bg-surface text-foreground shadow'
                : 'text-on-surface-variant hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: Mi plan ═══════ */}
      {tab === 'plan' && (
        <div className="space-y-6">
          {actual?.planCatalogo && (
            <div className="rounded-2xl bg-surface border border-border p-6">
              <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary" />
                Incluido en tu plan
              </h3>
              <ul className="grid md:grid-cols-2 gap-3">
                {actual.planCatalogo.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-on-surface-variant">
                    <Check size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Límites visuales */}
          {actual && (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-surface border border-border p-4">
                <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Usuarios</div>
                <div className="text-2xl font-bold text-foreground">
                  {actual.limites.usuarios >= 9999 ? 'Ilimitados' : actual.limites.usuarios}
                </div>
              </div>
              <div className="rounded-xl bg-surface border border-border p-4">
                <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Depósitos</div>
                <div className="text-2xl font-bold text-foreground">
                  {actual.limites.depositos >= 99 ? 'Ilimitados' : actual.limites.depositos}
                </div>
              </div>
              <div className="rounded-xl bg-surface border border-border p-4">
                <div className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Productos</div>
                <div className="text-2xl font-bold text-foreground">
                  {actual.limites.productos >= 99999 ? 'Ilimitados' : actual.limites.productos}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: Upgrade ═══════ */}
      {tab === 'upgrade' && (
        <div>
          {/* Toggle mensual/anual */}
          <div className="flex items-center justify-center mb-8">
            <div className="inline-flex p-1 bg-surface-variant/40 rounded-full">
              <button
                onClick={() => setFacturaMode('mensual')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                  facturaMode === 'mensual'
                    ? 'bg-surface text-foreground shadow'
                    : 'text-on-surface-variant'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setFacturaMode('anual')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition relative ${
                  facturaMode === 'anual'
                    ? 'bg-surface text-foreground shadow'
                    : 'text-on-surface-variant'
                }`}
              >
                Anual
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                  -17%
                </span>
              </button>
            </div>
          </div>

          {/* Grid de planes */}
          <div className="grid md:grid-cols-3 gap-5">
            {planesVisibles.map(plan => {
              const Icon = iconoPorPlan[plan.id] || Sparkles;
              const destacado = plan.destacado || plan.id === 'pro' || plan.id === 'pro_anual';
              const isActual = actual?.plan === plan.id && actual?.estado === 'active';
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border p-6 flex flex-col ${
                    destacado
                      ? 'border-primary bg-gradient-to-b from-primary/10 to-transparent shadow-xl shadow-primary/10'
                      : 'border-border bg-surface'
                  }`}
                >
                  {destacado && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-black text-[10px] font-black uppercase tracking-wider">
                      Más elegido
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    destacado ? 'bg-primary/20 text-primary' : 'bg-surface-variant text-on-surface-variant'
                  }`}>
                    <Icon size={24} />
                  </div>

                  <h3 className="text-2xl font-black text-foreground mb-1">{plan.nombre}</h3>
                  <p className="text-sm text-on-surface-variant mb-5 min-h-[2.5rem]">{plan.tagline}</p>

                  <div className="mb-5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black text-foreground">
                        {formatPrecio(plan.precioMensual)}
                      </span>
                      <span className="text-sm text-on-surface-variant">/mes</span>
                    </div>
                    {plan.frecuencia === 'anual' && plan.precioAnual && (
                      <div className="text-xs text-emerald-400 mt-1">
                        {formatPrecio(plan.precioAnual)} por año · facturado 1 vez
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.slice(0, 8).map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-on-surface-variant">
                        <Check size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {plan.features.length > 8 && (
                      <li className="text-xs text-on-surface-variant/70 pl-5">
                        + {plan.features.length - 8} más
                      </li>
                    )}
                  </ul>

                  {isActual ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl bg-emerald-500/20 text-emerald-400 font-semibold text-sm cursor-default"
                    >
                      Tu plan actual
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan)}
                      disabled={subscribing === plan.id}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${
                        destacado
                          ? 'bg-primary text-black hover:bg-primary/90'
                          : 'bg-surface-variant text-foreground hover:bg-surface-variant/70'
                      } disabled:opacity-50`}
                    >
                      {subscribing === plan.id ? (
                        <><Loader2 size={14} className="animate-spin" /> Redirigiendo...</>
                      ) : (
                        <>{esTrial ? 'Elegir plan' : 'Cambiar a este plan'} <ExternalLink size={14} /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Disclaimer MP */}
          <div className="mt-8 flex items-start gap-3 text-xs text-on-surface-variant bg-surface-variant/30 rounded-xl p-4">
            <ShieldCheck size={16} className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground mb-1">Pago seguro con Mercado Pago</p>
              <p>
                Al suscribirte te redirigimos al checkout de Mercado Pago. Tu tarjeta se guarda en MP, no en
                nuestros servidores. Podés cancelar cuando quieras y mantenés acceso hasta el final del periodo
                pagado. Todas las suscripciones se facturan en pesos argentinos (ARS).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TAB: Historial de pagos ═══════ */}
      {tab === 'pagos' && (
        <div>
          {pagos.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-12 text-center">
              <CreditCard size={48} className="mx-auto mb-3 text-on-surface-variant/40" />
              <h3 className="text-lg font-bold text-foreground mb-1">Sin pagos todavía</h3>
              <p className="text-sm text-on-surface-variant">
                Cuando Mercado Pago procese tu primer cobro, vas a verlo acá.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-on-surface-variant">
                      <th className="text-left font-semibold px-4 py-3">Fecha</th>
                      <th className="text-left font-semibold px-4 py-3">Monto</th>
                      <th className="text-left font-semibold px-4 py-3">Método</th>
                      <th className="text-left font-semibold px-4 py-3">Estado</th>
                      <th className="text-left font-semibold px-4 py-3">Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map(p => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-surface-variant/20">
                        <td className="px-4 py-3 text-sm text-foreground">{formatFecha(p.fechaPago)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">
                          {formatPrecio(p.monto)} {p.moneda}
                        </td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant">
                          {p.marca ? `${p.marca.toUpperCase()} ` : ''}
                          {p.ultimos4 ? `•••• ${p.ultimos4}` : p.metodoPago || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            p.estado === 'approved' ? 'bg-emerald-500/20 text-emerald-400'
                            : p.estado === 'rejected' ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {p.estado === 'approved' ? 'Aprobado'
                             : p.estado === 'rejected' ? 'Rechazado'
                             : p.estado === 'pending' ? 'Pendiente'
                             : p.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {p.facturado && p.facturaPdfUrl ? (
                            <a
                              href={p.facturaPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Download size={12} /> {p.facturaNumero || 'PDF'}
                            </a>
                          ) : (
                            <span className="text-xs text-on-surface-variant/60">
                              {p.estado === 'approved' ? 'Generándose...' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-start gap-3 text-xs text-on-surface-variant bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-400 mb-1">Facturación electrónica — Próximamente</p>
              <p>
                Estamos integrando AFIP/ARCA para emitir automáticamente Factura C/B por cada cobro. Mientras
                tanto, si necesitás una factura formal, escribinos a{' '}
                <a href="mailto:hola@opsterminal.com" className="text-primary underline">hola@opsterminal.com</a>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
