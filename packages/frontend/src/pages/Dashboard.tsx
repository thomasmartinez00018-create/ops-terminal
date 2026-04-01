import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import {
  Package, Warehouse, ArrowRightLeft, AlertTriangle,
  TrendingDown, TrendingUp, ClipboardCheck, Activity
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboardStats()
      .then(setStats)
      .catch(() => {
        // Fallback to basic stats if reportes endpoint not ready
        Promise.all([
          api.getProductos({ activo: 'true' }),
          api.getDepositos({ activo: 'true' }),
          api.getMovimientos({ limit: '10' }),
          api.getStock({ bajosDeMinimo: 'true' }),
        ]).then(([productos, depositos, movimientos, stockBajo]) => {
          setStats({
            productosActivos: productos.length,
            depositos: depositos.length,
            movimientosHoy: 0,
            movimientosSemana: movimientos.length,
            bajosDeMinimo: stockBajo.length,
            mermasDelMes: 0,
            ingresosDelMes: 0,
            inventariosAbiertos: 0,
            ultimosMovimientos: movimientos,
          });
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const tipoBadge: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'default'> = {
    ingreso: 'success', elaboracion: 'info', merma: 'danger',
    transferencia: 'warning', ajuste: 'default', consumo_interno: 'default',
    devolucion: 'warning', conteo: 'info',
  };

  const tipoLabels: Record<string, string> = {
    ingreso: 'Ingreso', elaboracion: 'Elaboración', merma: 'Merma',
    transferencia: 'Transferencia', ajuste: 'Ajuste', conteo: 'Conteo',
    consumo_interno: 'Consumo int.', devolucion: 'Devolución',
  };

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-on-surface-variant font-semibold">Cargando dashboard...</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Productos activos', value: stats.productosActivos, icon: Package, accent: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Depósitos', value: stats.depositos, icon: Warehouse, accent: 'text-success', bg: 'bg-success/10' },
    { label: 'Mov. hoy', value: stats.movimientosHoy, icon: Activity, accent: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Bajo mínimo', value: stats.bajosDeMinimo, icon: AlertTriangle, accent: stats.bajosDeMinimo > 0 ? 'text-destructive' : 'text-on-surface-variant', bg: stats.bajosDeMinimo > 0 ? 'bg-destructive/10' : 'bg-surface-high' },
  ];

  const kpis2 = [
    { label: 'Mov. semana', value: stats.movimientosSemana, icon: ArrowRightLeft, accent: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Mermas del mes', value: stats.mermasDelMes, icon: TrendingDown, accent: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Ingresos del mes', value: stats.ingresosDelMes, icon: TrendingUp, accent: 'text-success', bg: 'bg-success/10' },
    { label: 'Inventarios abiertos', value: stats.inventariosAbiertos, icon: ClipboardCheck, accent: 'text-warning', bg: 'bg-warning/10' },
  ];

  return (
    <div>
      <div className="mb-6">
        <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Dashboard</p>
        <h1 className="text-xl font-extrabold text-foreground mt-1">
          Hola, {user?.nombre}
        </h1>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {kpis.map(card => (
          <div key={card.label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${card.bg}`}>
                <card.icon size={18} className={card.accent} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">{card.value}</p>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis2.map(card => (
          <div key={card.label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${card.bg}`}>
                <card.icon size={18} className={card.accent} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground">{card.value}</p>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Últimos movimientos */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Últimos movimientos</h2>
        </div>
        {(!stats.ultimosMovimientos || stats.ultimosMovimientos.length === 0) ? (
          <p className="p-4 text-sm text-on-surface-variant font-medium">Sin movimientos registrados</p>
        ) : (
          <div className="divide-y divide-border">
            {stats.ultimosMovimientos.map((mov: any) => (
              <div key={mov.id} className="p-4 flex items-center justify-between hover:bg-surface-high/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant={tipoBadge[mov.tipo]}>
                    {tipoLabels[mov.tipo] || mov.tipo}
                  </Badge>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {mov.producto?.nombre}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {mov.cantidad} {mov.unidad} &middot; {mov.fecha}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant font-medium">{mov.usuario?.nombre}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
