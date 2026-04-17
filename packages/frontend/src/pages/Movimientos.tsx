import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import DrawerModal from '../components/ui/DrawerModal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import { useToast } from '../context/ToastContext';
import { useRecentProducts } from '../hooks/useRecentProducts';
import { tiposPermitidos, TIPOS_MOVIMIENTO } from '../lib/permisosMovimiento';
import { Plus, ScanLine, Layers, ScanBarcode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { todayStr } from '../lib/exportUtils';

const TIPOS_MOV = [
  { value: 'ingreso', label: 'Ingreso / Compra' },
  { value: 'venta', label: 'Venta' },
  { value: 'elaboracion', label: 'Elaboración' },
  { value: 'merma', label: 'Merma' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'consumo_interno', label: 'Consumo interno' },
  { value: 'devolucion', label: 'Devolución' },
];

const MOTIVOS_MERMA = ['Vencimiento', 'Rotura', 'Deterioro', 'Error de elaboración', 'Derrame', 'Otro'];
const MOTIVOS_VENTA = ['Venta al público', 'Venta mayorista', 'Delivery', 'Catering', 'Venta a empleado', 'Otro'];

const tipoBadge: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
  ingreso: 'success', elaboracion: 'info', merma: 'danger',
  transferencia: 'warning', ajuste: 'default', consumo_interno: 'default', devolucion: 'warning',
  venta: 'info',
};

export default function Movimientos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { getRecents, addRecent } = useRecentProducts(user?.id || 0);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: 'ingreso', productoId: '', depositoOrigenId: '', depositoDestinoId: '',
    cantidad: '', unidad: '', lote: '', motivo: '', observacion: '', responsableId: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Batch modal (transferencia múltiple) ──
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchTipo, setBatchTipo] = useState('transferencia');
  const [batchDepOrigen, setBatchDepOrigen] = useState('');
  const [batchDepDestino, setBatchDepDestino] = useState('');
  const [batchItems, setBatchItems] = useState<{ productoId: string; cantidad: string; unidad: string }[]>([
    { productoId: '', cantidad: '', unidad: '' }
  ]);
  const [batchError, setBatchError] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanStatus, setScanStatus] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const cargar = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filtroTipo) params.tipo = filtroTipo;
    api.getMovimientos(params).then(setMovimientos).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [filtroTipo]);
  useEffect(() => {
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
    api.getUsuarios({ activo: 'true' }).then(setUsuarios).catch(console.error);
  }, []);

  // Default inteligente por rol — le ahorra al cocinero/barra/depósito
  // un tap cada vez que abre el form. Antes arrancaba siempre en "ingreso"
  // aunque el cocinero solo registra "consumo_interno" y "merma".
  const tipoDefaultPorRol = (rol?: string): string => {
    if (rol === 'cocina') return 'consumo_interno';
    if (rol === 'barra') return 'venta';
    if (rol === 'deposito') return 'ingreso';
    return 'ingreso'; // admin/compras
  };

  const abrirNuevo = (tipoForzado?: string) => {
    const tipo = tipoForzado || tipoDefaultPorRol(user?.rol);
    const depDef = user?.depositoDefectoId ? String(user.depositoDefectoId) : '';
    setForm({
      tipo,
      productoId: '',
      // Pre-llenamos el depósito defecto del usuario según el tipo:
      // - Consumo/merma/venta/transferencia → es el origen (desde donde sale)
      // - Ingreso → es el destino (donde llega)
      depositoOrigenId: ['merma', 'transferencia', 'consumo_interno', 'venta'].includes(tipo) ? depDef : '',
      depositoDestinoId: ['ingreso', 'transferencia'].includes(tipo) ? depDef : '',
      cantidad: '',
      unidad: '',
      lote: '',
      motivo: '',
      observacion: '',
      responsableId: '',
    });
    setError('');
    setModalOpen(true);
  };

  const onProductoChange = (productoId: string) => {
    const prod = productos.find(p => p.id === Number(productoId));
    setForm(f => ({
      ...f,
      productoId,
      unidad: prod?.unidadUso || f.unidad,
      depositoDestinoId: prod?.depositoDefectoId?.toString() || f.depositoDestinoId,
    }));
  };

  const guardar = async () => {
    setError('');
    if (!form.productoId) {
      setError('Seleccioná un producto');
      return;
    }
    if (!form.cantidad || Number(form.cantidad) <= 0) {
      setError('La cantidad debe ser mayor a 0');
      return;
    }
    if (!form.unidad) {
      setError('Indicá la unidad');
      return;
    }
    if (needsOrigen && !form.depositoOrigenId) {
      setError('Seleccioná el depósito de origen');
      return;
    }
    if (needsDestino && !form.depositoDestinoId) {
      setError('Seleccioná el depósito de destino');
      return;
    }
    setSaving(true);
    const now = new Date();
    try {
      await api.createMovimiento({
        tipo: form.tipo,
        productoId: Number(form.productoId),
        usuarioId: user!.id,
        fecha: now.toISOString().split('T')[0],
        hora: now.toTimeString().slice(0, 5),
        depositoOrigenId: form.depositoOrigenId ? Number(form.depositoOrigenId) : null,
        depositoDestinoId: form.depositoDestinoId ? Number(form.depositoDestinoId) : null,
        cantidad: Number(form.cantidad),
        unidad: form.unidad,
        lote: form.lote || null,
        motivo: form.motivo || null,
        observacion: form.observacion || null,
        responsableId: form.responsableId ? Number(form.responsableId) : null,
      });
      const prod = productos.find(p => p.id === Number(form.productoId));
      addRecent(form.productoId);
      addToast(`Registrado: ${form.cantidad} ${form.unidad} de ${prod?.nombre}`);
      setModalOpen(false);
      cargar();
    } catch (e: any) {
      setError(e.message);
      addToast('Error al registrar el movimiento', 'error');
    } finally {
      setSaving(false);
    }
  };

  const needsOrigen = ['merma', 'transferencia', 'consumo_interno', 'venta'].includes(form.tipo);
  const needsDestino = ['ingreso', 'elaboracion', 'transferencia', 'ajuste', 'devolucion'].includes(form.tipo);

  // ── Batch helpers ──
  const abrirBatch = () => {
    setBatchTipo('transferencia');
    setBatchDepOrigen('');
    setBatchDepDestino('');
    setBatchItems([{ productoId: '', cantidad: '', unidad: '' }]);
    setBatchError('');
    setBatchOpen(true);
  };

  const batchAddItem = () => setBatchItems(prev => [...prev, { productoId: '', cantidad: '', unidad: '' }]);
  const batchRemoveItem = (idx: number) => setBatchItems(prev => prev.filter((_, i) => i !== idx));
  const batchUpdateItem = (idx: number, field: string, value: string) => {
    setBatchItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'productoId') {
        const prod = productos.find(p => p.id === Number(value));
        if (prod) updated.unidad = prod.unidadUso || '';
      }
      return updated;
    }));
  };

  const batchNeedsOrigen = ['merma', 'transferencia', 'consumo_interno', 'venta'].includes(batchTipo);
  const batchNeedsDestino = ['ingreso', 'elaboracion', 'transferencia', 'ajuste', 'devolucion'].includes(batchTipo);

  const procesarScan = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return;
    setScanStatus('');
    try {
      const producto = await api.scannerBuscarProducto(barcode.trim());
      // Check if already in list → increment quantity
      const existingIdx = batchItems.findIndex(i => i.productoId === producto.id.toString());
      if (existingIdx >= 0) {
        setBatchItems(prev => prev.map((item, i) => {
          if (i !== existingIdx) return item;
          return { ...item, cantidad: String((parseFloat(item.cantidad) || 0) + 1) };
        }));
        setScanStatus(`+1 ${producto.nombre}`);
      } else {
        // Add new row (replace empty first row or append)
        const emptyIdx = batchItems.findIndex(i => !i.productoId);
        if (emptyIdx >= 0) {
          setBatchItems(prev => prev.map((item, i) => {
            if (i !== emptyIdx) return item;
            return { productoId: producto.id.toString(), cantidad: '1', unidad: producto.unidadUso || 'unidad' };
          }));
        } else {
          setBatchItems(prev => [...prev, { productoId: producto.id.toString(), cantidad: '1', unidad: producto.unidadUso || 'unidad' }]);
        }
        setScanStatus(`✓ ${producto.nombre}`);
      }
    } catch {
      setScanStatus(`✗ No encontrado: ${barcode}`);
    }
    setScanInput('');
    setTimeout(() => scanRef.current?.focus(), 50);
  }, [batchItems]);

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); procesarScan(scanInput); }
  };

  const guardarBatch = async () => {
    setBatchError('');
    const validItems = batchItems.filter(i => i.productoId && Number(i.cantidad) > 0);
    if (!validItems.length) { setBatchError('Agregá al menos un producto con cantidad'); return; }
    if (batchNeedsOrigen && !batchDepOrigen) { setBatchError('Seleccioná depósito de origen'); return; }
    if (batchNeedsDestino && !batchDepDestino) { setBatchError('Seleccioná depósito de destino'); return; }

    setBatchSaving(true);
    const now = new Date();
    try {
      const res = await api.createMovimientosBatch({
        tipo: batchTipo,
        usuarioId: user!.id,
        fecha: now.toISOString().split('T')[0],
        hora: now.toTimeString().slice(0, 5),
        depositoOrigenId: batchDepOrigen ? Number(batchDepOrigen) : null,
        depositoDestinoId: batchDepDestino ? Number(batchDepDestino) : null,
        items: validItems.map(i => ({
          productoId: Number(i.productoId),
          cantidad: Number(i.cantidad),
          unidad: i.unidad || 'unidad',
        })),
      });
      addToast(`${res.count} movimientos registrados`);
      setBatchOpen(false);
      cargar();
    } catch (e: any) {
      setBatchError(e.message);
      addToast('Error al registrar movimientos', 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <div>
      <PageTour pageKey="movimientos" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Operaciones</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Movimientos</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportMenu size="sm" disabled={movimientos.length === 0} getConfig={() => ({
            title: 'Movimientos',
            filename: `movimientos-${todayStr()}`,
            subtitle: filtroTipo ? `Tipo: ${filtroTipo}` : undefined,
            headers: ['Fecha', 'Hora', 'Tipo', 'Producto', 'Cantidad', 'Unidad', 'Deposito', 'Usuario'],
            rows: movimientos.map((m: any) => [
              m.fecha, m.hora || '', m.tipo, m.producto?.nombre || '',
              m.cantidad, m.unidad, m.depositoOrigen?.nombre || m.depositoDestino?.nombre || '',
              m.usuario?.nombre || '',
            ]),
            summary: [
              { label: 'Total movimientos', value: movimientos.length },
            ],
            numberColumns: [4],
          } as ExportConfig)} />
          <button
            onClick={() => navigate('/escanear-factura')}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 font-semibold rounded-lg text-sm transition border border-amber-600/30"
          >
            <ScanLine size={16} /> Escanear factura
          </button>
          <button
            onClick={abrirBatch}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary font-semibold rounded-lg text-sm transition border border-primary/20"
          >
            <Layers size={16} /> Múltiple
          </button>
          <Button onClick={() => abrirNuevo()}>
            <Plus size={16} /> Registrar movimiento
          </Button>
        </div>
      </div>

      {/* Chips de acceso rápido — atajos al form con el tipo precargado.
          El usuario ve las 2-3 acciones que hace todos los días en su rol
          ("Merma", "Consumo/uso" si es cocina; "Ingreso", "Transferencia"
          si es depósito) con 1 tap. Respeta los permisos del usuario
          (si el admin no habilitó "venta" para cocina, ese chip no aparece). */}
      {(() => {
        const permitidos = new Set(tiposPermitidos(user as any));
        const chips = TIPOS_MOVIMIENTO.filter(t => permitidos.has(t.value));
        if (chips.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider self-center mr-1">Registro rápido:</span>
            {chips.map(t => (
              <button
                key={t.value}
                onClick={() => abrirNuevo(t.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${t.color}`}
                title={`Registrar ${t.label.toLowerCase()}`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        );
      })()}

      <div className="mb-4">
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_MOV.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Cantidad</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Depósito</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Registró</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-on-surface-variant">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-sm font-medium">Cargando movimientos...</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && movimientos.map(m => (
                <tr key={m.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 text-xs text-on-surface-variant">{m.fecha} {m.hora}</td>
                  <td className="p-3">
                    <Badge variant={tipoBadge[m.tipo]}>
                      {TIPOS_MOV.find(t => t.value === m.tipo)?.label || m.tipo}
                    </Badge>
                  </td>
                  <td className="p-3 font-semibold text-foreground">{m.producto?.nombre}</td>
                  <td className="p-3 hidden sm:table-cell text-foreground font-semibold">{m.cantidad} <span className="text-on-surface-variant font-normal">{m.unidad}</span></td>
                  <td className="p-3 hidden md:table-cell text-xs text-on-surface-variant">
                    {m.depositoOrigen?.nombre && <span>{m.depositoOrigen.nombre}</span>}
                    {m.depositoOrigen?.nombre && m.depositoDestino?.nombre && <span className="text-primary mx-1">&rarr;</span>}
                    {m.depositoDestino?.nombre && <span>{m.depositoDestino.nombre}</span>}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-xs text-on-surface-variant">{m.usuario?.nombre}</td>
                  <td className="p-3 hidden lg:table-cell text-xs">
                    {m.responsable
                      ? <span className="font-semibold text-warning">{m.responsable.nombre}</span>
                      : <span className="text-on-surface-variant/50">—</span>
                    }
                  </td>
                </tr>
              ))}
              {!loading && movimientos.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">
                    {filtroTipo
                      ? `Sin movimientos de tipo "${TIPOS_MOV.find(t => t.value === filtroTipo)?.label || filtroTipo}"`
                      : 'Sin movimientos registrados. Usá el botón "Registrar movimiento" para comenzar.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DrawerModal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar movimiento" size="lg">
        <div className="space-y-3">
          <Select
            label="Tipo de movimiento"
            id="tipo"
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value, motivo: '' })}
            options={TIPOS_MOV}
          />
          <SearchableSelect
            label="Producto"
            id="productoId"
            value={form.productoId}
            onChange={v => onProductoChange(v)}
            options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
            placeholder="Seleccionar producto..."
            pinnedValues={getRecents()}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Cantidad"
              id="cantidad"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.cantidad}
              onChange={e => setForm({ ...form, cantidad: e.target.value })}
            />
            <Input
              label="Unidad"
              id="unidad"
              value={form.unidad}
              onChange={e => setForm({ ...form, unidad: e.target.value })}
            />
          </div>
          {needsOrigen && (
            <Select
              label="Depósito origen"
              id="depositoOrigen"
              value={form.depositoOrigenId}
              onChange={e => setForm({ ...form, depositoOrigenId: e.target.value })}
              options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
              placeholder="Seleccionar..."
            />
          )}
          {needsDestino && (
            <Select
              label="Depósito destino"
              id="depositoDestino"
              value={form.depositoDestinoId}
              onChange={e => setForm({ ...form, depositoDestinoId: e.target.value })}
              options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
              placeholder="Seleccionar..."
            />
          )}
          {form.tipo === 'merma' && (
            <Select
              label="Motivo"
              id="motivo"
              value={form.motivo}
              onChange={e => setForm({ ...form, motivo: e.target.value })}
              options={MOTIVOS_MERMA.map(m => ({ value: m, label: m }))}
              placeholder="Seleccionar motivo..."
            />
          )}
          {form.tipo === 'venta' && (
            <Select
              label="Canal de venta"
              id="motivo"
              value={form.motivo}
              onChange={e => setForm({ ...form, motivo: e.target.value })}
              options={MOTIVOS_VENTA.map(m => ({ value: m, label: m }))}
              placeholder="Seleccionar canal..."
            />
          )}
          <Input
            label="Lote (opcional)"
            id="lote"
            value={form.lote}
            onChange={e => setForm({ ...form, lote: e.target.value })}
            placeholder="Ej: LOTE-2024-03"
          />
          <Select
            label="Responsable (opcional)"
            id="responsableId"
            value={form.responsableId}
            onChange={e => setForm({ ...form, responsableId: e.target.value })}
            placeholder={`Sin asignar (responsable: ${user?.nombre})`}
          >
            <option value="">Sin asignar — responsable: {user?.nombre}</option>
            {usuarios.filter(u => u.id !== user?.id).map(u => (
              <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>
            ))}
          </Select>
          <Input
            label="Observación (opcional)"
            id="observacion"
            value={form.observacion}
            onChange={e => setForm({ ...form, observacion: e.target.value })}
            placeholder="Notas adicionales..."
          />
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1" disabled={saving}>{saving ? 'Registrando...' : 'Registrar'}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </DrawerModal>

      {/* ── Modal batch (múltiples productos) ── */}
      <DrawerModal open={batchOpen} onClose={() => setBatchOpen(false)} title="Movimiento múltiple" size="lg">
        <div className="space-y-3">
          <Select
            label="Tipo de movimiento"
            id="batchTipo"
            value={batchTipo}
            onChange={e => setBatchTipo(e.target.value)}
            options={TIPOS_MOV.filter(t => !['elaboracion', 'conteo'].includes(t.value))}
          />

          <div className="grid grid-cols-2 gap-3">
            {batchNeedsOrigen && (
              <Select
                label="Depósito origen"
                id="batchDepOrigen"
                value={batchDepOrigen}
                onChange={e => setBatchDepOrigen(e.target.value)}
                options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                placeholder="Seleccionar..."
              />
            )}
            {batchNeedsDestino && (
              <Select
                label="Depósito destino"
                id="batchDepDestino"
                value={batchDepDestino}
                onChange={e => setBatchDepDestino(e.target.value)}
                options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
                placeholder="Seleccionar..."
              />
            )}
          </div>

          {/* Scanner toggle + input */}
          <div className="border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => { setScanMode(!scanMode); setScanStatus(''); setTimeout(() => scanRef.current?.focus(), 100); }}
                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition ${
                  scanMode ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
                }`}
              >
                <ScanBarcode size={14} />
                {scanMode ? 'Scanner activo' : 'Usar scanner'}
              </button>
              <button
                onClick={batchAddItem}
                className="text-xs font-bold text-primary hover:text-primary/80 uppercase tracking-wider"
              >
                + Agregar manual
              </button>
            </div>

            {scanMode && (
              <div className="mb-3">
                <div className="flex items-center gap-2 bg-surface-high rounded-lg px-3 py-2 border border-primary/30">
                  <ScanBarcode size={18} className="text-primary animate-pulse shrink-0" />
                  <input
                    ref={scanRef}
                    type="text"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                    onKeyDown={handleScanKeyDown}
                    placeholder="Escaneá o escribí un código..."
                    autoFocus
                    className="flex-1 bg-transparent text-sm font-bold text-foreground placeholder:text-on-surface-variant/50 outline-none"
                  />
                </div>
                {scanStatus && (
                  <p className={`text-xs font-semibold mt-1.5 ${scanStatus.startsWith('✗') ? 'text-destructive' : 'text-success'}`}>
                    {scanStatus}
                  </p>
                )}
              </div>
            )}

            {/* Product rows */}
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
              Productos ({batchItems.filter(i => i.productoId).length})
            </p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {batchItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <SearchableSelect
                      label={idx === 0 ? 'Producto' : undefined}
                      id={`bp-${idx}`}
                      value={item.productoId}
                      onChange={v => batchUpdateItem(idx, 'productoId', v)}
                      options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
                      placeholder="Producto..."
                      pinnedValues={getRecents()}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Cant' : undefined}
                      id={`bq-${idx}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={item.cantidad}
                      onChange={e => batchUpdateItem(idx, 'cantidad', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      label={idx === 0 ? 'Unid' : undefined}
                      id={`bu-${idx}`}
                      value={item.unidad}
                      onChange={e => batchUpdateItem(idx, 'unidad', e.target.value)}
                      placeholder="kg"
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {batchItems.length > 1 && (
                      <button
                        onClick={() => batchRemoveItem(idx)}
                        className="text-xs text-destructive hover:text-destructive/80 font-bold"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {batchError && <p className="text-sm text-destructive font-semibold">{batchError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardarBatch} className="flex-1" disabled={batchSaving}>
              {batchSaving ? 'Registrando...' : `Registrar ${batchItems.filter(i => i.productoId && Number(i.cantidad) > 0).length} movimientos`}
            </Button>
            <Button variant="secondary" onClick={() => setBatchOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </DrawerModal>
    </div>
  );
}
