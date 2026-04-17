import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import PageTour from '../components/PageTour';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import SearchableSelect from '../components/ui/SearchableSelect';
import { Plus, Eye, X as XIcon, Check, CheckCheck, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const ESTADOS: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  parcial: { label: 'Parcial', variant: 'info' },
  recibida: { label: 'Recibida', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'danger' },
};

interface ItemForm {
  productoId: number;
  nombre: string;
  cantidadPedida: number;
  unidad: string;
  precioEstimado: number | null;
}

export default function OrdenesCompra() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [selectedOrden, setSelectedOrden] = useState<any>(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [soloMias, setSoloMias] = useState(user?.rol !== 'admin');

  // Data auxiliar
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);

  // Modal crear OC
  const [modalCrear, setModalCrear] = useState(false);
  const [form, setForm] = useState({ proveedorId: '', responsableId: '', depositoDestinoId: '', observacion: '' });
  const [itemsForm, setItemsForm] = useState<ItemForm[]>([]);
  const [error, setError] = useState('');

  // Modal recibir
  const [modalRecibir, setModalRecibir] = useState(false);
  const [recepcionItems, setRecepcionItems] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.getProveedores({ activo: 'true' }),
      api.getUsuarios({ activo: 'true' }),
      api.getProductos({ activo: 'true' }),
      api.getDepositos({ activo: 'true' }),
    ]).then(([prov, usr, prod, dep]) => {
      setProveedores(prov);
      setUsuarios(usr);
      setProductos(prod);
      setDepositos(dep);
    }).catch(console.error);
  }, []);

  const cargarOrdenes = () => {
    const params: Record<string, string> = {};
    if (filtroEstado) params.estado = filtroEstado;
    if (soloMias && user) params.responsableId = String(user.id);
    api.getOrdenesCompra(params).then(setOrdenes).catch(console.error);
  };

  useEffect(() => {
    if (view === 'list') cargarOrdenes();
  }, [view, filtroEstado, soloMias]);

  const verDetalle = async (id: number) => {
    const orden = await api.getOrdenCompra(id);
    setSelectedOrden(orden);
    setView('detail');
  };

  const handleCrear = async () => {
    setError('');
    if (!form.proveedorId || !form.responsableId || itemsForm.length === 0) {
      setError('Completar proveedor, responsable y al menos un item');
      return;
    }
    try {
      await api.createOrdenCompra({
        proveedorId: parseInt(form.proveedorId),
        creadoPorId: user?.id,
        responsableId: parseInt(form.responsableId),
        depositoDestinoId: form.depositoDestinoId ? parseInt(form.depositoDestinoId) : null,
        observacion: form.observacion || null,
        items: itemsForm.map(i => ({
          productoId: i.productoId,
          cantidadPedida: i.cantidadPedida,
          unidad: i.unidad,
          precioEstimado: i.precioEstimado,
        })),
      });
      setModalCrear(false);
      setForm({ proveedorId: '', responsableId: '', depositoDestinoId: '', observacion: '' });
      setItemsForm([]);
      cargarOrdenes();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const agregarItem = () => {
    setItemsForm([...itemsForm, { productoId: 0, nombre: '', cantidadPedida: 1, unidad: 'unidad', precioEstimado: null }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...itemsForm];
    if (field === 'productoId') {
      const prod = productos.find((p: any) => p.id === parseInt(value));
      if (prod) {
        updated[idx] = { ...updated[idx], productoId: prod.id, nombre: prod.nombre, unidad: prod.unidadCompra };
      }
    } else {
      (updated[idx] as any)[field] = value;
    }
    setItemsForm(updated);
  };

  const removeItem = (idx: number) => {
    setItemsForm(itemsForm.filter((_, i) => i !== idx));
  };

  const abrirRecibir = () => {
    if (!selectedOrden) return;
    setRecepcionItems(
      selectedOrden.items.map((item: any) => ({
        productoId: item.productoId,
        nombre: item.producto?.nombre || '',
        cantidadPedida: item.cantidadPedida,
        cantidadRecibida: item.cantidadPedida,
        unidad: item.unidad,
        costoUnitario: item.precioEstimado || null,
        lote: '',
        observacion: '',
        atribucion: '',
        motivoDiferencia: '',
      }))
    );
    setModalRecibir(true);
  };

  const handleRecibir = async () => {
    setError('');
    // Validación 1: cantidad recibida debe ser un número válido (no NaN).
    // Si el usuario borró el input, parseFloat devuelve NaN y la atribución
    // se rompía silenciosamente — ahora la frenamos acá.
    const sinCantidad = recepcionItems.filter(i => {
      const n = parseFloat(i.cantidadRecibida);
      return !Number.isFinite(n) || n < 0;
    });
    if (sinCantidad.length > 0) {
      setError(`Falta completar la cantidad recibida en: ${sinCantidad.map(i => i.nombre).join(', ')}`);
      return;
    }
    // Validación 2: items con diferencia contra lo pedido requieren atribución
    // (quién se hace cargo del faltante/excedente).
    const sinAtribucion = recepcionItems.filter(i => {
      const dif = (parseFloat(i.cantidadRecibida) || 0) - i.cantidadPedida;
      return Math.abs(dif) > 0.001 && !i.atribucion;
    });
    if (sinAtribucion.length > 0) {
      setError(`Indicá a quién se atribuye la diferencia en: ${sinAtribucion.map(i => i.nombre).join(', ')}`);
      return;
    }
    try {
      await api.recibirOrdenCompra(selectedOrden.id, {
        recibidoPorId: user?.id,
        observacion: null,
        depositoDestinoId: selectedOrden.depositoDestinoId,
        items: recepcionItems.map(i => {
          const recibida = parseFloat(i.cantidadRecibida) || 0;
          const dif = recibida - i.cantidadPedida;
          return {
            productoId: i.productoId,
            cantidadPedida: i.cantidadPedida,
            cantidadRecibida: recibida,
            unidad: i.unidad,
            costoUnitario: i.costoUnitario ? parseFloat(i.costoUnitario) : null,
            lote: i.lote || null,
            observacion: i.observacion || null,
            atribucion: Math.abs(dif) > 0.001 ? (i.atribucion || null) : null,
            motivoDiferencia: i.motivoDiferencia || null,
          };
        }),
      });
      addToast(`Recepción confirmada para ${selectedOrden.codigo}`);
      setModalRecibir(false);
      verDetalle(selectedOrden.id);
    } catch (e: any) {
      setError(e.message);
      addToast('Error al confirmar la recepción', 'error');
    }
  };

  const handleCancelar = async (id: number, codigo: string) => {
    if (!confirm(`¿Cancelar la orden "${codigo}"? Esta acción no se puede deshacer.`)) return;
    await api.cancelarOrdenCompra(id);
    if (view === 'detail') verDetalle(id);
    else cargarOrdenes();
  };

  // ─── DETAIL VIEW ───
  if (view === 'detail' && selectedOrden) {
    const est = ESTADOS[selectedOrden.estado] || ESTADOS.pendiente;
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Orden de Compra</p>
            <h1 className="text-xl font-extrabold text-foreground mt-1">
              {selectedOrden.codigo}
              <Badge variant={est.variant} >{est.label}</Badge>
            </h1>
          </div>
          <div className="flex gap-2">
            {(selectedOrden.estado === 'pendiente' || selectedOrden.estado === 'parcial') && (
              <>
                <Button onClick={abrirRecibir}>
                  <Check size={16} className="mr-1" /> Recibir
                </Button>
                <Button variant="ghost" onClick={() => handleCancelar(selectedOrden.id, selectedOrden.codigo)}>
                  Cancelar OC
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setView('list')}>Volver</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="glass rounded-xl p-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase">Proveedor</p>
            <p className="text-sm font-bold text-foreground mt-1">{selectedOrden.proveedor?.nombre}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase">Responsable</p>
            <p className="text-sm font-bold text-foreground mt-1">{selectedOrden.responsable?.nombre}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase">Depósito destino</p>
            <p className="text-sm font-bold text-foreground mt-1">{selectedOrden.depositoDestino?.nombre || '—'}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase">Fecha</p>
            <p className="text-sm font-bold text-foreground mt-1">{selectedOrden.fecha}</p>
          </div>
        </div>

        {/* Items pedidos */}
        <div className="bg-surface rounded-xl border border-border mb-6">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">Items pedidos</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                <th className="text-left p-3">Producto</th>
                <th className="text-right p-3">Cantidad</th>
                <th className="text-left p-3">Unidad</th>
                <th className="text-right p-3">Precio est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedOrden.items?.map((item: any) => (
                <tr key={item.id} className="hover:bg-surface-high/50">
                  <td className="p-3 font-semibold text-foreground">{item.producto?.nombre}</td>
                  <td className="p-3 text-right text-foreground">{item.cantidadPedida}</td>
                  <td className="p-3 text-on-surface-variant">{item.unidad}</td>
                  <td className="p-3 text-right text-on-surface-variant">{item.precioEstimado ? `$${item.precioEstimado}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recepciones */}
        {selectedOrden.recepciones?.length > 0 && (
          <div className="bg-surface rounded-xl border border-border">
            <div className="p-4 border-b border-border">
              <h2 className="text-xs font-extrabold text-foreground uppercase tracking-widest">
                Recepciones ({selectedOrden.recepciones.length})
              </h2>
            </div>
            {selectedOrden.recepciones.map((rec: any) => {
              const hayDiferencias = rec.items?.some((ri: any) => ri.cantidadPedida && Math.abs(ri.cantidadRecibida - ri.cantidadPedida) > 0.001);
              return (
                <div key={rec.id} className="p-4 border-b border-border last:border-0">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-foreground">
                      {rec.fecha} {rec.hora} · {rec.recibidoPor?.nombre}
                    </p>
                    {hayDiferencias && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-warning uppercase tracking-wider">
                        <AlertTriangle size={12} /> Con diferencias
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider border-b border-border/50">
                          <th className="text-left pb-1">Producto</th>
                          <th className="text-center pb-1">Pedido</th>
                          <th className="text-center pb-1">Recibido</th>
                          <th className="text-center pb-1">Dif.</th>
                          <th className="text-left pb-1">Atribuido a</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {rec.items?.map((ri: any) => {
                          const pedido = ri.cantidadPedida ?? null;
                          const dif = pedido !== null ? ri.cantidadRecibida - pedido : null;
                          const hayDif = dif !== null && Math.abs(dif) > 0.001;
                          return (
                            <tr key={ri.id} className={hayDif ? (dif! < 0 ? 'bg-destructive/5' : 'bg-warning/5') : ''}>
                              <td className="py-1.5 font-semibold text-foreground">
                                {ri.producto?.nombre}
                                {ri.costoUnitario && <span className="ml-1 text-primary font-normal">${ri.costoUnitario}/u</span>}
                              </td>
                              <td className="py-1.5 text-center text-on-surface-variant">
                                {pedido !== null ? `${pedido} ${ri.unidad}` : '—'}
                              </td>
                              <td className="py-1.5 text-center font-bold text-foreground">
                                {ri.cantidadRecibida} {ri.unidad}
                              </td>
                              <td className="py-1.5 text-center">
                                {hayDif ? (
                                  <span className={`font-extrabold flex items-center justify-center gap-0.5 ${dif! < 0 ? 'text-destructive' : 'text-warning'}`}>
                                    {dif! < 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                                    {dif! > 0 ? '+' : ''}{Math.round(dif! * 100) / 100}
                                  </span>
                                ) : (
                                  <span className="text-success font-bold">✓</span>
                                )}
                              </td>
                              <td className="py-1.5">
                                {ri.atribucion === 'proveedor' && (
                                  <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">Proveedor</span>
                                )}
                                {ri.atribucion === 'recepcion' && (
                                  <span className="text-[10px] font-bold bg-warning/10 text-warning px-1.5 py-0.5 rounded">Error recepción</span>
                                )}
                                {ri.motivoDiferencia && (
                                  <p className="text-[10px] text-on-surface-variant mt-0.5">{ri.motivoDiferencia}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Recibir */}
        <Modal open={modalRecibir} onClose={() => setModalRecibir(false)} title="Recibir mercadería">
          <div className="space-y-3">
            {error && <p className="text-sm text-destructive font-semibold bg-destructive/10 p-3 rounded-lg">{error}</p>}
            <button
              onClick={() => setRecepcionItems(prev => prev.map(i => ({ ...i, cantidadRecibida: i.cantidadPedida, atribucion: '', motivoDiferencia: '' })))}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-sm font-bold hover:bg-success/20 transition-colors"
            >
              <CheckCheck size={15} /> Todo llegó como pedido
            </button>

            {recepcionItems.map((item, idx) => {
              const recibida = parseFloat(String(item.cantidadRecibida)) || 0;
              const dif = recibida - item.cantidadPedida;
              const hayDif = Math.abs(dif) > 0.001;
              return (
                <div key={idx} className={`p-3 rounded-lg border transition-colors ${
                  hayDif
                    ? dif < 0 ? 'bg-destructive/5 border-destructive/30' : 'bg-warning/5 border-warning/30'
                    : 'bg-surface-high border-transparent'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.nombre}</p>
                      <p className="text-xs text-on-surface-variant">Pedido: <strong>{item.cantidadPedida} {item.unidad}</strong></p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant mb-1">Recibido</p>
                        <Input
                          type="number"
                          value={item.cantidadRecibida}
                          onChange={e => {
                            const updated = [...recepcionItems];
                            updated[idx].cantidadRecibida = e.target.value;
                            // Si se igualó al pedido, limpiar atribución
                            if (Math.abs(parseFloat(e.target.value) - item.cantidadPedida) <= 0.001) {
                              updated[idx].atribucion = '';
                              updated[idx].motivoDiferencia = '';
                            }
                            setRecepcionItems(updated);
                          }}
                          className="w-24 text-center"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant mb-1">$/u</p>
                        <Input
                          type="number"
                          placeholder="—"
                          value={item.costoUnitario || ''}
                          onChange={e => {
                            const updated = [...recepcionItems];
                            updated[idx].costoUnitario = e.target.value;
                            setRecepcionItems(updated);
                          }}
                          className="w-24 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Diferencia detectada → pedir atribución */}
                  {hayDif && (
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={13} className={dif < 0 ? 'text-destructive' : 'text-warning'} />
                        <p className="text-xs font-bold text-foreground">
                          {dif < 0
                            ? `Faltaron ${Math.abs(Math.round(dif * 100) / 100)} ${item.unidad} — ¿por qué?`
                            : `Sobraron ${Math.round(dif * 100) / 100} ${item.unidad} — ¿por qué?`
                          }
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const updated = [...recepcionItems];
                            updated[idx].atribucion = 'proveedor';
                            setRecepcionItems(updated);
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                            item.atribucion === 'proveedor'
                              ? 'bg-destructive text-white border-destructive'
                              : 'bg-surface border-border text-on-surface-variant hover:border-destructive hover:text-destructive'
                          }`}
                        >
                          🚚 Proveedor despachó mal
                        </button>
                        <button
                          onClick={() => {
                            const updated = [...recepcionItems];
                            updated[idx].atribucion = 'recepcion';
                            setRecepcionItems(updated);
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                            item.atribucion === 'recepcion'
                              ? 'bg-warning text-black border-warning'
                              : 'bg-surface border-border text-on-surface-variant hover:border-warning hover:text-warning'
                          }`}
                        >
                          📋 Error al recibir/cargar
                        </button>
                      </div>
                      <Input
                        placeholder="Nota opcional (ej: remito dice 5kg pero pesó 4.2kg)"
                        value={item.motivoDiferencia || ''}
                        onChange={e => {
                          const updated = [...recepcionItems];
                          updated[idx].motivoDiferencia = e.target.value;
                          setRecepcionItems(updated);
                        }}
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" onClick={() => setModalRecibir(false)}>Cancelar</Button>
              <Button onClick={handleRecibir}>Confirmar recepción</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ─── LIST VIEW ───
  return (
    <div>
      <PageTour pageKey="ordenes-compra" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Compras</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Órdenes de Compra</h1>
        </div>
        <Button onClick={() => setModalCrear(true)}>
          <Plus size={16} className="mr-1" /> Nueva OC
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-border">
          <button
            onClick={() => setSoloMias(true)}
            className={`px-4 py-2 text-sm font-semibold transition ${soloMias ? 'bg-primary text-black' : 'bg-surface text-on-surface-variant hover:bg-surface-high'}`}
          >
            Mis asignadas
          </button>
          <button
            onClick={() => setSoloMias(false)}
            className={`px-4 py-2 text-sm font-semibold transition ${!soloMias ? 'bg-primary text-black' : 'bg-surface text-on-surface-variant hover:bg-surface-high'}`}
          >
            Todas
          </button>
        </div>
        <Select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="w-48">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="parcial">Parcial</option>
          <option value="recibida">Recibida</option>
          <option value="cancelada">Cancelada</option>
        </Select>
      </div>

      {/* Tabla */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Proveedor</th>
              <th className="text-left p-3">Responsable</th>
              <th className="text-left p-3">Fecha</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-center p-3">Items</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordenes.map(oc => {
              const est = ESTADOS[oc.estado] || ESTADOS.pendiente;
              return (
                <tr key={oc.id} className={`hover:bg-surface-high/50 transition-colors ${oc.responsableId === user?.id && ['pendiente', 'parcial'].includes(oc.estado) ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}>
                  <td className="p-3 font-bold text-primary">{oc.codigo}</td>
                  <td className="p-3 font-semibold text-foreground">{oc.proveedor?.nombre}</td>
                  <td className="p-3 text-on-surface-variant">{oc.responsable?.nombre}</td>
                  <td className="p-3 text-on-surface-variant">{oc.fecha}</td>
                  <td className="p-3"><Badge variant={est.variant}>{est.label}</Badge></td>
                  <td className="p-3 text-center text-on-surface-variant">{oc._count?.items || 0}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => verDetalle(oc.id)} className="text-primary hover:text-primary/80">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {ordenes.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-on-surface-variant font-medium">Sin órdenes de compra</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear OC */}
      <Modal open={modalCrear} onClose={() => setModalCrear(false)} title="Nueva Orden de Compra">
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <SearchableSelect
            label="Proveedor"
            value={form.proveedorId}
            onChange={v => setForm({ ...form, proveedorId: v })}
            options={proveedores.map(p => ({ value: String(p.id), label: p.nombre }))}
            placeholder="Buscar proveedor..."
          />

          <Select label="Responsable" value={form.responsableId} onChange={e => setForm({ ...form, responsableId: e.target.value })}>
            <option value="">Seleccionar...</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
          </Select>

          <Select label="Depósito destino" value={form.depositoDestinoId} onChange={e => setForm({ ...form, depositoDestinoId: e.target.value })}>
            <option value="">Sin asignar</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </Select>

          <Input label="Observación" value={form.observacion} onChange={e => setForm({ ...form, observacion: e.target.value })} />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Items</p>
              <button onClick={agregarItem} className="text-primary text-xs font-bold hover:text-primary/80">+ Agregar</button>
            </div>
            <div className="space-y-2">
              {itemsForm.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-surface-high rounded-lg">
                  <div className="flex-1">
                    <SearchableSelect
                      value={item.productoId?.toString() || ''}
                      onChange={v => updateItem(idx, 'productoId', v)}
                      options={productos.map(p => ({ value: p.id.toString(), label: p.nombre }))}
                      placeholder="Producto..."
                    />
                  </div>
                  <Input
                    type="number"
                    placeholder="Cant."
                    value={item.cantidadPedida}
                    onChange={e => updateItem(idx, 'cantidadPedida', parseFloat(e.target.value) || 0)}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    placeholder="$/u"
                    value={item.precioEstimado || ''}
                    onChange={e => updateItem(idx, 'precioEstimado', parseFloat(e.target.value) || null)}
                    className="w-20"
                  />
                  <button onClick={() => removeItem(idx)} className="text-destructive hover:text-destructive/80">
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" onClick={() => setModalCrear(false)}>Cancelar</Button>
            <Button onClick={handleCrear}>Crear OC</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
