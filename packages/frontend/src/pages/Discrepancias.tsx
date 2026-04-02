import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { AlertTriangle, CheckCircle, HelpCircle, ArrowLeft, ArrowRightLeft, RefreshCw, ClipboardCheck } from 'lucide-react';
import PageTour from '../components/PageTour';

const COLOR_MAP = {
  verde: { bg: 'bg-success/10 border-success/30', icon: CheckCircle, iconColor: 'text-success', label: 'Sin discrepancias' },
  amarillo: { bg: 'bg-warning/10 border-warning/30', icon: AlertTriangle, iconColor: 'text-warning', label: 'Discrepancias menores' },
  rojo: { bg: 'bg-destructive/10 border-destructive/30', icon: AlertTriangle, iconColor: 'text-destructive', label: 'Discrepancias graves' },
  gris: { bg: 'bg-surface-high border-border', icon: HelpCircle, iconColor: 'text-on-surface-variant', label: 'Sin inventario' },
};

export default function Discrepancias() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDep, setSelectedDep] = useState<any>(null);
  const [trazabilidad, setTrazabilidad] = useState<any>(null);
  const [selectedProd, setSelectedProd] = useState<any>(null);
  const [loadingTraz, setLoadingTraz] = useState(false);

  const cargar = () => {
    setLoading(true);
    api.getDiscrepancias()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const verTrazabilidad = async (productoId: number, depositoId: number, producto: any) => {
    if (!productoId) return;
    setLoadingTraz(true);
    setSelectedProd(producto);
    try {
      const result = await api.getTrazabilidad(productoId, depositoId);
      setTrazabilidad(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTraz(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-on-surface-variant font-semibold">Cargando discrepancias...</p>
      </div>
    );
  }

  // ─── TRAZABILIDAD VIEW ───
  if (trazabilidad && selectedProd && selectedDep) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Trazabilidad</p>
            <h1 className="text-xl font-extrabold text-foreground mt-1">
              {selectedProd.nombre || selectedProd.codigo} — {selectedDep.deposito.nombre}
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Stock actual: <span className="text-foreground font-bold">{trazabilidad.stockActual} {selectedProd.unidadUso}</span>
            </p>
          </div>
          <Button variant="ghost" onClick={() => { setTrazabilidad(null); setSelectedProd(null); }}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">
              Movimientos ({trazabilidad.movimientos.length})
            </h2>
          </div>
          {trazabilidad.movimientos.length === 0 ? (
            <p className="p-6 text-center text-on-surface-variant">Sin movimientos registrados para este producto en este depósito</p>
          ) : (
            <div className="divide-y divide-border">
              {trazabilidad.movimientos.map((mov: any) => (
                <div key={mov.id} className="p-4 flex items-center justify-between hover:bg-surface-high/50">
                  <div className="flex items-center gap-3">
                    <ArrowRightLeft size={16} className="text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Badge variant={mov.tipo === 'ingreso' ? 'success' : mov.tipo === 'merma' ? 'danger' : mov.tipo === 'transferencia' ? 'warning' : 'default'}>
                          {mov.tipo}
                        </Badge>
                        <span>{mov.cantidad} {mov.unidad}</span>
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {mov.fecha} {mov.hora}
                        {mov.depositoOrigen && <span> · De: {mov.depositoOrigen.nombre}</span>}
                        {mov.depositoDestino && <span> · A: {mov.depositoDestino.nombre}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-foreground">{mov.usuario?.nombre}</p>
                    {mov.motivo && <p className="text-xs text-on-surface-variant">{mov.motivo}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (selectedDep) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Discrepancias</p>
            <h1 className="text-xl font-extrabold text-foreground mt-1">{selectedDep.deposito.nombre}</h1>
            {selectedDep.ultimoInventario && (
              <p className="text-sm text-on-surface-variant mt-1">
                Inventario del {selectedDep.ultimoInventario.fecha} por {selectedDep.ultimoInventario.usuario}
              </p>
            )}
          </div>
          <Button variant="ghost" onClick={() => setSelectedDep(null)}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
        </div>

        {selectedDep.discrepancias.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <CheckCircle size={48} className="text-success mx-auto mb-4" />
            <h2 className="text-lg font-extrabold text-foreground">Todo en orden</h2>
            <p className="text-sm text-on-surface-variant">No se encontraron discrepancias en este depósito</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    <th className="text-left p-3">Producto</th>
                    <th className="text-center p-3">Contado</th>
                    <th className="text-center p-3">Esperado</th>
                    <th className="text-center p-3">Diferencia</th>
                    <th className="text-center p-3">Stock hoy</th>
                    <th className="text-right p-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedDep.discrepancias.map((d: any, i: number) => (
                    <tr
                      key={i}
                      className={`${
                        Math.abs(d.diferencia) > 2 ? 'bg-destructive/5' : 'bg-warning/5'
                      } hover:bg-surface-high/50 transition-colors`}
                    >
                      <td className="p-3">
                        <p className="font-semibold text-foreground">{d.producto.nombre}</p>
                        <p className="text-xs text-on-surface-variant">{d.producto.codigo} · {d.producto.unidadUso}</p>
                      </td>
                      <td className="p-3 text-center text-foreground font-semibold">{d.cantidadFisica}</td>
                      <td className="p-3 text-center text-on-surface-variant">{d.stockTeorico ?? '—'}</td>
                      <td className="p-3 text-center">
                        <span className={`font-extrabold ${(d.diferencia ?? 0) < 0 ? 'text-destructive' : 'text-warning'}`}>
                          {(d.diferencia ?? 0) > 0 ? '+' : ''}{d.diferencia ?? 0}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-xs font-semibold text-on-surface-variant">{d.stockActual ?? '—'}</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => verTrazabilidad(d.producto.id, selectedDep.deposito.id, d.producto)}
                          disabled={loadingTraz || !d.producto.id}
                          className="text-primary text-xs font-bold hover:text-primary/80 disabled:opacity-40"
                        >
                          Ver movimientos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── OVERVIEW (cards por depósito) ───
  const sinInventario = data.filter(d => d.estado === 'sin_inventario');
  const conInventario = data.filter(d => d.estado !== 'sin_inventario');

  return (
    <div>
      <PageTour pageKey="discrepancias" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Control</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Discrepancias por Depósito</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Diferencias encontradas al cierre de cada inventario
          </p>
        </div>
        <button
          onClick={cargar}
          className="p-2 rounded-lg hover:bg-surface-high transition-colors text-on-surface-variant"
          title="Recargar"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {data.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <AlertTriangle size={48} className="text-on-surface-variant mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-foreground">No hay depósitos activos</h2>
          <p className="text-sm text-on-surface-variant">Creá depósitos en la sección Depósitos</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Depósitos con inventario */}
          {conInventario.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conInventario.map((dep: any) => {
                const colorInfo = COLOR_MAP[dep.color as keyof typeof COLOR_MAP] || COLOR_MAP.gris;
                const Icon = colorInfo.icon;
                return (
                  <button
                    key={dep.deposito.id}
                    onClick={() => setSelectedDep(dep)}
                    className={`rounded-xl border p-6 text-left transition-all hover:scale-[1.02] cursor-pointer ${colorInfo.bg}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-extrabold text-foreground">{dep.deposito.nombre}</h3>
                        {dep.deposito.tipo && (
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{dep.deposito.tipo}</p>
                        )}
                      </div>
                      <Icon size={24} className={colorInfo.iconColor} />
                    </div>

                    <p className={`text-sm font-semibold ${colorInfo.iconColor}`}>{colorInfo.label}</p>

                    <p className="text-xs text-on-surface-variant mt-2">
                      {dep.ultimoInventario.fecha} · {dep.responsable}
                    </p>

                    {dep.discrepancias.length > 0 && (
                      <p className="text-xs font-bold text-foreground mt-2">
                        {dep.discrepancias.length} producto{dep.discrepancias.length > 1 ? 's' : ''} con diferencia
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Depósitos sin inventario */}
          {sinInventario.length > 0 && (
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                Sin inventario realizado
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sinInventario.map((dep: any) => (
                  <div
                    key={dep.deposito.id}
                    className="rounded-xl border border-border bg-surface-high p-4 flex items-center justify-between opacity-70"
                  >
                    <div>
                      <p className="font-semibold text-foreground text-sm">{dep.deposito.nombre}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Realizá un inventario para ver discrepancias</p>
                    </div>
                    <ClipboardCheck size={20} className="text-on-surface-variant" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
