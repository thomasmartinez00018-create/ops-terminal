import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { factorDesperdicio } from '../lib/merma';
import { TrendingDown, ChevronRight } from 'lucide-react';

// ============================================================================
// MargenCriticoWidget — "3 platos perdieron margen, revisá el precio"
// ----------------------------------------------------------------------------
// Se monta en el Dashboard del admin y del dueño. Calcula en cliente el
// margen actual de cada receta con precio de venta cargado, cruzando los
// últimos precios de ingredientes. Solo aparece si hay al menos un plato en
// estado "crítico" (margen < objetivo - 10 puntos).
//
// Es el caso de venta más fuerte de la app: "hace 2 meses cobrabas $4500 por
// tu pizza con 65% de margen; ahora con los mismos precios estás en 48%.
// Subila o cambiá proveedor."
// ============================================================================

interface RecetaCritica {
  id: number;
  nombre: string;
  codigo: string;
  costoPorPorcion: number;
  precioVenta: number;
  margenActual: number;
  margenObjetivo: number;
  perdida: number; // cuánto perdiste de margen vs objetivo
}

export default function MargenCriticoWidget() {
  const navigate = useNavigate();
  const [criticas, setCriticas] = useState<RecetaCritica[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Traer recetas con precio venta + todos los últimos costos en paralelo.
        const recetas = await api.getRecetas({ activo: 'true' });
        if (!mounted) return;
        const conPrecio = recetas.filter((r: any) => Number(r.precioVenta) > 0);
        if (conPrecio.length === 0) { setLoading(false); return; }

        // Juntar todos los productoId que aparecen
        const pids = new Set<number>();
        for (const r of conPrecio) {
          for (const ing of r.ingredientes || []) {
            if (ing.productoId) pids.add(ing.productoId);
          }
        }
        const precios = await api.getUltimosCostos(Array.from(pids));
        if (!mounted) return;

        const result: RecetaCritica[] = [];
        for (const r of conPrecio) {
          if (!r.ingredientes?.length || !r.porciones) continue;
          let costoTotal = 0;
          for (const ing of r.ingredientes) {
            const precio = ing.productoId ? (precios[ing.productoId]?.costoUnitario ?? 0) : 0;
            const cantNeta = Number(ing.cantidad) || 0;
            const factor = factorDesperdicio(Number(ing.mermaEsperada) || 0);
            costoTotal += cantNeta * factor * precio;
          }
          const costoPorPorcion = costoTotal / r.porciones;
          const precioVenta = Number(r.precioVenta);
          const margenActual = ((precioVenta - costoPorPorcion) / precioVenta) * 100;
          const margenObjetivo = Number(r.margenObjetivo) || 70;
          if (margenActual < margenObjetivo - 10) {
            result.push({
              id: r.id,
              nombre: r.nombre,
              codigo: r.codigo,
              costoPorPorcion,
              precioVenta,
              margenActual,
              margenObjetivo,
              perdida: margenObjetivo - margenActual,
            });
          }
        }
        // Ordenar por pérdida descendente (más crítico primero)
        result.sort((a, b) => b.perdida - a.perdida);
        setCriticas(result);
      } catch {
        // silencioso, no bloqueamos el dashboard si falla
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading || criticas.length === 0) return null;

  return (
    <button
      onClick={() => navigate('/recetas')}
      className="w-full mb-6 bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-left hover:bg-destructive/15 transition group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
          <TrendingDown size={18} className="text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">
            {criticas.length === 1
              ? '1 plato perdió margen'
              : `${criticas.length} platos perdieron margen`}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5 truncate">
            {criticas.slice(0, 3).map(r => `${r.nombre} (${r.margenActual.toFixed(0)}%)`).join(' · ')}
            {criticas.length > 3 ? ` y ${criticas.length - 3} más` : ''}
            {' — revisá el precio'}
          </p>
        </div>
        <ChevronRight size={20} className="text-destructive group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}
