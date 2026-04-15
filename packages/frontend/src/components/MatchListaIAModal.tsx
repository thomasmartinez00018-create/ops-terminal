import { useEffect, useMemo, useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import SearchableSelect from './ui/SearchableSelect';
import { api } from '../lib/api';
import {
  Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowRight,
  XCircle, Check, Wand2,
} from 'lucide-react';

// ============================================================================
// MatchListaIAModal — flujo completo match-ai → review → apply en un solo modal
// ============================================================================
// El bug que resolvemos: al importar una lista de precios, los items quedan en
// estadoMatch='PENDIENTE' porque el auto-match exacto por nombre (en el router
// /importar) casi nunca encuentra coincidencia en la primera lista de un
// proveedor nuevo (ProveedorProducto está vacío para ese proveedor). El
// Comparador filtra por estadoMatch='OK' → muestra "Sin datos" → el cliente
// piensa que la importación falló.
//
// Este componente es el gatillo UX que faltaba:
//   1. idle     → explica qué va a pasar, botón "Vincular con IA"
//   2. matching → llama POST /listas-precio/:id/match-ai (Gemini matchea)
//   3. review   → tabla editable: marcar/desmarcar, cambiar producto manual
//   4. applying → llama POST /listas-precio/:id/apply-matches
//   5. done     → "N vínculos aplicados" + CTA a Comparador
//
// Reutilizable desde ImportarLista (por fila + post-importación) y desde el
// empty state del ComparadorPrecios. Props mínimas — la madre decide listaId
// y qué hacer en onSuccess.
// ============================================================================

type Confianza = 'alta' | 'media' | 'baja' | 'error';
type Step = 'idle' | 'matching' | 'review' | 'applying' | 'done' | 'error';

interface Propuesta {
  itemId: number;
  productoOriginal: string;
  productoId: number | null;
  confianza: Confianza;
  producto?: { id: number; codigo: string; nombre: string; rubro?: string } | null;
}

interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  rubro?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  listaId: number | null;
  listaInfo?: {
    codigo?: string;
    proveedorNombre?: string;
    pendientes?: number;
  };
  /** Se dispara después de aplicar los matches. Recibe la cantidad aplicada. */
  onSuccess?: (applied: number) => void;
  /** Si true, muestra un CTA "Ver en comparador" en el step done */
  showComparadorCTA?: boolean;
  /** Callback opcional cuando se hace click en "Ver en comparador" */
  onGoComparador?: () => void;
}

const CONF_STYLES: Record<Confianza, { label: string; className: string }> = {
  alta: {
    label: 'Alta',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  media: {
    label: 'Media',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  baja: {
    label: 'Baja',
    className: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  error: {
    label: 'Error',
    className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  },
};

export default function MatchListaIAModal({
  open,
  onClose,
  listaId,
  listaInfo,
  onSuccess,
  showComparadorCTA = false,
  onGoComparador,
}: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [proposals, setProposals] = useState<Propuesta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  // itemId → está activo (se va a aplicar)
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  // itemId → productoId override (si el usuario cambió el match sugerido)
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const [applied, setApplied] = useState(0);

  // Reset al abrir/cerrar o cambiar de lista
  useEffect(() => {
    if (!open) return;
    setStep('idle');
    setProposals([]);
    setSelected({});
    setOverrides({});
    setErrorMsg('');
    setApplied(0);
  }, [open, listaId]);

  const handleStart = async () => {
    if (!listaId) return;
    setStep('matching');
    setErrorMsg('');
    try {
      // Disparamos match-ai y carga de productos en paralelo — el usuario está
      // mirando un loader y cada segundo cuenta.
      const [matchResp, prods] = await Promise.all([
        api.matchListaAI(listaId),
        api.getProductos({ activo: 'true' }),
      ]);
      const results: Propuesta[] = matchResp.results || [];
      setProductos(prods as Producto[]);
      setProposals(results);

      // Default: pre-seleccionar los de confianza alta y media.
      // Los de "baja" o null quedan desmarcados — el usuario decide manualmente.
      const sel: Record<number, boolean> = {};
      for (const r of results) {
        if (r.productoId && (r.confianza === 'alta' || r.confianza === 'media')) {
          sel[r.itemId] = true;
        }
      }
      setSelected(sel);
      setStep('review');
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al matchear con IA');
      setStep('error');
    }
  };

  const handleApply = async () => {
    if (!listaId) return;
    // Construir lista de matches: para cada itemId seleccionado, usar el
    // override si existe, si no el productoId propuesto por la IA.
    const matches = proposals
      .filter((p) => selected[p.itemId])
      .map((p) => ({
        itemId: p.itemId,
        productoId: overrides[p.itemId] ?? p.productoId,
      }))
      .filter((m): m is { itemId: number; productoId: number } => m.productoId != null);

    if (!matches.length) {
      setErrorMsg('Marcá al menos un ítem para vincular');
      return;
    }

    setStep('applying');
    setErrorMsg('');
    try {
      const resp = await api.applyMatches(listaId, { matches });
      setApplied(resp.applied || matches.length);
      setStep('done');
      onSuccess?.(resp.applied || matches.length);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al aplicar vínculos');
      setStep('error');
    }
  };

  const toggleOne = (itemId: number) => {
    setSelected((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleAll = (value: boolean) => {
    const next: Record<number, boolean> = {};
    for (const p of proposals) {
      if (p.productoId || overrides[p.itemId]) next[p.itemId] = value;
    }
    setSelected(next);
  };

  const setOverride = (itemId: number, productoId: string) => {
    const id = Number(productoId);
    if (!id) {
      // Limpiar override y desmarcar si la IA tampoco tenía match
      setOverrides((prev) => {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      });
      const p = proposals.find((x) => x.itemId === itemId);
      if (p && !p.productoId) {
        setSelected((prev) => ({ ...prev, [itemId]: false }));
      }
      return;
    }
    setOverrides((prev) => ({ ...prev, [itemId]: id }));
    // Si el usuario eligió manualmente, auto-marcar
    setSelected((prev) => ({ ...prev, [itemId]: true }));
  };

  // Stats para el header del step review
  const stats = useMemo(() => {
    const total = proposals.length;
    const marcados = Object.values(selected).filter(Boolean).length;
    const sinMatch = proposals.filter((p) => !p.productoId && !overrides[p.itemId]).length;
    return { total, marcados, sinMatch };
  }, [proposals, selected, overrides]);

  // Options para el SearchableSelect de productos
  const productoOptions = useMemo(
    () =>
      productos.map((p) => ({
        value: String(p.id),
        label: `${p.codigo} · ${p.nombre}${p.rubro ? ` (${p.rubro})` : ''}`,
      })),
    [productos]
  );

  const title =
    step === 'done'
      ? 'Vínculos aplicados'
      : listaInfo?.codigo
      ? `Vincular ${listaInfo.codigo} con IA`
      : 'Vincular lista con IA';

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {/* ═════ STEP: IDLE ═════ */}
      {step === 'idle' && (
        <div className="space-y-5">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="shrink-0 w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Vinculación automática con Gemini
              </p>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                La IA va a analizar{' '}
                {listaInfo?.pendientes ? (
                  <>
                    los <strong className="text-foreground">{listaInfo.pendientes}</strong>{' '}
                    productos pendientes
                  </>
                ) : (
                  'los productos importados'
                )}{' '}
                {listaInfo?.proveedorNombre && (
                  <>
                    de <strong className="text-foreground">{listaInfo.proveedorNombre}</strong>{' '}
                  </>
                )}
                y te va a proponer un match contra tu catálogo. Vos revisás y
                aplicás solo lo que tenga sentido.
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-xs text-on-surface-variant">
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              La IA ignora marca, presentación y envase (Muzza La Paulina 5kg →
              Muzzarella).
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              Cada propuesta viene con nivel de confianza (alta / media / baja).
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              Podés cambiar el match manualmente antes de aplicar.
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              Al aplicar, los productos aparecen inmediatamente en el Comparador.
            </li>
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleStart} disabled={!listaId}>
              <Wand2 className="w-4 h-4" />
              Vincular con IA
            </Button>
          </div>
        </div>
      )}

      {/* ═════ STEP: MATCHING ═════ */}
      {step === 'matching' && (
        <div className="py-16 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Gemini analizando productos...</p>
            <p className="text-xs text-on-surface-variant mt-1">
              Esto puede tardar 10-30 segundos según la cantidad de ítems.
            </p>
          </div>
        </div>
      )}

      {/* ═════ STEP: REVIEW ═════ */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-surface-high border border-border">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-on-surface-variant">
                Total: <strong className="text-foreground">{stats.total}</strong>
              </span>
              <span className="text-primary">
                Marcados: <strong>{stats.marcados}</strong>
              </span>
              {stats.sinMatch > 0 && (
                <span className="text-rose-400">
                  Sin match: <strong>{stats.sinMatch}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAll(true)}
                className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
              >
                Marcar todos
              </button>
              <span className="text-zinc-700">·</span>
              <button
                onClick={() => toggleAll(false)}
                className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:underline"
              >
                Desmarcar
              </button>
            </div>
          </div>

          {/* Tabla de propuestas */}
          <div className="border border-border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="border-b border-border text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <th className="px-3 py-2.5 text-left w-10"></th>
                  <th className="px-3 py-2.5 text-left">Producto importado</th>
                  <th className="px-3 py-2.5 text-center w-6"></th>
                  <th className="px-3 py-2.5 text-left">Producto del catálogo</th>
                  <th className="px-3 py-2.5 text-center w-20">Confianza</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const isChecked = !!selected[p.itemId];
                  const effectiveId = overrides[p.itemId] ?? p.productoId;
                  const effectiveProd = productos.find((x) => x.id === effectiveId);
                  return (
                    <tr
                      key={p.itemId}
                      className={`border-b border-border/50 transition-colors ${
                        isChecked ? 'bg-primary/5' : 'hover:bg-surface-high/50'
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(p.itemId)}
                          disabled={!effectiveId}
                          className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2 text-foreground text-xs">
                        {p.productoOriginal}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <ArrowRight className="w-3 h-3 inline text-on-surface-variant/60" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="min-w-[220px] max-w-[340px]">
                          <SearchableSelect
                            options={[
                              { value: '', label: '— Sin vincular —' },
                              ...productoOptions,
                            ]}
                            value={effectiveId ? String(effectiveId) : ''}
                            onChange={(val) => setOverride(p.itemId, val)}
                            placeholder="Buscar en catálogo..."
                          />
                        </div>
                        {effectiveProd && !p.producto && overrides[p.itemId] && (
                          <p className="text-[9px] text-primary/80 font-bold uppercase tracking-widest mt-1">
                            Match manual
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                            CONF_STYLES[p.confianza]?.className || CONF_STYLES.baja.className
                          }`}
                        >
                          {CONF_STYLES[p.confianza]?.label || p.confianza}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {proposals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-on-surface-variant text-xs">
                      No hay ítems pendientes para matchear en esta lista.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs text-rose-300">{errorMsg}</span>
            </div>
          )}

          <div className="flex justify-between items-center gap-2 pt-2">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              {stats.marcados > 0 && `Se van a vincular ${stats.marcados} productos`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleApply} disabled={stats.marcados === 0}>
                <Check className="w-4 h-4" />
                Aplicar {stats.marcados} vínculo{stats.marcados !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═════ STEP: APPLYING ═════ */}
      {step === 'applying' && (
        <div className="py-16 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <p className="text-sm font-bold text-foreground">Aplicando vínculos...</p>
        </div>
      )}

      {/* ═════ STEP: DONE ═════ */}
      {step === 'done' && (
        <div className="py-10 text-center space-y-5">
          <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/15 items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-extrabold text-foreground">
              {applied} producto{applied !== 1 ? 's' : ''} vinculado
              {applied !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-on-surface-variant mt-1 max-w-sm mx-auto">
              Ya aparecen en el Comparador de Precios y se actualizó{' '}
              <code className="text-primary">ProveedorProducto.ultimoPrecio</code> con
              los valores de la lista.
            </p>
          </div>

          <div className="flex gap-2 justify-center pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            {showComparadorCTA && onGoComparador && (
              <Button
                onClick={() => {
                  onGoComparador();
                  onClose();
                }}
              >
                Ver en Comparador
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ═════ STEP: ERROR ═════ */}
      {step === 'error' && (
        <div className="py-10 text-center space-y-4">
          <div className="inline-flex w-16 h-16 rounded-full bg-rose-500/15 items-center justify-center">
            <XCircle className="w-9 h-9 text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Algo falló</p>
            <p className="text-xs text-on-surface-variant mt-1 max-w-md mx-auto">
              {errorMsg}
            </p>
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={handleStart}>Reintentar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
