import { useEffect, useMemo, useState } from 'react';
import PageTour from '../components/PageTour';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import DrawerModal from '../components/ui/DrawerModal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import HelpHint from '../components/ui/HelpHint';
import ConfirmDialog, { useConfirm } from '../components/ui/ConfirmDialog';
import {
  Plus, Pencil, Trash2, ChefHat, DollarSign, X, Package, Calculator, Info,
  Copy, ChevronDown, ChevronUp, Send, Sliders, Search, Printer,
  Utensils, Scissors, Flame, ArrowRight,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { factorDesperdicio, porcentajeDesperdicio } from '../lib/merma';
import { sugerirMerma } from '../lib/mermasSugeridas';

// ============================================================================
// RECETAS — rediseño pensado para el barro de la cocina
// ----------------------------------------------------------------------------
// Prioridades de esta versión, en orden:
//   1. El dato que importa (costo por porción) es SIEMPRE lo más grande y visible.
//   2. Mobile first — cards verticales, no grids de 6 columnas que se cortan.
//   3. Modo simple por default (sin merma). Merma es opcional, se activa con
//      un chip por ingrediente → cocinas que no la usan no ven ruido.
//   4. Un ingrediente se carga tap-tap-número: producto + cantidad, listo.
//   5. Duplicar receta en 1 click — la mayoría de recetas son variaciones.
//   6. La lista en mobile son cards grandes con el costo por porción arriba.
// No saca ninguna función previa: solo reordena, colapsa lo complejo y
// destaca lo útil.
// ============================================================================

const CATEGORIAS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'plato', label: 'Plato' },
  { value: 'postre', label: 'Postre' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'guarnicion', label: 'Guarnición' },
];

const SECTORES = [
  { value: '', label: 'Sin sector' },
  { value: 'pizzeria', label: 'Pizzería' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'pasteleria', label: 'Pastelería' },
  { value: 'pastas', label: 'Pastas' },
];

interface Ingrediente {
  productoId: number | null;
  cantidad: number;
  unidad: string;
  mermaEsperada: number;
}

const emptyIngrediente: Ingrediente = {
  productoId: null,
  cantidad: 0,
  unidad: '',
  mermaEsperada: 0,
};

const emptyForm = {
  codigo: '',
  nombre: '',
  categoria: '',
  sector: '',
  porciones: 1,
  productoResultadoId: null as number | null,
  cantidadProducida: '' as string | number,
  unidadProducida: '',
  // salidaACarta: plato final que va al menú del cliente (true) vs
  // preparación intermedia como masa, caldo, salsa base (false).
  salidaACarta: false,
  ingredientes: [] as Ingrediente[],
  // Pricing (opcional)
  precioVenta: '' as string | number,
  margenObjetivo: 70 as number,
  // Ficha técnica (opcional)
  metodoPreparacion: '',
  tiempoPreparacion: '' as string | number,
  notasChef: '',
  imagenBase64: '' as string | null,
};

// Formato de dinero corto pensado para etiquetas ("$3.250" sin decimales si
// es redondo, con 2 si es chiquito). Ahorra espacio en cards mobile.
function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions = abs >= 100
    ? { maximumFractionDigits: 0 }
    : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
  return `$${n.toLocaleString('es-AR', opts)}`;
}
function fmtNum(n: number, dec = 3): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-AR', { maximumFractionDigits: dec });
}

// Calcula info de margen para una receta dada su costo por porción en vivo.
// Devuelve null si falta data (la UI no muestra badge). Esta lógica espeja
// la del backend en /recetas/:id/costo pero en cliente para mostrarla en la
// lista sin gastar una llamada por receta.
function calcMargenInfo(r: any, costoPorPorcion: number | null | undefined): { pct: number; className: string; estado: 'ok' | 'alerta' | 'critico' } | null {
  const precio = Number(r?.precioVenta);
  const costo = Number(costoPorPorcion);
  if (!precio || precio <= 0 || !Number.isFinite(costo)) return null;
  const pct = ((precio - costo) / precio) * 100;
  const objetivo = Number(r?.margenObjetivo) || 70;
  if (pct >= objetivo) {
    return { pct, estado: 'ok', className: 'bg-success/10 text-success' };
  }
  if (pct >= objetivo - 10) {
    return { pct, estado: 'alerta', className: 'bg-amber-500/10 text-amber-500' };
  }
  return { pct, estado: 'critico', className: 'bg-destructive/10 text-destructive' };
}

// Abre una ventana nueva con el layout imprimible de la ficha técnica
// (método + foto + ingredientes + costo). El usuario tira Cmd+P / Ctrl+P
// directo. No depende de PDF-libs en el bundle — es HTML + CSS puro.
function imprimirFichaTecnica(costoData: any, receta: any) {
  if (!costoData) return;
  const nombre = receta?.nombre ?? costoData.nombre ?? 'Receta';
  const codigo = receta?.codigo ?? costoData.codigo ?? '';
  const porciones = receta?.porciones ?? costoData.porciones ?? 1;
  const tiempo = receta?.tiempoPreparacion;
  const metodo = receta?.metodoPreparacion || '';
  const notas = receta?.notasChef || '';
  const imagen = receta?.imagenBase64 || '';
  const precioVenta = receta?.precioVenta;
  const costoPorPorcion = Number(costoData.costoPorPorcion) || 0;
  const costoTotal = Number(costoData.costoTotal) || 0;
  const ingredientes = costoData.ingredientes || [];

  const fmt = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ficha técnica · ${nombre}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, system-ui, sans-serif;
      color: #111;
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.5;
    }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 10px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
    .meta span + span { margin-left: 12px; padding-left: 12px; border-left: 1px solid #ccc; }
    .hero { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; }
    .hero img { width: 180px; height: 180px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; }
    .hero-info { flex: 1; }
    .costo-box { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px; }
    .costo-item { background: #f8f8f8; padding: 10px 14px; border-radius: 8px; }
    .costo-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    .costo-item .value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .costo-item.highlight { background: #fff6d6; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #eee; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    .r { text-align: right; font-variant-numeric: tabular-nums; }
    .metodo { white-space: pre-wrap; padding: 14px; background: #f8f8f8; border-left: 4px solid #D4AF37; border-radius: 0 8px 8px 0; font-size: 14px; }
    .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="hero">
    ${imagen ? `<img src="${imagen}" alt="${nombre}">` : ''}
    <div class="hero-info">
      <div class="meta">
        <span><strong>${codigo}</strong></span>
        <span>${porciones} porción${porciones === 1 ? '' : 'es'}</span>
        ${tiempo ? `<span>${tiempo} min</span>` : ''}
      </div>
      <h1>${nombre}</h1>
      <div class="costo-box">
        <div class="costo-item highlight">
          <div class="label">Costo por porción</div>
          <div class="value">${fmt(costoPorPorcion)}</div>
        </div>
        <div class="costo-item">
          <div class="label">Costo total</div>
          <div class="value">${fmt(costoTotal)}</div>
        </div>
        ${precioVenta ? `
        <div class="costo-item">
          <div class="label">Precio de venta</div>
          <div class="value">${fmt(Number(precioVenta))}</div>
        </div>` : ''}
      </div>
    </div>
  </div>

  <h2>Ingredientes</h2>
  <table>
    <thead>
      <tr>
        <th>Ingrediente</th>
        <th class="r">Cant. neta</th>
        <th class="r">% merma</th>
        <th class="r">Cant. bruta</th>
        <th class="r">Costo</th>
      </tr>
    </thead>
    <tbody>
      ${ingredientes.map((ing: any) => {
        const cantNeta = Number(ing.cantidad) || 0;
        const merma = Number(ing.mermaEsperada) || 0;
        const cantBruta = Number(ing.cantidadBruta ?? cantNeta) || 0;
        const costo = Number(ing.costoTotal) || 0;
        return `
          <tr>
            <td><strong>${ing.nombre}</strong> <span style="color:#999;font-size:11px;">${ing.unidad}</span></td>
            <td class="r">${cantNeta.toFixed(3)}</td>
            <td class="r">${merma > 0 ? merma.toFixed(1) + '%' : '—'}</td>
            <td class="r">${cantBruta.toFixed(3)}</td>
            <td class="r"><strong>${fmt(costo)}</strong></td>
          </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${metodo ? `
  <h2>Método de preparación</h2>
  <div class="metodo">${metodo.replace(/</g, '&lt;')}</div>
  ` : ''}

  ${notas ? `
  <h2>Notas del chef</h2>
  <div class="metodo" style="border-left-color:#999;">${notas.replace(/</g, '&lt;')}</div>
  ` : ''}

  <div class="footer">
    OPS Terminal · ${new Date().toLocaleDateString('es-AR')} · Esta ficha se regenera cuando cambian los precios de los ingredientes.
  </div>

  <script>
    // Auto-imprimir al abrir, pero esperar a que cargue la imagen si hay.
    window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    alert('Permití los pop-ups para imprimir la ficha.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Comprime una imagen client-side antes de subirla. Necesario porque el
// iPhone genera fotos de 3-5MB que en base64 serían 4-7MB — matar el
// transfer de Neon (estamos a $19/mes con 100GB de cap). Objetivo: ~80KB.
async function comprimirImagen(file: File, maxDim = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas no soportado')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function Recetas() {
  const { addToast } = useToast();
  const { confirm, dialogProps } = useConfirm();
  const [recetas, setRecetas] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  // Circuito: IDs de productos que son "porción" (output de porcionado) o
  // "elaborado" (output de elaboración). Los usamos para pintar íconos
  // visuales en el selector de ingredientes — el chef entiende de un
  // vistazo si el ingrediente es bruto, elaborado o una porción lista.
  const [tiposCircuito, setTiposCircuito] = useState<{ porcion: Set<number>; elaborado: Set<number> }>({
    porcion: new Set(),
    elaborado: new Set(),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [costoModal, setCostoModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [costoData, setCostoData] = useState<any>(null);
  const [error, setError] = useState('');
  // Precios unitarios en vivo (último costo de compra por producto)
  const [preciosUnit, setPreciosUnit] = useState<Record<number, number>>({});
  // Mini-calculadora de % desperdicio (peso bruto + peso desperdicio)
  const [calcMermaIndex, setCalcMermaIndex] = useState<number | null>(null);
  const [calcBruto, setCalcBruto] = useState('');
  const [calcDesp, setCalcDesp] = useState('');
  // Ingrediente cuyos "detalles" (merma/factor/precio unit) están expandidos.
  // Se colapsa por default para no asustar con números al que solo quiere
  // cargar una receta simple.
  const [expandedIng, setExpandedIng] = useState<number | null>(null);
  // Filtros de la lista
  const [buscar, setBuscar] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  // filtroCarta: '' = todas, 'si' = solo carta, 'no' = solo preparaciones
  const [filtroCarta, setFiltroCarta] = useState<'' | 'si' | 'no'>('');

  const cargar = () => {
    api.getRecetas({ activo: 'true' }).then(setRecetas).catch(console.error);
  };

  useEffect(() => {
    cargar();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
    // Cargar qué productos son porción/elaborado para pintar íconos
    // en el selector de ingredientes. Falla silencioso si no llega.
    api.getProductosTiposCircuito()
      .then(data => {
        setTiposCircuito({
          porcion: new Set(data.porcion || []),
          elaborado: new Set(data.elaborado || []),
        });
      })
      .catch(() => {});
  }, []);

  // Productos indexados por id — mucho más rápido que productos.find en cada
  // render de cada ingrediente.
  const productosById = useMemo(() => {
    const m = new Map<number, any>();
    for (const p of productos) m.set(p.id, p);
    return m;
  }, [productos]);

  // Lista filtrada (búsqueda + categoría). Se calcula en cliente — las
  // recetas rara vez superan 200.
  const recetasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return recetas.filter((r: any) => {
      if (filtroCat && r.categoria !== filtroCat) return false;
      if (filtroCarta === 'si' && !r.salidaACarta) return false;
      if (filtroCarta === 'no' && r.salidaACarta) return false;
      if (!q) return true;
      return (r.nombre || '').toLowerCase().includes(q)
        || (r.codigo || '').toLowerCase().includes(q);
    });
  }, [recetas, buscar, filtroCat, filtroCarta]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const abrir = async (receta?: any, opts?: { duplicar?: boolean }) => {
    if (receta) {
      setEditId(opts?.duplicar ? null : receta.id);
      // IMPORTANTE: GET /recetas (list) NO trae imagenBase64 para evitar OOM
      // en el backend (cada imagen pesa hasta 500KB; 30 recetas × 500KB
      // revientan el heap de Node al hacer JSON.stringify). Solo el detalle
      // trae la foto, así que si estamos editando, pegamos al detail para
      // recuperar la imagen existente y no sobreescribirla con null al
      // guardar.
      let imagenBase64 = '';
      if (!opts?.duplicar) {
        try {
          const full = await api.getReceta(receta.id);
          imagenBase64 = full.imagenBase64 ?? '';
        } catch {
          // Si falla, seguimos sin imagen — peor caso, el usuario tiene
          // que volver a subirla. No frenamos la edición.
        }
      }
      setForm({
        codigo: opts?.duplicar ? `${receta.codigo}-COPIA` : receta.codigo,
        nombre: opts?.duplicar ? `${receta.nombre} (copia)` : receta.nombre,
        categoria: receta.categoria,
        sector: receta.sector || '',
        porciones: receta.porciones,
        productoResultadoId: opts?.duplicar ? null : (receta.productoResultadoId ?? null),
        cantidadProducida: receta.cantidadProducida ?? '',
        unidadProducida: receta.unidadProducida ?? '',
        salidaACarta: !!receta.salidaACarta,
        ingredientes: receta.ingredientes?.map((ing: any) => ({
          productoId: ing.productoId,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          mermaEsperada: ing.mermaEsperada || 0,
        })) || [],
        precioVenta: receta.precioVenta ?? '',
        margenObjetivo: receta.margenObjetivo ?? 70,
        metodoPreparacion: receta.metodoPreparacion ?? '',
        tiempoPreparacion: receta.tiempoPreparacion ?? '',
        notasChef: receta.notasChef ?? '',
        imagenBase64,
      });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setExpandedIng(null);
    setError('');
    setModalOpen(true);
  };

  const guardar = async () => {
    setError('');
    try {
      const data: any = {
        codigo: form.codigo,
        nombre: form.nombre,
        categoria: form.categoria,
        sector: form.sector || null,
        porciones: Number(form.porciones),
        productoResultadoId: form.productoResultadoId ?? null,
        cantidadProducida: form.cantidadProducida !== '' ? Number(form.cantidadProducida) : null,
        unidadProducida: form.unidadProducida || null,
        salidaACarta: !!form.salidaACarta,
        ingredientes: form.ingredientes.map(ing => ({
          productoId: ing.productoId,
          cantidad: Number(ing.cantidad),
          unidad: ing.unidad,
          mermaEsperada: Number(ing.mermaEsperada),
        })),
        // Pricing (null si vacío)
        precioVenta: form.precioVenta !== '' && Number(form.precioVenta) > 0
          ? Number(form.precioVenta) : null,
        margenObjetivo: Number(form.margenObjetivo) || 70,
        // Ficha técnica (null si vacío para no ensuciar la DB)
        metodoPreparacion: form.metodoPreparacion?.trim() || null,
        tiempoPreparacion: form.tiempoPreparacion !== '' && Number(form.tiempoPreparacion) > 0
          ? Number(form.tiempoPreparacion) : null,
        notasChef: form.notasChef?.trim() || null,
        imagenBase64: form.imagenBase64 || null,
      };
      if (editId) {
        await api.updateReceta(editId, data);
        addToast('Receta actualizada correctamente');
      } else {
        await api.createReceta(data);
        addToast('Receta creada correctamente');
      }
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
      addToast('Error al guardar la receta', 'error');
    }
  };

  const eliminar = async (id: number, nombre: string) => {
    const ok = await confirm({
      title: `¿Desactivar la receta "${nombre}"?`,
      detalle: 'Va a desaparecer de la lista de platos. Los datos se guardan — la podés reactivar desde los filtros.',
      variant: 'warning',
      confirmLabel: 'Sí, desactivar',
    });
    if (!ok) return;
    try {
      await api.deleteReceta(id);
      addToast('Receta desactivada');
      cargar();
    } catch {
      addToast('Error al desactivar la receta', 'error');
    }
  };

  const verCosto = async (id: number) => {
    try {
      const data = await api.getRecetaCosto(id);
      // Guardamos el id para que "Imprimir ficha" pueda cruzarlo con la
      // receta original (método de preparación, foto, tiempo no vienen en
      // /costo porque es un endpoint focalizado en cálculo).
      setCostoData({ ...data, id });
      setCostoModal(true);
    } catch (e: any) {
      console.error(e);
      addToast('No pudimos calcular el costo ahora', 'error');
    }
  };

  const agregarIngrediente = () => {
    const nuevoIdx = form.ingredientes.length;
    setForm({ ...form, ingredientes: [...form.ingredientes, { ...emptyIngrediente }] });
    // Expandimos el recién agregado para que el usuario lo vea en foco.
    setExpandedIng(nuevoIdx);
  };

  const quitarIngrediente = (index: number) => {
    setForm({ ...form, ingredientes: form.ingredientes.filter((_, i) => i !== index) });
    if (expandedIng === index) setExpandedIng(null);
  };

  const actualizarIngrediente = (index: number, campo: keyof Ingrediente, valor: any) => {
    const nuevos = [...form.ingredientes];
    nuevos[index] = { ...nuevos[index], [campo]: valor };
    if (campo === 'productoId' && valor) {
      const prod = productosById.get(Number(valor));
      if (prod) nuevos[index].unidad = prod.unidadUso;
    }
    setForm({ ...form, ingredientes: nuevos });
  };

  // Cargar últimos precios cada vez que cambian los productos seleccionados
  useEffect(() => {
    if (!modalOpen) return;
    const ids = Array.from(
      new Set(
        form.ingredientes
          .map(ing => ing.productoId)
          .filter((id): id is number => id != null)
      )
    );
    const faltan = ids.filter(id => !(id in preciosUnit));
    if (faltan.length === 0) return;
    api.getUltimosCostos(faltan)
      .then(resp => {
        setPreciosUnit(prev => {
          const next = { ...prev };
          for (const id of faltan) {
            next[id] = resp[id]?.costoUnitario ?? 0;
          }
          return next;
        });
      })
      .catch(() => { });
  }, [form.ingredientes, modalOpen]);

  const abrirCalcMerma = (index: number) => {
    setCalcMermaIndex(index);
    setCalcBruto('');
    setCalcDesp('');
  };

  const aplicarCalcMerma = () => {
    if (calcMermaIndex == null) return;
    const bruto = Number(calcBruto);
    const desp = Number(calcDesp);
    if (!bruto || bruto <= 0 || desp < 0) return;
    const pct = porcentajeDesperdicio(bruto, desp);
    actualizarIngrediente(calcMermaIndex, 'mermaEsperada', +pct.toFixed(2));
    setCalcMermaIndex(null);
  };

  // ── Cálculos en vivo del form ─────────────────────────────────────────────
  const { costoTotal, costoPorPorcion } = useMemo(() => {
    let total = 0;
    for (const ing of form.ingredientes) {
      const merma = Number(ing.mermaEsperada) || 0;
      const factor = factorDesperdicio(merma);
      const cantNeta = Number(ing.cantidad) || 0;
      const precio = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
      total += cantNeta * factor * precio;
    }
    const porc = form.porciones > 0 ? total / form.porciones : 0;
    return { costoTotal: total, costoPorPorcion: porc };
  }, [form.ingredientes, form.porciones, preciosUnit]);

  // Costo por porción de una receta guardada — la pre-calculamos para las
  // cards de la lista. Usa los precios del último ingreso cargado via
  // /ultimos-costos. Si no hay, el número queda en null y la card muestra
  // "—" con link "Ver costo" que refresca desde el backend.
  const [costosListaCache, setCostosListaCache] = useState<Record<number, number | null>>({});
  useEffect(() => {
    if (!recetas.length) return;
    // Juntamos todos los productoId que aparecen en todas las recetas.
    const pids = new Set<number>();
    for (const r of recetas) {
      for (const ing of r.ingredientes || []) {
        if (ing.productoId) pids.add(ing.productoId);
      }
    }
    if (pids.size === 0) return;
    const faltan = Array.from(pids).filter(id => !(id in preciosUnit));
    if (faltan.length) {
      api.getUltimosCostos(faltan)
        .then(resp => {
          setPreciosUnit(prev => {
            const next = { ...prev };
            for (const id of faltan) next[id] = resp[id]?.costoUnitario ?? 0;
            return next;
          });
        })
        .catch(() => {});
    }
    // Calcular costos por receta con los precios disponibles (aunque sean 0).
    const nuevos: Record<number, number | null> = {};
    for (const r of recetas) {
      if (!r.ingredientes?.length) { nuevos[r.id] = null; continue; }
      let total = 0;
      let tieneAlgunPrecio = false;
      for (const ing of r.ingredientes) {
        const cantNeta = Number(ing.cantidad) || 0;
        const merma = Number(ing.mermaEsperada) || 0;
        const factor = factorDesperdicio(merma);
        const precio = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
        if (precio > 0) tieneAlgunPrecio = true;
        total += cantNeta * factor * precio;
      }
      nuevos[r.id] = tieneAlgunPrecio && r.porciones > 0 ? total / r.porciones : null;
    }
    setCostosListaCache(nuevos);
  }, [recetas, preciosUnit]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageTour pageKey="recetas" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Cocina</p>
            <HelpHint
              title="¿Cómo funcionan las recetas?"
              bullets={[
                'Cargás cada plato una sola vez con sus ingredientes y cuánto lleva de cada uno.',
                'Cuando subís una factura nueva del proveedor, el costo de cada plato se actualiza solo.',
                'El número grande en dorado es el costo por porción — lo que te cuesta hacer un plato. Cobrá mínimo 3× ese número.',
                'Si un ingrediente se descarta (cáscara, hueso), usá el chip "Detalle" para poner el % de merma. Si no, dejalo en 0.',
              ]}
            />
          </div>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Recetas</h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {recetas.length} receta{recetas.length === 1 ? '' : 's'} — costo por porción al día con los últimos precios de proveedor.
          </p>
        </div>
        <Button onClick={() => abrir()}>
          <Plus size={16} /> Nueva receta
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <Input
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar receta por nombre o código…"
            className="pl-9"
          />
        </div>
        <Select
          value={filtroCat}
          onChange={e => setFiltroCat(e.target.value)}
          options={[{ value: '', label: 'Todas las categorías' }, ...CATEGORIAS]}
        />
      </div>

      {/* Toggle rápido: todas / sólo carta / sólo preparaciones.
          Chips grandes y táctiles — más útiles que un dropdown para algo
          que se alterna seguido en la cocina. */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {[
          { value: '', label: 'Todas', count: recetas.length },
          { value: 'si', label: 'A la carta', icon: <Utensils size={11} />, count: recetas.filter(r => r.salidaACarta).length },
          { value: 'no', label: 'Preparaciones', icon: <ChefHat size={11} />, count: recetas.filter(r => !r.salidaACarta).length },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFiltroCarta(opt.value as '' | 'si' | 'no')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shrink-0 transition-all active:scale-95 ${
              filtroCarta === opt.value
                ? opt.value === 'si' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : opt.value === 'no' ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-foreground/10 border-foreground/20 text-foreground'
                : 'bg-surface border-border text-on-surface-variant hover:text-foreground'
            }`}
          >
            {opt.icon}
            {opt.label}
            <span className={`text-[10px] px-1.5 rounded ${filtroCarta === opt.value ? 'bg-background/30' : 'bg-surface-high'}`}>
              {opt.count}
            </span>
          </button>
        ))}
      </div>

      {/* Lista — cards en mobile, tabla en desktop */}
      {/* Mobile: cards grandes, tocables, costo por porción gigante */}
      <div className="sm:hidden space-y-2.5">
        {recetasFiltradas.map(r => {
          const costo = costosListaCache[r.id];
          const margenInfo = calcMargenInfo(r, costo);
          return (
            <div key={r.id} className="bg-surface rounded-xl border border-border p-4 active:scale-[0.99] transition-transform">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-primary">{r.codigo}</p>
                  <p className="font-bold text-foreground text-base leading-tight mt-0.5 truncate">{r.nombre}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {r.salidaACarta && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <Utensils size={10} /> A LA CARTA
                      </span>
                    )}
                    <Badge>{r.categoria}</Badge>
                    <span className="text-[10px] text-on-surface-variant">
                      {r.porciones} porción{r.porciones === 1 ? '' : 'es'}
                    </span>
                    {margenInfo && (
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${margenInfo.className}`}>
                        Margen {margenInfo.pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Por porción</p>
                  <p className="font-mono text-xl font-extrabold text-primary tabular-nums leading-tight">
                    {costo != null ? fmtMoney(costo) : '—'}
                  </p>
                  {r.precioVenta && r.precioVenta > 0 && (
                    <p className="text-[10px] text-on-surface-variant mt-0.5">
                      venta {fmtMoney(Number(r.precioVenta))}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <button
                  onClick={() => abrir(r)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-surface-high text-xs font-bold text-foreground active:bg-surface-high/70"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  onClick={() => verCosto(r.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 text-xs font-bold text-primary active:bg-primary/20"
                >
                  <DollarSign size={13} /> Ver detalle
                </button>
                <button
                  onClick={() => abrir(r, { duplicar: true })}
                  className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:bg-surface-high/70"
                  title="Duplicar receta"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => eliminar(r.id, r.nombre)}
                  className="p-2 rounded-lg bg-surface-high text-on-surface-variant active:bg-destructive/10 active:text-destructive"
                  title="Eliminar receta"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {recetasFiltradas.length === 0 && (
          <div className="bg-surface rounded-xl border border-border p-10 text-center">
            <ChefHat size={28} className="mx-auto text-on-surface-variant mb-2" />
            <p className="text-sm text-on-surface-variant font-medium">
              {recetas.length === 0 ? 'Todavía no hay recetas.' : 'Sin resultados con ese filtro.'}
            </p>
            {recetas.length === 0 && (
              <Button size="sm" onClick={() => abrir()} className="mt-3">
                <Plus size={14} /> Crear la primera
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Desktop: tabla con costo por porción destacado */}
      <div className="hidden sm:block bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Nombre</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Categoría</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Sector</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Porciones</th>
                <th className="text-right p-3 text-[10px] font-bold text-primary uppercase tracking-widest">Costo / porción</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Precio venta</th>
                <th className="text-center p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Margen</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recetasFiltradas.map(r => {
                const costo = costosListaCache[r.id];
                const margenInfo = calcMargenInfo(r, costo);
                return (
                  <tr key={r.id} className="hover:bg-surface-high/50 transition-colors">
                    <td className="p-3 font-mono text-xs text-primary">{r.codigo}</td>
                    <td className="p-3 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        {r.salidaACarta && (
                          <span title="Sale a la carta del restaurante" className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <Utensils size={9} /> CARTA
                          </span>
                        )}
                        <span className="truncate">{r.nombre}</span>
                      </div>
                    </td>
                    <td className="p-3"><Badge>{r.categoria}</Badge></td>
                    <td className="p-3 hidden md:table-cell text-xs text-on-surface-variant">
                      {r.sector ? (SECTORES.find(s => s.value === r.sector)?.label || r.sector) : '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-right text-on-surface-variant">{r.porciones}</td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-base font-extrabold text-primary tabular-nums">
                        {costo != null ? fmtMoney(costo) : '—'}
                      </span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-right font-mono text-foreground tabular-nums">
                      {r.precioVenta ? fmtMoney(Number(r.precioVenta)) : <span className="text-on-surface-variant/60">—</span>}
                    </td>
                    <td className="p-3 hidden lg:table-cell text-center">
                      {margenInfo ? (
                        <span className={`inline-block text-[11px] font-extrabold px-2 py-0.5 rounded ${margenInfo.className}`} title={margenInfo.estado === 'critico' ? 'Margen crítico — revisá el precio' : margenInfo.estado === 'alerta' ? 'Margen cerca del objetivo' : 'Margen OK'}>
                          {margenInfo.pct.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-on-surface-variant/60 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => verCosto(r.id)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-primary transition-colors" title="Ver detalle de costo">
                          <DollarSign size={14} />
                        </button>
                        <button onClick={() => abrir(r)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => abrir(r, { duplicar: true })} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Duplicar">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => eliminar(r.id, r.nombre)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {recetasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-on-surface-variant font-medium">
                    {recetas.length === 0 ? 'Todavía no hay recetas. Creá la primera con el botón de arriba.' : 'Sin resultados con ese filtro.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal crear/editar — layout mobile-first con costo visible arriba
          y cards verticales por ingrediente.
          ═══════════════════════════════════════════════════════════════════ */}
      <DrawerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar receta' : 'Nueva receta'}
        size="xl"
      >
        <div className="space-y-4">
          {/* Stepper del circuito — contextualiza dónde está parado el chef.
              Receta es el paso final: consume producto bruto / elaborado /
              porción y produce un plato (o una sub-preparación). */}
          <div className="rounded-xl border border-border/60 bg-surface-high/20 p-3">
            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-2">
              Circuito de producción
            </p>
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-on-surface-variant">
                <Package size={11} /> Bruto
              </div>
              <ArrowRight size={10} className="text-on-surface-variant/40 shrink-0" />
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-on-surface-variant">
                <Flame size={11} /> Elaborado
              </div>
              <ArrowRight size={10} className="text-on-surface-variant/40 shrink-0" />
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface text-on-surface-variant">
                <Scissors size={11} /> Porción
              </div>
              <ArrowRight size={10} className="text-primary/70 shrink-0" />
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-extrabold ${
                form.salidaACarta
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-primary/5 border-primary/30 text-primary'
              }`}>
                {form.salidaACarta ? <Utensils size={11} /> : <ChefHat size={11} />}
                {form.salidaACarta ? 'Carta' : 'Receta'}
              </div>
            </div>
          </div>

          {/* Hero del costo — SIEMPRE visible, es la razón de ser de esta pantalla */}
          <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Costo por porción</p>
                <p className="font-mono text-3xl sm:text-4xl font-extrabold text-primary tabular-nums leading-tight">
                  {costoPorPorcion > 0 ? fmtMoney(costoPorPorcion) : '$0'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total receta</p>
                <p className="font-mono text-lg font-bold text-foreground tabular-nums">
                  {fmtMoney(costoTotal)}
                </p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  {form.porciones} porción{form.porciones === 1 ? '' : 'es'} · {form.ingredientes.length} ingrediente{form.ingredientes.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Salida a carta — toggle visual grande, define el destino del plato ── */}
          <button
            type="button"
            onClick={() => setForm({ ...form, salidaACarta: !form.salidaACarta })}
            className={`w-full rounded-xl border p-4 flex items-center gap-3 transition-all active:scale-[0.99] text-left ${
              form.salidaACarta
                ? 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border-emerald-500/40'
                : 'bg-surface-high/30 border-border/60 hover:border-border'
            }`}
          >
            <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
              form.salidaACarta ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface text-on-surface-variant'
            }`}>
              <Utensils size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-extrabold ${form.salidaACarta ? 'text-emerald-400' : 'text-foreground'}`}>
                {form.salidaACarta ? '✓ Sale a la carta del restaurante' : 'Marcá si sale a la carta'}
              </p>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                {form.salidaACarta
                  ? 'Plato final que el cliente pide en el menú. Va al reporte de platos, cálculo de margen y ventas.'
                  : 'Hoy es una preparación interna (salsa, masa, fondo). Activá si es un plato que sale al salón.'}
              </p>
            </div>
            {/* Switch visual */}
            <div className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
              form.salidaACarta ? 'bg-emerald-500' : 'bg-surface border border-border'
            }`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow-md transition-transform ${
                form.salidaACarta ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`} />
            </div>
          </button>

          {/* Datos básicos */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código"
              id="codigo"
              value={form.codigo}
              onChange={e => setForm({ ...form, codigo: e.target.value })}
              placeholder="REC-001"
            />
            <Input
              label="Porciones"
              id="porciones"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.porciones}
              onChange={e => setForm({ ...form, porciones: Number(e.target.value) || 1 })}
            />
          </div>
          <Input
            label="Nombre"
            id="nombre"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: Pizza napolitana, Milanesa con puré…"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Categoría"
              id="categoria"
              value={form.categoria}
              onChange={e => setForm({ ...form, categoria: e.target.value })}
              options={CATEGORIAS}
              placeholder="Elegir…"
            />
            <Select
              label="Sector"
              id="sector"
              value={form.sector}
              onChange={e => setForm({ ...form, sector: e.target.value })}
              options={SECTORES}
            />
          </div>

          {/* Producto elaborado — solo si la receta también produce stock */}
          <details className="rounded-xl border border-border bg-surface-high/20 group">
            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
              <Package size={13} className="text-primary" />
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                Producto elaborado <span className="normal-case font-normal">(opcional)</span>
              </p>
              {form.productoResultadoId && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Configurado
                </span>
              )}
              <ChevronDown size={14} className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-3 pt-0 space-y-2">
              <p className="text-[11px] text-on-surface-variant">
                Solo si esta receta produce un producto con stock propio (ej: masa madre, caldo, salsa base).
                Al elaborar, se consume los ingredientes y se ingresa al stock lo producido.
              </p>
              <SearchableSelect
                value={form.productoResultadoId?.toString() || ''}
                onChange={v => {
                  const prod = productosById.get(Number(v));
                  setForm(f => ({
                    ...f,
                    productoResultadoId: v ? Number(v) : null,
                    unidadProducida: prod?.unidadUso ?? f.unidadProducida,
                  }));
                }}
                options={[
                  { value: '', label: 'Sin producto resultado' },
                  ...productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} · ${p.nombre}` })),
                ]}
                placeholder="Buscar producto elaborado…"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Cantidad producida"
                  id="cantidadProducida"
                  type="number"
                  inputMode="decimal"
                  value={form.cantidadProducida}
                  onChange={e => setForm(f => ({ ...f, cantidadProducida: e.target.value }))}
                  placeholder="ej: 7"
                />
                <Input
                  label="Unidad"
                  id="unidadProducida"
                  value={form.unidadProducida}
                  onChange={e => setForm(f => ({ ...f, unidadProducida: e.target.value }))}
                  placeholder="kg, lt, unidad…"
                />
              </div>
            </div>
          </details>

          {/* Precio de venta y margen — opcional pero muy visible */}
          <details className="rounded-xl border border-border bg-surface-high/20 group" open={!!form.precioVenta}>
            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
              <DollarSign size={13} className="text-primary" />
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                Precio de venta <span className="normal-case font-normal">(opcional)</span>
              </p>
              {form.precioVenta !== '' && Number(form.precioVenta) > 0 && (() => {
                const precio = Number(form.precioVenta);
                const margen = precio > 0 ? ((precio - costoPorPorcion) / precio) * 100 : 0;
                const objetivo = Number(form.margenObjetivo) || 70;
                const estado = margen >= objetivo ? 'ok' : margen >= objetivo - 10 ? 'alerta' : 'critico';
                const color = estado === 'ok' ? 'text-success bg-success/10'
                  : estado === 'alerta' ? 'text-amber-500 bg-amber-500/10'
                  : 'text-destructive bg-destructive/10';
                return (
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${color}`}>
                    Margen {margen.toFixed(0)}%
                  </span>
                );
              })()}
              <ChevronDown size={14} className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-3 pt-0 space-y-2">
              <p className="text-[11px] text-on-surface-variant">
                Cargá lo que cobrás por porción. La app te va a avisar cuando el costo de los ingredientes suba y el margen caiga debajo de tu objetivo.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Precio por porción</label>
                  <div className="flex items-stretch rounded-lg bg-surface overflow-hidden border border-border/40">
                    <span className="flex items-center justify-center px-2 text-xs font-bold text-on-surface-variant bg-surface-high/60">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      value={form.precioVenta}
                      onChange={e => setForm({ ...form, precioVenta: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 bg-transparent text-foreground text-base font-bold focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Margen objetivo %</label>
                  <div className="flex items-stretch rounded-lg bg-surface overflow-hidden border border-border/40">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      max="99"
                      placeholder="70"
                      value={form.margenObjetivo}
                      onChange={e => setForm({ ...form, margenObjetivo: Number(e.target.value) })}
                      className="flex-1 min-w-0 px-3 py-2 bg-transparent text-foreground text-base font-bold focus:outline-none"
                    />
                    <span className="flex items-center justify-center px-2 text-xs font-bold text-on-surface-variant bg-surface-high/60">%</span>
                  </div>
                </div>
              </div>
              {form.precioVenta !== '' && Number(form.precioVenta) > 0 && costoPorPorcion > 0 && (() => {
                const precio = Number(form.precioVenta);
                const margen = ((precio - costoPorPorcion) / precio) * 100;
                const ganancia = precio - costoPorPorcion;
                const objetivo = Number(form.margenObjetivo) || 70;
                const bajoObjetivo = margen < objetivo;
                return (
                  <div className={`rounded-lg px-3 py-2 text-xs flex items-center justify-between ${
                    bajoObjetivo
                      ? margen < objetivo - 10
                        ? 'bg-destructive/10 text-destructive border border-destructive/30'
                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                      : 'bg-success/10 text-success border border-success/30'
                  }`}>
                    <span className="font-bold">
                      Margen {margen.toFixed(1)}% · ganás {fmtMoney(ganancia)} por porción
                    </span>
                    {bajoObjetivo && (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">
                        {margen < objetivo - 10 ? '⚠ revisá precio' : 'atento'}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </details>

          {/* Ficha técnica — método de preparación + foto + tiempo. Colapsado
              por default porque es opcional y no queremos saturar al usuario. */}
          <details className="rounded-xl border border-border bg-surface-high/20 group" open={!!(form.metodoPreparacion || form.imagenBase64 || form.tiempoPreparacion)}>
            <summary className="flex items-center gap-2 p-3 cursor-pointer list-none select-none">
              <ChefHat size={13} className="text-primary" />
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest flex-1">
                Ficha técnica <span className="normal-case font-normal">(método, foto, tiempo)</span>
              </p>
              {(form.metodoPreparacion || form.imagenBase64) && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Cargada
                </span>
              )}
              <ChevronDown size={14} className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-3 pt-0 space-y-3">
              <p className="text-[11px] text-on-surface-variant">
                Convertí la receta en una ficha completa que podés imprimir y pegar en la cocina.
              </p>

              {/* Foto — opcional, comprimida client-side para no reventar DB */}
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
                  Foto del plato
                </label>
                {form.imagenBase64 ? (
                  <div className="relative rounded-lg overflow-hidden border border-border/40">
                    <img
                      src={form.imagenBase64}
                      alt="Foto del plato"
                      className="w-full max-h-64 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imagenBase64: '' })}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 hover:bg-background text-destructive"
                      title="Quitar foto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-6 rounded-lg bg-surface border border-dashed border-border hover:border-primary/40 cursor-pointer text-xs text-on-surface-variant transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        // Compresión agresiva: max 800px, JPEG 75% — típicamente
                        // deja el base64 en 60-100KB. Evita subir 3MB del iPhone.
                        try {
                          const compressed = await comprimirImagen(file, 800, 0.75);
                          if (compressed.length > 500_000) {
                            addToast('La imagen es muy grande. Probá con otra más chica.', 'error');
                            return;
                          }
                          setForm(f => ({ ...f, imagenBase64: compressed }));
                        } catch {
                          addToast('No pudimos procesar la imagen', 'error');
                        }
                      }}
                    />
                    <Plus size={16} /> Subir foto del plato
                  </label>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
                  Método de preparación
                </label>
                <textarea
                  value={form.metodoPreparacion}
                  onChange={e => setForm({ ...form, metodoPreparacion: e.target.value })}
                  placeholder={'1. Picar la cebolla...\n2. Rehogar en aceite...\n3. Agregar el tomate...'}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-surface border-0 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  maxLength={5000}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
                    Tiempo (min)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="30"
                    value={form.tiempoPreparacion}
                    onChange={e => setForm({ ...form, tiempoPreparacion: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-surface border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">
                  Notas del chef
                </label>
                <textarea
                  value={form.notasChef}
                  onChange={e => setForm({ ...form, notasChef: e.target.value })}
                  placeholder="Vino recomendado, presentación, trucos…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-surface border-0 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  maxLength={2000}
                />
              </div>
            </div>
          </details>

          {/* Ingredientes — cards verticales */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ChefHat size={14} className="text-primary" />
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Ingredientes <span className="text-primary">({form.ingredientes.length})</span>
                </p>
              </div>
              <button
                onClick={agregarIngrediente}
                className="flex items-center gap-1 text-xs font-bold text-primary active:text-primary/70 px-2 py-1 rounded-lg hover:bg-primary/10"
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            {form.ingredientes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-xs text-on-surface-variant italic mb-3">
                  Sin ingredientes todavía. Tocá "Agregar" para empezar.
                </p>
                <Button size="sm" onClick={agregarIngrediente}>
                  <Plus size={14} /> Primer ingrediente
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {form.ingredientes.map((ing, index) => {
                  const merma = Number(ing.mermaEsperada) || 0;
                  const factor = factorDesperdicio(merma);
                  const cantNeta = Number(ing.cantidad) || 0;
                  const cantBruta = cantNeta * factor;
                  const precioUnit = ing.productoId ? (preciosUnit[ing.productoId] ?? 0) : 0;
                  const costoTotalIng = cantBruta * precioUnit;
                  const tieneMerma = merma > 0;
                  const isExpanded = expandedIng === index;
                  const prod = ing.productoId ? productosById.get(ing.productoId) : null;
                  // Tipo de este ingrediente en el circuito:
                  //   - porción: viene del paso 2 (ya listo para usar)
                  //   - elaborado: viene del paso 1 (producto limpio/elaborado)
                  //   - bruto: producto original sin elaborar
                  const tipoIng = ing.productoId && tiposCircuito.porcion.has(ing.productoId)
                    ? 'porcion'
                    : ing.productoId && tiposCircuito.elaborado.has(ing.productoId)
                      ? 'elaborado'
                      : 'bruto';
                  const tipoBadge = tipoIng === 'porcion'
                    ? { icon: <Scissors size={10} />, label: 'Porción', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30' }
                    : tipoIng === 'elaborado'
                      ? { icon: <Flame size={10} />, label: 'Elaborado', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30' }
                      : { icon: <Package size={10} />, label: 'Bruto', cls: 'bg-surface text-on-surface-variant border-border/50' };

                  return (
                    <div
                      key={index}
                      className={`rounded-xl bg-surface-high/40 border transition-all ${
                        isExpanded ? 'border-primary/40' : 'border-border/60'
                      }`}
                    >
                      {/* Fila principal: producto + cantidad + costo + quitar */}
                      <div className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <SearchableSelect
                              value={ing.productoId?.toString() || ''}
                              onChange={v => actualizarIngrediente(index, 'productoId', v ? Number(v) : null)}
                              options={productos.map(p => {
                                // Prefix visual en el label según tipo en el circuito.
                                // El chef ve de un vistazo si el ingrediente es
                                // "✂ porción" (listo del porcionado), "🔥 elaborado"
                                // (del paso 1) o bruto (sin prefijo).
                                const prefix = tiposCircuito.porcion.has(p.id) ? '✂ '
                                  : tiposCircuito.elaborado.has(p.id) ? '🔥 '
                                  : '';
                                return { value: p.id.toString(), label: `${prefix}${p.nombre}${p.codigo ? ` · ${p.codigo}` : ''}` };
                              })}
                              placeholder="Buscar ingrediente…"
                            />
                            {/* Badge del tipo — solo cuando hay producto elegido */}
                            {ing.productoId && (
                              <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mt-1.5 border ${tipoBadge.cls}`}>
                                {tipoBadge.icon}
                                {tipoBadge.label}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => quitarIngrediente(index)}
                            className="p-2 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors shrink-0"
                            title="Quitar ingrediente"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Cantidad + unidad */}
                          <div className="flex-1 flex items-stretch rounded-lg bg-surface overflow-hidden border border-border/40">
                            <input
                              type="number"
                              step="0.001"
                              inputMode="decimal"
                              placeholder="0"
                              value={ing.cantidad || ''}
                              onChange={e => actualizarIngrediente(index, 'cantidad', e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2.5 bg-transparent text-foreground text-base font-bold focus:outline-none"
                            />
                            <span className="flex items-center justify-center px-3 text-xs font-bold text-on-surface-variant bg-surface-high/60 min-w-[56px]">
                              {ing.unidad || '—'}
                            </span>
                          </div>

                          {/* Chip de merma — tap para toggle, muestra % si está */}
                          <button
                            onClick={() => setExpandedIng(isExpanded ? null : index)}
                            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-[10px] font-bold transition-colors border ${
                              tieneMerma
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                : 'bg-surface border-border/50 text-on-surface-variant'
                            }`}
                            title={tieneMerma ? `Merma ${merma}%` : 'Sin merma configurada'}
                          >
                            <Sliders size={11} />
                            {tieneMerma ? `${merma}%` : 'Detalle'}
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>

                        {/* Resumen — costo de este ingrediente siempre visible */}
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-on-surface-variant">
                            {precioUnit > 0 && prod
                              ? `${fmtMoney(precioUnit)}/${ing.unidad || 'u'} · último de ${prod.nombre.length > 18 ? prod.nombre.slice(0, 18) + '…' : prod.nombre}`
                              : prod
                                ? <span className="italic">Falta cargar el último precio (sin facturas de este producto)</span>
                                : <span className="italic">Elegí un ingrediente para ver su costo</span>}
                          </span>
                          <span className={`font-mono font-extrabold tabular-nums ${costoTotalIng > 0 ? 'text-primary text-sm' : 'text-on-surface-variant'}`}>
                            {costoTotalIng > 0 ? fmtMoney(costoTotalIng) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Panel expandido: merma + factor + bruto + precio */}
                      {isExpanded && (
                        <div className="border-t border-border/40 p-3 space-y-3 bg-surface/30">
                          <div className="flex items-start gap-2 px-2 py-2 rounded-lg bg-primary/5">
                            <Info size={12} className="text-primary shrink-0 mt-0.5" />
                            <p className="text-[11px] text-on-surface-variant leading-relaxed">
                              La <b className="text-foreground">merma</b> es lo que se descarta al limpiar un producto (cáscara, hueso, recorte).
                              Dejala en <b className="text-foreground">0</b> si comprás ya limpio (ej: muzzarella, harina). Si pelás 1kg de cebolla y tirás 200g, tenés 20% de merma.
                            </p>
                          </div>

                          {/* Sugerencia automática según nombre del producto —
                              solo se muestra si: el producto está elegido, hay
                              sugerencia confiable en la tabla del rubro, y el
                              usuario todavía no cargó un valor propio (merma=0).
                              Es un hint pasivo: no pisa lo que el chef puso. */}
                          {prod && !tieneMerma && (() => {
                            const s = sugerirMerma(prod.nombre);
                            if (!s) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => actualizarIngrediente(index, 'mermaEsperada', s.pct)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 active:bg-amber-500/20 text-left transition-colors"
                                title="Tocá para aplicar la merma típica de este producto"
                              >
                                <span className="text-base">💡</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold text-amber-500">
                                    Merma típica para {prod.nombre.length > 30 ? prod.nombre.slice(0, 30) + '…' : prod.nombre}: {s.pct}%
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant mt-0.5">
                                    {s.nota} · tocá para usar
                                  </p>
                                </div>
                              </button>
                            );
                          })()}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">% de merma</label>
                                <button
                                  type="button"
                                  onClick={() => abrirCalcMerma(index)}
                                  className="flex items-center gap-1 text-[10px] font-bold text-primary active:text-primary/70"
                                  title="Calcular con la balanza"
                                >
                                  <Calculator size={10} /> Calcular
                                </button>
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="0"
                                value={ing.mermaEsperada || ''}
                                onChange={e => actualizarIngrediente(index, 'mermaEsperada', e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-surface border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Hay que comprar</label>
                              <div className="w-full px-3 py-2 rounded-lg bg-surface/40 text-foreground text-base font-mono tabular-nums font-bold">
                                {cantBruta > 0 ? `${fmtNum(cantBruta)} ${ing.unidad || ''}` : '—'}
                              </div>
                              <p className="text-[9px] text-on-surface-variant mt-0.5">
                                {tieneMerma ? `cant. neta × ${factor.toFixed(3)} (factor)` : 'igual a la cantidad neta (sin merma)'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded-lg bg-surface/40">
                            <span className="text-on-surface-variant">
                              Último precio de compra: <b className="text-foreground font-mono">{precioUnit > 0 ? fmtMoney(precioUnit) : '—'}</b> por {ing.unidad || 'unidad'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {form.ingredientes.length > 0 && (
              <button
                onClick={agregarIngrediente}
                className="mt-2 w-full flex items-center justify-center gap-1 py-2.5 rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
              >
                <Plus size={14} /> Agregar otro ingrediente
              </button>
            )}
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button onClick={guardar} className="flex-1">
              {editId ? 'Guardar cambios' : 'Crear receta'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>

          {/* Leyenda de ingrediente sin precio — se lista al final solo si hay casos */}
          {(() => {
            const sinPrecio = form.ingredientes.filter(ing =>
              ing.productoId && (preciosUnit[ing.productoId] ?? 0) <= 0
            ).length;
            if (sinPrecio === 0) return null;
            return (
              <div className="text-[11px] text-amber-500 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                ⚠ {sinPrecio} ingrediente{sinPrecio === 1 ? '' : 's'} sin precio cargado. El costo sube cuando confirmes una factura de ese proveedor.
              </div>
            );
          })()}
        </div>
      </DrawerModal>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal Ver Costo — desglose visual con barras de % de participación
          ═══════════════════════════════════════════════════════════════════ */}
      <DrawerModal
        open={costoModal}
        onClose={() => setCostoModal(false)}
        title="Costo de receta"
      >
        {costoData && (() => {
          const total = Number(costoData.costoTotal) || 0;
          const porPorcion = Number(costoData.costoPorPorcion) || 0;
          const items = (costoData.ingredientes || []) as any[];
          const ordenados = [...items].sort((a, b) => Number(b.costoTotal) - Number(a.costoTotal));

          const compartirWA = () => {
            const lines = [
              `📋 ${costoData.nombre} (${costoData.porciones} porc.)`,
              `💰 Costo total: ${fmtMoney(total)}`,
              `🎯 Por porción: ${fmtMoney(porPorcion)}`,
              '',
              'Ingredientes:',
              ...ordenados.map((ing: any) => {
                const pct = total > 0 ? (Number(ing.costoTotal) / total) * 100 : 0;
                return `• ${ing.nombre}: ${fmtMoney(Number(ing.costoTotal))} (${pct.toFixed(0)}%)`;
              }),
            ];
            const txt = encodeURIComponent(lines.join('\n'));
            window.open(`https://wa.me/?text=${txt}`, '_blank');
          };

          return (
            <div className="space-y-4">
              {/* Hero — dato que importa */}
              <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 p-4">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{costoData.nombre}</p>
                <p className="font-mono text-4xl font-extrabold text-primary tabular-nums leading-tight mt-1">
                  {fmtMoney(porPorcion)}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  por porción · total de la receta: <b className="text-foreground">{fmtMoney(total)}</b> ({costoData.porciones} porc.)
                </p>
              </div>

              {/* Ingredientes como barras de % */}
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                  Dónde está el costo
                </p>
                <div className="space-y-1.5">
                  {ordenados.map((ing: any, i: number) => {
                    const pct = total > 0 ? (Number(ing.costoTotal) / total) * 100 : 0;
                    const cantNeta = Number(ing.cantidad) || 0;
                    const cantBruta = Number(ing.cantidadBruta || ing.cantidad) || 0;
                    const merma = Number(ing.mermaEsperada) || 0;
                    return (
                      <div key={i} className="rounded-lg bg-surface-high/40 border border-border/40 p-2.5">
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <p className="font-semibold text-foreground text-sm truncate flex-1">{ing.nombre}</p>
                          <span className="font-mono text-sm font-bold text-primary tabular-nums">
                            {fmtMoney(Number(ing.costoTotal))}
                          </span>
                        </div>
                        {/* Barra de % */}
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                          <span>
                            {fmtNum(cantNeta)} {ing.unidad}
                            {merma > 0 && (
                              <span className="text-amber-500"> · {merma}% merma → {fmtNum(cantBruta)} {ing.unidad}</span>
                            )}
                            <span className="text-on-surface-variant/70"> · {fmtMoney(Number(ing.costoUnitario))}/{ing.unidad}</span>
                          </span>
                          <span className="font-mono font-bold text-foreground">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-1 flex-wrap">
                <Button onClick={compartirWA} className="flex-1 min-w-[140px]" variant="secondary">
                  <Send size={14} /> WhatsApp
                </Button>
                <Button
                  onClick={() => imprimirFichaTecnica(costoData, recetas.find(r => r.id === costoData.id))}
                  className="flex-1 min-w-[140px]"
                  variant="secondary"
                >
                  <Printer size={14} /> Imprimir ficha
                </Button>
                <Button onClick={() => setCostoModal(false)}>Cerrar</Button>
              </div>
            </div>
          );
        })()}
      </DrawerModal>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal calculadora de % de desperdicio
          ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        open={calcMermaIndex != null}
        onClose={() => setCalcMermaIndex(null)}
        title="Calcular % de merma"
      >
        <div className="space-y-4">
          <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
            <Info size={13} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Poné en la balanza lo que tenés <b className="text-foreground">entero</b> (el peso bruto) y lo que <b className="text-foreground">descartás</b> (cáscara, hueso, recorte). La app calcula la merma real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Peso bruto</label>
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                placeholder="ej: 1.000"
                value={calcBruto}
                onChange={e => setCalcBruto(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 block">Descarte</label>
              <input
                type="number"
                step="0.001"
                inputMode="decimal"
                placeholder="ej: 0.300"
                value={calcDesp}
                onChange={e => setCalcDesp(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {(() => {
            const bruto = Number(calcBruto) || 0;
            const desp = Number(calcDesp) || 0;
            if (bruto <= 0 || desp < 0) return null;
            const pct = porcentajeDesperdicio(bruto, desp);
            const factor = factorDesperdicio(pct);
            return (
              <div className="bg-surface-high/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-on-surface-variant">Merma real</span>
                  <span className="font-mono text-base font-extrabold text-primary tabular-nums">{pct.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant">Factor resultante</span>
                  <span className="font-mono text-foreground tabular-nums">×{factor.toFixed(3)}</span>
                </div>
                <p className="text-[10px] text-on-surface-variant pt-1 border-t border-border/40">
                  Si necesitás {bruto} kg limpios, tenés que comprar {(bruto * factor).toFixed(3)} kg.
                </p>
              </div>
            );
          })()}

          <div className="flex gap-2">
            <Button onClick={aplicarCalcMerma} className="flex-1" disabled={!calcBruto || Number(calcBruto) <= 0}>
              Aplicar merma
            </Button>
            <Button variant="secondary" onClick={() => setCalcMermaIndex(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
