import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ChefHat, AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

// ============================================================================
// DisponibilidadRecetasWidget — "86 list" de arranque de día
// ----------------------------------------------------------------------------
// Al abrir la app a la mañana, el dueño/chef ve de una:
//   - "Hoy NO podés hacer: X platos" (sinStock) — cada uno con el ingrediente
//     que falta. Evita el "mozo te pide milanesa y no hay pan rallado" en
//     medio del servicio.
//   - "Al límite" (bajoStock) — platos con 1-5 porciones posibles. Aviso
//     proactivo para reponer HOY antes del servicio.
//
// Colapsado por default — el tamaño del widget depende de la cantidad de
// platos afectados, y si todo va bien no molesta. Al tocar se expande con
// la lista completa y el ingrediente que falta por plato.
//
// Criterio operativo:
//   - Rojo (sinStock): 0 porciones posibles → quiebre garantizado
//   - Ámbar (bajoStock): 1-5 porciones → reponer hoy
//   - Si ambas listas están vacías → no mostramos nada (no agregar ruido
//     al dashboard).
// ============================================================================

interface Item {
  recetaId: number;
  codigo: string;
  nombre: string;
  categoria: string | null;
  porciones: number;
  porcionesPosibles: number;
  ingredienteLimitante: {
    productoId: number;
    codigo: string;
    nombre: string;
    stockActual: number;
    unidad: string;
    cantidadNecesariaPorPorcion: number;
  } | null;
}

interface Data {
  sinStock: Item[];
  bajoStock: Item[];
  totalRecetas: number;
}

function fmtStock(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  // Stock con 2 decimales máximo — para kg y unidades se ve bien
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export default function DisponibilidadRecetasWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.getDisponibilidadRecetas()
      .then(r => { if (mounted) setData(r); })
      .catch(() => { if (mounted) setData(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) return null;
  if (!data) return null;
  const { sinStock, bajoStock } = data;
  // No mostrar si no hay nada crítico — el dashboard no premia el ruido.
  if (sinStock.length === 0 && bajoStock.length === 0) return null;

  // Severidad del widget: si hay sinStock = rojo (destructive), si solo hay
  // bajoStock = ámbar (warning).
  const hayCriticos = sinStock.length > 0;

  const borderColor = hayCriticos ? 'border-destructive/40' : 'border-amber-500/40';
  const bgColor = hayCriticos ? 'bg-destructive/5' : 'bg-amber-500/5';
  const iconBg = hayCriticos ? 'bg-destructive/15' : 'bg-amber-500/15';
  const iconColor = hayCriticos ? 'text-destructive' : 'text-amber-500';
  const Icon = hayCriticos ? AlertOctagon : AlertTriangle;

  const titleStr = hayCriticos
    ? `Hoy no podés hacer ${sinStock.length} plato${sinStock.length === 1 ? '' : 's'}`
    : `${bajoStock.length} plato${bajoStock.length === 1 ? '' : 's'} al límite`;

  const subtitleParts: string[] = [];
  if (sinStock.length > 0) {
    subtitleParts.push(sinStock.slice(0, 3).map(s => s.nombre).join(', ') + (sinStock.length > 3 ? '…' : ''));
  } else if (bajoStock.length > 0) {
    const b = bajoStock[0];
    subtitleParts.push(`${b.nombre} · quedan ~${b.porcionesPosibles} porc`);
  }

  return (
    <div className={`mb-6 rounded-xl border ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header — tap para toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-4 text-left flex items-center gap-3 hover:bg-background/20 transition-colors"
      >
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon size={18} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground flex items-center gap-2 flex-wrap">
            <ChefHat size={14} className={iconColor} />
            {titleStr}
            {bajoStock.length > 0 && hayCriticos && (
              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                +{bajoStock.length} al límite
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5 truncate">
            {expanded ? 'Tocá para cerrar' : subtitleParts.join(' · ')}
          </p>
        </div>
        {expanded
          ? <ChevronDown size={18} className={iconColor + ' shrink-0'} />
          : <ChevronRight size={18} className={iconColor + ' shrink-0'} />}
      </button>

      {expanded && (
        <div className="border-t border-border bg-background/40">
          {/* Sección: sinStock — rojo */}
          {sinStock.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-destructive">
                No se puede preparar — falta insumo
              </p>
              <div className="divide-y divide-border">
                {sinStock.slice(0, 10).map(item => (
                  <ItemRow key={item.recetaId} item={item} variant="sin" onClick={() => navigate(`/recetas?id=${item.recetaId}`)} />
                ))}
                {sinStock.length > 10 && (
                  <p className="px-4 py-2 text-[10px] text-on-surface-variant italic">
                    y {sinStock.length - 10} plato{sinStock.length - 10 === 1 ? '' : 's'} más sin stock…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Sección: bajoStock — ámbar */}
          {bajoStock.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-amber-500">
                Al límite — reponer hoy
              </p>
              <div className="divide-y divide-border">
                {bajoStock.slice(0, 10).map(item => (
                  <ItemRow key={item.recetaId} item={item} variant="bajo" onClick={() => navigate(`/recetas?id=${item.recetaId}`)} />
                ))}
                {bajoStock.length > 10 && (
                  <p className="px-4 py-2 text-[10px] text-on-surface-variant italic">
                    y {bajoStock.length - 10} plato{bajoStock.length - 10 === 1 ? '' : 's'} más al límite…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* CTA: ir a reposición para armar la compra */}
          <button
            onClick={() => navigate('/reposicion')}
            className="w-full p-3 border-t border-border flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
          >
            Generar órdenes de reposición
            <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, variant, onClick }: { item: Item; variant: 'sin' | 'bajo'; onClick: () => void }) {
  const ing = item.ingredienteLimitante;
  return (
    <button
      onClick={onClick}
      className="w-full p-3 flex items-start gap-3 text-left hover:bg-surface/40 active:bg-surface/60 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="font-semibold text-foreground text-sm truncate">{item.nombre}</p>
          <span className="font-mono text-[10px] text-primary/80 shrink-0">{item.codigo}</span>
        </div>
        {ing && (
          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
            {variant === 'sin' ? 'Falta ' : 'Queda poco '}
            <b className="text-foreground">{ing.nombre}</b>
            {' — '}
            <span className="font-mono">{fmtStock(ing.stockActual)} {ing.unidad}</span>
            {' en stock, '}
            <span className="font-mono">{fmtStock(ing.cantidadNecesariaPorPorcion)} {ing.unidad}</span>
            {' por porción'}
          </p>
        )}
      </div>
      <div className="text-right shrink-0 min-w-[70px]">
        <p className={`font-mono text-lg font-extrabold tabular-nums leading-tight ${variant === 'sin' ? 'text-destructive' : 'text-amber-500'}`}>
          {item.porcionesPosibles}
        </p>
        <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">
          porc
        </p>
      </div>
    </button>
  );
}
