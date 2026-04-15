import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import {
  Plus, Pencil, Trash2, Warehouse, ArrowRight, Sliders, Search,
  Save, RotateCcw, GitBranch, Info,
} from 'lucide-react';
import PageTour from '../components/PageTour';

const TIPOS_DEPOSITO = [
  { value: 'almacen', label: 'Almacén' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'barra', label: 'Barra' },
  { value: 'camara', label: 'Cámara fría' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'seco', label: 'Seco' },
  { value: 'garage', label: 'Garage' },
  { value: 'otro', label: 'Otro' },
];

interface DepositoForm {
  codigo: string;
  nombre: string;
  tipo: string;
  depositoPadreId: string; // '' | number as string
}

const emptyForm: DepositoForm = { codigo: '', nombre: '', tipo: '', depositoPadreId: '' };

// ── ParametroRow ────────────────────────────────────────────────
// Fila editable de parámetros de reposición para un producto en un depósito.
// Muestra fallback del producto global cuando no hay override por depósito.
interface ParametroDraft {
  productoId: number;
  productoCodigo: string;
  productoNombre: string;
  unidad: string;
  stockMinimo: string;       // input values son strings para poder mostrar vacío
  stockObjetivo: string;
  puntoReposicion: string;
  fallbackMinimo: number | null;
  fallbackIdeal: number | null;
  hasOverride: boolean;      // existe fila en stock_parametros
  dirty: boolean;
}

export default function Depositos() {
  const { addToast } = useToast();
  const [depositos, setDepositos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DepositoForm>(emptyForm);
  const [error, setError] = useState('');

  // ── Parámetros modal ─────────────────────────────────────────
  const [paramsModalOpen, setParamsModalOpen] = useState(false);
  const [paramsDeposito, setParamsDeposito] = useState<any | null>(null);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [paramsSearch, setParamsSearch] = useState('');
  const [paramsFiltro, setParamsFiltro] = useState<'todos' | 'con-override' | 'sin-override'>('todos');
  const [drafts, setDrafts] = useState<ParametroDraft[]>([]);

  const cargar = () => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  };

  useEffect(() => { cargar(); }, []);

  // ── Map rápido para mostrar "padre → hijo" ───────────────────
  const depositoPorId = useMemo(() => {
    const map = new Map<number, any>();
    depositos.forEach(d => map.set(d.id, d));
    return map;
  }, [depositos]);

  // Cadena completa hacia arriba (Garage → Gamuza → Barra)
  const getCadena = (dep: any): string[] => {
    const cadena: string[] = [];
    let actual: any = dep;
    const seen = new Set<number>();
    while (actual) {
      if (seen.has(actual.id)) break;
      seen.add(actual.id);
      cadena.unshift(actual.nombre);
      actual = actual.depositoPadreId ? depositoPorId.get(actual.depositoPadreId) : null;
    }
    return cadena;
  };

  // ── Opciones de padre válidas (excluyendo self y descendientes) ──
  const getParentOptions = (excluirId: number | null): { value: string; label: string }[] => {
    // Calcular descendientes de excluirId para evitar ciclos
    const descendientes = new Set<number>();
    if (excluirId != null) {
      descendientes.add(excluirId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const d of depositos) {
          if (d.depositoPadreId && descendientes.has(d.depositoPadreId) && !descendientes.has(d.id)) {
            descendientes.add(d.id);
            changed = true;
          }
        }
      }
    }
    return depositos
      .filter(d => !descendientes.has(d.id))
      .map(d => ({ value: String(d.id), label: `${d.codigo} — ${d.nombre}` }));
  };

  const abrir = (dep?: any) => {
    if (dep) {
      setEditId(dep.id);
      setForm({
        codigo: dep.codigo,
        nombre: dep.nombre,
        tipo: dep.tipo || '',
        depositoPadreId: dep.depositoPadreId != null ? String(dep.depositoPadreId) : '',
      });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setError('');
    setModalOpen(true);
  };

  const guardar = async () => {
    setError('');
    try {
      const payload: any = {
        codigo: form.codigo,
        nombre: form.nombre,
        tipo: form.tipo,
        depositoPadreId: form.depositoPadreId === '' ? null : parseInt(form.depositoPadreId),
      };
      if (editId) {
        await api.updateDeposito(editId, payload);
      } else {
        await api.createDeposito(payload);
      }
      setModalOpen(false);
      addToast(editId ? 'Depósito actualizado' : 'Depósito creado', 'success');
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const eliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar el depósito "${nombre}"? Esta acción se puede revertir.`)) return;
    try {
      await api.deleteDeposito(id);
      addToast('Depósito desactivado', 'success');
      cargar();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const tipoLabel = (tipo: string) =>
    TIPOS_DEPOSITO.find(t => t.value === tipo)?.label || tipo;

  // ── Parámetros: abrir modal y cargar data ───────────────────
  const abrirParametros = async (dep: any) => {
    setParamsDeposito(dep);
    setParamsModalOpen(true);
    setParamsLoading(true);
    setParamsSearch('');
    setParamsFiltro('todos');
    setDrafts([]);

    try {
      const [productos, parametros] = await Promise.all([
        api.getProductos({ activo: 'true' }),
        api.getParametrosReposicion({ depositoId: String(dep.id) }),
      ]);

      // Mapear parametros existentes por productoId
      const paramMap = new Map<number, any>();
      (parametros as any[]).forEach(p => paramMap.set(p.productoId, p));

      const ds: ParametroDraft[] = (productos as any[]).map(p => {
        const override = paramMap.get(p.id);
        return {
          productoId: p.id,
          productoCodigo: p.codigo,
          productoNombre: p.nombre,
          unidad: p.unidadUso || p.unidad || 'u',
          stockMinimo: override?.stockMinimo != null ? String(override.stockMinimo) : '',
          stockObjetivo: override?.stockObjetivo != null ? String(override.stockObjetivo) : '',
          puntoReposicion: override?.puntoReposicion != null ? String(override.puntoReposicion) : '',
          fallbackMinimo: p.stockMinimo ?? null,
          fallbackIdeal: p.stockIdeal ?? null,
          hasOverride: !!override,
          dirty: false,
        };
      });

      // Ordenar: overrides primero, después por código
      ds.sort((a, b) => {
        if (a.hasOverride !== b.hasOverride) return a.hasOverride ? -1 : 1;
        return a.productoCodigo.localeCompare(b.productoCodigo);
      });

      setDrafts(ds);
    } catch (e: any) {
      addToast('Error al cargar parámetros: ' + e.message, 'error');
    } finally {
      setParamsLoading(false);
    }
  };

  const updateDraft = (productoId: number, field: 'stockMinimo' | 'stockObjetivo' | 'puntoReposicion', value: string) => {
    setDrafts(prev => prev.map(d =>
      d.productoId === productoId ? { ...d, [field]: value, dirty: true } : d
    ));
  };

  const resetDraft = (productoId: number) => {
    setDrafts(prev => prev.map(d =>
      d.productoId === productoId
        ? { ...d, stockMinimo: '', stockObjetivo: '', puntoReposicion: '', dirty: true }
        : d
    ));
  };

  const guardarParametros = async () => {
    if (!paramsDeposito) return;
    const cambios = drafts.filter(d => d.dirty);
    if (cambios.length === 0) {
      addToast('No hay cambios para guardar', 'info');
      return;
    }

    setParamsSaving(true);
    try {
      const payload = cambios.map(d => ({
        productoId: d.productoId,
        depositoId: paramsDeposito.id,
        stockMinimo: d.stockMinimo === '' ? null : parseFloat(d.stockMinimo),
        stockObjetivo: d.stockObjetivo === '' ? null : parseFloat(d.stockObjetivo),
        puntoReposicion: d.puntoReposicion === '' ? null : parseFloat(d.puntoReposicion),
      }));
      const res = await api.saveParametrosReposicion(payload);
      addToast(`${res.actualizados} parámetro(s) guardado(s)`, 'success');

      // Refrescar drafts desde servidor
      await abrirParametros(paramsDeposito);
    } catch (e: any) {
      addToast('Error al guardar: ' + e.message, 'error');
    } finally {
      setParamsSaving(false);
    }
  };

  // ── Filtrado de drafts ──────────────────────────────────────
  const draftsVisibles = useMemo(() => {
    const q = paramsSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return drafts.filter(d => {
      if (paramsFiltro === 'con-override' && !d.hasOverride && !d.dirty) return false;
      if (paramsFiltro === 'sin-override' && (d.hasOverride || d.dirty)) return false;
      if (!q) return true;
      const label = (d.productoCodigo + ' ' + d.productoNombre).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return label.includes(q);
    });
  }, [drafts, paramsSearch, paramsFiltro]);

  const cambiosCount = drafts.filter(d => d.dirty).length;
  const overridesCount = drafts.filter(d => d.hasOverride).length;

  return (
    <div>
      <PageTour pageKey="depositos" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Gestión</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Depósitos</h1>
          <p className="text-xs text-on-surface-variant mt-1 font-medium">
            Configurá la cadena de reposición y los puntos mínimos por depósito
          </p>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nuevo depósito
        </Button>
      </div>

      {/* Info de cadena */}
      {depositos.some(d => d.depositoPadreId) && (
        <div className="mb-5 flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <GitBranch size={15} className="text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            <span className="font-bold text-primary">Cadena de reposición activa.</span> Cuando un depósito hijo
            cae por debajo de su punto de reposición, el sistema sugiere una transferencia automática desde su padre.
            El motor revisa toda la cadena en vivo y crea órdenes que necesitan tu confirmación antes de ejecutarse.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {depositos.map(dep => {
          const cadena = getCadena(dep);
          const tieneCadena = cadena.length > 1;
          const hijos = depositos.filter(d => d.depositoPadreId === dep.id);

          return (
            <div key={dep.id} className="glass rounded-xl p-4 flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                    <Warehouse size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-primary">{dep.codigo}</p>
                    <p className="font-semibold text-foreground mt-0.5 truncate">{dep.nombre}</p>
                    {dep.tipo && <Badge variant="info">{tipoLabel(dep.tipo)}</Badge>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => abrirParametros(dep)}
                    title="Parámetros de reposición"
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <Sliders size={14} />
                  </button>
                  <button
                    onClick={() => abrir(dep)}
                    title="Editar"
                    className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => eliminar(dep.id, dep.nombre)}
                    title="Desactivar"
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Cadena visual */}
              {tieneCadena && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5">
                    Cadena
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {cadena.map((nombre, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          i === cadena.length - 1 ? 'bg-primary/15 text-primary' : 'bg-surface-high text-on-surface-variant'
                        }`}>
                          {nombre}
                        </span>
                        {i < cadena.length - 1 && <ArrowRight size={10} className="text-on-surface-variant/40" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Hijos */}
              {hijos.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-[9px] font-bold text-on-surface-variant/60 uppercase tracking-widest mb-1.5">
                    Reponen desde acá ({hijos.length})
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {hijos.map(h => (
                      <span key={h.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-high text-on-surface-variant">
                        {h.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal: Crear/Editar depósito ───────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar depósito' : 'Nuevo depósito'}
      >
        <div className="space-y-3">
          <Input
            label="Código"
            id="codigo"
            value={form.codigo}
            onChange={e => setForm({ ...form, codigo: e.target.value })}
            placeholder="DEP-01"
          />
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre del depósito"
          />
          <Select
            label="Tipo"
            id="tipo"
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value })}
            options={TIPOS_DEPOSITO}
            placeholder="Seleccionar tipo..."
          />

          <Select
            label="Se repone desde (padre)"
            id="padre"
            value={form.depositoPadreId}
            onChange={e => setForm({ ...form, depositoPadreId: e.target.value })}
            options={getParentOptions(editId)}
            placeholder="— Sin padre (depósito raíz) —"
          />
          <div className="flex items-start gap-2 px-1">
            <Info size={11} className="text-on-surface-variant/60 shrink-0 mt-0.5" />
            <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
              Si este depósito debe ser reabastecido desde otro (ej: Barra ← Gamuza ← Garage),
              elegí el origen acá. El motor sugerirá transferencias automáticamente.
            </p>
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar' : 'Crear depósito'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Parámetros de reposición ────────────────── */}
      <Modal
        open={paramsModalOpen}
        onClose={() => setParamsModalOpen(false)}
        title={paramsDeposito ? `Parámetros — ${paramsDeposito.nombre}` : 'Parámetros'}
        size="xl"
      >
        {paramsLoading ? (
          <div className="py-10 text-center">
            <p className="text-sm text-on-surface-variant font-semibold">Cargando parámetros…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Leyenda */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-high/50 border border-border">
              <Info size={14} className="text-primary shrink-0 mt-0.5" />
              <div className="text-[11px] text-on-surface-variant leading-relaxed">
                <p className="mb-1">
                  <span className="font-bold text-foreground">Stock mínimo</span>: disparador de alerta crítica.
                  <span className="mx-2 text-on-surface-variant/40">•</span>
                  <span className="font-bold text-foreground">Punto de reposición</span>: al caer bajo este valor, el motor sugiere reponer.
                  <span className="mx-2 text-on-surface-variant/40">•</span>
                  <span className="font-bold text-foreground">Stock objetivo</span>: cuánto dejar al reabastecer.
                </p>
                <p className="text-on-surface-variant/70">
                  Los valores vacíos usan el fallback global del producto (columna <span className="font-mono text-[10px]">Fallback</span>).
                  Solo cargá parámetros para los productos que este depósito realmente maneja.
                </p>
              </div>
            </div>

            {/* Barra de controles */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Buscar producto…"
                  value={paramsSearch}
                  onChange={e => setParamsSearch(e.target.value)}
                  className="w-full bg-surface-high border-0 rounded-lg pl-9 pr-3 py-2.5 text-sm font-semibold text-foreground placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex gap-1 p-1 bg-surface-high rounded-lg">
                {(['todos', 'con-override', 'sin-override'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setParamsFiltro(f)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      paramsFiltro === f
                        ? 'bg-primary text-primary-foreground'
                        : 'text-on-surface-variant hover:text-foreground'
                    }`}
                  >
                    {f === 'todos' ? `Todos (${drafts.length})` :
                     f === 'con-override' ? `Configurados (${overridesCount})` :
                     'Sin configurar'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabla */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="max-h-[45vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-high z-10">
                    <tr className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
                      <th className="text-left px-3 py-2.5">Producto</th>
                      <th className="text-right px-2 py-2.5 w-20">Mínimo</th>
                      <th className="text-right px-2 py-2.5 w-20">P. repo</th>
                      <th className="text-right px-2 py-2.5 w-20">Objetivo</th>
                      <th className="text-right px-2 py-2.5 w-24">Fallback</th>
                      <th className="w-10 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftsVisibles.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-on-surface-variant text-xs font-semibold">
                          Sin productos que coincidan
                        </td>
                      </tr>
                    )}
                    {draftsVisibles.map(d => {
                      const rowClass = d.dirty
                        ? 'bg-primary/5 border-l-2 border-primary'
                        : d.hasOverride
                          ? 'bg-surface-high/30'
                          : '';
                      return (
                        <tr key={d.productoId} className={`border-t border-border/50 ${rowClass}`}>
                          <td className="px-3 py-2">
                            <p className="font-mono text-[10px] text-primary/80">{d.productoCodigo}</p>
                            <p className="text-xs font-semibold text-foreground truncate max-w-[240px]">{d.productoNombre}</p>
                            <p className="text-[9px] text-on-surface-variant/60 uppercase tracking-widest">{d.unidad}</p>
                          </td>
                          <td className="px-1 py-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={d.stockMinimo}
                              onChange={e => updateDraft(d.productoId, 'stockMinimo', e.target.value)}
                              placeholder="—"
                              className="w-full bg-surface-high border-0 rounded px-2 py-1.5 text-xs font-bold text-foreground text-right placeholder:text-on-surface-variant/30 outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          </td>
                          <td className="px-1 py-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={d.puntoReposicion}
                              onChange={e => updateDraft(d.productoId, 'puntoReposicion', e.target.value)}
                              placeholder="—"
                              className="w-full bg-surface-high border-0 rounded px-2 py-1.5 text-xs font-bold text-foreground text-right placeholder:text-on-surface-variant/30 outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          </td>
                          <td className="px-1 py-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={d.stockObjetivo}
                              onChange={e => updateDraft(d.productoId, 'stockObjetivo', e.target.value)}
                              placeholder="—"
                              className="w-full bg-surface-high border-0 rounded px-2 py-1.5 text-xs font-bold text-foreground text-right placeholder:text-on-surface-variant/30 outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <p className="text-[10px] text-on-surface-variant font-medium font-mono">
                              {d.fallbackMinimo != null ? `min ${d.fallbackMinimo}` : '—'}
                            </p>
                            <p className="text-[10px] text-on-surface-variant/60 font-medium font-mono">
                              {d.fallbackIdeal != null ? `ideal ${d.fallbackIdeal}` : ''}
                            </p>
                          </td>
                          <td className="px-2 py-2">
                            {(d.hasOverride || d.dirty) && (
                              <button
                                onClick={() => resetDraft(d.productoId)}
                                title="Limpiar (volver al fallback)"
                                className="p-1 rounded hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-on-surface-variant font-semibold">
                {cambiosCount > 0
                  ? <span className="text-primary">{cambiosCount} cambio(s) pendiente(s)</span>
                  : `${overridesCount} parámetro(s) configurado(s)`}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setParamsModalOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={guardarParametros} disabled={paramsSaving || cambiosCount === 0}>
                  <Save size={14} />
                  {paramsSaving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
