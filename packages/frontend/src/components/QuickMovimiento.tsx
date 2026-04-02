import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRecentProducts } from '../hooks/useRecentProducts';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import SearchableSelect from './ui/SearchableSelect';
import { ScanBarcode, X } from 'lucide-react';

const TIPOS = [
  { value: 'venta', label: 'Venta', icon: '🛒', color: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'consumo_interno', label: 'Consumo / Uso', icon: '🍽️', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { value: 'merma', label: 'Merma', icon: '🗑️', color: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'transferencia', label: 'Transferencia', icon: '↔️', color: 'bg-warning/10 text-warning border-warning/30' },
  { value: 'ingreso', label: 'Ingreso', icon: '📦', color: 'bg-success/10 text-success border-success/30' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  tipoInicial?: string;
}

export default function QuickMovimiento({ open, onClose, tipoInicial = 'consumo_interno' }: Props) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { getRecents, addRecent } = useRecentProducts(user?.id || 0);

  const [tipo, setTipo] = useState(tipoInicial);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState('');
  const [depositoOrigenId, setDepositoOrigenId] = useState('');
  const [depositoDestinoId, setDepositoDestinoId] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);

  // Scanner mode
  const [scannerMode, setScannerMode] = useState(false);
  const [scanBuffer, setScanBuffer] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ nombre: string; found: boolean } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const recents = getRecents();

  useEffect(() => {
    if (open) {
      api.getProductos({ activo: 'true' }).then(setProductos).catch(() => {});
      api.getDepositos({ activo: 'true' }).then(setDepositos).catch(() => {});
      api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(() => {});
      if (user?.depositoDefectoId) {
        setDepositoOrigenId(String(user.depositoDefectoId));
        setDepositoDestinoId(String(user.depositoDefectoId));
      }
    }
  }, [open, user]);

  useEffect(() => { setTipo(tipoInicial); }, [tipoInicial]);

  // Keep scanner input focused when scanner mode is on
  useEffect(() => {
    if (scannerMode && open) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [scannerMode, open]);

  const onProductoChange = (id: string) => {
    setProductoId(id);
    const prod = productos.find(p => p.id === Number(id));
    if (prod) setUnidad(prod.unidadUso || '');
  };

  // Handle barcode scan: barcode readers send chars rapidly then Enter
  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const barcode = scanBuffer.trim();
      setScanBuffer('');
      if (!barcode) return;

      const prod = productos.find(p =>
        p.codigoBarras === barcode || p.codigo === barcode
      );
      if (prod) {
        setProductoId(prod.id.toString());
        setUnidad(prod.unidadUso || '');
        setScanFeedback({ nombre: prod.nombre, found: true });
        addRecent(prod.id.toString());
        // Auto-focus cantidad after scan
        setTimeout(() => {
          const cantInput = document.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
          cantInput?.focus();
          cantInput?.select();
        }, 100);
      } else {
        setScanFeedback({ nombre: barcode, found: false });
      }
      setTimeout(() => setScanFeedback(null), 3000);
    }
  };

  const resetForm = () => {
    setProductoId('');
    setCantidad('');
    setUnidad('');
    setResponsableId('');
    setScanFeedback(null);
    if (user?.depositoDefectoId) {
      setDepositoOrigenId(String(user.depositoDefectoId));
      setDepositoDestinoId(String(user.depositoDefectoId));
    }
    if (scannerMode) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const guardar = async () => {
    if (!productoId || !cantidad) {
      addToast('Seleccioná un producto y cantidad', 'error');
      return;
    }
    if (needsOrigen && !depositoOrigenId) {
      addToast('Seleccioná el depósito de origen', 'error');
      return;
    }
    if (needsDestino && !depositoDestinoId) {
      addToast('Seleccioná el depósito de destino', 'error');
      return;
    }
    setLoading(true);
    const now = new Date();
    try {
      await api.createMovimiento({
        tipo,
        productoId: Number(productoId),
        usuarioId: user!.id,
        fecha: now.toISOString().split('T')[0],
        hora: now.toTimeString().slice(0, 5),
        depositoOrigenId: needsOrigen && depositoOrigenId ? Number(depositoOrigenId) : null,
        depositoDestinoId: needsDestino && depositoDestinoId ? Number(depositoDestinoId) : null,
        cantidad: Number(cantidad),
        unidad,
        responsableId: responsableId ? Number(responsableId) : null,
      });

      const prod = productos.find(p => p.id === Number(productoId));
      addRecent(productoId);
      addToast(`Registrado: ${cantidad} ${unidad} de ${prod?.nombre}`);

      if (batchMode) {
        resetForm();
      } else {
        onClose();
      }
    } catch {
      addToast('Error al registrar el movimiento', 'error');
    } finally {
      setLoading(false);
    }
  };

  const needsOrigen = ['merma', 'transferencia', 'consumo_interno', 'venta'].includes(tipo);
  const needsDestino = ['ingreso', 'transferencia'].includes(tipo);
  const selectedProd = productos.find(p => p.id === Number(productoId));

  return (
    <Modal open={open} onClose={onClose} title="Registrar rápido">
      <div className="space-y-4">
        {/* Tipo — chips grandes */}
        <div className="grid grid-cols-2 gap-2">
          {TIPOS.map(t => (
            <button
              key={t.value}
              onClick={() => setTipo(t.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border font-bold text-sm transition-all ${
                tipo === t.value ? t.color : 'border-border text-on-surface-variant hover:bg-surface-high'
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Producto + toggle scanner */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Producto</span>
            <button
              onClick={() => setScannerMode(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                scannerMode
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-surface-high text-on-surface-variant hover:text-foreground'
              }`}
            >
              <ScanBarcode size={13} />
              {scannerMode ? 'Scanner ON' : 'Scanner'}
            </button>
          </div>

          {scannerMode ? (
            <div className="space-y-2">
              {/* Hidden input that captures scanner input */}
              <div className="relative">
                <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" />
                <input
                  ref={scanInputRef}
                  type="text"
                  value={scanBuffer}
                  onChange={e => setScanBuffer(e.target.value)}
                  onKeyDown={handleScanKey}
                  onBlur={() => setTimeout(() => scanInputRef.current?.focus(), 100)}
                  placeholder="Apuntá el lector acá y escaneá..."
                  className="w-full pl-9 pr-3 py-3 rounded-xl bg-primary/5 border border-primary/30 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-on-surface-variant/50"
                />
              </div>

              {/* Feedback del scan */}
              {scanFeedback && (
                <div className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  scanFeedback.found
                    ? 'bg-success/10 border border-success/30 text-success'
                    : 'bg-destructive/10 border border-destructive/30 text-destructive'
                }`}>
                  {scanFeedback.found ? '✓' : '✗'}
                  {scanFeedback.found ? `Encontrado: ${scanFeedback.nombre}` : `No encontrado: ${scanFeedback.nombre}`}
                </div>
              )}

              {/* Producto seleccionado */}
              {selectedProd && (
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-high border border-border">
                  <span className="text-sm font-semibold text-foreground">{selectedProd.nombre}</span>
                  <button onClick={() => { setProductoId(''); setUnidad(''); }} className="text-on-surface-variant hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <SearchableSelect
              value={productoId}
              onChange={onProductoChange}
              options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
              placeholder="Buscar producto..."
              pinnedValues={recents}
            />
          )}
        </div>

        {/* Cantidad grande y táctil */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Cantidad"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              className="text-xl font-extrabold text-center"
            />
          </div>
          <div className="w-24">
            <Input
              label="Unidad"
              value={unidad}
              onChange={e => setUnidad(e.target.value)}
            />
          </div>
        </div>

        {/* Depósitos */}
        {needsOrigen && depositos.length > 0 && (
          <SearchableSelect
            label="Desde (depósito origen)"
            value={depositoOrigenId}
            onChange={setDepositoOrigenId}
            options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
            placeholder="Seleccionar depósito..."
          />
        )}
        {needsDestino && depositos.length > 0 && (
          <SearchableSelect
            label="Hacia (depósito destino)"
            value={depositoDestinoId}
            onChange={setDepositoDestinoId}
            options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
            placeholder="Seleccionar depósito..."
          />
        )}

        {/* Responsable opcional */}
        <div>
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
            Responsable <span className="normal-case font-normal">(opcional)</span>
          </label>
          <select
            value={responsableId}
            onChange={e => setResponsableId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Sin asignar — responsable: {user?.nombre || 'Usuario'}</option>
            {usuarios.filter(u => u.id !== user?.id).map(u => (
              <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>
            ))}
          </select>
        </div>

        {/* Modo batch */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={batchMode}
            onChange={e => setBatchMode(e.target.checked)}
            className="accent-primary w-4 h-4"
          />
          <span className="text-sm font-semibold text-on-surface-variant">
            Modo continuo <span className="text-[10px] font-normal">(registrar varios sin cerrar)</span>
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <Button onClick={guardar} disabled={!productoId || !cantidad || loading} className="flex-1">
            {loading ? 'Guardando...' : batchMode ? 'Guardar y seguir' : 'Guardar'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  );
}
