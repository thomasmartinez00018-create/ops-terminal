import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import {
  ChefHat, DollarSign, TrendingUp, Search, Pencil, Utensils,
  Sparkles, Filter, Eye, ArrowRight, Calculator, BarChart3,
  Check, X, TrendingDown,
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

  // Modal sugerencias inteligentes (recetas con costo subido o margen bajo)
  const [sugerenciasOpen, setSugerenciasOpen] = useState(false);

  // Recetas con sugerencia activa: costo subió >1% o margen real está
  // significativamente por debajo del objetivo y hay precio sugerido viable.
  const sugerenciasList = useMemo(
    () => recetas.filter(r => {
      const ajuste = r.ajustePrecio as { dif: number; pct: number } | null;
      if (!ajuste || ajuste.dif <= 0 || Math.abs(ajuste.pct) < 1) return false;
      // requiere que tenga precio sugerido viable
      return r.precioSugerido && r.precioSugerido > 0;
    }),
    [recetas]
  );
  const sugerenciasCount = sugerenciasList.length;

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
      if (items.length > 0) out.push({ categoria: cat.value, label: cat.label, emoji: cat.emoji, items });
    }
    const sinCat = filtradas.filter(r => !r.categoria || !CATEGORIAS_ORDEN.some(c => c.value === r.categoria));
    if (sinCat.length > 0) out.push({ categoria: '', label: 'Sin categoría', emoji: '📋', items: sinCat });
    return out;
  }, [filtradas, orden]);

  // Stats globales
  const stats = useMemo(() => {
    const conPrecio = recetas.filter(r => r.precioVenta && r.precioVenta > 0);
    const sinPrecio = recetas.filter(r => !r.precioVenta || r.precioVenta <= 0);
    // Para el PROMEDIO excluimos outliers de datos corruptos: un margen
    // < -200% no es un dato real, es un costo mal cargado (ej: $3.500.000
    // por porción). Si lo metés en el promedio te da "-29154%" que no le
    // sirve a nadie. Esos casos se cuentan aparte como "a revisar".
    const conMargenValido = recetas.filter(
      r => r.margenReal !== null && r.margenReal > -200,
    );
    const aRevisar = recetas.filter(
      r => r.margenReal !== null && r.margenReal <= -200,
    ).length;
    const margenProm = conMargenValido.length > 0
      ? conMargenValido.reduce((s, r) => s + r.margenReal, 0) / conMargenValido.length
      : null;
    const totalElaborados30d = recetas.reduce((s, r) => s + (r.elaboraciones?.total30d ?? 0), 0);
    return { total: recetas.length, conPrecio: conPrecio.length, sinPrecio: sinPrecio.length, margenProm, aRevisar, totalElaborados30d };
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
        <div className="flex gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => navigate('/recetas')}>
            <ChefHat size={14} /> Recetas
          </Button>
          {sugerenciasCount > 0 && (
            <Button
              variant="ghost"
              onClick={() => setSugerenciasOpen(true)}
              className="!bg-amber-500/10 !text-amber-500 hover:!bg-amber-500/20 !border-amber-500/40"
            >
              <Sparkles size={14} /> Sugerencias{' '}
              <span className="ml-1 text-[10px] bg-amber-500 text-background rounded-full px-1.5 py-0.5 font-extrabold">
                {sugerenciasCount}
              </span>
            </Button>
          )}
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
          {stats.aRevisar > 0 && (
            <p className="text-[10px] font-bold text-amber-500 mt-0.5">
              {stats.aRevisar} con costo a revisar
            </p>
          )}
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

      {/* Modal Sugerencias inteligentes */}
      <SugerenciasModal
        open={sugerenciasOpen}
        onClose={() => setSugerenciasOpen(false)}
        sugerencias={sugerenciasList}
        onAplicar={async (id, precio) => {
          await api.patchPrecioReceta(id, precio);
          handlePrecioChange(id, precio);
        }}
        onAplicarTodas={async (cambios) => {
          // Bulk: aplica todos los precios sugeridos en paralelo
          await Promise.all(cambios.map(c => api.patchPrecioReceta(c.id, c.precio)));
          for (const c of cambios) handlePrecioChange(c.id, c.precio);
          setSugerenciasOpen(false);
          addToast(`${cambios.length} precios actualizados`, 'success');
        }}
      />

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
  const variacionPct = receta.variacionCostoPct as number ?? 0;
  const variacionAbs = receta.variacionCostoAbs as number ?? 0;
  const costoAnterior = receta.costoAnteriorPorPorcion as number ?? costo;
  const precioSugerido = receta.precioSugerido as number | null;
  const ajuste = receta.ajustePrecio as { dif: number; pct: number } | null;
  const elab30d = receta.elaboraciones?.total30d ?? 0;
  const elaborHist = receta.elaboraciones?.totalHistorico ?? 0;

  const margenColor = margen === null ? '' :
    margen >= (receta.margenObjetivo ?? 70) ? 'text-success' :
    margen >= (receta.margenObjetivo ?? 70) - 10 ? 'text-amber-500' :
    'text-destructive';

  // Solo mostrar variación si es significativa (>0.5%)
  const tieneVariacion = Math.abs(variacionPct) > 0.5;
  const subio = variacionPct > 0;
  const sugiereSubir = ajuste != null && ajuste.dif > 0 && Math.abs(ajuste.pct) > 1;

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
            margen <= -200 ? (
              // Margen absurdo = costo mal cargado. No mostramos "-58233%"
              // (alarma sin info). Mostramos qué hacer.
              <div
                className="flex items-center gap-1 text-[11px] font-bold text-amber-500"
                title="El costo cargado parece erróneo (muy alto vs. el precio). Revisá el costo del producto o sus ingredientes."
              >
                <TrendingDown size={11} />
                Revisar costo
              </div>
            ) : (
              <div className={`flex items-center gap-1 text-[11px] font-bold tabular-nums ${margenColor}`}>
                {margen >= (receta.margenObjetivo ?? 70)
                  ? <TrendingUp size={11} />
                  : <TrendingDown size={11} />
                }
                {margen.toFixed(0)}% margen
              </div>
            )
          )}
        </div>

        {/* Fila costo + ranking */}
        <div className="flex items-center justify-between gap-2">
          {costo > 0 ? (
            <span className="text-[10px] text-on-surface-variant font-mono tabular-nums flex items-center gap-1.5">
              Costo: {fmtPrecio(costo)}/porción
              {tieneVariacion && (
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${
                    subio ? 'bg-rose-500/15 text-rose-500' : 'bg-emerald-500/15 text-emerald-500'
                  }`}
                  title={`Costo anterior: ${fmtPrecio(costoAnterior)} · Variación: ${variacionAbs > 0 ? '+' : ''}${fmtPrecio(variacionAbs)}`}
                >
                  {subio ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {variacionPct > 0 ? '+' : ''}{variacionPct.toFixed(0)}%
                </span>
              )}
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

        {/* Banda de sugerencia: si subió costo o margen está bajo objetivo,
            recomendar nuevo precio. Click → aplica el precio sugerido. */}
        {sugiereSubir && precioSugerido && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await api.patchPrecioReceta(receta.id, precioSugerido);
                onPrecioChange(receta.id, precioSugerido);
              } catch (err: any) {
                console.error('Error aplicando precio sugerido', err);
              }
            }}
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 text-left flex items-center gap-2 group transition-colors"
            title={`Click para aplicar el precio sugerido. Mantiene el ${
              receta.margenObjetivo ? `${receta.margenObjetivo}% objetivo` : '70% margen'
            }.`}
          >
            <Sparkles size={10} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0 text-[10px] leading-tight">
              <span className="text-on-surface-variant">Sugerido </span>
              <span className="font-extrabold text-amber-500 tabular-nums">{fmtPrecio(precioSugerido)}</span>
              {receta.precioVenta && (
                <span className="text-on-surface-variant"> (era {fmtPrecio(receta.precioVenta)}, +{ajuste!.pct.toFixed(0)}%)</span>
              )}
            </div>
            <span className="text-[9px] font-bold text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
              APLICAR
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SugerenciasModal — bulk apply de precios sugeridos por aumento de costo
// ============================================================================
function SugerenciasModal({
  open, onClose, sugerencias, onAplicar, onAplicarTodas,
}: {
  open: boolean;
  onClose: () => void;
  sugerencias: any[];
  onAplicar: (id: number, precio: number) => Promise<void>;
  onAplicarTodas: (cambios: { id: number; precio: number }[]) => Promise<void>;
}) {
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  // Por defecto, todas seleccionadas cuando se abre
  useEffect(() => {
    if (open) setSeleccionadas(new Set(sugerencias.map(s => s.id)));
  }, [open, sugerencias]);

  const toggleSel = (id: number) => {
    setSeleccionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todasSeleccionadas = sugerencias.length > 0 && sugerencias.every(s => seleccionadas.has(s.id));
  const algunaSeleccionada = sugerencias.some(s => seleccionadas.has(s.id));

  const sumImpactoMensual = useMemo(() => {
    // Aproximación: por cada receta seleccionada, dif × elaboraciones30d
    return sugerencias
      .filter(s => seleccionadas.has(s.id))
      .reduce((sum, s) => {
        const dif = s.ajustePrecio?.dif ?? 0;
        const e30 = s.elaboraciones?.total30d ?? 0;
        return sum + dif * e30;
      }, 0);
  }, [sugerencias, seleccionadas]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-t-2xl sm:rounded-2xl border border-border w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className="sticky top-0 bg-bg-primary border-b border-border px-4 sm:px-5 py-3 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={11} /> Sugerencias inteligentes
            </div>
            <div className="text-base font-extrabold mt-0.5">
              {sugerencias.length} {sugerencias.length === 1 ? 'plato necesita' : 'platos necesitan'} ajuste
            </div>
            <div className="text-[11px] text-on-surface-variant">
              Calculadas para mantener el margen objetivo después del aumento de costos.
            </div>
          </div>
          <button onClick={onClose} className="p-1 -m-1 hover:bg-surface rounded shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Toggle todas + impacto mensual estimado */}
        <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between gap-3 bg-surface/50">
          <button
            onClick={() => {
              if (todasSeleccionadas) setSeleccionadas(new Set());
              else setSeleccionadas(new Set(sugerencias.map(s => s.id)));
            }}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1.5"
          >
            <input
              type="checkbox"
              checked={todasSeleccionadas}
              onChange={() => {}}
              className="w-3.5 h-3.5 accent-primary"
            />
            {todasSeleccionadas ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </button>
          {sumImpactoMensual > 0 && (
            <div className="text-[11px] text-on-surface-variant">
              Impacto estimado:{' '}
              <span className="font-bold text-emerald-500">+{fmtPrecio(sumImpactoMensual)}/mes</span>
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="divide-y divide-border/30 max-h-[55vh] overflow-y-auto">
          {sugerencias.length === 0 && (
            <div className="text-center py-12 text-sm text-on-surface-variant">
              No hay sugerencias activas. Todos los platos tienen márgenes saludables.
            </div>
          )}
          {sugerencias.map(s => (
            <SugerenciaRow
              key={s.id}
              receta={s}
              seleccionada={seleccionadas.has(s.id)}
              onToggle={() => toggleSel(s.id)}
              onAplicar={async () => {
                if (!s.precioSugerido) return;
                await onAplicar(s.id, s.precioSugerido);
              }}
            />
          ))}
        </div>

        {/* Footer con bulk-apply */}
        {sugerencias.length > 0 && (
          <div className="sticky bottom-0 bg-bg-primary border-t border-border px-4 sm:px-5 py-3 flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="text-xs text-on-surface-variant flex-1">
              {seleccionadas.size === 0 ? (
                'Seleccioná al menos una para aplicar'
              ) : (
                <>
                  <span className="font-bold text-foreground">{seleccionadas.size}</span> seleccionado{seleccionadas.size !== 1 ? 's' : ''}
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              disabled={!algunaSeleccionada || aplicando}
              onClick={async () => {
                setAplicando(true);
                try {
                  const cambios = sugerencias
                    .filter(s => seleccionadas.has(s.id) && s.precioSugerido)
                    .map(s => ({ id: s.id, precio: s.precioSugerido as number }));
                  await onAplicarTodas(cambios);
                } finally {
                  setAplicando(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={14} />
              {aplicando ? 'Aplicando…' : `Aplicar ${seleccionadas.size > 0 ? seleccionadas.size : ''} ${seleccionadas.size === 1 ? 'precio' : 'precios'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SugerenciaRow({
  receta, seleccionada, onToggle, onAplicar,
}: {
  receta: any;
  seleccionada: boolean;
  onToggle: () => void;
  onAplicar: () => Promise<void>;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);
  const ajuste = receta.ajustePrecio as { dif: number; pct: number };
  const variacionCosto = receta.variacionCostoPct ?? 0;
  const margenAct = receta.margenReal as number | null;

  return (
    <div className={`px-4 py-3 flex items-start gap-3 transition-colors ${
      seleccionada ? 'bg-primary/5' : 'hover:bg-surface-high/50'
    }`}>
      <input
        type="checkbox"
        checked={seleccionada}
        onChange={onToggle}
        disabled={aplicado}
        className="mt-1 w-4 h-4 accent-primary shrink-0 disabled:opacity-50"
      />
      <button onClick={onToggle} className="flex-1 min-w-0 text-left">
        {/* Línea 1: nombre + rubro */}
        <div className="flex items-center gap-2 mb-1">
          {receta.rubro && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
              {receta.rubro}
            </span>
          )}
          <span className="text-sm font-bold truncate">{receta.nombre}</span>
        </div>
        {/* Línea 2: precio actual → sugerido */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-on-surface-variant">
            {fmtPrecio(receta.precioVenta || 0)}
          </span>
          <ArrowRight size={12} className="text-amber-500" />
          <span className="font-extrabold text-amber-500 tabular-nums">
            {fmtPrecio(receta.precioSugerido)}
          </span>
          <span className="text-[10px] font-bold text-amber-500">
            (+{ajuste.pct.toFixed(0)}%)
          </span>
        </div>
        {/* Línea 3: porqué */}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-on-surface-variant flex-wrap">
          {variacionCosto > 0.5 && (
            <span className="flex items-center gap-1">
              <TrendingUp size={9} className="text-rose-500" />
              Costo +{variacionCosto.toFixed(0)}% (era {fmtPrecio(receta.costoAnteriorPorPorcion)}, ahora {fmtPrecio(receta.costoPorPorcion)})
            </span>
          )}
          {margenAct !== null && (
            <span>
              Margen actual: <span className="font-bold">{margenAct.toFixed(0)}%</span>
              {receta.margenObjetivo && (
                <> · Objetivo: <span className="font-bold">{receta.margenObjetivo}%</span></>
              )}
            </span>
          )}
          {receta.elaboraciones?.total30d > 0 && (
            <span>{receta.elaboraciones.total30d} ventas/30d</span>
          )}
        </div>
      </button>
      <button
        onClick={async () => {
          setAplicando(true);
          try { await onAplicar(); setAplicado(true); }
          finally { setAplicando(false); }
        }}
        disabled={aplicando || aplicado}
        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 ${
          aplicado
            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
            : 'bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50'
        }`}
      >
        {aplicado ? '✓ Aplicado' : aplicando ? '...' : 'Aplicar'}
      </button>
    </div>
  );
}
