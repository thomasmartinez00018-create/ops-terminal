/**
 * CodigosBarrasManager — gestiona los códigos de barras multi-pack de un
 * producto (botella individual, caja x6, caja x12, etc.).
 *
 * Caso de uso real: el cliente compra vinos por caja. Cada caja trae
 * 6 botellas. La caja tiene un código de barras propio, distinto al de
 * la botella. Cuando escanea la caja al recibir mercadería, el sistema
 * debe sumar 6 al stock — no 1.
 *
 * Cada fila representa una "presentación" del mismo producto:
 *   - código   → lo que la pistola lee
 *   - factor   → cuántas unidades del producto representa (1 / 6 / 12…)
 *   - descripción → texto amigable ("Caja x6", "Pack x12", "Botella")
 *
 * Acciones inline: agregar / editar / desactivar / borrar.
 * Requiere productoId (existente) — se monta en el modal de edición de
 * Producto, no en el de creación.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Barcode, Plus, Trash2, Check, X, AlertCircle, ScanLine } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

type Codigo = {
  id: number;
  codigo: string;
  factor: number;
  descripcion: string | null;
  activo: boolean;
};

type Props = {
  productoId: number;
  productoNombre?: string;
  /** Si el producto ya tiene un `codigoBarras` (campo legacy) y la tabla
   *  todavía no tiene ninguno cargado, sugerirlo como pre-fill (factor 1). */
  codigoBarrasLegacy?: string | null;
  /** Unidad del producto (kg, lt, unidad…) — para mostrar contexto. */
  unidadUso?: string;
};

export default function CodigosBarrasManager({
  productoId, productoNombre, codigoBarrasLegacy, unidadUso = 'unidad',
}: Props) {
  const { addToast } = useToast();
  const [items, setItems] = useState<Codigo[]>([]);
  const [cargando, setCargando] = useState(true);

  // Form de nuevo código
  const [nuevoCodigo, setNuevoCodigo] = useState('');
  const [nuevoFactor, setNuevoFactor] = useState('1');
  const [nuevoDescripcion, setNuevoDescripcion] = useState('');
  const [agregando, setAgregando] = useState(false);
  const nuevoCodigoRef = useRef<HTMLInputElement>(null);

  // Edición inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editFactor, setEditFactor] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await api.getCodigosBarras(productoId);
      setItems(data);
    } catch (e: any) {
      addToast(e?.message || 'Error cargando códigos', 'error');
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const sugerirDescripcion = (factor: number): string => {
    if (factor === 1) return 'Unidad';
    if (factor === 6) return 'Caja x6';
    if (factor === 12) return 'Caja x12';
    if (factor === 24) return 'Pack x24';
    return `× ${factor}`;
  };

  const agregar = async () => {
    const codigo = nuevoCodigo.trim();
    if (!codigo) return;
    const factor = Number(nuevoFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      addToast('Factor inválido (debe ser > 0)', 'error');
      return;
    }
    setAgregando(true);
    try {
      const descripcion = nuevoDescripcion.trim() || sugerirDescripcion(factor);
      await api.addCodigoBarras(productoId, { codigo, factor, descripcion });
      setNuevoCodigo('');
      setNuevoFactor('1');
      setNuevoDescripcion('');
      addToast(`Código "${codigo}" agregado (× ${factor})`, 'success');
      await cargar();
      // Re-enfocar el input para escanear el siguiente
      setTimeout(() => nuevoCodigoRef.current?.focus(), 50);
    } catch (e: any) {
      addToast(e?.message || 'No se pudo agregar', 'error');
    } finally {
      setAgregando(false);
    }
  };

  const iniciarEdit = (it: Codigo) => {
    setEditId(it.id);
    setEditFactor(String(it.factor));
    setEditDescripcion(it.descripcion || '');
  };
  const cancelarEdit = () => { setEditId(null); setEditFactor(''); setEditDescripcion(''); };
  const guardarEdit = async (it: Codigo) => {
    const factor = Number(editFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      addToast('Factor inválido', 'error'); return;
    }
    try {
      await api.updateCodigoBarras(it.id, { factor, descripcion: editDescripcion.trim() || null });
      cancelarEdit();
      await cargar();
    } catch (e: any) {
      addToast(e?.message || 'Error', 'error');
    }
  };

  const toggleActivo = async (it: Codigo) => {
    try {
      await api.updateCodigoBarras(it.id, { activo: !it.activo });
      await cargar();
    } catch (e: any) {
      addToast(e?.message || 'Error', 'error');
    }
  };

  const borrar = async (it: Codigo) => {
    if (!window.confirm(`¿Borrar el código "${it.codigo}"? Esta acción no afecta el stock histórico.`)) return;
    try {
      await api.deleteCodigoBarras(it.id);
      await cargar();
      addToast('Código eliminado', 'success');
    } catch (e: any) {
      addToast(e?.message || 'No se pudo borrar', 'error');
    }
  };

  // Si está vacío y hay legacy, sugerir cargarlo
  const tieneLegacy = !!codigoBarrasLegacy && codigoBarrasLegacy.trim();
  const mostrarHintLegacy = !cargando && items.length === 0 && tieneLegacy;

  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Barcode size={14} className="text-primary" />
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Códigos de barras
          </div>
          <div className="text-[10px] text-on-surface-variant/70 leading-tight">
            Botella, caja, pack… Al escanear un código, el sistema multiplica las unidades por el factor.
          </div>
        </div>
      </div>

      {/* Hint para migrar el código legacy */}
      {mostrarHintLegacy && (
        <button
          type="button"
          onClick={() => {
            setNuevoCodigo(codigoBarrasLegacy!.trim());
            setNuevoFactor('1');
            setNuevoDescripcion('Unidad');
            setTimeout(() => nuevoCodigoRef.current?.focus(), 30);
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-500 text-left hover:bg-amber-500/15"
        >
          <AlertCircle size={11} />
          <span>
            Este producto tiene el código <b>{codigoBarrasLegacy}</b> cargado en su ficha pero todavía no figura acá.
            Tocá para cargarlo como "Unidad".
          </span>
        </button>
      )}

      {/* Lista de códigos */}
      {cargando ? (
        <div className="text-[11px] text-on-surface-variant py-2">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-[11px] text-on-surface-variant py-2 italic">
          Sin códigos cargados todavía.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(it => {
            const editando = editId === it.id;
            return (
              <div
                key={it.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                  it.activo ? 'bg-surface' : 'bg-surface/40 opacity-60'
                }`}
              >
                <code className="font-mono text-[11px] text-primary tabular-nums shrink-0 w-32 truncate">
                  {it.codigo}
                </code>
                {editando ? (
                  <>
                    <input
                      type="text"
                      value={editDescripcion}
                      onChange={e => setEditDescripcion(e.target.value)}
                      placeholder="Descripción"
                      className="flex-1 px-2 py-0.5 rounded bg-surface-high border border-border text-[11px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editFactor}
                      onChange={e => setEditFactor(e.target.value)}
                      className="w-16 px-2 py-0.5 rounded bg-surface-high border border-border text-[11px] text-right tabular-nums"
                    />
                    <button type="button" onClick={() => guardarEdit(it)} className="p-1 rounded bg-success/15 text-success hover:bg-success/25">
                      <Check size={11} />
                    </button>
                    <button type="button" onClick={cancelarEdit} className="p-1 rounded bg-surface-high text-on-surface-variant hover:bg-destructive/10 hover:text-destructive">
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[11px] text-foreground truncate">
                      {it.descripcion || sugerirDescripcion(it.factor)}
                    </span>
                    <span className="text-[10px] font-bold text-on-surface-variant tabular-nums">
                      × {it.factor}
                    </span>
                    {it.factor > 1 && (
                      <span className="text-[9px] text-on-surface-variant/70">
                        ({it.factor} {unidadUso})
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => iniciarEdit(it)}
                      className="text-[10px] font-bold text-primary/80 hover:text-primary px-1.5 py-0.5"
                      title="Editar"
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActivo(it)}
                      className="text-[10px] text-on-surface-variant hover:text-foreground px-1.5 py-0.5"
                      title={it.activo ? 'Desactivar' : 'Activar'}
                    >
                      {it.activo ? 'pausar' : 'activar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(it)}
                      className="p-1 rounded text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                      title="Borrar"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form: agregar nuevo código */}
      <div className="border-t border-border/40 pt-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
          Agregar código
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[150px]">
            <ScanLine size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              ref={nuevoCodigoRef}
              type="text"
              value={nuevoCodigo}
              onChange={e => setNuevoCodigo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
              placeholder="Escaneá o tipeá…"
              className="w-full pl-7 pr-2 py-1.5 rounded bg-surface-high border border-border text-[11px] font-mono"
            />
          </div>
          <input
            type="text"
            value={nuevoDescripcion}
            onChange={e => setNuevoDescripcion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
            placeholder="Caja x6…"
            list="presentaciones-comunes"
            className="w-28 px-2 py-1.5 rounded bg-surface-high border border-border text-[11px]"
          />
          <datalist id="presentaciones-comunes">
            <option value="Unidad" />
            <option value="Botella" />
            <option value="Caja x6" />
            <option value="Caja x12" />
            <option value="Pack x24" />
            <option value="Bolsón" />
          </datalist>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={nuevoFactor}
            onChange={e => setNuevoFactor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
            placeholder="×"
            title="Factor: cuántas unidades representa"
            className="w-14 px-2 py-1.5 rounded bg-surface-high border border-border text-[11px] text-right tabular-nums"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={agregando || !nuevoCodigo.trim()}
            className="px-2.5 py-1.5 rounded bg-primary text-on-primary text-[11px] font-bold disabled:opacity-40 flex items-center gap-1"
          >
            <Plus size={11} /> Agregar
          </button>
        </div>
        {Number(nuevoFactor) > 1 && nuevoCodigo.trim() && (
          <div className="mt-1.5 text-[10px] text-amber-500">
            ⚠ Al escanear este código se sumarán <b>{nuevoFactor} {unidadUso}</b> de
            {productoNombre ? ` "${productoNombre}"` : ' este producto'}.
          </div>
        )}
      </div>
    </div>
  );
}
