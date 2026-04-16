import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { todayStr, formatCurrency } from '../lib/exportUtils';
import { ScanLine, DollarSign, Eye, Ban, Search } from 'lucide-react';

const ESTADOS_COLOR: Record<string, string> = {
  pendiente: 'bg-warning/15 text-warning border-warning/30',
  parcial: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  pagada: 'bg-success/15 text-success border-success/30',
  anulada: 'bg-destructive/15 text-destructive border-destructive/30',
};

const TIPO_COLOR: Record<string, string> = {
  A: 'bg-blue-500/15 text-blue-400',
  B: 'bg-emerald-500/15 text-emerald-400',
  C: 'bg-purple-500/15 text-purple-400',
  ticket: 'bg-warning/15 text-warning',
  remito: 'bg-surface-high text-on-surface-variant',
};

const MEDIOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
];

export default function Facturas() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [facturas, setFacturas] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros — inicializados desde URL params si vienen de otra página
  const [filtroProveedor, setFiltroProveedor] = useState(searchParams.get('proveedorId') || '');
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('estado') || '');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(searchParams.get('desde') || '');
  const [filtroHasta, setFiltroHasta] = useState(searchParams.get('hasta') || '');
  const [buscar, setBuscar] = useState('');

  // Modal detalle
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalle, setDetalle] = useState<any>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Modal pago
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoFacturaId, setPagoFacturaId] = useState<number | null>(null);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMedio, setPagoMedio] = useState('efectivo');
  const [pagoRef, setPagoRef] = useState('');
  const [pagoObs, setPagoObs] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filtroProveedor) params.proveedorId = filtroProveedor;
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroDesde) params.desde = filtroDesde;
      if (filtroHasta) params.hasta = filtroHasta;
      const data = await api.getFacturas(params);
      setFacturas(data);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [filtroProveedor, filtroEstado, filtroTipo, filtroDesde, filtroHasta]);
  useEffect(() => {
    api.getProveedores().then(setProveedores).catch(() => {});
  }, []);

  const verDetalle = async (id: number) => {
    setLoadingDetalle(true);
    setDetalleOpen(true);
    try {
      const data = await api.getFactura(id);
      setDetalle(data);
    } catch { }
    setLoadingDetalle(false);
  };

  const abrirPago = (facturaId: number, saldoPendiente: number) => {
    setPagoFacturaId(facturaId);
    setPagoMonto(String(saldoPendiente));
    setPagoMedio('efectivo');
    setPagoRef('');
    setPagoObs('');
    setPagoOpen(true);
  };

  const guardarPago = async () => {
    if (!pagoFacturaId || !pagoMonto) return;
    setGuardandoPago(true);
    try {
      await api.registrarPago(pagoFacturaId, {
        fecha: new Date().toISOString().split('T')[0],
        monto: Number(pagoMonto),
        medioPago: pagoMedio,
        referencia: pagoRef || null,
        observacion: pagoObs || null,
        creadoPorId: user!.id,
      });
      addToast(`Pago de $${Number(pagoMonto).toLocaleString()} registrado`);
      setPagoOpen(false);
      cargar();
      // Refresh detalle if open
      if (detalleOpen && detalle?.id === pagoFacturaId) verDetalle(pagoFacturaId);
    } catch (e: any) {
      addToast(e.message || 'Error al registrar pago', 'error');
    }
    setGuardandoPago(false);
  };

  const anular = async (id: number, codigo: string) => {
    if (!confirm(`¿Anular la factura ${codigo}? Esta acción no se puede revertir.`)) return;
    try {
      await api.anularFactura(id);
      addToast(`Factura ${codigo} anulada`);
      cargar();
    } catch (e: any) {
      addToast(e.message || 'Error', 'error');
    }
  };

  const facturasFiltradas = facturas.filter(f => {
    if (!buscar) return true;
    const q = buscar.toLowerCase();
    return f.codigo?.toLowerCase().includes(q) ||
      f.numero?.toLowerCase().includes(q) ||
      f.proveedor?.nombre?.toLowerCase().includes(q);
  });

  const formatMoney = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const totalFacturado = facturasFiltradas.reduce((s, f) => s + (f.total || 0), 0);
  const totalPagado = facturasFiltradas.reduce((s, f) => s + (f.totalPagado || 0), 0);

  const getExportConfig = (): ExportConfig => ({
    title: 'Facturas',
    filename: `facturas-${todayStr()}`,
    headers: ['Codigo', 'Tipo', 'Numero', 'Fecha', 'Proveedor', 'Total', 'Pagado', 'Saldo', 'Estado'],
    rows: facturasFiltradas.map(f => [
      f.codigo, f.tipoComprobante, f.numero, f.fecha,
      f.proveedor?.nombre || '', f.total, f.totalPagado, f.saldoPendiente, f.estado,
    ]),
    summary: [
      { label: 'Facturas', value: facturasFiltradas.length },
      { label: 'Facturado', value: formatCurrency(totalFacturado) },
      { label: 'Pagado', value: formatCurrency(totalPagado) },
      { label: 'Saldo', value: formatCurrency(totalFacturado - totalPagado) },
    ],
    currencyColumns: [5, 6, 7],
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Contabilidad</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Facturas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportMenu getConfig={getExportConfig} disabled={facturasFiltradas.length === 0} size="sm" />
          <Button onClick={() => navigate('/escanear-factura')}>
            <ScanLine size={16} /> Escanear
          </Button>
        </div>
      </div>

      {/* Filtros — primera fila: búsqueda + selects */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Buscar por código, número o proveedor..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="parcial">Parcial</option>
          <option value="pagada">Pagada</option>
          <option value="anulada">Anulada</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-surface-high border-0 text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="">Todos los tipos</option>
          <option value="A">Factura A</option>
          <option value="B">Factura B</option>
          <option value="C">Factura C</option>
          <option value="ticket">Ticket</option>
          <option value="remito">Remito</option>
        </select>
      </div>

      {/* Filtros — segunda fila: rango de fechas + atajos */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Desde</label>
          <input
            type="date"
            value={filtroDesde}
            onChange={e => setFiltroDesde(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Hasta</label>
          <input
            type="date"
            value={filtroHasta}
            onChange={e => setFiltroHasta(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {/* Atajos — un click pone un rango típico */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Hoy', dias: 0 },
            { label: '7 días', dias: 7 },
            { label: '30 días', dias: 30 },
            { label: 'Este mes', mes: true },
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => {
                const hoy = new Date();
                const hasta = hoy.toISOString().split('T')[0];
                let desde: string;
                if (preset.mes) {
                  const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                  desde = d.toISOString().split('T')[0];
                } else if (preset.dias === 0) {
                  desde = hasta;
                } else {
                  const d = new Date(hoy);
                  d.setDate(d.getDate() - (preset.dias || 0));
                  desde = d.toISOString().split('T')[0];
                }
                setFiltroDesde(desde);
                setFiltroHasta(hasta);
              }}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-surface-high text-on-surface-variant hover:text-primary hover:bg-primary/10 uppercase tracking-wider transition-colors"
            >
              {preset.label}
            </button>
          ))}
          {(filtroDesde || filtroHasta) && (
            <button
              onClick={() => { setFiltroDesde(''); setFiltroHasta(''); }}
              className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg text-destructive hover:bg-destructive/10 uppercase tracking-wider transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Código</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Tipo</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Número</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fecha</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Proveedor</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Saldo</th>
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Estado</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facturasFiltradas.map(f => (
                <tr key={f.id} className="hover:bg-surface-high/50 transition-colors">
                  <td className="p-3 font-mono text-xs text-primary font-bold">{f.codigo}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${TIPO_COLOR[f.tipoComprobante] || ''}`}>
                      {f.tipoComprobante === 'ticket' ? 'Ticket' : f.tipoComprobante === 'remito' ? 'Remito' : `Fac. ${f.tipoComprobante}`}
                    </span>
                  </td>
                  <td className="p-3 text-on-surface-variant font-medium hidden sm:table-cell">{f.numero || '—'}</td>
                  <td className="p-3 text-foreground font-semibold">{f.fecha}</td>
                  <td className="p-3 hidden md:table-cell font-medium text-on-surface-variant">{f.proveedor?.nombre}</td>
                  <td className="p-3 text-right font-bold text-foreground">{formatMoney(f.total)}</td>
                  <td className="p-3 text-right hidden lg:table-cell">
                    <span className={`font-bold ${f.saldoPendiente > 0 ? 'text-warning' : 'text-success'}`}>
                      {formatMoney(f.saldoPendiente)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${ESTADOS_COLOR[f.estado] || ''}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => verDetalle(f.id)} className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors" title="Ver detalle">
                        <Eye size={14} />
                      </button>
                      {f.estado !== 'pagada' && f.estado !== 'anulada' && (
                        <button onClick={() => abrirPago(f.id, f.saldoPendiente)} className="p-1.5 rounded-lg hover:bg-success/10 text-on-surface-variant hover:text-success transition-colors" title="Registrar pago">
                          <DollarSign size={14} />
                        </button>
                      )}
                      {f.estado !== 'anulada' && (
                        <button onClick={() => anular(f.id, f.codigo)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors" title="Anular">
                          <Ban size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {facturasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-on-surface-variant font-medium">
                    {loading ? 'Cargando...' : 'No se encontraron facturas'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle */}
      <Modal open={detalleOpen} onClose={() => { setDetalleOpen(false); setDetalle(null); }} title={detalle ? `Factura ${detalle.codigo}` : 'Cargando...'}>
        {loadingDetalle ? (
          <p className="text-center text-on-surface-variant py-8">Cargando...</p>
        ) : detalle && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Info header */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Tipo</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${TIPO_COLOR[detalle.tipoComprobante] || ''}`}>
                  {detalle.tipoComprobante === 'ticket' ? 'Ticket' : detalle.tipoComprobante === 'remito' ? 'Remito' : `Factura ${detalle.tipoComprobante}`}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Proveedor</p>
                <p className="font-semibold text-foreground">{detalle.proveedor?.nombre}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Fecha</p>
                <p className="font-semibold text-foreground">{detalle.fecha}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Vencimiento</p>
                <p className="font-semibold text-foreground">{detalle.fechaVencimiento || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">N° Original</p>
                <p className="font-semibold text-foreground">{detalle.numero || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Estado</p>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${ESTADOS_COLOR[detalle.estado] || ''}`}>
                  {detalle.estado}
                </span>
              </div>
            </div>

            {/* Totales */}
            <div className="grid grid-cols-3 gap-3 bg-surface-high rounded-xl p-3">
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Total</p>
                <p className="text-lg font-extrabold text-foreground">{formatMoney(detalle.total)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Pagado</p>
                <p className="text-lg font-extrabold text-success">{formatMoney(detalle.totalPagado)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase">Saldo</p>
                <p className={`text-lg font-extrabold ${detalle.saldoPendiente > 0 ? 'text-warning' : 'text-success'}`}>
                  {formatMoney(detalle.saldoPendiente)}
                </p>
              </div>
            </div>

            {/* Items */}
            {detalle.items?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Items</p>
                <div className="space-y-1">
                  {detalle.items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between bg-surface-high rounded-lg px-3 py-2 text-sm">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{item.descripcion}</p>
                        {item.producto && <p className="text-xs text-primary font-medium">{item.producto.codigo} — {item.producto.nombre}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{item.cantidad} {item.unidad} x {formatMoney(item.precioUnitario)}</p>
                        <p className="text-xs text-on-surface-variant">IVA: {item.alicuotaIva}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagos */}
            {detalle.pagos?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Pagos</p>
                <div className="space-y-1">
                  {detalle.pagos.map((pago: any) => (
                    <div key={pago.id} className="flex items-center justify-between bg-surface-high rounded-lg px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-success">{formatMoney(pago.monto)}</p>
                        <p className="text-xs text-on-surface-variant">{pago.fecha} · {pago.medioPago} {pago.referencia ? `· ${pago.referencia}` : ''}</p>
                      </div>
                      <p className="text-xs text-on-surface-variant">{pago.creadoPor?.nombre}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Acciones */}
            {detalle.estado !== 'pagada' && detalle.estado !== 'anulada' && (
              <Button onClick={() => { setDetalleOpen(false); abrirPago(detalle.id, detalle.saldoPendiente); }} className="w-full">
                <DollarSign size={16} /> Registrar pago
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Pago */}
      <Modal open={pagoOpen} onClose={() => setPagoOpen(false)} title="Registrar pago">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Monto *</label>
            <input
              type="number"
              step="0.01"
              value={pagoMonto}
              onChange={e => setPagoMonto(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-xl font-extrabold text-center text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Medio de pago</label>
            <select
              value={pagoMedio}
              onChange={e => setPagoMedio(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {MEDIOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Referencia</label>
            <input
              type="text"
              value={pagoRef}
              onChange={e => setPagoRef(e.target.value)}
              placeholder="N° transferencia, cheque, etc."
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Observación</label>
            <input
              type="text"
              value={pagoObs}
              onChange={e => setPagoObs(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2.5 rounded-lg bg-surface-high border-0 text-sm font-semibold text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={guardarPago} disabled={!pagoMonto || guardandoPago} className="flex-1">
              {guardandoPago ? 'Guardando...' : 'Registrar pago'}
            </Button>
            <Button variant="secondary" onClick={() => setPagoOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
