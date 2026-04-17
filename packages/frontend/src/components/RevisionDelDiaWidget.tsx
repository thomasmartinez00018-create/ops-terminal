import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ClipboardCheck, ChevronDown, ChevronRight, Send, AlertTriangle } from 'lucide-react';

// ============================================================================
// RevisionDelDiaWidget — rutina de cierre para combatir "robo hormiga"
// ----------------------------------------------------------------------------
// Problema real del rubro: pequeños hurtos acumulados diarios generan
// faltantes mensuales importantes. La recomendación industry-standard es
// "inventario diario actualizado", pero hacer inventario real todos los
// días es inviable.
//
// Compromiso práctico: al fin de turno el encargado abre este widget, ve
// un resumen de qué pasó hoy (ingresos, consumos, mermas, alertas) y si
// todo cuadra en su cabeza, lo manda por WhatsApp al dueño. Sin schema
// nuevo: es informativo puro, el valor está en la rutina y la
// transparencia hacia el dueño.
//
// No bloquea — aparece discreto y solo se expande al tap. No molesta al
// dueño que abre el Dashboard a la mañana. Pensado para la tarde / noche.
// ============================================================================

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

const tipoNombre: Record<string, string> = {
  ingreso: 'Ingresos',
  venta: 'Ventas',
  consumo_interno: 'Consumos',
  merma: 'Mermas',
  transferencia: 'Transferencias',
  elaboracion: 'Elaboraciones',
  ajuste: 'Ajustes',
  devolucion: 'Devoluciones',
};

export default function RevisionDelDiaWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [movHoy, setMovHoy] = useState<any[]>([]);
  const [mermaAyer, setMermaAyer] = useState<number>(0);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const hoy = useMemo(() => new Date().toISOString().split('T')[0], []);
  const ayer = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.getMovimientos({ fecha: hoy }),
      api.getMovimientos({ fecha: ayer, tipo: 'merma' }),
    ])
      .then(([h, a]) => {
        if (!mounted) return;
        setMovHoy(Array.isArray(h) ? h : []);
        const mAyer = Array.isArray(a)
          ? a.reduce((sum, m: any) => sum + (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0), 0)
          : 0;
        setMermaAyer(mAyer);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [hoy, ayer]);

  // Agregados
  const { porTipo, totalMov, mermaHoy, anomalias } = useMemo(() => {
    const byTipo: Record<string, { count: number; valor: number }> = {};
    let total = 0;
    let mHoy = 0;
    for (const m of movHoy) {
      const t = m.tipo;
      const valor = (Number(m.cantidad) || 0) * (Number(m.costoUnitario) || 0);
      if (!byTipo[t]) byTipo[t] = { count: 0, valor: 0 };
      byTipo[t].count += 1;
      byTipo[t].valor += valor;
      total += 1;
      if (t === 'merma') mHoy += valor;
    }
    // Anomalías: mermas de hoy > 2× mermas de ayer (y mínimo $500)
    const anomalias: string[] = [];
    if (mHoy > 500 && mHoy > mermaAyer * 2 && mermaAyer > 0) {
      anomalias.push(`Las mermas de hoy (${fmt(mHoy)}) son más del doble que ayer (${fmt(mermaAyer)})`);
    }
    return { porTipo: byTipo, totalMov: total, mermaHoy: mHoy, anomalias };
  }, [movHoy, mermaAyer]);

  if (loading) return null;
  // Solo aparece si hubo movimiento hoy. En un negocio cerrado el widget
  // desaparece.
  if (totalMov === 0) return null;

  const compartirWA = () => {
    const lines = [
      `📋 Revisión del día — ${hoy}`,
      `Encargado: ${user?.nombre || '—'}`,
      '',
      `${totalMov} movimientos registrados hoy:`,
      ...Object.entries(porTipo).map(([t, v]) =>
        `• ${tipoNombre[t] || t}: ${v.count} operación${v.count === 1 ? '' : 'es'}${v.valor > 0 ? ` · ${fmt(v.valor)}` : ''}`
      ),
      '',
      ...(anomalias.length > 0 ? ['⚠ A revisar:', ...anomalias.map(a => `  — ${a}`), ''] : []),
      'Enviado desde OPS Terminal.',
    ];
    const txt = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${txt}`, '_blank');
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left flex items-center gap-3 hover:bg-surface-high/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <ClipboardCheck size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground">
            Revisión del día
            {anomalias.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/15 px-2 py-0.5 rounded">
                <AlertTriangle size={10} /> {anomalias.length} a revisar
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {totalMov} movimiento{totalMov === 1 ? '' : 's'} hoy
            {mermaHoy > 0 && <> · merma {fmt(mermaHoy)}</>}
            {' — tocá para ver el resumen'}
          </p>
        </div>
        {expanded
          ? <ChevronDown size={20} className="text-on-surface-variant shrink-0" />
          : <ChevronRight size={20} className="text-on-surface-variant shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border bg-background/40">
          {/* Desglose por tipo */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(porTipo)
              .sort((a, b) => b[1].count - a[1].count)
              .map(([t, v]) => (
                <div key={t} className="rounded-lg bg-surface-high/40 p-2.5">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    {tipoNombre[t] || t}
                  </p>
                  <p className="font-mono text-lg font-extrabold text-foreground tabular-nums leading-tight">
                    {v.count}
                  </p>
                  {v.valor > 0 && (
                    <p className="text-[10px] text-on-surface-variant font-mono">{fmt(v.valor)}</p>
                  )}
                </div>
              ))}
          </div>

          {/* Anomalías destacadas */}
          {anomalias.length > 0 && (
            <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Cosas a revisar
              </p>
              <ul className="space-y-1">
                {anomalias.map((a, i) => (
                  <li key={i} className="text-xs text-foreground">• {a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Acciones */}
          <div className="p-3 border-t border-border bg-surface/40 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => navigate(`/movimientos?fecha=${hoy}`)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-surface-high text-xs font-bold text-foreground active:bg-surface-high/70"
            >
              Ver detalle de movimientos
            </button>
            <button
              onClick={compartirWA}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-success/15 text-success text-xs font-bold active:scale-95 transition-transform"
            >
              <Send size={13} /> Enviar resumen por WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
