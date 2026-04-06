import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Camera, Upload, Loader2, Check, AlertTriangle, Trash2, ScanLine, ChevronLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FacturaItem {
  index: number;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precioUnitario: number | null;
  alicuotaIva: number;
  productoId: number | null;
  productoNombre: string | null;
  confidence: 'alta' | 'media' | 'ninguna';
}

interface FacturaResult {
  factura: {
    proveedor: string | null;
    proveedorMatch: { id: number; nombre: string } | null;
    fecha: string | null;
    numeroFactura: string | null;
    tipoComprobante: string;
    subtotal: number | null;
    ivaTotal: number | null;
    total: number | null;
  };
  items: FacturaItem[];
}

type Step = 'capture' | 'processing' | 'review' | 'done';

const TIPOS_COMPROBANTE = [
  { value: 'A', label: 'Factura A' },
  { value: 'B', label: 'Factura B' },
  { value: 'C', label: 'Factura C' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'remito', label: 'Remito' },
];

const ALICUOTAS_IVA = [
  { value: 0, label: '0%' },
  { value: 10.5, label: '10.5%' },
  { value: 21, label: '21%' },
  { value: 27, label: '27%' },
];

export default function EscanerFactura() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('capture');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<FacturaResult | null>(null);
  const [items, setItems] = useState<FacturaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Datos para confirmar
  const [proveedorId, setProveedorId] = useState<number | string>('');
  const [depositoId, setDepositoId] = useState<number | string>('');
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<any>(null);

  // Campos contabilidad
  const [tipoComprobante, setTipoComprobante] = useState('ticket');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [ivaTotal, setIvaTotal] = useState('');
  const [total, setTotal] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getProveedores().then(setProveedores).catch(() => {});
    api.getDepositos().then(setDepositos).catch(() => {});
    api.getProductos().then(setProductos).catch(() => {});
  }, []);

  // ── Captura de imagen ──
  const handleFile = async (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(',')[1]);
      await procesarImagen(dataUrl, file.type);
    };
    reader.readAsDataURL(file);
  };

  const procesarImagen = async (dataUrl: string, mimeType: string) => {
    setStep('processing');
    try {
      const base64 = dataUrl.split(',')[1];
      const data: any = await api.escanearFactura({ imagen: base64, mimeType });
      setResult(data);
      setItems(data.items || []);
      if (data.factura?.proveedorMatch) {
        setProveedorId(data.factura.proveedorMatch.id);
      }
      // Pre-fill contabilidad fields from AI
      if (data.factura?.tipoComprobante) setTipoComprobante(data.factura.tipoComprobante);
      if (data.factura?.subtotal != null) setSubtotal(String(data.factura.subtotal));
      if (data.factura?.ivaTotal != null) setIvaTotal(String(data.factura.ivaTotal));
      if (data.factura?.total != null) setTotal(String(data.factura.total));
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Error al procesar la factura');
      setStep('capture');
    }
  };

  // ── Edicion de items ──
  const updateItem = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const asignarProducto = (idx: number, productoId: number) => {
    const prod = productos.find(p => p.id === productoId);
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, productoId, productoNombre: prod?.nombre || null, confidence: 'alta' as const } : item
    ));
  };

  // ── Confirmar ──
  const confirmar = async () => {
    const itemsValidos = items.filter(i => i.productoId && i.cantidad);
    if (!itemsValidos.length) { setError('No hay items válidos para registrar'); return; }
    if (!depositoId) { setError('Seleccioná un depósito destino'); return; }

    setConfirmando(true);
    setError(null);
    try {
      const data = await api.confirmarFactura({
        items: items.map(i => ({
          productoId: i.productoId,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad || 'unidad',
          precioUnitario: i.precioUnitario,
          alicuotaIva: i.alicuotaIva || 0,
        })),
        proveedorId: proveedorId || null,
        depositoDestinoId: Number(depositoId),
        usuarioId: user!.id,
        fecha: result?.factura?.fecha || undefined,
        documentoRef: result?.factura?.numeroFactura || undefined,
        tipoComprobante,
        fechaVencimiento: fechaVencimiento || null,
        subtotal: subtotal ? Number(subtotal) : 0,
        iva: ivaTotal ? Number(ivaTotal) : 0,
        total: total ? Number(total) : 0,
        imagenBase64: imageBase64 || null,
      });
      setResultadoFinal(data);
      setStep('done');
      addToast(data?.mensaje || 'Factura registrada correctamente');
    } catch (err: any) {
      const msg = err?.message || 'Error al registrar';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setConfirmando(false);
    }
  };

  const reset = () => {
    setStep('capture');
    setImagePreview(null);
    setImageBase64(null);
    setResult(null);
    setItems([]);
    setError(null);
    setResultadoFinal(null);
    setProveedorId('');
    setTipoComprobante('ticket');
    setFechaVencimiento('');
    setSubtotal('');
    setIvaTotal('');
    setTotal('');
  };

  // ── Confidence badge ──
  const ConfBadge = ({ c }: { c: string }) => {
    if (c === 'alta') return <span className="text-[10px] bg-success/20 text-success px-1.5 py-0.5 rounded font-bold">Match IA ✓</span>;
    if (c === 'media') return <span className="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-bold">Probable</span>;
    return <span className="text-[10px] bg-destructive/20 text-destructive px-1.5 py-0.5 rounded font-bold">Sin match</span>;
  };

  const tipoBadgeColor = (t: string) => {
    if (t === 'A') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    if (t === 'B') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (t === 'C') return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    if (t === 'ticket') return 'bg-warning/15 text-warning border-warning/30';
    return 'bg-surface-high text-on-surface-variant border-border';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {step !== 'capture' && step !== 'done' && (
          <button onClick={reset} className="p-2 rounded-lg bg-surface-high hover:bg-surface border border-border transition-colors">
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Contabilidad</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">
            {step === 'capture' && 'Escanear Factura'}
            {step === 'processing' && 'Analizando...'}
            {step === 'review' && 'Revisar datos extraídos'}
            {step === 'done' && 'Factura registrada'}
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center gap-2 text-destructive text-sm font-semibold">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* ═══ STEP: CAPTURE ═══ */}
      {step === 'capture' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
            <ScanLine size={48} className="mx-auto mb-4 text-primary/60" />
            <p className="text-on-surface-variant mb-6 font-medium">Sacá foto o subí una imagen de la factura</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-xl transition"
              >
                <Camera size={18} /> Sacar foto
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 bg-surface-high hover:bg-surface border border-border text-foreground font-semibold rounded-xl transition"
              >
                <Upload size={18} /> Subir archivo
              </button>
            </div>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          <div className="bg-surface border border-border rounded-xl p-4 text-sm text-on-surface-variant">
            <p className="font-bold text-foreground mb-1">Consejos:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Asegurate de que el texto sea legible</li>
              <li>Funciona con facturas A, B, C, remitos y tickets</li>
              <li>La IA detecta el tipo de comprobante, IVA y vincula productos automáticamente</li>
              <li>Reconoce productos sin importar el proveedor ni cómo aparezcan escritos</li>
              <li>Siempre vas a poder revisar y corregir antes de confirmar</li>
            </ul>
          </div>
        </div>
      )}

      {/* ═══ STEP: PROCESSING ═══ */}
      {step === 'processing' && (
        <div className="text-center py-16">
          <Loader2 size={48} className="mx-auto mb-4 text-primary animate-spin" />
          <p className="text-lg font-bold text-foreground">Analizando factura con IA...</p>
          <p className="text-sm text-on-surface-variant mt-1">Extrayendo datos y vinculando productos automáticamente</p>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-6 mx-auto max-h-48 rounded-xl opacity-50" />
          )}
        </div>
      )}

      {/* ═══ STEP: REVIEW ═══ */}
      {step === 'review' && result && (
        <div className="space-y-4">
          {/* Datos de la factura */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Proveedor detectado</p>
                <p className="font-semibold text-foreground mt-0.5">{result.factura.proveedor || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">N° Factura</p>
                <p className="font-semibold text-foreground mt-0.5">{result.factura.numeroFactura || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Fecha</p>
                <p className="font-semibold text-foreground mt-0.5">{result.factura.fecha || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Items</p>
                <p className="font-semibold text-foreground mt-0.5">{items.length} productos</p>
              </div>
            </div>

            {/* Tipo comprobante + IVA + Totales */}
            <div className="border-t border-border pt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Tipo comprobante</label>
                <select
                  value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {TIPOS_COMPROBANTE.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="mt-1">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border ${tipoBadgeColor(tipoComprobante)}`}>
                    {TIPOS_COMPROBANTE.find(t => t.value === tipoComprobante)?.label}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Vencimiento</label>
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Subtotal</label>
                <input
                  type="number"
                  step="0.01"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">IVA total</label>
                <input
                  type="number"
                  step="0.01"
                  value={ivaTotal}
                  onChange={(e) => setIvaTotal(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Total</label>
                <input
                  type="number"
                  step="0.01"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Proveedor y deposito */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Proveedor</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">— Sin proveedor —</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Depósito destino *</label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">— Seleccionar —</option>
                {depositos.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Productos detectados:</p>
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`bg-surface border rounded-xl p-3 ${
                  item.confidence === 'alta' ? 'border-success/30' :
                  item.confidence === 'media' ? 'border-warning/30' :
                  'border-destructive/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.descripcion}</p>
                      <ConfBadge c={item.confidence} />
                    </div>
                    {item.productoNombre && (
                      <p className="text-xs text-success font-semibold mt-0.5">= {item.productoNombre}</p>
                    )}
                  </div>
                  <button onClick={() => removeItem(idx)} className="p-1 text-on-surface-variant hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div>
                    <label className="text-on-surface-variant font-medium">Producto</label>
                    <select
                      value={item.productoId || ''}
                      onChange={(e) => asignarProducto(idx, Number(e.target.value))}
                      className="w-full bg-surface-high border-0 rounded-lg px-2 py-1.5 text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">— Asignar —</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-on-surface-variant font-medium">Cantidad</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.cantidad ?? ''}
                      onChange={(e) => updateItem(idx, 'cantidad', e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-surface-high border-0 rounded-lg px-2 py-1.5 text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-on-surface-variant font-medium">Unidad</label>
                    <select
                      value={item.unidad || 'unidad'}
                      onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                      className="w-full bg-surface-high border-0 rounded-lg px-2 py-1.5 text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="kg">kg</option>
                      <option value="lt">lt</option>
                      <option value="unidad">unidad</option>
                      <option value="caja">caja</option>
                      <option value="gr">gr</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-on-surface-variant font-medium">$/u</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.precioUnitario ?? ''}
                      onChange={(e) => updateItem(idx, 'precioUnitario', e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-surface-high border-0 rounded-lg px-2 py-1.5 text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-on-surface-variant font-medium">IVA</label>
                    <select
                      value={item.alicuotaIva}
                      onChange={(e) => updateItem(idx, 'alicuotaIva', Number(e.target.value))}
                      className="w-full bg-surface-high border-0 rounded-lg px-2 py-1.5 text-xs font-semibold mt-0.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {ALICUOTAS_IVA.map(a => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen y acciones */}
          <div className="flex items-center justify-between bg-surface border border-border rounded-xl p-4">
            <div className="text-sm">
              <span className="text-on-surface-variant font-medium">Listos: </span>
              <span className="font-bold text-success">{items.filter(i => i.productoId && i.cantidad).length}</span>
              <span className="text-on-surface-variant font-medium"> / {items.length} items</span>
              {items.some(i => !i.productoId) && (
                <span className="text-warning text-xs font-semibold ml-2">(asigná los sin match)</span>
              )}
            </div>
            <button
              onClick={confirmar}
              disabled={confirmando || !items.some(i => i.productoId && i.cantidad) || !depositoId}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-on-primary font-bold rounded-xl transition"
            >
              {confirmando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Registrar factura
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP: DONE ═══ */}
      {step === 'done' && resultadoFinal && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-success" />
          </div>
          <h2 className="text-xl font-extrabold text-foreground mb-2">{resultadoFinal.mensaje}</h2>
          <p className="text-on-surface-variant font-medium mb-2">
            Código: <span className="font-bold text-primary">{resultadoFinal.facturaCodigo}</span>
          </p>
          <p className="text-on-surface-variant text-sm mb-6">
            {resultadoFinal.registrados} movimientos de ingreso creados
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-3 bg-primary hover:bg-primary/90 text-on-primary font-bold rounded-xl transition"
            >
              Escanear otra factura
            </button>
            <button
              onClick={() => navigate('/facturas')}
              className="flex items-center gap-2 px-6 py-3 bg-surface-high hover:bg-surface border border-border text-foreground font-semibold rounded-xl transition"
            >
              <FileText size={16} /> Ver facturas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
