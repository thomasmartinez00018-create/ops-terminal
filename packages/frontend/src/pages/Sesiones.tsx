/**
 * Sesiones — historial de sesiones de venta del módulo Punto de Venta.
 *
 * Vista web (no mobile-first). Lista sesiones cerradas y abiertas con totales
 * por depósito, ranking de productos vendidos, y quiebres por medio de cobro.
 *
 * Para usar el flujo de venta en sí, ir a /punto-venta (mobile-first).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Package, Clock, CheckCircle, ShoppingBag, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

type SesionLista = {
  id: number;
  depositoId: number;
  operadorId: number;
  estado: string;
  abiertaAt: string;
  cerradaAt: string | null;
  totalVentas: number | null;
  totalCobros: number | null;
  deposito: { id: number; codigo: string; nombre: string; tipo: string | null };
  operador: { id: number; nombre: string };
  _count: { ventas: number; cobros: number };
};

type SesionDetalle = SesionLista & {
  ventas: Array<{
    id: number;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    producto: { id: number; nombre: string; codigo: string; unidadUso: string };
  }>;
  cobros: Array<{ id: number; medio: string; monto: number; observacion: string | null }>;
  conteos?: Array<{
    productoId: number;
    esperado: number;
    real: number;
    diferencia: number;
    producto: { nombre: string; unidadUso: string };
  }>;
};

export default function Sesiones() {
  const { addToast } = useToast();
  const [sesiones, setSesiones] = useState<SesionLista[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroDeposito, setFiltroDeposito] = useState<string>('');
  const [depositos, setDepositos] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<SesionDetalle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getDepositos().then(setDepositos).catch(() => {});
  }, []);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params: Record<string, string> = {};
    if (filtroEstado) params.estado = filtroEstado;
    if (filtroDeposito) params.depositoId = filtroDeposito;
    api.getSesiones(params)
      .then(d => { if (!cancel) setSesiones(d); })
      .catch(e => addToast({ type: 'error', message: e?.message || 'Error' }))
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [filtroEstado, filtroDeposito]);

  async function abrirDetalle(id: number) {
    try {
      const d = await api.getSesion(id);
      setSeleccionada(d);
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Error' });
    }
  }

  // Stats agregadas
  const stats = useMemo(() => {
    const cerradas = sesiones.filter(s => s.estado === 'cerrada');
    const totalVentas = cerradas.reduce((sum, s) => sum + (s.totalVentas || 0), 0);
    const items = cerradas.reduce((sum, s) => sum + s._count.ventas, 0);
    return {
      total: sesiones.length,
      abiertas: sesiones.filter(s => s.estado === 'abierta').length,
      cerradas: cerradas.length,
      totalVentas,
      items,
    };
  }, [sesiones]);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Sesiones de venta</h1>
          <p className="text-sm text-on-surface-variant">
            Historial de carritos, barras y puntos móviles.
          </p>
        </div>
        <Link
          to="/punto-venta"
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold flex items-center gap-2"
        >
          <ShoppingBag size={16} /> Abrir punto de venta
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat icon={<Clock size={14} />} label="Abiertas" value={String(stats.abiertas)} accent="text-amber-500" />
        <Stat icon={<CheckCircle size={14} />} label="Cerradas" value={String(stats.cerradas)} accent="text-emerald-500" />
        <Stat icon={<Wallet size={14} />} label="Total vendido" value={`$${stats.totalVentas.toFixed(0)}`} accent="text-primary" />
        <Stat icon={<Package size={14} />} label="Items vendidos" value={String(stats.items)} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="text-xs px-2 py-1.5 rounded bg-surface-high border border-border/60"
        >
          <option value="">Todos los estados</option>
          <option value="abierta">Abiertas</option>
          <option value="cerrada">Cerradas</option>
        </select>
        <select
          value={filtroDeposito}
          onChange={e => setFiltroDeposito(e.target.value)}
          className="text-xs px-2 py-1.5 rounded bg-surface-high border border-border/60"
        >
          <option value="">Todos los depósitos</option>
          {depositos.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {loading && <div className="text-sm text-on-surface-variant">Cargando…</div>}
        {sesiones.map(s => (
          <button
            key={s.id}
            onClick={() => abrirDetalle(s.id)}
            className="w-full text-left rounded-lg border border-border/60 bg-surface p-3 hover:border-primary/60 transition-colors flex items-center gap-3"
          >
            <div className={`w-2 h-12 rounded-full ${s.estado === 'abierta' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold flex items-center gap-2">
                {s.deposito.nombre}
                <span className="text-[10px] text-on-surface-variant font-normal">#{s.id}</span>
              </div>
              <div className="text-[11px] text-on-surface-variant">
                {s.operador.nombre} ·{' '}
                {new Date(s.abiertaAt).toLocaleString('es-AR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
                {s.cerradaAt && (
                  <> → {new Date(s.cerradaAt).toLocaleTimeString('es-AR').slice(0, 5)}</>
                )}
              </div>
            </div>
            <div className="text-right">
              {s.totalVentas != null ? (
                <div className="text-sm font-bold text-primary">${s.totalVentas.toFixed(0)}</div>
              ) : (
                <div className="text-[11px] text-amber-500 font-bold">en curso</div>
              )}
              <div className="text-[10px] text-on-surface-variant">
                {s._count.ventas} items
              </div>
            </div>
            <ChevronRight size={16} className="text-on-surface-variant" />
          </button>
        ))}
        {!sesiones.length && !loading && (
          <div className="text-center text-sm text-on-surface-variant py-12">
            No hay sesiones todavía. Abrí una desde Punto de Venta.
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {seleccionada && (
        <DetalleSesion sesion={seleccionada} onClose={() => setSeleccionada(null)} />
      )}
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant">
        {icon} {label}
      </div>
      <div className={`text-lg font-bold mt-0.5 ${accent || ''}`}>{value}</div>
    </div>
  );
}

function DetalleSesion({ sesion, onClose }: { sesion: SesionDetalle; onClose: () => void }) {
  // Ranking productos
  const ranking = useMemo(() => {
    const m = new Map<number, { nombre: string; cantidad: number; subtotal: number }>();
    for (const v of sesion.ventas) {
      const ex = m.get(v.producto.id) || { nombre: v.producto.nombre, cantidad: 0, subtotal: 0 };
      ex.cantidad += v.cantidad;
      ex.subtotal += v.subtotal;
      m.set(v.producto.id, ex);
    }
    return Array.from(m.values()).sort((a, b) => b.cantidad - a.cantidad);
  }, [sesion.ventas]);

  // Cobros por medio
  const porMedio = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of sesion.cobros) {
      m.set(c.medio, (m.get(c.medio) || 0) + c.monto);
    }
    return Array.from(m.entries());
  }, [sesion.cobros]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-bg-primary rounded-2xl border border-border/60 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-bg-primary border-b border-border/60 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold">Sesión #{sesion.id} · {sesion.deposito.nombre}</div>
            <div className="text-[11px] text-on-surface-variant">
              {sesion.operador.nombre} ·{' '}
              {new Date(sesion.abiertaAt).toLocaleString('es-AR')}
            </div>
          </div>
          <button onClick={onClose} className="text-sm font-bold text-primary">Cerrar</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Totales */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-surface p-3">
              <div className="text-[10px] uppercase text-on-surface-variant">Ventas</div>
              <div className="text-xl font-bold text-primary">
                ${(sesion.totalVentas || 0).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <div className="text-[10px] uppercase text-on-surface-variant">Cobrado</div>
              <div className="text-xl font-bold">
                ${(sesion.totalCobros || 0).toFixed(0)}
              </div>
            </div>
            <div className="rounded-lg bg-surface p-3">
              <div className="text-[10px] uppercase text-on-surface-variant">Items</div>
              <div className="text-xl font-bold">{sesion.ventas.length}</div>
            </div>
          </div>

          {/* Ranking productos */}
          <div>
            <div className="text-sm font-bold mb-2">Productos vendidos</div>
            <div className="space-y-1">
              {ranking.map((r, i) => (
                <div key={r.nombre} className="flex items-center gap-2 text-xs rounded bg-surface px-2 py-1.5">
                  <div className="w-6 text-center text-[10px] font-bold text-on-surface-variant">#{i + 1}</div>
                  <div className="flex-1 truncate">{r.nombre}</div>
                  <div className="w-16 text-right text-on-surface-variant">{r.cantidad.toFixed(0)} u</div>
                  <div className="w-20 text-right font-bold text-primary">${r.subtotal.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cobros por medio */}
          {!!porMedio.length && (
            <div>
              <div className="text-sm font-bold mb-2">Cobros</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {porMedio.map(([medio, monto]) => (
                  <div key={medio} className="rounded bg-surface p-2 text-center">
                    <div className="text-[10px] uppercase text-on-surface-variant">{medio}</div>
                    <div className="text-base font-bold">${monto.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diferencias de conteo */}
          {sesion.conteos && sesion.conteos.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-2">Conteo de cierre</div>
              <div className="space-y-1">
                {sesion.conteos
                  .filter(c => Math.abs(c.diferencia) > 0.001)
                  .map(c => (
                    <div key={c.productoId} className="flex items-center gap-2 text-xs rounded bg-surface px-2 py-1.5">
                      <div className="flex-1 truncate">{c.producto.nombre}</div>
                      <div className="text-[11px] text-on-surface-variant">
                        esp {c.esperado.toFixed(0)} · real {c.real.toFixed(0)}
                      </div>
                      <div className={`w-16 text-right font-bold ${
                        c.diferencia < 0 ? 'text-rose-500' : 'text-emerald-500'
                      }`}>
                        {c.diferencia > 0 ? '+' : ''}{c.diferencia.toFixed(0)}
                      </div>
                    </div>
                  ))}
                {sesion.conteos.every(c => Math.abs(c.diferencia) <= 0.001) && (
                  <div className="text-[11px] text-on-surface-variant">Sin diferencias</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
