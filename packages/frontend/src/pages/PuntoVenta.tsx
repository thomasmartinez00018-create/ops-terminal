/**
 * PuntoVenta — pantalla mobile-first para venta en kiosco/carrito/barra/evento
 *
 * Flujo (6 pasos):
 *   1. Elegir depósito (carrito/barra/punto)
 *   2. Ver productos y stock del depósito
 *   3. Buscar/escanear y agregar al carrito de venta
 *   4. Revisar items pendientes
 *   5. Cerrar: registrar cobros (multi-medio) + conteo de cierre
 *   6. Sincronización (descuento de stock + ticket)
 *
 * Genérico: el "carrito móvil" es solo un caso. Sirve para barras de evento,
 * food trucks, delivery propio, minibar de hotel, cantina, buffet, etc.
 *
 * Mobile-first: todo el flujo sirve para celular. En desktop también funciona.
 * Sin offline real — pero los POSTs tienen retry implícito (fallan con toast,
 * el operador puede reintentar). Cada venta lleva un clienteUuid generado
 * en cliente (idempotencia para retries).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Minus, Trash2, ShoppingCart, X, Check, Search,
  Package, Wallet, ArrowLeft, AlertTriangle, Camera,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// ─── Tipos ─────────────────────────────────────────────────────────────────
type Deposito = {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string | null;
  sesionAbierta: { id: number; abiertaAt: string; operador: { nombre: string } } | null;
};

type ProductoVendible = {
  id: number;
  codigo: string;
  nombre: string;
  rubro: string;
  subrubro: string | null;
  unidadUso: string;
  codigoBarras: string | null;
  precioVenta: number | null;
  stockDeposito: number | null;
};

type VentaItem = {
  id: number;
  productoId: number;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  producto: { id: number; codigo: string; nombre: string; unidadUso: string };
  registradoAt: string;
};

type Sesion = {
  id: number;
  depositoId: number;
  operadorId: number;
  estado: string;
  abiertaAt: string;
  deposito: { id: number; codigo: string; nombre: string };
  operador: { id: number; nombre: string };
  ventas: VentaItem[];
};

type CobroDraft = {
  medio: string;
  monto: string;
};

const MEDIOS_COBRO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mp', label: 'Mercado Pago' },
  { value: 'qr', label: 'QR' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

// Pequeño wrapper para generar UUID en navegador (sin libs).
function uuid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function PuntoVenta() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<'eleccion' | 'venta' | 'cierre'>('eleccion');
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [productos, setProductos] = useState<ProductoVendible[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Cargar depósitos al montar ────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await api.getDepositosDisponibles();
        if (!cancel) setDepositos(data);
      } catch (e: any) {
        addToast({ type: 'error', message: e?.message || 'Error cargando depósitos' });
      }
    })();
    return () => { cancel = true; };
  }, []);

  // ── Cuando hay sesión activa, cargar productos vendibles ──────────────
  useEffect(() => {
    if (!sesion) return;
    let cancel = false;
    (async () => {
      try {
        const data = await api.getProductosVendibles(sesion.depositoId);
        if (!cancel) setProductos(data);
      } catch (e: any) {
        addToast({ type: 'error', message: e?.message || 'Error cargando productos' });
      }
    })();
    return () => { cancel = true; };
  }, [sesion?.depositoId]);

  // ── Abrir sesión sobre un depósito ────────────────────────────────────
  async function abrir(deposito: Deposito) {
    if (!user) return;
    setLoading(true);
    try {
      let s: any;
      if (deposito.sesionAbierta) {
        s = await api.getSesion(deposito.sesionAbierta.id);
      } else {
        s = await api.abrirSesion({ depositoId: deposito.id, operadorId: user.id });
        // re-fetch con ventas vacías
        s = await api.getSesion(s.id);
      }
      setSesion(s);
      setStep('venta');
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'No se pudo abrir la sesión' });
    } finally {
      setLoading(false);
    }
  }

  // ── Volver a elección (no cierra la sesión) ───────────────────────────
  function volverAEleccion() {
    setSesion(null);
    setProductos([]);
    setStep('eleccion');
    // refresh depósitos para ver el badge "abierta"
    api.getDepositosDisponibles().then(setDepositos).catch(() => {});
  }

  // ── Agregar producto a la sesión ──────────────────────────────────────
  async function agregar(producto: ProductoVendible, cantidad: number) {
    if (!sesion) return;
    if (producto.precioVenta == null) {
      addToast({ type: 'error', message: 'Producto sin precio de venta — defínelo en el catálogo' });
      return;
    }
    try {
      const item = await api.registrarVenta(sesion.id, {
        productoId: producto.id,
        cantidad,
        precioUnitario: producto.precioVenta,
        clienteUuid: uuid(),
      });
      setSesion(s => s ? { ...s, ventas: [item, ...s.ventas] } : s);
      addToast({ type: 'success', message: `+${cantidad} ${producto.nombre}` });
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Error agregando' });
    }
  }

  async function eliminarVenta(ventaId: number) {
    if (!sesion) return;
    try {
      await api.eliminarVenta(sesion.id, ventaId);
      setSesion(s => s ? { ...s, ventas: s.ventas.filter(v => v.id !== ventaId) } : s);
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'No se pudo eliminar' });
    }
  }

  // Total general
  const totalVentas = useMemo(
    () => sesion?.ventas.reduce((s, v) => s + v.subtotal, 0) ?? 0,
    [sesion?.ventas],
  );
  const cantidadItems = sesion?.ventas.reduce((s, v) => s + v.cantidad, 0) ?? 0;

  // ─── Render ──────────────────────────────────────────────────────────
  if (step === 'eleccion') {
    return (
      <ElegirDeposito depositos={depositos} loading={loading} onElegir={abrir} />
    );
  }
  if (step === 'venta' && sesion) {
    return (
      <Venta
        sesion={sesion}
        productos={productos}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        onAgregar={agregar}
        onEliminar={eliminarVenta}
        onVolver={volverAEleccion}
        onIrCierre={() => setStep('cierre')}
        totalVentas={totalVentas}
        cantidadItems={cantidadItems}
      />
    );
  }
  if (step === 'cierre' && sesion) {
    return (
      <Cierre
        sesion={sesion}
        totalVentas={totalVentas}
        onVolver={() => setStep('venta')}
        onCerradoOk={() => {
          addToast({ type: 'success', message: 'Sesión cerrada y stock sincronizado' });
          setSesion(null);
          setProductos([]);
          setStep('eleccion');
          navigate('/sesiones');
        }}
      />
    );
  }
  return null;
}

// ============================================================================
// Step 1 — Elegir depósito
// ============================================================================
function ElegirDeposito({
  depositos, loading, onElegir,
}: {
  depositos: Deposito[]; loading: boolean; onElegir: (d: Deposito) => void;
}) {
  return (
    <div className="min-h-screen bg-bg-primary p-4">
      <h1 className="text-xl font-bold mb-1">Punto de Venta</h1>
      <p className="text-sm text-on-surface-variant mb-6">Elegí un depósito o carrito para abrir sesión.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {depositos.map(d => (
          <button
            key={d.id}
            disabled={loading}
            onClick={() => onElegir(d)}
            className="text-left rounded-xl border border-border/60 bg-surface p-4 hover:border-primary/60 transition-colors disabled:opacity-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-bold">{d.nombre}</div>
                <div className="text-[11px] text-on-surface-variant">
                  {d.codigo}{d.tipo ? ` · ${d.tipo}` : ''}
                </div>
              </div>
              {d.sesionAbierta ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-bold uppercase tracking-wider">
                  En recorrido
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold uppercase tracking-wider">
                  Disponible
                </span>
              )}
            </div>
            {d.sesionAbierta && (
              <div className="mt-2 text-[11px] text-on-surface-variant">
                Operador: {d.sesionAbierta.operador.nombre} · desde{' '}
                {new Date(d.sesionAbierta.abiertaAt).toLocaleTimeString().slice(0, 5)}
              </div>
            )}
          </button>
        ))}
        {!depositos.length && (
          <div className="col-span-full text-center text-sm text-on-surface-variant py-12">
            No hay depósitos. Creá uno desde Depósitos primero.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Pantalla de venta (catálogo + carrito)
// ============================================================================
function Venta({
  sesion, productos, busqueda, setBusqueda, onAgregar, onEliminar, onVolver, onIrCierre,
  totalVentas, cantidadItems,
}: {
  sesion: Sesion;
  productos: ProductoVendible[];
  busqueda: string;
  setBusqueda: (s: string) => void;
  onAgregar: (p: ProductoVendible, cantidad: number) => void;
  onEliminar: (ventaId: number) => void;
  onVolver: () => void;
  onIrCierre: () => void;
  totalVentas: number;
  cantidadItems: number;
}) {
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [productoActivo, setProductoActivo] = useState<ProductoVendible | null>(null);
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Filtrado búsqueda
  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return productos;
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.codigoBarras && p.codigoBarras.toLowerCase().includes(q))
    );
  }, [busqueda, productos]);

  // Group por rubro (para escaneo rápido visualmente)
  const porRubro = useMemo(() => {
    const map = new Map<string, ProductoVendible[]>();
    for (const p of filtrados) {
      const k = p.rubro || 'Sin rubro';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries());
  }, [filtrados]);

  // Quick-add por scan: si el input matchea exactamente un código de barras, agregar 1
  function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = scanInput.trim();
    if (!q) return;
    const match = productos.find(p => p.codigoBarras === q || p.codigo === q);
    if (match) {
      onAgregar(match, 1);
      setScanInput('');
    } else {
      setBusqueda(q);
      setScanInput('');
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary pb-24">
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-bg-primary border-b border-border/60 px-3 py-2 flex items-center gap-2">
        <button onClick={onVolver} className="p-2 -m-2 hover:bg-surface rounded-md">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-bold leading-tight">{sesion.deposito.nombre}</div>
          <div className="text-[10px] text-on-surface-variant">
            {sesion.operador.nombre} · sesión #{sesion.id}
          </div>
        </div>
        <button
          onClick={() => setMostrarCarrito(true)}
          className="relative p-2 -m-2 hover:bg-surface rounded-md"
          aria-label="Ver carrito"
        >
          <ShoppingCart size={20} />
          {sesion.ventas.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-primary text-on-primary rounded-full w-4 h-4 flex items-center justify-center">
              {sesion.ventas.length}
            </span>
          )}
        </button>
      </div>

      {/* Búsqueda + scan */}
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Buscar producto…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-high border border-border/60 text-sm focus:outline-none focus:border-primary/50"
          />
        </div>
        <form onSubmit={onScanSubmit} className="relative">
          <Camera size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            ref={scanRef}
            type="text"
            placeholder="Escanear código de barras (Enter para agregar)"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-dashed border-border/60 text-sm focus:outline-none focus:border-primary/50"
          />
        </form>
      </div>

      {/* Listado por rubro */}
      <div className="px-3 space-y-4">
        {porRubro.map(([rubro, items]) => (
          <div key={rubro}>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-2">
              {rubro}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map(p => (
                <ProductoCard
                  key={p.id}
                  producto={p}
                  onClick={() => setProductoActivo(p)}
                />
              ))}
            </div>
          </div>
        ))}
        {!filtrados.length && (
          <div className="text-center text-sm text-on-surface-variant py-12">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            {busqueda
              ? `Sin resultados para "${busqueda}"`
              : 'No hay productos vendibles. Marcá "Vendible directo" desde Productos.'}
          </div>
        )}
      </div>

      {/* Footer fijo con total */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border/60 px-4 py-3 flex items-center gap-3 shadow-lg">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
            {cantidadItems} items
          </div>
          <div className="text-lg font-bold text-primary">
            ${totalVentas.toFixed(0)}
          </div>
        </div>
        <button
          onClick={onIrCierre}
          disabled={!sesion.ventas.length}
          className="px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold disabled:opacity-50"
        >
          Cerrar carrito
        </button>
      </div>

      {/* Modal selector de cantidad */}
      {productoActivo && (
        <SelectorCantidad
          producto={productoActivo}
          onClose={() => setProductoActivo(null)}
          onAgregar={(cant) => {
            onAgregar(productoActivo, cant);
            setProductoActivo(null);
          }}
        />
      )}

      {/* Drawer del carrito */}
      {mostrarCarrito && (
        <CarritoDrawer
          ventas={sesion.ventas}
          total={totalVentas}
          onClose={() => setMostrarCarrito(false)}
          onEliminar={onEliminar}
          onIrCierre={() => { setMostrarCarrito(false); onIrCierre(); }}
        />
      )}
    </div>
  );
}

function ProductoCard({ producto, onClick }: { producto: ProductoVendible; onClick: () => void }) {
  const sinPrecio = producto.precioVenta == null;
  const stock = producto.stockDeposito ?? 0;
  const sinStock = stock <= 0;
  return (
    <button
      onClick={onClick}
      disabled={sinPrecio}
      className={`text-left rounded-lg border p-2.5 transition-colors ${
        sinPrecio
          ? 'border-border/40 bg-surface/50 opacity-60'
          : 'border-border/60 bg-surface hover:border-primary/60'
      }`}
    >
      <div className="text-xs font-bold leading-snug line-clamp-2 min-h-[2rem]">{producto.nombre}</div>
      <div className="mt-1 flex items-center justify-between">
        <div className="text-sm font-bold text-primary">
          {sinPrecio ? '—' : `$${producto.precioVenta!.toFixed(0)}`}
        </div>
        <div className={`text-[10px] font-bold ${sinStock ? 'text-rose-500' : 'text-on-surface-variant'}`}>
          stock {stock.toFixed(0)}
        </div>
      </div>
    </button>
  );
}

function SelectorCantidad({
  producto, onClose, onAgregar,
}: {
  producto: ProductoVendible; onClose: () => void; onAgregar: (cant: number) => void;
}) {
  const [cant, setCant] = useState(1);
  const stock = producto.stockDeposito ?? 0;
  const restante = stock - cant;
  const subtotal = (producto.precioVenta || 0) * cant;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-primary rounded-2xl border border-border/60 w-full sm:max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-base font-bold">{producto.nombre}</div>
            <div className="text-xs text-on-surface-variant mt-0.5">${(producto.precioVenta || 0).toFixed(0)} c/u</div>
          </div>
          <button onClick={onClose} className="p-1 -m-1"><X size={18} /></button>
        </div>

        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Cantidad</div>
        <div className="flex items-center justify-center gap-4 mb-4">
          <button onClick={() => setCant(c => Math.max(1, c - 1))} className="p-3 rounded-full bg-surface border border-border/60">
            <Minus size={18} />
          </button>
          <input
            type="number"
            value={cant}
            onChange={e => setCant(Math.max(1, parseInt(e.target.value || '1')))}
            className="w-20 text-center text-3xl font-bold bg-transparent focus:outline-none"
          />
          <button onClick={() => setCant(c => c + 1)} className="p-3 rounded-full bg-surface border border-border/60">
            <Plus size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs mb-4">
          <div className="rounded-lg bg-surface p-2">
            <div className="text-[10px] uppercase text-on-surface-variant">Stock actual</div>
            <div className="text-base font-bold">{stock.toFixed(0)} {producto.unidadUso}</div>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <div className="text-[10px] uppercase text-on-surface-variant">Stock restante</div>
            <div className={`text-base font-bold ${restante < 0 ? 'text-rose-500' : ''}`}>
              {restante.toFixed(0)} {producto.unidadUso}
            </div>
          </div>
        </div>

        <div className="text-center mb-4">
          <div className="text-[10px] uppercase text-on-surface-variant">Subtotal</div>
          <div className="text-2xl font-bold text-primary">${subtotal.toFixed(0)}</div>
        </div>

        <button
          onClick={() => onAgregar(cant)}
          className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold"
        >
          Agregar al carrito
        </button>
      </div>
    </div>
  );
}

function CarritoDrawer({
  ventas, total, onClose, onEliminar, onIrCierre,
}: {
  ventas: VentaItem[]; total: number; onClose: () => void;
  onEliminar: (id: number) => void; onIrCierre: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-full sm:max-w-md bg-bg-primary border-l border-border/60 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <div className="font-bold">Carrito ({ventas.length})</div>
          <button onClick={onClose} className="p-1 -m-1"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {ventas.map(v => (
            <div key={v.id} className="flex items-center gap-2 rounded-lg bg-surface border border-border/60 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{v.producto.nombre}</div>
                <div className="text-[11px] text-on-surface-variant">
                  {v.cantidad} {v.producto.unidadUso} × ${v.precioUnitario.toFixed(0)}
                </div>
              </div>
              <div className="text-sm font-bold text-primary tabular-nums">${v.subtotal.toFixed(0)}</div>
              <button onClick={() => onEliminar(v.id)} className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!ventas.length && (
            <div className="text-center text-sm text-on-surface-variant py-12">
              Carrito vacío
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm">Total a cobrar</div>
            <div className="text-xl font-bold text-primary">${total.toFixed(0)}</div>
          </div>
          <button
            onClick={onIrCierre}
            disabled={!ventas.length}
            className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-50"
          >
            Ir al cierre
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 3 — Cierre (cobros + conteo)
// ============================================================================
function Cierre({
  sesion, totalVentas, onVolver, onCerradoOk,
}: {
  sesion: Sesion; totalVentas: number; onVolver: () => void; onCerradoOk: () => void;
}) {
  const { addToast } = useToast();
  const [cobros, setCobros] = useState<CobroDraft[]>([{ medio: 'efectivo', monto: '' }]);
  const [observaciones, setObservaciones] = useState('');
  const [mostrarConteo, setMostrarConteo] = useState(false);
  const [stockEsperado, setStockEsperado] = useState<any[]>([]);
  const [conteoReal, setConteoReal] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Cargar stock esperado para el conteo
  useEffect(() => {
    api.getSesionStockActual(sesion.id).then(setStockEsperado).catch(() => {});
  }, [sesion.id]);

  // Auto-llenar primer cobro con el total si está vacío
  useEffect(() => {
    if (cobros.length === 1 && cobros[0].monto === '' && totalVentas > 0) {
      setCobros([{ medio: 'efectivo', monto: String(totalVentas.toFixed(0)) }]);
    }
    // eslint-disable-next-line
  }, [totalVentas]);

  const totalCobros = cobros.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);
  const diff = totalCobros - totalVentas;

  function setCobro(i: number, patch: Partial<CobroDraft>) {
    setCobros(arr => arr.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
  function agregarCobro() {
    setCobros(arr => [...arr, { medio: 'transferencia', monto: '' }]);
  }
  function eliminarCobro(i: number) {
    setCobros(arr => arr.filter((_, j) => j !== i));
  }

  async function cerrar() {
    if (totalVentas <= 0) {
      addToast({ type: 'error', message: 'No hay ventas registradas' });
      return;
    }
    const cobrosLimpios = cobros
      .filter(c => parseFloat(c.monto) > 0)
      .map(c => ({ medio: c.medio, monto: parseFloat(c.monto) }));
    if (!cobrosLimpios.length) {
      addToast({ type: 'error', message: 'Registrá al menos un medio de cobro' });
      return;
    }

    const conteos = mostrarConteo
      ? Object.entries(conteoReal)
          .filter(([, v]) => v !== '')
          .map(([productoId, real]) => ({
            productoId: parseInt(productoId),
            real: parseFloat(real),
          }))
          .filter(c => isFinite(c.real))
      : [];

    setSubmitting(true);
    try {
      await api.cerrarSesion(sesion.id, {
        cobros: cobrosLimpios,
        conteos,
        observaciones: observaciones || undefined,
      });
      onCerradoOk();
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Error cerrando sesión' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary pb-24">
      <div className="sticky top-0 z-10 bg-bg-primary border-b border-border/60 px-3 py-2 flex items-center gap-2">
        <button onClick={onVolver} className="p-2 -m-2 hover:bg-surface rounded-md">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="text-sm font-bold">Cerrar sesión</div>
          <div className="text-[10px] text-on-surface-variant">{sesion.deposito.nombre}</div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Resumen ventas */}
        <div className="rounded-xl border border-border/60 bg-surface p-4">
          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">
            Total ventas
          </div>
          <div className="text-3xl font-bold text-primary">${totalVentas.toFixed(0)}</div>
          <div className="text-xs text-on-surface-variant mt-1">
            {sesion.ventas.length} items vendidos
          </div>
        </div>

        {/* Medios de cobro */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold flex items-center gap-2">
              <Wallet size={16} /> Medios de cobro
            </div>
            <button
              onClick={agregarCobro}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              + agregar medio
            </button>
          </div>
          <div className="space-y-2">
            {cobros.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-surface border border-border/60 p-2">
                <select
                  value={c.medio}
                  onChange={e => setCobro(i, { medio: e.target.value })}
                  className="text-xs px-2 py-1.5 rounded bg-surface-high border border-border/60 focus:outline-none"
                >
                  {MEDIOS_COBRO.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={c.monto}
                  onChange={e => setCobro(i, { monto: e.target.value })}
                  className="flex-1 text-right text-sm font-bold px-2 py-1.5 rounded bg-surface-high border border-border/60 focus:outline-none focus:border-primary/50"
                />
                {cobros.length > 1 && (
                  <button onClick={() => eliminarCobro(i)} className="p-1 text-rose-500 hover:bg-rose-500/10 rounded">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <div className="text-xs text-on-surface-variant">Cobrado</div>
            <div className={`text-sm font-bold ${Math.abs(diff) < 0.01 ? 'text-emerald-500' : 'text-amber-500'}`}>
              ${totalCobros.toFixed(0)}
              {Math.abs(diff) >= 0.01 && (
                <span className="ml-2 text-[11px]">
                  ({diff > 0 ? '+' : ''}{diff.toFixed(0)})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Conteo de cierre (opcional) */}
        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <button
            onClick={() => setMostrarConteo(v => !v)}
            className="w-full flex items-center justify-between text-sm font-bold"
          >
            <span className="flex items-center gap-2">
              <Package size={16} /> Conteo de cierre {mostrarConteo ? '(activo)' : '(opcional)'}
            </span>
            <span className="text-[11px] text-primary">
              {mostrarConteo ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>
          {mostrarConteo && (
            <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
              {stockEsperado.map(s => (
                <div key={s.productoId} className="flex items-center gap-2 text-xs">
                  <div className="flex-1 truncate">{s.nombre}</div>
                  <div className="text-on-surface-variant w-16 text-right">
                    esp. {s.stockEsperado.toFixed(0)}
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="real"
                    value={conteoReal[s.productoId] ?? ''}
                    onChange={e => setConteoReal(m => ({ ...m, [s.productoId]: e.target.value }))}
                    className="w-20 text-right px-2 py-1 rounded bg-surface-high border border-border/60 focus:outline-none focus:border-primary/50"
                  />
                </div>
              ))}
              {!stockEsperado.length && (
                <div className="text-center text-[11px] text-on-surface-variant py-4">
                  Sin stock para contar
                </div>
              )}
            </div>
          )}
        </div>

        {/* Observaciones */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
            Observaciones
          </div>
          <textarea
            value={observaciones}
            onChange={e => setObservaciones(e.target.value)}
            placeholder="Ej: sin novedades, faltantes…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border/60 text-sm focus:outline-none focus:border-primary/50"
          />
        </div>

        {Math.abs(diff) >= 0.01 && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/40 p-3 text-xs">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              El total cobrado ({totalCobros.toFixed(0)}) no coincide con el total de ventas ({totalVentas.toFixed(0)}).
              Se cierra igual — la diferencia queda como observación.
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border/60 px-4 py-3 shadow-lg">
        <button
          onClick={cerrar}
          disabled={submitting || totalVentas <= 0}
          className="w-full py-3 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check size={18} />
          {submitting ? 'Cerrando…' : 'Finalizar y sincronizar'}
        </button>
      </div>
    </div>
  );
}
