/**
 * Skeleton — placeholder animado para estados de carga. Reemplaza el
 * "Cargando…" en texto plano que se siente tosco/roto. Da percepción de
 * velocidad: el usuario ve la "forma" de lo que viene en vez de un vacío.
 *
 * Uso:
 *   {loading ? <SkeletonList rows={6} /> : <Tabla data={data} />}
 *   {loading ? <SkeletonCards count={8} /> : <Cards data={data} />}
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-high/60 ${className}`}
      aria-hidden="true"
    />
  );
}

/** Lista de filas tipo tabla (para Stock, Movimientos, etc.) */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-surface p-3"
        >
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Grilla de cards (para Carta, Productos en modo card). */
export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      role="status"
      aria-label="Cargando"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-surface overflow-hidden">
          <Skeleton className="h-24 w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
            <Skeleton className="h-4 w-1/3 mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Fila de stat-cards (para Dashboard, headers con métricas). */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-surface p-3 space-y-2">
          <Skeleton className="h-2.5 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      ))}
    </div>
  );
}
