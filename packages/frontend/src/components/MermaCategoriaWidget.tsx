import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { AlertTriangle, ArrowRight } from 'lucide-react';

// ============================================================================
// MermaCategoriaWidget — "¿dónde se está yendo la mercadería?"
// ----------------------------------------------------------------------------
// Complemento del RevisionDelDiaWidget. Mientras Revisión del Día muestra la
// ANOMALÍA del día (mermas 2x más altas que promedio), este widget muestra el
// DESGLOSE de los últimos 30 días por CATEGORÍA:
//
//   Preparación         $45.000   ← merma "esperada" (cáscara, hueso)
//   Vencimiento         $18.000   ← evitable con rotación / compras más chicas
//   Rotura              $5.000
//   Cortesía            $12.000   ← hay que ver si están controladas
//   Comida staff        $22.000
//   Sin explicación     $34.000   ⚠ BANDERA ROJA — auditar
//
// La magia está en que "sin_explicacion" se destaca en rojo si representa
// >20% del total. Eso es el pitch anti-robo-hormiga: el dueño ve de una
// cuánta plata "se le va por la ventana" sin poder explicarla.
//
// Carga lazy: solo pega al backend cuando el widget es visible (no bloquea
// el render del dashboard). Skip para roles no-admin/no-dueño.
// ============================================================================

interface Grupo {
  tipo: string;
  categoria: string;
  cantidad: number;
  valor: number;
  count: number;
}

interface Response {
  totalValor: number;
  totalMovimientos: number;
  grupos: Grupo[];
}

const CATEGORIAS_META: Record<string, { label: string; emoji: string; color: string; bad: boolean }> = {
  preparacion:      { label: 'Preparación',     emoji: '🥬', color: 'text-on-surface-variant', bad: false },
  vencimiento:      { label: 'Se venció',       emoji: '📅', color: 'text-amber-500',          bad: true  },
  rotura:           { label: 'Se rompió',       emoji: '💥', color: 'text-on-surface-variant', bad: false },
  cortesia:         { label: 'Cortesía',        emoji: '🎁', color: 'text-blue-400',           bad: false },
  staff_meal:       { label: 'Comida staff',    emoji: '🍽️', color: 'text-on-surface-variant', bad: false },
  sin_explicacion:  { label: 'Sin explicación', emoji: '❓', color: 'text-destructive',        bad: true  },
  sin_categorizar:  { label: 'Sin categorizar', emoji: '⚪', color: 'text-on-surface-variant', bad: false },
};

function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function MermaCategoriaWidget() {
  const navigate = useNavigate();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const hasta = new Date().toISOString().split('T')[0];
    const d = new Date(); d.setDate(d.getDate() - 30);
    const desde = d.toISOString().split('T')[0];

    api.getMermasPorCategoria({ desde, hasta })
      .then((r: any) => { if (mounted) setData(r); })
      .catch(() => { if (mounted) setData(null); })
      .finally(() => { if (mounted) setLoading(false); });

    return () => { mounted = false; };
  }, []);

  // Agrupar por categoría sumando merma + consumo_interno en el mismo bucket.
  const categorias = useMemo(() => {
    if (!data?.grupos) return [];
    const agg: Record<string, { categoria: string; valor: number; cantidad: number; count: number }> = {};
    for (const g of data.grupos) {
      const cat = g.categoria || 'sin_categorizar';
      if (!agg[cat]) agg[cat] = { categoria: cat, valor: 0, cantidad: 0, count: 0 };
      agg[cat].valor += g.valor;
      agg[cat].cantidad += g.cantidad;
      agg[cat].count += g.count;
    }
    return Object.values(agg).sort((a, b) => b.valor - a.valor);
  }, [data]);

  const totalValor = data?.totalValor || 0;
  const sinExplicacion = categorias.find(c => c.categoria === 'sin_explicacion');
  const pctSinExplicacion = totalValor > 0 && sinExplicacion ? (sinExplicacion.valor / totalValor) * 100 : 0;
  const alertaSinExplicacion = pctSinExplicacion >= 20;

  // No mostrar si loading, sin data, o si no hay nada relevante (0 mermas).
  if (loading) return null;
  if (!data || data.totalMovimientos === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Últimos 30 días · ¿Dónde se está yendo?
            </p>
            <p className="font-mono text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums mt-0.5 leading-tight">
              {fmtMoney(totalValor)}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              en mermas y consumo interno · {data.totalMovimientos} movimientos
            </p>
          </div>
          {alertaSinExplicacion && (
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-[10px] font-extrabold">
              <AlertTriangle size={12} />
              A REVISAR
            </div>
          )}
        </div>

        {alertaSinExplicacion && sinExplicacion && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive leading-relaxed">
              <b>{pctSinExplicacion.toFixed(0)}% de tus mermas</b> están sin explicación
              ({fmtMoney(sinExplicacion.valor)}). Cuando este número es alto, suele esconder
              errores de carga o pérdidas que conviene auditar.
            </p>
          </div>
        )}
      </div>

      {/* Barras por categoría — el orden ya viene por valor descendente */}
      <div className="divide-y divide-border">
        {categorias.slice(0, 7).map(c => {
          const meta = CATEGORIAS_META[c.categoria] || CATEGORIAS_META['sin_categorizar'];
          const pct = totalValor > 0 ? (c.valor / totalValor) * 100 : 0;
          return (
            <div key={c.categoria} className="p-3 flex items-center gap-3">
              <div className="text-lg shrink-0 w-7 text-center">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className={`text-xs font-bold ${meta.bad && pct >= 20 ? meta.color : 'text-foreground'}`}>
                    {meta.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-mono text-sm font-extrabold tabular-nums ${meta.bad && pct >= 20 ? meta.color : 'text-foreground'}`}>
                      {fmtMoney(c.valor)}
                    </span>
                    <span className="text-[10px] font-bold text-on-surface-variant tabular-nums w-8 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      meta.bad && pct >= 20 ? 'bg-destructive' : meta.bad ? 'bg-amber-500' : 'bg-primary/60'
                    }`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate('/reportes?tab=mermas')}
        className="w-full p-3 border-t border-border flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
      >
        Ver detalle completo
        <ArrowRight size={13} />
      </button>
    </div>
  );
}
