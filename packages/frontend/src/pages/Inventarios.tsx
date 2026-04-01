import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { Plus, ClipboardCheck, Lock, Trash2, AlertTriangle } from 'lucide-react';

interface DetalleRow {
  productoId: number;
  codigo: string;
  nombre: string;
  stockTeorico: number | null;
  cantidadFisica: number | null;
  diferencia: number | null;
  counted: boolean;
}

export default function Inventarios() {
  const { user } = useAuth();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedInventarioId, setSelectedInventarioId] = useState<number | null>(null);

  // ─── List state ───
  const [inventarios, setInventarios] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDeposito, setFiltroDeposito] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ depositoId: '', fecha: '', observacion: '' });
  const [error, setError] = useState('');

  // ─── Detail state ───
  const [inventario, setInventario] = useState<any>(null);
  const [detalles, setDetalles] = useState<DetalleRow[]>([]);
  const [resumen, setResumen] = useState<any>(null);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);

  // ─── Load depositos once ───
  useEffect(() => {
    api.getDepositos({ activo: 'true' }).then(setDepositos).catch(console.error);
  }, []);

  // ─── Load inventarios list ───
  const cargarLista = () => {
    const params: Record<string, string> = {};
    if (filtroEstado) params.estado = filtroEstado;
    if (filtroDeposito) params.depositoId = filtroDeposito;
    api.getInventarios(params).then(setInventarios).catch(console.error);
  };

  useEffect(() => {
    if (view === 'list') cargarLista();
  }, [view, filtroEstado, filtroDeposito]);

  // ─── Load detail ───
  const cargarDetalle = async (id: number) => {
    try {
      const [inv, productos] = await Promise.all([
        api.getInventario(id),
        api.getProductos({ activo: 'true' }),
      ]);
      setInventario(inv);

      const detallesMap = new Map<number, any>();
      if (inv.detalles) {
        inv.detalles.forEach((d: any) => detallesMap.set(d.productoId, d));
      }

      const rows: DetalleRow[] = productos.map((p: any) => {
        const det = detallesMap.get(p.id);
        return {
          productoId: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          stockTeorico: det ? det.stockTeorico : null,
          cantidadFisica: det ? det.cantidadFisica : null,
          diferencia: det ? det.diferencia : null,
          counted: !!det,
        };
      });

      setDetalles(rows);

      api.getInventarioResumen(id).then(setResumen).catch(console.error);
    } catch (e) {
      console.error(e);
    }
  };

  const abrirDetalle = (id: number) => {
    setSelectedInventarioId(id);
    setView('detail');
    cargarDetalle(id);
  };

  const volverALista = () => {
    setView('list');
    setSelectedInventarioId(null);
    setInventario(null);
    setDetalles([]);
    setResumen(null);
    setConfirmCerrar(false);
  };

  // ─── Create inventario ───
  const abrirNuevo = () => {
    const hoy = new Date().toISOString().split('T')[0];
    setForm({ depositoId: '', fecha: hoy, observacion: '' });
    setError('');
    setModalOpen(true);
  };

  const guardar = async () => {
    setError('');
    if (!form.depositoId) { setError('Seleccione un depósito'); return; }
    try {
      await api.createInventario({
        fecha: form.fecha,
        usuarioId: user!.id,
        depositoId: Number(form.depositoId),
        observacion: form.observacion || null,
      });
      setModalOpen(false);
      cargarLista();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ─── Delete inventario ───
  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este inventario? Esta acción no se puede deshacer.')) return;
    try {
      await api.deleteInventario(id);
      cargarLista();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ─── Save detalle row ───
  const guardarDetalle = async (productoId: number, cantidadFisica: string) => {
    if (!selectedInventarioId || cantidadFisica === '') return;
    setSaving(productoId);
    try {
      const result = await api.addInventarioDetalle(selectedInventarioId, {
        productoId,
        cantidadFisica: Number(cantidadFisica),
      });
      setDetalles(prev =>
        prev.map(d =>
          d.productoId === productoId
            ? {
                ...d,
                stockTeorico: result.stockTeorico,
                cantidadFisica: result.cantidadFisica,
                diferencia: result.diferencia,
                counted: true,
              }
            : d
        )
      );
      api.getInventarioResumen(selectedInventarioId).then(setResumen).catch(console.error);
    } catch (e: any) {
      console.error(e);
    } finally {
      setSaving(null);
    }
  };

  // ─── Close inventario ───
  const cerrar = async () => {
    if (!selectedInventarioId) return;
    try {
      await api.cerrarInventario(selectedInventarioId);
      setConfirmCerrar(false);
      await cargarDetalle(selectedInventarioId);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const isOpen = inventario?.estado === 'abierto';

  // ─── Computed summary ───
  const summaryFromRows = () => {
    const counted = detalles.filter(d => d.counted);
    const withDiff = counted.filter(d => d.diferencia !== null && d.diferencia !== 0);
    const totalPos = counted.reduce((s, d) => s + (d.diferencia && d.diferencia > 0 ? d.diferencia : 0), 0);
    const totalNeg = counted.reduce((s, d) => s + (d.diferencia && d.diferencia < 0 ? d.diferencia : 0), 0);
    return { total: counted.length, withDiff: withDiff.length, totalPos, totalNeg };
  };

  const stats = resumen || summaryFromRows();

  // ════════════════════════════════════════════════════════════
  //  VIEW: DETAIL
  // ════════════════════════════════════════════════════════════
  if (view === 'detail' && inventario) {
    return (
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Inventario</p>
            <h1 className="text-xl font-extrabold text-foreground mt-1">
              <ClipboardCheck size={20} className="inline mr-2 -mt-0.5" />
              Conteo #{inventario.id}
            </h1>
          </div>
          <div className="flex gap-2">
            {isOpen && (
              <Button variant="secondary" onClick={() => setConfirmCerrar(true)}>
                <Lock size={16} /> Cerrar inventario
              </Button>
            )}
            <Button variant="secondary" onClick={volverALista}>Volver</Button>
          </div>
        </div>

        {/* Info card */}
        <div className="glass rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</p>
              <p className="text-sm font-semibold text-foreground mt-1">{inventario.fecha}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Depósito</p>
              <p className="text-sm font-semibold text-foreground mt-1">{inventario.deposito?.nombre || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</p>
              <div className="mt-1">
                <Badge variant={isOpen ? 'warning' : 'success'}>
                  {isOpen ? 'Abierto' : 'Cerrado'}
                </Badge>
              </div>
            </div>
            {inventario.observacion && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Observación</p>
                <p className="text-sm text-on-surface-variant mt-1">{inventario.observacion}</p>
              </div>
            )}
          </div>
        </div>

        {/* Counting table */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                  <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Stock teórico</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Cant. física</th>
                  <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detalles.map(row => (
                  <DetalleRowComp
                    key={row.productoId}
                    row={row}
                    isOpen={isOpen}
                    saving={saving === row.productoId}
                    onSave={guardarDetalle}
                  />
                ))}
                {detalles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant font-medium">
                      Sin productos cargados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary bar */}
        <div className="glass rounded-xl p-4 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Items contados</p>
              <p className="text-lg font-extrabold text-foreground mt-1">{stats.total ?? stats.totalItems ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Con diferencia</p>
              <p className="text-lg font-extrabold text-warning mt-1">{stats.withDiff ?? stats.itemsConDiferencia ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total sobrante</p>
              <p className="text-lg font-extrabold text-success mt-1">+{stats.totalPos ?? stats.totalPositivo ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total faltante</p>
              <p className="text-lg font-extrabold text-destructive mt-1">{stats.totalNeg ?? stats.totalNegativo ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Confirm close modal */}
        <Modal open={confirmCerrar} onClose={() => setConfirmCerrar(false)} title="Cerrar inventario">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-warning mt-0.5 shrink-0" />
              <p className="text-sm text-on-surface-variant">
                Al cerrar el inventario se generarán movimientos de ajuste automáticos para todas las diferencias encontradas. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={cerrar} className="flex-1">
                <Lock size={16} /> Confirmar cierre
              </Button>
              <Button variant="secondary" onClick={() => setConfirmCerrar(false)}>Cancelar</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  VIEW: LIST
  // ════════════════════════════════════════════════════════════
  return (
    <div>
      <PageTour pageKey="inventarios" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Sección</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Inventarios</h1>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo inventario
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los estados</option>
          <option value="abierto">Abierto</option>
          <option value="cerrado">Cerrado</option>
        </select>
        <select
          value={filtroDeposito}
          onChange={e => setFiltroDeposito(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los depósitos</option>
          {depositos.map(d => (
            <option key={d.id} value={d.id.toString()}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Depósito</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Usuario</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Items</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inventarios.map(inv => (
                <tr key={inv.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 text-xs text-on-surface-variant">{inv.fecha}</td>
                  <td className="p-3 font-semibold text-foreground">{inv.deposito?.nombre || '-'}</td>
                  <td className="p-3 hidden sm:table-cell text-xs text-on-surface-variant">{inv.usuario?.nombre || '-'}</td>
                  <td className="p-3">
                    <Badge variant={inv.estado === 'abierto' ? 'warning' : 'success'}>
                      {inv.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
                    </Badge>
                  </td>
                  <td className="p-3 hidden sm:table-cell text-right text-foreground font-semibold">
                    {inv._count?.detalles ?? inv.detalles?.length ?? '-'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => abrirDetalle(inv.id)}
                        className="p-1.5 rounded-lg hover:bg-surface-high text-primary"
                        title={inv.estado === 'abierto' ? 'Contar' : 'Ver'}
                      >
                        <ClipboardCheck size={16} />
                      </button>
                      {inv.estado === 'abierto' && (
                        <button
                          onClick={() => eliminar(inv.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {inventarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-on-surface-variant font-medium">
                    Sin inventarios registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo inventario">
        <div className="space-y-3">
          <Select
            label="Depósito"
            id="depositoId"
            value={form.depositoId}
            onChange={e => setForm({ ...form, depositoId: e.target.value })}
            options={depositos.map(d => ({ value: d.id.toString(), label: d.nombre }))}
            placeholder="Seleccionar depósito..."
          />
          <Input
            label="Fecha"
            id="fecha"
            type="date"
            value={form.fecha}
            onChange={e => setForm({ ...form, fecha: e.target.value })}
          />
          <Input
            label="Observación (opcional)"
            id="observacion"
            value={form.observacion}
            onChange={e => setForm({ ...form, observacion: e.target.value })}
            placeholder="Notas adicionales..."
          />
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} className="flex-1">Crear inventario</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Sub-component: editable detail row
// ════════════════════════════════════════════════════════════
function DetalleRowComp({
  row,
  isOpen,
  saving,
  onSave,
}: {
  row: DetalleRow;
  isOpen: boolean;
  saving: boolean;
  onSave: (productoId: number, cantidadFisica: string) => void;
}) {
  const [value, setValue] = useState(row.cantidadFisica !== null ? row.cantidadFisica.toString() : '');
  const committed = useRef(value);

  useEffect(() => {
    const v = row.cantidadFisica !== null ? row.cantidadFisica.toString() : '';
    setValue(v);
    committed.current = v;
  }, [row.cantidadFisica]);

  const handleBlur = () => {
    if (value !== committed.current && value !== '') {
      committed.current = value;
      onSave(row.productoId, value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const diffColor = row.diferencia === null || row.diferencia === 0
    ? 'text-on-surface-variant'
    : row.diferencia < 0
      ? 'text-destructive'
      : 'text-success';

  return (
    <tr className={`hover:bg-surface-high/50 transition-colors ${saving ? 'opacity-60' : ''}`}>
      <td className="p-3 text-xs text-on-surface-variant font-mono">{row.codigo}</td>
      <td className="p-3 font-semibold text-foreground">{row.nombre}</td>
      <td className="p-3 text-right text-on-surface-variant tabular-nums">
        {row.stockTeorico !== null ? row.stockTeorico : '-'}
      </td>
      <td className="p-3 text-right">
        {isOpen ? (
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-24 text-right px-2 py-1.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 tabular-nums"
            placeholder="0"
          />
        ) : (
          <span className="text-foreground font-semibold tabular-nums">
            {row.cantidadFisica !== null ? row.cantidadFisica : '-'}
          </span>
        )}
      </td>
      <td className={`p-3 text-right font-bold tabular-nums ${diffColor}`}>
        {row.diferencia !== null ? (row.diferencia > 0 ? `+${row.diferencia}` : row.diferencia) : '-'}
      </td>
    </tr>
  );
}
