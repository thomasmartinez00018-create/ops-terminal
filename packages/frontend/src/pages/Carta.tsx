import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import {
  ChefHat, DollarSign, TrendingUp, Search, Pencil, Utensils,
  Sparkles, Filter, Eye, ArrowRight, Calculator, BarChart3,
  Check, X, ArrowUpDown, TrendingDown,
} from 'lucide-react';

// ============================================================================
// CARTA — menú visual con precios, margen, rubro y ranking de elaboraciones
// ============================================================================

const CATEGORIAS_ORDEN: { value: string; label: string; emoji: string }[] = [
  { value: 'entrada',    label: 'Entradas',     emoji: '🥗' },
  { value: 'plato',      label: 'Platos',        emoji: '🍽️' },
  { value: 'guarnicion', label: 'Guarniciones',  emoji: '🍟' },
  { value: 'bebida',     label: 'Bebidas',        emoji: '🍷' },
  { value: 'postre',     label: 'Postres',        emoji: '🍰' },
];

type Orden = 'nombre' | 'precio_asc' | 'precio_desc' | 'margen_asc' | 'margen_desc' | 'ranking';

function fmtPrecio(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function MargenBadge({ margen, objetivo }: { margen: number | null; objetivo: number | null }) {
  if (margen === null) return null;
  const obj = objetivo ?? 70;
  const color = margen >= obj ? 'text-success' : margen >= obj - 10 ? 'text-amber-500' : 'text-destructive';
  return (
    <span className={`text-[10px] font-bold font-mono tabular-nums ${color}`}>
      {margen.toFixed(0)}%
    </span>
  );
}

// ── Componente de precio editable inline ────────────────────────────────────
function PrecioInline({
  recetaId,
  precioVenta,
  onChange,
}: {
  recetaId: number;
  precioVenta: number | null;
  onChange: (id: number, precio: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVal(precioVenta ? String(Math.round(precioVenta)) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  };

  const cancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(false);
  };

  const save = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const n = val.trim() === '' ? null : Number(val.replace(',', '.'));
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      addToast('Precio inválido', 'error'); return;
    }
    setSaving(true);
    try {
      await api.patchPrecioReceta(recetaId, n);
      onChange(recetaId, n);
      setEditing(false);
    } catch {
      addToast('Error al guardar precio', 'error');
    }
    setSaving(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <div className="relative">
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs font-bold text-primary">$</span>
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={onKey}
            className="w-24 pl-5 pr-1 py-0.5 rounded bg-surface-high border border-primary/50 text-sm font-bold font-mono tabular-nums focus:outline-none"
          />
        </div>
        <button
          disabled={saving}
          onMouseDown={e => { e.preventDefault(); save(e); }}
          className="w-6 h-6 rounded-full bg-success/20 text-success hover:bg-success/30 flex items-center justify-center transition-colors"
        >
          <Check size={11} />
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); cancel(e); }}
          className="w-6 h-6 rounded-full bg-surface-high text-on-surface-variant hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className={`group/precio flex items-center gap-1 font-mono text-base font-extrabold tabular-nums transition-colors ${
        precioVenta && precioVenta > 0
          ? 'text-primary hover:text-primary/80'
          : 'text-on-surface-variant/50 hover:text-primary/60'
      }`}
      title="Clic para editar precio"
    >
      {precioVenta && precioVenta > 0 ? fmtPrecio(precioVenta) : 'Sin precio'}
      <Pencil size={11} className="opacity-0 group-hover/precio:opacity-100 transition-opacity" />
    </button>
  );
}

export default function Carta() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [recetas, setRecetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [orden, setOrden] = useState<Orden>('nombre');

  // Modal bulk pricing
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTipo, setBulkTipo] = useState<'porcentaje' | 'fijo'>('porcentaje');
  const [bulkValor, setBulkValor] = useState('');
  const [bulkRedondear, setBulkRedondear] = useState('100');
  const [bulkFiltroCat, setBulkFiltroCat] = useState<string>('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<{ antes: number; despues: number; nombre: string }[] | null>(null);

  const cargar = () => {
    setLoading(true);
    api.getCartaData()
      .then(data => setRecetas(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  // Actualizar precio localmente sin recargar todo
  const handlePrecioChange = (id: number, precio: number | null) => {
    setRecetas(prev => prev.map(r => r.id === id ? { ...r, precioVenta: precio } : r));
  };

  const filtradas = useMemo(() => {
    let base = recetas.filter(r => {
      if (filtroCat && r.categoria !== filtroCat) return false;
      if (buscar) {
        const q = buscar.toLowerCase();
        if (!r.nombre.toLowerCase().includes(q) &&
            !(r.codigo || '').toLowerCase().includes(q) &&
            !(r.rubro || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Ordenar
    switch (orden) {
      case 'precio_asc':
        base = [...base].sort((a, b) => (a.precioVenta ?? 0) - (b.precioVenta ?? 0));
        break;
      case 'precio_desc':
        base = [...base].sort((a, b) => (b.precioVenta ?? 0) - (a.precioVenta ?? 0));
        break;
      case 'margen_asc':
        base = [...base].sort((a, b) => (a.margenReal ?? -999) - (b.margenReal ?? -999));
        break;
      case 'margen_desc':
        base = [...base].sort((a, b) => (b.margenReal ?? -999) - (a.margenReal ?? -999));
        break;
      case 'ranking':
        base = [...base].sort((a, b) =>
          (b.elaboraciones?.total30d ?? 0) - (a.elaboraciones?.total30d ?? 0)
        );
        break;
      default:
        base = [...base].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }
    return base;
  }, [recetas, buscar, filtroCat, orden]);

  // Agrupar por categoría (si no hay orden que rompa grupos, respetamos CATEGORIAS_ORDEN)
  const grupos = useMemo(() => {
    const agrupar = orden === 'nombre';
    if (!agrupar) {
      return filtradas.length > 0
        ? [{ categoria: '__all__', label: '', emoji: '', items: filtradas }]
        : [];
    }
    const out: { categoria: string; label: string; emoji: string; items: any[] }[] = [];
    for (const cat of CATEGORIAS_ORDEN) {
      const items = filtradas.filter(r => r.categoria === cat.value);
      if (items.length > 0) out.push({ ...cat, items });
    }
    const sinCat = filtradas.filter(r => !r.categoria || !CATEGORIAS_ORDEN.some(c => c.value === r.categoria));
    if (sinCat.length > 0) out.push({ categoria: '', label: 'Sin categoría', emoji: '📋', items: sinCat });
    return out;
  }, [filtradas, orden]);

  // Stats globales
  const stats = useMemo(() => {
    const conPrecio = recetas.filter(r => r.precioVenta && r.precioVenta > 0);
    const sinPrecio = recetas.filter(r => !r.precioVenta || r.precioVenta <= 0);
    const conMargen = recetas.filter(r => r.margenReal !== null);
    const margenProm = conMargen.length > 0
      ? conMargen.reduce((s, r) => s + r.margenReal, 0) / conMargen.length
      : null;
    const totalElaborados30d = recetas.reduce((s, r) => s + (r.elaboraciones?.total30d ?? 0), 0);
    return { total: recetas.length, conPrecio: conPrecio.length, sinPrecio: sinPrecio.length, margenProm, totalElaborados30d };
  }, [recetas]);

  // Bulk
  const calcularPreview = () => {
    const valor = parseFloat(bulkValor.replace(',', '.'));
    if (!valor || isNaN(valor)) { addToast('Ingresá un valor numérico', 'error'); return; }
    const redondear = parseFloat(bulkRedondear) || 0;
    const aplicar = (p: number) => {
      let n = bulkTipo === 'porcentaje' ? p * (1 + valor / 100) : p + valor;
      if (n < 0) n = 0;
      if (redondear > 0) n = Math.round(n / redondear) * redondear;
      return Math.round(n * 100) / 100;
    };
    const cambios = recetas
      .filter(r => r.precioVenta && r.precioVenta > 0 && (!bulkFiltroCat || r.categoria === bulkFiltroCat))
      .map(r => ({ nombre: r.nombre, antes: Number(r.precioVenta), despues: aplicar(Number(r.precioVenta)) }))
      .filter(c => c.despues !== c.antes);
    setBulkPreview(cambios);
  };

  const ejecutarBulk = async () => {
    const valor = parseFloat(bulkValor.replace(',', '.'));
    if (!valor || isNaN(valor)) return;
    setBulkLoading(true);
    try {
      const r = await api.bulkPrecioRecetas({
        ajuste: { tipo: bulkTipo, valor, redondear: parseFloat(bulkRedondear) || 0 },
        filtro: bulkFiltroCat ? { categoria: bulkFiltroCat } : undefined,
      });
      addToast(`${r.actualizados} de ${r.total} precios actualizados`);
      setBulkOpen(false); setBulkValor(''); setBulkPreview(null);
      cargar();
    } catch (e: any) {
      addToast(e?.message || 'Error al actualizar precios', 'error');
    }
    setBulkLoading(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Restaurante</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1 flex items-center gap-2">
            <Utensils size={20} className="text-primary" />
            Carta
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Precio editable por plato · Margen en tiempo real · Ranking de elaboraciones
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/recetas')}>
            <ChefHat size={14} /> Recetas
          </Button>
          <Button onClick={() => { setBulkPreview(null); setBulkOpen(true); }}>
            <TrendingUp size={14} /> Subir precios
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Platos</p>
          <p className="text-2xl font-extrabold text-foreground tabular-nums mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Con precio</p>
          <p className="text-2xl font-extrabold text-success tabular-nums mt-1">{stats.conPrecio}</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Margen prom.</p>
          <p className={`text-2xl font-extrabold tabular-nums mt-1 ${
            stats.margenProm === null ? 'text-on-surface-variant/40'
            : stats.margenProm >= 60 ? 'text-success'
            : stats.margenProm >= 45 ? 'text-amber-500'
            : 'text-destructive'
          }`}>
            {stats.margenProm !== null ? `${stats.margenProm.toFixed(0)}%` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Elab. 30 días</p>
          <p className="text-2xl font-extrabold text-primary tabular-nums mt-1 font-mono">{stats.totalElaborados30d}</p>
        </div>
      </div>

      {/* Filtros + Orden */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Buscar plato o rubro..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm font-medium focus:outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={filtroCat}
          onChange={e => setFiltroCat(e.target.value)}
          className="px-3 py-2 rounded-lg bg-surface border border-border text-sm font-semibold focus:outline-none focus:border-primary/50"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS_ORDEN.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          value={orden}
          onChange={e => setOrden(e.target.value as Orden)}
          className="px-3 py-2 rounded-lg bg-surface border border-border text-sm font-semibold focus:outline-none focus:border-primary/50"
        >
          <option value="nombre">Orden: A–Z</option>
          <option value="precio_desc">Orden: Precio ↓</option>
          <option value="precio_asc">Orden: Precio ↑</option>
          <option value="margen_desc">Orden: Mejor margen</option>
          <option value="margen_asc">Orden: Peor margen</option>
          <option value="ranking">Orden: Más elaborados (30d)</option>
        </select>
      </div>

      {/* Carta */}
      {loading ? (
        <p className="text-center text-on-surface-variant py-12">Cargando carta...</p>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Utensils size={32} className="mx-auto text-on-surface-variant mb-3" />
          <p className="text-sm font-bold text-foreground mb-1">Tu carta está vacía</p>
          <p className="text-xs text-on-surface-variant mb-4">
            Marcá las recetas como "Activa en carta" desde Recetas, o importá desde Maxirest.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" size="sm" onClick={() => navigate('/recetas')}>
              <ChefHat size={14} /> Ir a Recetas
            </Button>
            <Button size="sm" onClick={() => navigate('/importar')}>
              <Sparkles size={14} /> Importar de Maxirest
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map(g => (
            <div key={g.categoria || 'sin-cat'}>
              {g.label && (
                <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border/60">
                  <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
                    <span className="text-2xl">{g.emoji}</span>
                    {g.label}
                  </h2>
                  <span className="text-xs font-bold text-on-surface-variant">
                    {g.items.length} {g.items.length === 1 ? 'plato' : 'platos'}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.items.map((r, idx) => (
                  <CartaCard
                    key={r.id}
                    receta={r}
                    ranking={orden === 'ranking' ? idx + 1 : null}
                    onPrecioChange={handlePrecioChange}
                    onEdit={() => navigate(`/recetas?edit=${r.id}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Bulk Pricing */}
      <Modal
        open={bulkOpen}
        onClose={() => { setBulkOpen(false); setBulkPreview(null); }}
        title="Actualizar precios masivamente"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
            <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-primary">
              Aplica un ajuste % o $ fijo a todos los platos con precio. Solo se modifican los que ya tienen precio cargado.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Tipo de ajuste</label>
            <div className="grid grid-cols-2 gap-2">
              {(['porcentaje', 'fijo'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => { setBulkTipo(t); setBulkPreview(null); }}
                  className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                    bulkTipo === t ? 'bg-primary text-background border-primary' : 'bg-surface-high border-border text-on-surface-variant hover:border-primary/40'
                  }`}
                >
                  {t === 'porcentaje' ? <><TrendingUp size={14} className="inline mr-1" />% Porcentaje</> : <><DollarSign size={14} className="inline mr-1" />$ Monto fijo</>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              {bulkTipo === 'porcentaje' ? 'Porcentaje (use - para bajar)' : 'Monto fijo (use - para bajar)'}
            </label>
            <div className="relative">
              <input
                type="text" inputMode="decimal"
                value={bulkValor}
                onChange={e => { setBulkValor(e.target.value); setBulkPreview(null); }}
                placeholder={bulkTipo === 'porcentaje' ? 'Ej: 5 (sube 5%)' : 'Ej: 500 (suma $500)'}
                className="w-full px-3 py-2.5 pr-12 rounded-lg bg-surface-high border border-border text-base font-bold focus:outline-none focus:border-primary/50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base font-extrabold text-primary">
                {bulkTipo === 'porcentaje' ? '%' : '$'}
              </span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              <Filter size={11} className="inline mr-1" /> Aplicar a
            </label>
            <select
              value={bulkFiltroCat}
              onChange={e => { setBulkFiltroCat(e.target.value); setBulkPreview(null); }}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border border-border text-sm font-semibold focus:outline-none focus:border-primary/50"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS_ORDEN.map(c => <option key={c.value} value={c.value}>Solo {c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Redondeo</label>
            <div className="flex gap-1.5">
              {['0', '50', '100', '500'].map(v => (
                <button key={v} type="button"
                  onClick={() => { setBulkRedondear(v); setBulkPreview(null); }}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                    bulkRedondear === v ? 'bg-primary/20 text-primary border-primary/40' : 'bg-surface-high border-border text-on-surface-variant'
                  }`}
                >
                  {v === '0' ? 'Sin redondeo' : `$${v}`}
                </button>
              ))}
            </div>
          </div>

          {!bulkPreview ? (
            <Button onClick={calcularPreview} className="w-full" variant="outline" disabled={!bulkValor.trim()}>
              <Eye size={14} /> Ver preview
            </Button>
          ) : (
            <>
              <div className="bg-surface-high/40 rounded-lg border border-border p-3 max-h-60 overflow-y-auto">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Preview · {bulkPreview.length} {bulkPreview.length === 1 ? 'cambio' : 'cambios'}
                </p>
                {bulkPreview.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic">Ningún precio cambiaría.</p>
                ) : (
                  <div className="space-y-1.5">
                    {bulkPreview.slice(0, 30).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 min-w-0 truncate text-foreground">{c.nombre}</span>
                        <span className="font-mono tabular-nums text-on-surface-variant">{fmtPrecio(c.antes)}</span>
                        <ArrowRight size={10} className="text-primary" />
                        <span className="font-mono tabular-nums font-bold text-primary">{fmtPrecio(c.despues)}</span>
                      </div>
                    ))}
                    {bulkPreview.length > 30 && (
                      <p className="text-[10px] text-on-surface-variant italic text-center pt-1">
                        + {bulkPreview.length - 30} cambios más…
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setBulkPreview(null)} className="flex-1">
                  <Calculator size={14} /> Recalcular
                </Button>
                <Button
                  onClick={ejecutarBulk}
                  disabled={bulkLoading || bulkPreview.length === 0}
                  className="flex-1"
                >
                  {bulkLoading ? 'Aplicando...' : `Aplicar a ${bulkPreview.length}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Card individual de la carta ──────────────────────────────────────────────
function CartaCard({
  receta,
  ranking,
  onPrecioChange,
  onEdit,
}: {
  receta: any;
  ranking: number | null;
  onPrecioChange: (id: number, precio: number | null) => void;
  onEdit: () => void;
}) {
  const margen = receta.margenReal as number | null;
  const costo = receta.costoPorPorcion as number;
  const elab30d = receta.elaboraciones?.total30d ?? 0;
  const elaborHist = receta.elaboraciones?.totalHistorico ?? 0;

  const margenColor = margen === null ? '' :
    margen >= (receta.margenObjetivo ?? 70) ? 'text-success' :
    margen >= (receta.margenObjetivo ?? 70) - 10 ? 'text-amber-500' :
    'text-destructive';

  return (
    <div className="rounded-xl bg-surface border border-border hover:border-primary/30 transition-all overflow-hidden">
      {/* Foto + encabezado */}
      <button onClick={onEdit} className="group w-full text-left flex">
        {/* Foto */}
        <div className="w-24 h-24 shrink-0 relative overflow-hidden"
          style={{ background: 'radial-gradient(circle at 30% 30%, rgba(212,175,55,.14), transparent 60%), linear-gradient(135deg, #1A1714, #0F0D0A)' }}
        >
          {receta.imagenBase64 ? (
            <img src={receta.imagenBase64} alt={receta.nombre} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">
              {CATEGORIAS_ORDEN.find(c => c.value === receta.categoria)?.emoji || '🍽️'}
            </div>
          )}
          {/* Ranking badge */}
          {ranking !== null && (
            <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-primary/90 text-background text-[9px] font-extrabold flex items-center justify-center">
              {ranking}
            </div>
          )}
        </div>
        {/* Nombre + rubro + código */}
        <div className="flex-1 min-w-0 p-3">
          {receta.rubro && (
            <span className="inline-block text-[9px] font-bold uppercase tracking-[0.12em] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded mb-1">
              {receta.rubro}
            </span>
          )}
          <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
            {receta.nombre}
          </p>
          {receta.codigo && (
            <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">{receta.codigo}</p>
          )}
        </div>
      </button>

      {/* Datos: precio, costo, margen, elaboraciones */}
      <div className="px-3 pb-3 border-t border-border/30 pt-2 space-y-1.5">
        {/* Fila precio + margen */}
        <div className="flex items-center justify-between gap-2">
          <PrecioInline
            recetaId={receta.id}
            precioVenta={receta.precioVenta}
            onChange={onPrecioChange}
          />
          {margen !== null && (
            <div className={`flex items-center gap-1 text-[11px] font-bold tabular-nums ${margenColor}`}>
              {margen >= (receta.margenObjetivo ?? 70)
                ? <TrendingUp size={11} />
                : <TrendingDown size={11} />
              }
              {margen.toFixed(0)}% margen
            </div>
          )}
        </div>

        {/* Fila costo + ranking */}
        <div className="flex items-center justify-between gap-2">
          {costo > 0 ? (
            <span className="text-[10px] text-on-surface-variant font-mono tabular-nums">
              Costo: {fmtPrecio(costo)}/porción
            </span>
          ) : (
            <span className="text-[10px] text-on-surface-variant/40">Sin costo cargado</span>
          )}
          {(elab30d > 0 || elaborHist > 0) && (
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">
              <BarChart3 size={10} className="text-primary/60" />
              <span className="font-bold text-foreground">{elab30d}</span>
              <span>/ 30d</span>
              {elaborHist > 0 && (
                <span className="text-on-surface-variant/50">({elaborHist} total)</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
