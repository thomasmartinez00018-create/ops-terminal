import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import {
  ChefHat, DollarSign, TrendingUp, Search, Pencil, Utensils,
  Sparkles, Filter, Eye, ArrowRight, Calculator,
} from 'lucide-react';

// ============================================================================
// CARTA — vista visual del menú del restaurante con precios
// ----------------------------------------------------------------------------
// Pedido de Andrés (audio 29/04): "tener una manera de ver la carta con los
// valores como está en la carta del restaurante" + "subir precios un 3% a
// partir del 15 de enero, con la carta real". Esta página resuelve ambas:
//
//   1. Vista tipo menú: agrupa recetas por categoría con foto + nombre +
//      precio. Es la versión "para mostrar al cliente" del listado de
//      recetas. Al click en una card abre la receta para editar.
//
//   2. Bulk update de precios: botón "Subir precios" abre un modal donde
//      se elige % o monto fijo, opcionalmente filtra por categoría, y
//      muestra preview antes de confirmar. Redondeo configurable (al $100
//      más cercano por default — los precios de carta suelen terminar en
//      00 o 50).
// ============================================================================

const CATEGORIAS_ORDEN: { value: string; label: string; emoji: string }[] = [
  { value: 'entrada', label: 'Entradas', emoji: '🥗' },
  { value: 'plato', label: 'Platos', emoji: '🍽️' },
  { value: 'guarnicion', label: 'Guarniciones', emoji: '🍟' },
  { value: 'bebida', label: 'Bebidas', emoji: '🍷' },
  { value: 'postre', label: 'Postres', emoji: '🍰' },
];

function fmtPrecio(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

export default function Carta() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [recetas, setRecetas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

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
    api.getRecetas({ activo: 'true' })
      .then(data => setRecetas(data.filter((r: any) => r.salidaACarta)))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => {
    return recetas.filter(r => {
      if (filtroCat && r.categoria !== filtroCat) return false;
      if (buscar) {
        const q = buscar.toLowerCase();
        if (!r.nombre.toLowerCase().includes(q) &&
            !(r.codigo || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [recetas, buscar, filtroCat]);

  // Agrupar por categoría manteniendo el orden de CATEGORIAS_ORDEN
  const grupos = useMemo(() => {
    const out: { categoria: string; label: string; emoji: string; items: any[] }[] = [];
    for (const cat of CATEGORIAS_ORDEN) {
      const items = filtradas.filter(r => r.categoria === cat.value);
      if (items.length > 0) out.push({ categoria: cat.value, label: cat.label, emoji: cat.emoji, items });
    }
    // Sin categoría
    const sinCat = filtradas.filter(r => !r.categoria || !CATEGORIAS_ORDEN.some(c => c.value === r.categoria));
    if (sinCat.length > 0) out.push({ categoria: '', label: 'Sin categoría', emoji: '📋', items: sinCat });
    return out;
  }, [filtradas]);

  // Stats globales
  const stats = useMemo(() => {
    const conPrecio = recetas.filter(r => r.precioVenta && r.precioVenta > 0);
    const sinPrecio = recetas.filter(r => !r.precioVenta || r.precioVenta <= 0);
    const promedio = conPrecio.length > 0
      ? conPrecio.reduce((s, r) => s + Number(r.precioVenta), 0) / conPrecio.length
      : 0;
    return { total: recetas.length, conPrecio: conPrecio.length, sinPrecio: sinPrecio.length, promedio };
  }, [recetas]);

  // Calcular preview del bulk
  const calcularPreview = () => {
    const valor = parseFloat(bulkValor.replace(',', '.'));
    if (!valor || isNaN(valor)) {
      addToast('Ingresá un valor numérico', 'error');
      return;
    }
    const redondear = parseFloat(bulkRedondear) || 0;
    const aplicar = (precio: number) => {
      let nuevo = bulkTipo === 'porcentaje' ? precio * (1 + valor / 100) : precio + valor;
      if (nuevo < 0) nuevo = 0;
      if (redondear > 0) nuevo = Math.round(nuevo / redondear) * redondear;
      return Math.round(nuevo * 100) / 100;
    };
    const target = recetas.filter(r =>
      r.precioVenta && r.precioVenta > 0 &&
      (!bulkFiltroCat || r.categoria === bulkFiltroCat)
    );
    const cambios = target.map(r => ({
      nombre: r.nombre,
      antes: Number(r.precioVenta),
      despues: aplicar(Number(r.precioVenta)),
    })).filter(c => c.despues !== c.antes);
    setBulkPreview(cambios);
  };

  const ejecutarBulk = async () => {
    const valor = parseFloat(bulkValor.replace(',', '.'));
    if (!valor || isNaN(valor)) return;
    setBulkLoading(true);
    try {
      const r = await api.bulkPrecioRecetas({
        ajuste: {
          tipo: bulkTipo,
          valor,
          redondear: parseFloat(bulkRedondear) || 0,
        },
        filtro: bulkFiltroCat ? { categoria: bulkFiltroCat } : undefined,
      });
      addToast(`${r.actualizados} de ${r.total} precios actualizados`);
      setBulkOpen(false);
      setBulkValor('');
      setBulkPreview(null);
      cargar();
    } catch (e: any) {
      addToast(e?.message || 'Error al actualizar precios', 'error');
    }
    setBulkLoading(false);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Restaurante</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1 flex items-center gap-2">
            <Utensils size={20} className="text-primary" />
            Carta
          </h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Vista del menú del restaurante con precios. Acá podés subir precios masivamente o editar plato por plato.
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
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Platos en carta</p>
          <p className="text-2xl font-extrabold text-foreground tabular-nums mt-1">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Con precio</p>
          <p className="text-2xl font-extrabold text-success tabular-nums mt-1">{stats.conPrecio}</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Sin precio</p>
          <p className={`text-2xl font-extrabold tabular-nums mt-1 ${stats.sinPrecio > 0 ? 'text-amber-500' : 'text-foreground'}`}>{stats.sinPrecio}</p>
        </div>
        <div className="rounded-xl bg-surface border border-border p-3">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Precio promedio</p>
          <p className="text-2xl font-extrabold text-primary tabular-nums mt-1 font-mono">{fmtPrecio(stats.promedio)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Buscar plato..."
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
      </div>

      {/* Carta agrupada por categoría */}
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
              <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border/60">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
                  <span className="text-2xl">{g.emoji}</span>
                  {g.label}
                </h2>
                <span className="text-xs font-bold text-on-surface-variant">
                  {g.items.length} {g.items.length === 1 ? 'plato' : 'platos'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.items.map(r => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/recetas?edit=${r.id}`)}
                    className="group text-left rounded-xl bg-surface border border-border hover:border-primary/40 transition-all overflow-hidden flex"
                  >
                    {/* Foto / placeholder */}
                    <div className="w-24 h-24 shrink-0 relative overflow-hidden"
                      style={{ background: 'radial-gradient(circle at 30% 30%, rgba(212,175,55,.14), transparent 60%), linear-gradient(135deg, #1A1714, #0F0D0A)' }}
                    >
                      {r.imagenBase64 ? (
                        <img src={r.imagenBase64} alt={r.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">
                          {CATEGORIAS_ORDEN.find(c => c.value === r.categoria)?.emoji || '🍽️'}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-1">
                      <div>
                        <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                          {r.nombre}
                        </p>
                        {r.codigo && (
                          <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">{r.codigo}</p>
                        )}
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`font-mono text-base font-extrabold tabular-nums ${
                          r.precioVenta && r.precioVenta > 0 ? 'text-primary' : 'text-on-surface-variant/50'
                        }`}>
                          {r.precioVenta && r.precioVenta > 0 ? fmtPrecio(r.precioVenta) : 'Sin precio'}
                        </span>
                        <Pencil size={12} className="text-on-surface-variant group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </button>
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
              Aplica un ajuste % o $ fijo a todos los platos con precio. Solo se modifican los que ya tienen precio cargado — los sin precio se ignoran.
            </p>
          </div>

          {/* Tipo de ajuste */}
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">Tipo de ajuste</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setBulkTipo('porcentaje'); setBulkPreview(null); }}
                className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  bulkTipo === 'porcentaje'
                    ? 'bg-primary text-background border-primary'
                    : 'bg-surface-high border-border text-on-surface-variant hover:border-primary/40'
                }`}
              >
                <TrendingUp size={14} className="inline mr-1" /> % Porcentaje
              </button>
              <button
                type="button"
                onClick={() => { setBulkTipo('fijo'); setBulkPreview(null); }}
                className={`px-3 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  bulkTipo === 'fijo'
                    ? 'bg-primary text-background border-primary'
                    : 'bg-surface-high border-border text-on-surface-variant hover:border-primary/40'
                }`}
              >
                <DollarSign size={14} className="inline mr-1" /> $ Monto fijo
              </button>
            </div>
          </div>

          {/* Valor del ajuste */}
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              {bulkTipo === 'porcentaje' ? 'Porcentaje (use - para bajar precios)' : 'Monto fijo (use - para bajar precios)'}
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
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

          {/* Filtro por categoría */}
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

          {/* Redondeo */}
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
              Redondeo (precio queda múltiplo de…)
            </label>
            <div className="flex gap-1.5">
              {['0', '50', '100', '500'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setBulkRedondear(v); setBulkPreview(null); }}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                    bulkRedondear === v
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-surface-high border-border text-on-surface-variant'
                  }`}
                >
                  {v === '0' ? 'Sin redondeo' : `$${v}`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
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
                  <p className="text-xs text-on-surface-variant italic">Ningún precio cambiaría con este ajuste.</p>
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
