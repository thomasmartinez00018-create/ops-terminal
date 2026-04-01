import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import { ScanBarcode, Play, Square, Save, RotateCcw } from 'lucide-react';

interface ConteoItem {
  productoId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  conteo: number;
  stockTeorico: number;
  diferencia: number;
}

export default function ControlScanner() {
  const { user } = useAuth();
  const [depositos, setDepositos] = useState<any[]>([]);
  const [depositoId, setDepositoId] = useState('');
  const [activo, setActivo] = useState(false);
  const [items, setItems] = useState<ConteoItem[]>([]);
  const [lastScan, setLastScan] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  }, []);

  const iniciarControl = async () => {
    if (!depositoId) return;
    setItems([]);
    setActivo(true);
    setError('');
    setSaved(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const detenerControl = () => {
    setActivo(false);
  };

  const procesarScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || !depositoId) return;
    setError('');
    setLastScan(barcode);

    try {
      // Buscar producto por código de barras o código interno
      const producto = await api.scannerBuscarProducto(barcode.trim());

      // Verificar si ya está en la lista
      const existingIdx = items.findIndex(i => i.productoId === producto.id);

      if (existingIdx >= 0) {
        // Incrementar conteo
        const updated = [...items];
        updated[existingIdx].conteo += 1;
        updated[existingIdx].diferencia = updated[existingIdx].conteo - updated[existingIdx].stockTeorico;
        setItems(updated);
      } else {
        // Nuevo producto: obtener stock teórico
        const { stockTeorico } = await api.scannerStockTeorico(producto.id, parseInt(depositoId));
        const newItem: ConteoItem = {
          productoId: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          unidad: producto.unidadUso,
          conteo: 1,
          stockTeorico,
          diferencia: 1 - stockTeorico,
        };
        setItems(prev => [newItem, ...prev]);
      }
    } catch {
      setError(`Producto no encontrado: ${barcode}`);
    }

    setScanInput('');
    inputRef.current?.focus();
  }, [items, depositoId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarScan(scanInput);
    }
  };

  const ajustarConteo = (idx: number, nuevoConteo: number) => {
    const updated = [...items];
    updated[idx].conteo = nuevoConteo;
    updated[idx].diferencia = nuevoConteo - updated[idx].stockTeorico;
    setItems(updated);
  };

  const guardarComoInventario = async () => {
    if (items.length === 0 || !depositoId) return;
    setSaving(true);
    setError('');

    try {
      const hoy = new Date().toISOString().split('T')[0];
      const inv = await api.createInventario({
        fecha: hoy,
        usuarioId: user?.id,
        depositoId: parseInt(depositoId),
        observacion: 'Control por scanner',
      });

      for (const item of items) {
        await api.addInventarioDetalle(inv.id, {
          productoId: item.productoId,
          cantidadFisica: item.conteo,
        });
      }

      await api.cerrarInventario(inv.id);
      setSaved(true);
      setActivo(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalItems = items.length;
  const totalOk = items.filter(i => i.diferencia === 0).length;
  const totalFaltan = items.filter(i => i.diferencia < 0).length;
  const totalSobran = items.filter(i => i.diferencia > 0).length;

  return (
    <div>
      <PageTour pageKey="control-scanner" />
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Control</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">Control con Scanner</h1>
      </div>

      {/* Setup */}
      {!activo && !saved && (
        <div className="max-w-md mx-auto mt-12">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="p-4 rounded-full bg-primary/10 inline-block mb-4">
              <ScanBarcode size={48} className="text-primary" />
            </div>
            <h2 className="text-lg font-extrabold text-foreground mb-2">Iniciar Control</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Seleccioná el depósito y escaneá los productos con el lector de códigos
            </p>
            <Select
              value={depositoId}
              onChange={e => setDepositoId(e.target.value)}
              className="mb-4"
            >
              <option value="">Seleccionar depósito...</option>
              {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </Select>
            <Button onClick={iniciarControl} disabled={!depositoId} className="w-full">
              <Play size={16} className="mr-2" /> Iniciar control
            </Button>
          </div>
        </div>
      )}

      {/* Saved */}
      {saved && (
        <div className="max-w-md mx-auto mt-12">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="p-4 rounded-full bg-success/10 inline-block mb-4">
              <Save size={48} className="text-success" />
            </div>
            <h2 className="text-lg font-extrabold text-foreground mb-2">Control guardado</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Se creó un inventario con {totalItems} productos controlados.
              {totalFaltan > 0 && <span className="text-destructive font-bold"> {totalFaltan} con faltantes.</span>}
            </p>
            <Button onClick={() => { setSaved(false); setItems([]); }} className="w-full">
              <RotateCcw size={16} className="mr-2" /> Nuevo control
            </Button>
          </div>
        </div>
      )}

      {/* Active scanning */}
      {activo && (
        <>
          {/* Scanner input - grande y prominente */}
          <div className="glass rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <ScanBarcode size={24} className="text-primary animate-pulse" />
              <input
                ref={inputRef}
                type="text"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escaneá un código de barras..."
                autoFocus
                className="flex-1 bg-transparent text-2xl font-bold text-foreground placeholder:text-on-surface-variant/50 outline-none"
              />
              <Button variant="ghost" onClick={detenerControl}>
                <Square size={16} className="mr-1" /> Detener
              </Button>
            </div>
            {lastScan && (
              <p className="text-xs text-on-surface-variant mt-2">Último scan: <span className="text-primary font-bold">{lastScan}</span></p>
            )}
            {error && <p className="text-xs text-destructive font-semibold mt-2">{error}</p>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-foreground">{totalItems}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase">Productos</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-success">{totalOk}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase">Coinciden</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-destructive">{totalFaltan}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase">Faltan</p>
            </div>
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-warning">{totalSobran}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase">Sobran</p>
            </div>
          </div>

          {/* Tabla de conteo */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="text-left p-3">Producto</th>
                  <th className="text-center p-3">Conteo</th>
                  <th className="text-center p-3">Teórico</th>
                  <th className="text-center p-3">Diferencia</th>
                  <th className="text-left p-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, idx) => (
                  <tr
                    key={item.productoId}
                    className={`transition-colors ${
                      item.diferencia === 0 ? 'bg-success/5' :
                      item.diferencia < 0 ? 'bg-destructive/5' : 'bg-warning/5'
                    }`}
                  >
                    <td className="p-3">
                      <p className="font-semibold text-foreground">{item.nombre}</p>
                      <p className="text-xs text-on-surface-variant">{item.codigo} · {item.unidad}</p>
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        value={item.conteo}
                        onChange={e => ajustarConteo(idx, parseFloat(e.target.value) || 0)}
                        className="w-16 text-center bg-surface-high rounded-lg px-2 py-1 text-foreground font-bold border border-border"
                      />
                    </td>
                    <td className="p-3 text-center text-on-surface-variant font-semibold">{item.stockTeorico}</td>
                    <td className="p-3 text-center">
                      <span className={`font-extrabold ${
                        item.diferencia === 0 ? 'text-success' :
                        item.diferencia < 0 ? 'text-destructive' : 'text-warning'
                      }`}>
                        {item.diferencia > 0 ? '+' : ''}{item.diferencia}
                      </span>
                    </td>
                    <td className="p-3">
                      {item.diferencia === 0 ? (
                        <Badge variant="success">OK</Badge>
                      ) : item.diferencia < 0 ? (
                        <Badge variant="danger">FALTA</Badge>
                      ) : (
                        <Badge variant="warning">SOBRA</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-on-surface-variant font-medium">
                      Escaneá productos para comenzar el conteo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Guardar */}
          {items.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={guardarComoInventario} disabled={saving}>
                <Save size={16} className="mr-1" />
                {saving ? 'Guardando...' : 'Finalizar y guardar'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
