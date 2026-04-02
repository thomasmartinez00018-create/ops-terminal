import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Camera, Upload, Loader2, Check, X, AlertTriangle, Trash2, ScanLine, ChevronLeft } from 'lucide-react';

interface FacturaItem {
  index: number;
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  precioUnitario: number | null;
  productoId: number | null;
  productoNombre: string | null;
  confidence: 'exact' | 'fuzzy' | 'none';
}

interface FacturaResult {
  factura: {
    proveedor: string | null;
    proveedorMatch: { id: number; nombre: string } | null;
    fecha: string | null;
    numeroFactura: string | null;
  };
  items: FacturaItem[];
}

type Step = 'capture' | 'processing' | 'review' | 'done';

export default function EscanerFactura() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('capture');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
      await procesarImagen(dataUrl, file.type);
    };
    reader.readAsDataURL(file);
  };

  const procesarImagen = async (dataUrl: string, mimeType: string) => {
    setStep('processing');
    try {
      const base64 = dataUrl.split(',')[1];
      const data: any = await (api as any).escanearFactura({ imagen: base64, mimeType });
      setResult(data);
      setItems(data.items || []);
      if (data.factura?.proveedorMatch) {
        setProveedorId(data.factura.proveedorMatch.id);
      }
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
      i === idx ? { ...item, productoId, productoNombre: prod?.nombre || null, confidence: 'exact' as const } : item
    ));
  };

  // ── Confirmar ──
  const confirmar = async () => {
    const itemsValidos = items.filter(i => i.productoId && i.cantidad);
    if (!itemsValidos.length) { setError('No hay items validos para registrar'); return; }
    if (!depositoId) { setError('Selecciona un deposito destino'); return; }

    setConfirmando(true);
    setError(null);
    try {
      const data = await (api as any).confirmarFactura({
        items: itemsValidos.map(i => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
          unidad: i.unidad || 'unidad',
          precioUnitario: i.precioUnitario,
        })),
        proveedorId: proveedorId || null,
        depositoDestinoId: Number(depositoId),
        usuarioId: user!.id,
        fecha: result?.factura?.fecha || undefined,
        documentoRef: result?.factura?.numeroFactura || undefined,
      });
      setResultadoFinal(data);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Error al registrar');
    } finally {
      setConfirmando(false);
    }
  };

  const reset = () => {
    setStep('capture');
    setImagePreview(null);
    setResult(null);
    setItems([]);
    setError(null);
    setResultadoFinal(null);
    setProveedorId('');
  };

  // ── Confidence badge ──
  const ConfBadge = ({ c }: { c: string }) => {
    if (c === 'exact') return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Exacto</span>;
    if (c === 'fuzzy') return <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Similar</span>;
    return <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">Sin match</span>;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        {step !== 'capture' && step !== 'done' && (
          <button onClick={reset} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-xs text-amber-500 tracking-widest font-semibold uppercase">Escaner de Facturas</p>
          <h1 className="text-xl font-bold">
            {step === 'capture' && 'Escanea una factura'}
            {step === 'processing' && 'Analizando...'}
            {step === 'review' && 'Revisar datos extraidos'}
            {step === 'done' && 'Ingreso registrado'}
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* ═══ STEP: CAPTURE ═══ */}
      {step === 'capture' && (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-zinc-700 rounded-xl p-12 text-center">
            <ScanLine size={48} className="mx-auto mb-4 text-amber-500/60" />
            <p className="text-zinc-400 mb-6">Saca foto o subi una imagen de la factura</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg transition"
              >
                <Camera size={18} /> Sacar foto
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition border border-zinc-600"
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

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
            <p className="font-medium text-zinc-400 mb-1">Consejos:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Asegurate de que el texto sea legible</li>
              <li>Funciona con facturas, remitos y tickets</li>
              <li>La IA extrae productos, cantidades y precios</li>
              <li>Siempre vas a poder revisar y corregir antes de confirmar</li>
            </ul>
          </div>
        </div>
      )}

      {/* ═══ STEP: PROCESSING ═══ */}
      {step === 'processing' && (
        <div className="text-center py-16">
          <Loader2 size={48} className="mx-auto mb-4 text-amber-500 animate-spin" />
          <p className="text-lg font-medium">Analizando factura con IA...</p>
          <p className="text-sm text-zinc-500 mt-1">Esto puede tardar unos segundos</p>
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-6 mx-auto max-h-48 rounded-lg opacity-50" />
          )}
        </div>
      )}

      {/* ═══ STEP: REVIEW ═══ */}
      {step === 'review' && result && (
        <div className="space-y-4">
          {/* Datos de la factura */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-zinc-500 text-xs">Proveedor</p>
              <p className="font-medium">{result.factura.proveedor || '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Factura</p>
              <p className="font-medium">{result.factura.numeroFactura || '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Fecha</p>
              <p className="font-medium">{result.factura.fecha || '—'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Items</p>
              <p className="font-medium">{items.length} productos</p>
            </div>
          </div>

          {/* Proveedor y deposito */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Proveedor</label>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— Sin proveedor —</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Deposito destino *</label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
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
            <p className="text-sm font-medium text-zinc-400">Productos detectados:</p>
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`bg-zinc-900 border rounded-lg p-3 ${
                  item.confidence === 'exact' ? 'border-emerald-500/30' :
                  item.confidence === 'fuzzy' ? 'border-amber-500/30' :
                  'border-red-500/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.descripcion}</p>
                      <ConfBadge c={item.confidence} />
                    </div>
                    {item.productoNombre && (
                      <p className="text-xs text-emerald-400 mt-0.5">= {item.productoNombre}</p>
                    )}
                  </div>
                  <button onClick={() => removeItem(idx)} className="p-1 text-zinc-600 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="text-zinc-600">Producto</label>
                    <select
                      value={item.productoId || ''}
                      onChange={(e) => asignarProducto(idx, Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-0.5"
                    >
                      <option value="">— Asignar —</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-zinc-600">Cantidad</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.cantidad ?? ''}
                      onChange={(e) => updateItem(idx, 'cantidad', e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-600">Unidad</label>
                    <select
                      value={item.unidad || 'unidad'}
                      onChange={(e) => updateItem(idx, 'unidad', e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-0.5"
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
                    <label className="text-zinc-600">$/u</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.precioUnitario ?? ''}
                      onChange={(e) => updateItem(idx, 'precioUnitario', e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen y acciones */}
          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="text-sm">
              <span className="text-zinc-500">Listos: </span>
              <span className="font-bold text-emerald-400">{items.filter(i => i.productoId && i.cantidad).length}</span>
              <span className="text-zinc-500"> / {items.length} items</span>
              {items.some(i => !i.productoId) && (
                <span className="text-amber-400 text-xs ml-2">(asigna los sin match)</span>
              )}
            </div>
            <button
              onClick={confirmar}
              disabled={confirmando || !items.some(i => i.productoId && i.cantidad) || !depositoId}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
            >
              {confirmando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Registrar ingresos
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP: DONE ═══ */}
      {step === 'done' && resultadoFinal && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">{resultadoFinal.mensaje}</h2>
          <p className="text-zinc-500 mb-6">{resultadoFinal.registrados} movimientos de ingreso creados</p>
          <button
            onClick={reset}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg"
          >
            Escanear otra factura
          </button>
        </div>
      )}
    </div>
  );
}
