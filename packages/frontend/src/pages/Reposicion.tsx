import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import TabBar from '../components/ui/TabBar';
import {
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Zap,
  Check,
  X as XIcon,
  ShoppingCart,
  PlayCircle,
  ClipboardList,
  Boxes,
} from 'lucide-react';

// ============================================================================
// Reposición — página principal
// ============================================================================
// Tres vistas tabulables:
//   1. ALERTAS  → detecta en vivo qué (producto × depósito) está bajo el
//      punto de reposición y propone desde qué depósito padre resolverlo.
//      Desde acá se lanza "Generar órdenes sugeridas" → crea órdenes
//      agrupadas por par origen→destino.
//   2. ÓRDENES  → lista las órdenes de reposición activas (sugerida /
//      pendiente / ejecutada). Permite confirmar, ejecutar y cancelar.
//   3. COMPRAR  → alertas cuya resolución requiere comprar al proveedor
//      (depósitos sin padre en la cadena). Link directo a crear OC.
//
// Regla de oro: nada se descuenta sin confirmación humana. Las alertas se
// calculan on-demand, las órdenes 'sugeridas' no tocan stock, solo al
// ejecutar se crean los Movimientos.
// ============================================================================

type Tab = 'alertas' | 'ordenes' | 'comprar';

const ESTADO_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  sugerida: { label: 'Sugerida', variant: 'info' },
  pendiente: { label: 'Pendiente', variant: 'warning' },
  ejecutada: { label: 'Ejecutada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'danger' },
};

export default function Reposicion() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('alertas');
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);

  // Alertas (vivas, calculadas en el backend)
  const [alertasData, setAlertasData] = useState<{
    total: number;
    alertas: any[];
    resumen: { paraTransferir: number; paraComprar: number; conStockPadreSuficiente: number };
  } | null>(null);

  // Órdenes (persistidas)
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<'activas' | 'todas' | 'ejecutadas'>('activas');
  const [detalleOrden, setDetalleOrden] = useState<any | null>(null);
  const [editItems, setEditItems] = useState<Record<number, number>>({});
  const [ejecutando, setEjecutando] = useState(false);

  const cargarAlertas = async () => {
    setLoading(true);
    try {
      const data = await api.getAlertasReposicion();
      setAlertasData(data);
    } catch (err: any) {
      addToast(err?.message || 'Error al cargar alertas', 'error');
    } finally {
      setLoading(false);
    }
  };

  const cargarOrdenes = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtroEstado === 'activas') params.activas = 'true';
      if (filtroEstado === 'ejecutadas') params.estado = 'ejecutada';
      const data = await api.getOrdenesReposicion(params);
      setOrdenes(data);
    } catch (err: any) {
      addToast(err?.message || 'Error al cargar órdenes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'alertas' || tab === 'comprar') cargarAlertas();
    if (tab === 'ordenes') cargarOrdenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filtroEstado]);

  const generarOrdenes = async () => {
    if (!confirm('Se crearán órdenes de reposición internas en estado "sugerida". Nada se descontará del stock hasta que un humano ejecute cada orden. ¿Continuar?')) {
      return;
    }
    setGenerando(true);
    try {
      const res = await api.generarOrdenesReposicion();
      addToast(
        res.ordenesCreadas > 0
          ? `Se crearon ${res.ordenesCreadas} órdenes de reposición`
          : (res.mensaje || 'No hay alertas para transferencias internas'),
        'success',
      );
      await cargarAlertas();
      setTab('ordenes');
    } catch (err: any) {
      addToast(err?.message || 'Error al generar órdenes', 'error');
    } finally {
      setGenerando(false);
    }
  };

  const abrirDetalle = async (id: number) => {
    try {
      const orden = await api.getOrdenReposicion(id);
      setDetalleOrden(orden);
      // Pre-carga cantidades confirmadas (o sugeridas si no hay)
      const map: Record<number, number> = {};
      for (const it of orden.items) {
        map[it.id] = it.cantidadConfirmada ?? it.cantidadSugerida;
      }
      setEditItems(map);
    } catch (err: any) {
      addToast(err?.message || 'Error al cargar orden', 'error');
    }
  };

  const cerrarDetalle = () => {
    setDetalleOrden(null);
    setEditItems({});
  };

  const confirmarOrden = async () => {
    if (!detalleOrden) return;
    try {
      const items = detalleOrden.items.map((it: any) => ({
        id: it.id,
        cantidadConfirmada: Number(editItems[it.id] ?? 0),
      }));
      await api.confirmarOrdenReposicion(detalleOrden.id, { items });
      addToast('Orden confirmada — lista para ejecutar', 'success');
      cerrarDetalle();
      cargarOrdenes();
    } catch (err: any) {
      addToast(err?.message || 'Error al confirmar', 'error');
    }
  };

  const ejecutarOrden = async () => {
    if (!detalleOrden) return;
    if (!confirm('Esto creará los movimientos de transferencia en el stock. Esta acción no se puede deshacer. ¿Continuar?')) {
      return;
    }
    // Si hay cantidades editadas sin guardar, guardamos primero.
    const hayCambios = detalleOrden.items.some((it: any) =>
      Number(editItems[it.id] ?? 0) !== (it.cantidadConfirmada ?? it.cantidadSugerida),
    );
    setEjecutando(true);
    try {
      if (hayCambios) {
        const items = detalleOrden.items.map((it: any) => ({
          id: it.id,
          cantidadConfirmada: Number(editItems[it.id] ?? 0),
        }));
        await api.confirmarOrdenReposicion(detalleOrden.id, { items });
      }
      await api.ejecutarOrdenReposicion(detalleOrden.id);
      addToast('Orden ejecutada — stock transferido', 'success');
      cerrarDetalle();
      cargarOrdenes();
    } catch (err: any) {
      if (err?.message?.includes('Stock insuficiente')) {
        addToast('Stock insuficiente en el depósito origen. Reducí cantidades o reponé primero.', 'error');
      } else {
        addToast(err?.message || 'Error al ejecutar', 'error');
      }
    } finally {
      setEjecutando(false);
    }
  };

  const cancelarOrden = async (id: number) => {
    if (!confirm('¿Cancelar esta orden de reposición?')) return;
    try {
      await api.cancelarOrdenReposicion(id);
      addToast('Orden cancelada', 'success');
      cerrarDetalle();
      cargarOrdenes();
    } catch (err: any) {
      addToast(err?.message || 'Error al cancelar', 'error');
    }
  };

  // Alertas agrupadas por (depósito padre → depósito destino) para el tab "alertas"
  const alertasAgrupadas = useMemo(() => {
    if (!alertasData) return [];
    const grupos = new Map<string, { origen: string; destino: string; items: any[] }>();
    for (const a of alertasData.alertas) {
      if (a.requiereCompra || !a.depositoPadreId) continue;
      const key = `${a.depositoPadreId}->${a.depositoId}`;
      const g = grupos.get(key);
      if (g) g.items.push(a);
      else grupos.set(key, {
        origen: a.depositoPadreNombre ?? '—',
        destino: a.depositoNombre,
        items: [a],
      });
    }
    return Array.from(grupos.values());
  }, [alertasData]);

  const alertasCompra = useMemo(() => {
    if (!alertasData) return [];
    return alertasData.alertas.filter(a => a.requiereCompra);
  }, [alertasData]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Operaciones</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Reposición</h1>
        </div>
        {tab === 'alertas' && (alertasAgrupadas.length > 0) && (
          <Button onClick={generarOrdenes} disabled={generando} size="md">
            <Zap size={14} />
            {generando ? 'Generando...' : `Generar ${alertasAgrupadas.length} órdenes`}
          </Button>
        )}
        {tab === 'ordenes' && (
          <Button variant="secondary" onClick={cargarOrdenes} size="sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
        )}
      </div>

      {/* Mini-cards resumen */}
      {alertasData && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-surface rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 text-on-surface-variant text-[10px] font-bold uppercase tracking-wider mb-1">
              <AlertTriangle size={12} />
              Alertas totales
            </div>
            <p className="text-xl font-extrabold text-foreground">{alertasData.total}</p>
          </div>
          <div className="bg-surface rounded-xl border border-primary/30 p-3">
            <div className="flex items-center gap-2 text-primary text-[10px] font-bold uppercase tracking-wider mb-1">
              <ArrowRight size={12} />
              Transferir
            </div>
            <p className="text-xl font-extrabold text-primary">{alertasData.resumen.paraTransferir}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">
              {alertasData.resumen.conStockPadreSuficiente} con stock suficiente en padre
            </p>
          </div>
          <div className="bg-surface rounded-xl border border-destructive/30 p-3">
            <div className="flex items-center gap-2 text-destructive text-[10px] font-bold uppercase tracking-wider mb-1">
              <ShoppingCart size={12} />
              Comprar
            </div>
            <p className="text-xl font-extrabold text-destructive">{alertasData.resumen.paraComprar}</p>
          </div>
        </div>
      )}

      <TabBar
        tabs={[
          { key: 'alertas', label: `Alertas ${alertasData ? `(${alertasAgrupadas.length})` : ''}` },
          { key: 'ordenes', label: 'Órdenes' },
          { key: 'comprar', label: `Comprar ${alertasData ? `(${alertasCompra.length})` : ''}` },
        ]}
        active={tab}
        onChange={k => setTab(k as Tab)}
      />

      {/* ── TAB: ALERTAS ─────────────────────────────────────────────── */}
      {tab === 'alertas' && (
        <div>
          {loading && <CargandoRow />}
          {!loading && alertasAgrupadas.length === 0 && (
            <EmptyState
              icon={<Check size={32} className="text-success" />}
              title="Todo al día"
              description="Ningún depósito está por debajo del punto de reposición en este momento."
            />
          )}
          {!loading && alertasAgrupadas.map((grupo, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border overflow-hidden mb-4">
              {/* Header del grupo: origen → destino */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface-high/50">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Boxes size={14} className="text-on-surface-variant" />
                  <span className="font-bold text-foreground">{grupo.origen}</span>
                  <ArrowRight size={14} className="text-primary" />
                  <span className="font-bold text-foreground">{grupo.destino}</span>
                </div>
                <Badge variant="info">{grupo.items.length} productos</Badge>
              </div>
              <div className="divide-y divide-border">
                {grupo.items.map((a: any) => (
                  <div key={`${a.productoId}-${a.depositoId}`} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{a.productoNombre}</p>
                      <p className="text-[10px] text-on-surface-variant font-mono">{a.productoCodigo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-on-surface-variant">
                        Stock: <span className={a.stockActual <= 0 ? 'text-destructive font-bold' : 'text-foreground font-bold'}>{a.stockActual}</span>
                        {' / '}
                        <span className="text-primary font-bold">{a.stockObjetivo} {a.unidad}</span>
                      </p>
                      <p className="text-[11px] font-bold text-primary mt-0.5">
                        Sugerido: +{a.cantidadSugerida} {a.unidad}
                      </p>
                    </div>
                    {!a.puedeReponerDesdePadre && (
                      <Badge variant="warning">Sin stock padre</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: ÓRDENES ─────────────────────────────────────────────── */}
      {tab === 'ordenes' && (
        <div>
          <div className="flex gap-2 mb-4">
            {(['activas', 'ejecutadas', 'todas'] as const).map(e => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  filtroEstado === e
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-high text-on-surface-variant hover:text-foreground'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          {loading && <CargandoRow />}
          {!loading && ordenes.length === 0 && (
            <EmptyState
              icon={<ClipboardList size={32} className="text-on-surface-variant" />}
              title="Sin órdenes activas"
              description="Volvé al tab 'Alertas' y tocá 'Generar órdenes' para crear las sugeridas."
            />
          )}
          <div className="space-y-2">
            {ordenes.map(o => (
              <button
                key={o.id}
                onClick={() => abrirDetalle(o.id)}
                className="w-full text-left bg-surface rounded-xl border border-border hover:border-primary/50 hover:bg-surface-high/30 transition-colors p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-primary font-bold">{o.codigo}</span>
                    <Badge variant={ESTADO_BADGE[o.estado]?.variant ?? 'default'}>
                      {ESTADO_BADGE[o.estado]?.label ?? o.estado}
                    </Badge>
                    {o.generadoAuto && <Badge>Auto</Badge>}
                  </div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    {o.depositoOrigen?.nombre}
                    <ArrowRight size={12} className="text-on-surface-variant" />
                    {o.depositoDestino?.nombre}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {o._count?.items ?? 0} productos · {o.fecha}
                    {o.motivo && ` · ${o.motivo}`}
                  </p>
                </div>
                <div className="text-on-surface-variant">
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: COMPRAR ─────────────────────────────────────────────── */}
      {tab === 'comprar' && (
        <div>
          {loading && <CargandoRow />}
          {!loading && alertasCompra.length === 0 && (
            <EmptyState
              icon={<Check size={32} className="text-success" />}
              title="Nada que comprar"
              description="Los depósitos raíz tienen stock suficiente por encima del punto de reposición."
            />
          )}
          {!loading && alertasCompra.length > 0 && (
            <>
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                      <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Depósito</th>
                      <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock</th>
                      <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Sugerido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {alertasCompra.map(a => (
                      <tr key={`${a.productoId}-${a.depositoId}`} className="hover:bg-surface-high/50">
                        <td className="p-3">
                          <p className="font-semibold text-foreground">{a.productoNombre}</p>
                          <p className="text-[10px] font-mono text-on-surface-variant">{a.productoCodigo}</p>
                        </td>
                        <td className="p-3 hidden sm:table-cell">
                          <Badge>{a.depositoNombre}</Badge>
                        </td>
                        <td className="p-3 text-right">
                          <span className={a.stockActual <= 0 ? 'text-destructive font-bold' : 'text-foreground font-bold'}>
                            {a.stockActual}
                          </span>
                          <span className="text-on-surface-variant text-xs"> / {a.stockObjetivo}</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-primary font-extrabold">+{a.cantidadSugerida}</span>
                          <span className="text-on-surface-variant text-xs"> {a.unidad}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-surface-high/50 border border-border rounded-xl flex items-start gap-3">
                <ShoppingCart size={18} className="text-primary shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-on-surface-variant leading-relaxed">
                  Estos productos requieren una orden de compra a un proveedor externo. Desde{' '}
                  <span className="text-foreground font-bold">Órdenes de Compra</span> podés crear una OC
                  que reponga estos faltantes. El punto de reposición sugiere la cantidad; ajustala según
                  lo que decidas comprar con cada proveedor.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Modal detalle orden ──────────────────────────────────────── */}
      {detalleOrden && (
        <Modal
          open={!!detalleOrden}
          onClose={cerrarDetalle}
          title={`Orden ${detalleOrden.codigo}`}
          size="lg"
        >
          <div className="space-y-4">
            {/* Meta */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <Boxes size={14} className="text-on-surface-variant" />
                <span className="font-bold text-foreground">{detalleOrden.depositoOrigen?.nombre}</span>
                <ArrowRight size={14} className="text-primary" />
                <span className="font-bold text-foreground">{detalleOrden.depositoDestino?.nombre}</span>
              </div>
              <Badge variant={ESTADO_BADGE[detalleOrden.estado]?.variant ?? 'default'}>
                {ESTADO_BADGE[detalleOrden.estado]?.label ?? detalleOrden.estado}
              </Badge>
            </div>
            <div className="text-[11px] text-on-surface-variant">
              {detalleOrden.motivo && <span>{detalleOrden.motivo} · </span>}
              Creada por {detalleOrden.creadoPor?.nombre} el {detalleOrden.fecha}
              {detalleOrden.ejecutadoPor && (
                <span> · Ejecutada por {detalleOrden.ejecutadoPor.nombre} el {detalleOrden.fechaEjecucion}</span>
              )}
            </div>

            {/* Items editables */}
            <div className="bg-surface-high/30 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 border-b border-border text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                <span>Producto</span>
                <span className="text-right">Stock actual</span>
                <span className="text-right">Cantidad</span>
              </div>
              {detalleOrden.items.map((it: any) => {
                const puedeEditar = detalleOrden.estado === 'sugerida' || detalleOrden.estado === 'pendiente';
                return (
                  <div key={it.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 border-b border-border last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{it.producto?.nombre}</p>
                      <p className="text-[10px] font-mono text-on-surface-variant">{it.producto?.codigo}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-on-surface-variant">
                        Dest: <span className="text-foreground font-bold">{it.stockDestinoSnapshot ?? '—'}</span>
                      </p>
                      <p className="text-on-surface-variant">
                        Orig: <span className="text-foreground font-bold">{it.stockOrigenSnapshot ?? '—'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        disabled={!puedeEditar}
                        value={editItems[it.id] ?? 0}
                        onChange={e => setEditItems(prev => ({ ...prev, [it.id]: parseFloat(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 rounded bg-surface-high border border-border text-foreground text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                      />
                      <span className="text-[10px] text-on-surface-variant font-bold">{it.unidad}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Acciones */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {detalleOrden.estado !== 'ejecutada' && detalleOrden.estado !== 'cancelada' && (
                  <Button variant="destructive" size="sm" onClick={() => cancelarOrden(detalleOrden.id)}>
                    <XIcon size={14} />
                    Cancelar
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="md" onClick={cerrarDetalle}>Cerrar</Button>
                {detalleOrden.estado === 'sugerida' && (
                  <Button onClick={confirmarOrden} size="md">
                    <Check size={14} />
                    Confirmar
                  </Button>
                )}
                {(detalleOrden.estado === 'sugerida' || detalleOrden.estado === 'pendiente') && (
                  <Button onClick={ejecutarOrden} disabled={ejecutando} size="md">
                    <PlayCircle size={14} />
                    {ejecutando ? 'Ejecutando...' : 'Ejecutar'}
                  </Button>
                )}
              </div>
            </div>

            {user?.rol === 'admin' && (
              <p className="text-[10px] text-on-surface-variant text-center pt-2 border-t border-border">
                Al ejecutar se crean movimientos de transferencia entre depósitos.
                El stock se calcula en vivo desde la tabla de movimientos.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-componentes pequeños
// ----------------------------------------------------------------------------

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-10 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-high/50 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">{title}</h3>
      <p className="text-xs text-on-surface-variant mt-2 max-w-sm mx-auto">{description}</p>
    </div>
  );
}

function CargandoRow() {
  return (
    <div className="bg-surface rounded-xl border border-border p-10 text-center">
      <div className="inline-flex items-center gap-2 text-on-surface-variant">
        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm font-medium">Cargando...</span>
      </div>
    </div>
  );
}
