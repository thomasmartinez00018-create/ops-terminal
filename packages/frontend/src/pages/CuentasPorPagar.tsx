import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import { DollarSign, AlertTriangle, FileText, Download, TrendingUp } from 'lucide-react';

export default function CuentasPorPagar() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCuentasPorPagar()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatMoney = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  const exportarCSV = () => {
    if (!data?.proveedores?.length) return;
    const headers = ['Proveedor', 'Facturas', 'Facturado', 'Pagado', 'Saldo', 'Corriente (0-30d)', '31-60d', '61-90d', '90+ d'];
    const rows = data.proveedores.map((p: any) => [
      p.nombre, p.cantFacturas, p.totalFacturado, p.totalPagado, p.saldo,
      p.corriente, p.dias31_60, p.dias61_90, p.dias90plus,
    ]);
    const csv = [headers, ...rows].map((r: any[]) => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuentas-por-pagar-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-center text-on-surface-variant">Cargando...</div>;

  const totales = data?.totales || { totalAdeudado: 0, totalFacturas: 0, corriente: 0, dias31_60: 0, dias61_90: 0, dias90plus: 0 };
  const proveedores = data?.proveedores || [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Contabilidad</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Cuentas por Pagar</h1>
        </div>
        <button
          onClick={exportarCSV}
          disabled={proveedores.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-high border border-border text-sm font-semibold text-on-surface-variant hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-warning/10">
              <DollarSign size={20} className="text-warning" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total adeudado</p>
              <p className="text-2xl font-extrabold text-warning">{formatMoney(totales.totalAdeudado)}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <FileText size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Facturas pendientes</p>
              <p className="text-2xl font-extrabold text-foreground">{totales.totalFacturas}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Vencidas (90+ d)</p>
              <p className={`text-2xl font-extrabold ${totales.dias90plus > 0 ? 'text-destructive' : 'text-success'}`}>
                {formatMoney(totales.dias90plus)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla por proveedor */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Proveedor</th>
                <th className="text-center p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Facturas</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Facturado</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Pagado</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Saldo</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Corriente</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">31-60d</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">61-90d</th>
                <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">90+d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proveedores.map((p: any) => (
                <tr
                  key={p.proveedorId}
                  className="hover:bg-surface-high/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/facturas?proveedorId=${p.proveedorId}`)}
                >
                  <td className="p-3 font-semibold text-foreground">{p.nombre}</td>
                  <td className="p-3 text-center text-on-surface-variant font-medium">{p.cantFacturas}</td>
                  <td className="p-3 text-right text-on-surface-variant font-medium hidden md:table-cell">{formatMoney(p.totalFacturado)}</td>
                  <td className="p-3 text-right text-success font-medium hidden md:table-cell">{formatMoney(p.totalPagado)}</td>
                  <td className="p-3 text-right font-bold text-warning">{formatMoney(p.saldo)}</td>
                  <td className="p-3 text-right text-on-surface-variant hidden lg:table-cell">{formatMoney(p.corriente)}</td>
                  <td className="p-3 text-right text-on-surface-variant hidden lg:table-cell">{p.dias31_60 > 0 ? formatMoney(p.dias31_60) : '—'}</td>
                  <td className="p-3 text-right hidden lg:table-cell">
                    <span className={p.dias61_90 > 0 ? 'text-warning font-semibold' : 'text-on-surface-variant'}>
                      {p.dias61_90 > 0 ? formatMoney(p.dias61_90) : '—'}
                    </span>
                  </td>
                  <td className="p-3 text-right hidden lg:table-cell">
                    <span className={p.dias90plus > 0 ? 'text-destructive font-bold' : 'text-on-surface-variant'}>
                      {p.dias90plus > 0 ? formatMoney(p.dias90plus) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
              {proveedores.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-on-surface-variant font-medium">
                    No hay cuentas pendientes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aging bar visual */}
      {totales.totalAdeudado > 0 && (
        <div className="mt-4 bg-surface border border-border rounded-xl p-4">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Distribución por antigüedad</p>
          <div className="flex rounded-lg overflow-hidden h-6">
            {totales.corriente > 0 && (
              <div
                className="bg-success/60 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${(totales.corriente / totales.totalAdeudado) * 100}%` }}
              >
                {Math.round((totales.corriente / totales.totalAdeudado) * 100)}%
              </div>
            )}
            {totales.dias31_60 > 0 && (
              <div
                className="bg-blue-500/60 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${(totales.dias31_60 / totales.totalAdeudado) * 100}%` }}
              >
                {Math.round((totales.dias31_60 / totales.totalAdeudado) * 100)}%
              </div>
            )}
            {totales.dias61_90 > 0 && (
              <div
                className="bg-warning/60 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${(totales.dias61_90 / totales.totalAdeudado) * 100}%` }}
              >
                {Math.round((totales.dias61_90 / totales.totalAdeudado) * 100)}%
              </div>
            )}
            {totales.dias90plus > 0 && (
              <div
                className="bg-destructive/60 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${(totales.dias90plus / totales.totalAdeudado) * 100}%` }}
              >
                {Math.round((totales.dias90plus / totales.totalAdeudado) * 100)}%
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success/60" />Corriente</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/60" />31-60d</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning/60" />61-90d</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive/60" />90+d</span>
          </div>
        </div>
      )}
    </div>
  );
}
