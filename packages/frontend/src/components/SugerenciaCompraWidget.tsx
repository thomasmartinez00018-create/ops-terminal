import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ShoppingCart, ChevronRight, ChevronDown, TrendingDown, Loader2, ArrowRight } from 'lucide-react';

// ============================================================================
// SugerenciaCompraWidget — "te estás quedando corto de X, comprale a Y"
// ----------------------------------------------------------------------------
// Widget para el Dashboard que detecta al entrar a la app qué productos
// están en zona de reposición y sugiere el proveedor con el mejor precio
// para cada uno. Aprovecha infraestructura existente:
//   - /api/reposicion/alertas → productos con stock debajo del punto de
//     reposición (ya calcula cantidadSugerida, requiereCompra, etc).
//   - /api/proveedores/comparar-precios/:productoId → lista de proveedores
//     con último precio. La usamos lazy (sólo al expandir el widget).
//
// Caso de uso real: el dueño abre la app a la mañana, ve "faltan 4
// productos, total estimado $48.500, el más barato te lo da Don Juan para
// 3 de los 4 productos". Un click y la OC queda pre-armada.
// ============================================================================

interface AlertaCompra {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  unidad: string;
  cantidadSugerida: number;
  stockActual: number;
  stockMinimo: number;
  depositoNombre: string;
}

interface MejorPrecio {
  proveedorId: number;
  proveedorNombre: string;
  precio: number;
  unidad?: string;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = abs >= 1000
    ? { maximumFractionDigits: 0 }
    : { maximumFractionDigits: 2 };
  return `$${n.toLocaleString('es-AR', opts)}`;
}

export default function SugerenciaCompraWidget() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<AlertaCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // mejorPrecio[productoId] = null mientras carga, undefined si aún no se pidió
  const [preciosPorProducto, setPreciosPorProducto] = useState<Record<number, MejorPrecio | null>>({});

  // Carga inicial — solo alertas con requiereCompra=true (las que hay que
  // comprarle al proveedor; las que se pueden reponer del depósito padre no
  // son parte de este widget).
  useEffect(() => {
    let mounted = true;
    api.getAlertasReposicion()
      .then(res => {
        if (!mounted) return;
        const soloCompra = (res.alertas || [])
          .filter((a: any) => a.requiereCompra)
          .map((a: any) => ({
            productoId: a.productoId,
            productoCodigo: a.productoCodigo,
            productoNombre: a.productoNombre,
            unidad: a.unidad,
            cantidadSugerida: Number(a.cantidadSugerida) || 0,
            stockActual: Number(a.stockActual) || 0,
            stockMinimo: Number(a.stockMinimo) || 0,
            depositoNombre: a.depositoNombre,
          }));
        // Dedupe por productoId (un producto puede aparecer en N depósitos)
        const byProducto = new Map<number, AlertaCompra>();
        for (const a of soloCompra) {
          const prev = byProducto.get(a.productoId);
          if (!prev) {
            byProducto.set(a.productoId, a);
          } else {
            prev.cantidadSugerida += a.cantidadSugerida;
          }
        }
        setAlertas(Array.from(byProducto.values()));
      })
      .catch(() => setAlertas([]))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Al expandir por primera vez, traer los mejores precios. Se hace on-demand
  // para no gastar requests al backend si el usuario no abre el widget.
  const cargarPrecios = async () => {
    const pendientes = alertas.filter(a => !(a.productoId in preciosPorProducto));
    if (!pendientes.length) return;
    // Consultas en paralelo pero cap a 10 para no saturar si hay muchas alertas.
    const batch = pendientes.slice(0, 10);
    const resultados = await Promise.allSettled(
      batch.map(a => api.compararPrecios(a.productoId).then(rows => ({ a, rows })))
    );
    const next: Record<number, MejorPrecio | null> = {};
    for (const r of resultados) {
      if (r.status !== 'fulfilled') continue;
      const { a, rows } = r.value;
      // rows: [{ proveedorId, proveedorNombre, ultimoPrecio, ... }]
      const withPrice = (rows || []).filter((x: any) => Number(x.ultimoPrecio) > 0);
      if (!withPrice.length) { next[a.productoId] = null; continue; }
      const mejor = withPrice.reduce((min: any, cur: any) =>
        Number(cur.ultimoPrecio) < Number(min.ultimoPrecio) ? cur : min
      );
      next[a.productoId] = {
        proveedorId: mejor.proveedorId,
        proveedorNombre: mejor.proveedorNombre || mejor.proveedor?.nombre || '—',
        precio: Number(mejor.ultimoPrecio),
        unidad: mejor.unidadProveedor || a.unidad,
      };
    }
    setPreciosPorProducto(prev => ({ ...prev, ...next }));
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) cargarPrecios();
  };

  // Totales estimados
  const totalEstimado = useMemo(() => {
    let total = 0;
    let conPrecio = 0;
    for (const a of alertas) {
      const p = preciosPorProducto[a.productoId];
      if (p && p.precio > 0) {
        total += p.precio * a.cantidadSugerida;
        conPrecio++;
      }
    }
    return { total, conPrecio };
  }, [alertas, preciosPorProducto]);

  // Agrupa proveedores sugeridos (para "¿A quién le compramos la mayoría?")
  const proveedorMasFrecuente = useMemo(() => {
    const count: Record<string, { nombre: string; id: number; items: number; total: number }> = {};
    for (const a of alertas) {
      const p = preciosPorProducto[a.productoId];
      if (!p) continue;
      const key = String(p.proveedorId);
      if (!count[key]) {
        count[key] = { nombre: p.proveedorNombre, id: p.proveedorId, items: 0, total: 0 };
      }
      count[key].items += 1;
      count[key].total += p.precio * a.cantidadSugerida;
    }
    const sorted = Object.values(count).sort((a, b) => b.items - a.items);
    return sorted[0] || null;
  }, [alertas, preciosPorProducto]);

  // Estados de render
  if (loading) return null; // no mostramos spinner — el widget es secundario
  if (alertas.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header — siempre visible, tap para expandir */}
      <button
        onClick={toggleExpand}
        className="w-full p-4 text-left flex items-center gap-3 hover:bg-amber-500/10 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <ShoppingCart size={18} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">
            Te estás quedando corto de {alertas.length} producto{alertas.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {expanded
              ? (totalEstimado.conPrecio > 0
                ? `Total estimado: ${fmtMoney(totalEstimado.total)} (${totalEstimado.conPrecio} con precio de proveedor)`
                : 'Buscando mejores precios…')
              : `Tocá para ver qué comprar y a quién — ${alertas.slice(0, 3).map(a => a.productoNombre.split(' ')[0]).join(', ')}${alertas.length > 3 ? '…' : ''}`}
          </p>
        </div>
        {expanded
          ? <ChevronDown size={20} className="text-amber-500 shrink-0" />
          : <ChevronRight size={20} className="text-amber-500 shrink-0" />}
      </button>

      {/* Lista expandida con mejor proveedor por producto */}
      {expanded && (
        <div className="border-t border-amber-500/20 bg-background/40">
          <div className="divide-y divide-border">
            {alertas.slice(0, 10).map(a => {
              const p = preciosPorProducto[a.productoId];
              const cargando = !(a.productoId in preciosPorProducto);
              return (
                <div key={a.productoId} className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{a.productoNombre}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      Faltan <b className="text-amber-500 font-mono">{a.cantidadSugerida.toFixed(2)} {a.unidad}</b>
                      <span className="text-on-surface-variant/70"> · queda {a.stockActual} de mín {a.stockMinimo}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 min-w-[100px]">
                    {cargando ? (
                      <Loader2 size={14} className="animate-spin text-on-surface-variant inline" />
                    ) : p === null ? (
                      <span className="text-[10px] font-bold text-on-surface-variant/70">sin proveedor</span>
                    ) : p ? (
                      <>
                        <p className="text-[10px] font-bold text-primary">
                          <TrendingDown size={10} className="inline" /> {p.proveedorNombre}
                        </p>
                        <p className="font-mono text-sm font-extrabold text-foreground tabular-nums">
                          {fmtMoney(p.precio * a.cantidadSugerida)}
                        </p>
                        <p className="text-[9px] text-on-surface-variant font-mono">
                          {fmtMoney(p.precio)} / {a.unidad}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {alertas.length > 10 && (
              <p className="p-2 text-center text-[10px] text-on-surface-variant">
                y {alertas.length - 10} producto{alertas.length - 10 === 1 ? '' : 's'} más…
              </p>
            )}
          </div>

          {/* Acciones */}
          <div className="p-3 border-t border-amber-500/20 bg-surface/40 flex flex-col sm:flex-row gap-2">
            {proveedorMasFrecuente && (
              <div className="flex-1 text-xs text-on-surface-variant">
                La mayoría ({proveedorMasFrecuente.items} de {alertas.length}) se compran más barato a{' '}
                <b className="text-foreground">{proveedorMasFrecuente.nombre}</b> — total estimado{' '}
                <b className="text-foreground font-mono">{fmtMoney(proveedorMasFrecuente.total)}</b>.
              </div>
            )}
            <button
              onClick={() => navigate('/reposicion')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-amber-950 text-xs font-extrabold active:scale-95 transition-transform"
            >
              Armar pedidos
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
