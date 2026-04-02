import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import PageTour from '../components/PageTour';
import Modal from '../components/ui/Modal';
import { Plus, Pencil, Trash2, Truck, Package, Phone, Mail } from 'lucide-react';

const emptyProveedorForm = {
  codigo: '',
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
};

const emptyMapForm = {
  productoId: '',
  nombreProveedor: '',
  codigoProveedor: '',
  unidadProveedor: '',
  factorConversion: 1,
  ultimoPrecio: 0,
};

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [selectedProveedor, setSelectedProveedor] = useState<any | null>(null);
  const [proveedorProductos, setProveedorProductos] = useState<any[]>([]);

  // Modals
  const [modalProvOpen, setModalProvOpen] = useState(false);
  const [modalMapOpen, setModalMapOpen] = useState(false);
  const [editProvId, setEditProvId] = useState<number | null>(null);
  const [editMapId, setEditMapId] = useState<number | null>(null);
  const [provForm, setProvForm] = useState(emptyProveedorForm);
  const [mapForm, setMapForm] = useState(emptyMapForm);
  const [error, setError] = useState('');
  const [errorMap, setErrorMap] = useState('');

  const cargarProveedores = () => {
    api.getProveedores({ activo: 'true' }).then(setProveedores).catch(console.error);
  };

  useEffect(() => {
    cargarProveedores();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
  }, []);

  const cargarProductosProveedor = (prov: any) => {
    setSelectedProveedor(prov);
    api.getProveedorProductos(prov.id).then(setProveedorProductos).catch(console.error);
  };

  // --- Proveedor CRUD ---
  const abrirProv = (prov?: any) => {
    if (prov) {
      setEditProvId(prov.id);
      setProvForm({
        codigo: prov.codigo,
        nombre: prov.nombre,
        contacto: prov.contacto || '',
        telefono: prov.telefono || '',
        email: prov.email || '',
      });
    } else {
      setEditProvId(null);
      setProvForm(emptyProveedorForm);
    }
    setError('');
    setModalProvOpen(true);
  };

  const guardarProv = async () => {
    setError('');
    try {
      if (editProvId) {
        await api.updateProveedor(editProvId, provForm);
      } else {
        await api.createProveedor(provForm);
      }
      setModalProvOpen(false);
      cargarProveedores();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const eliminarProv = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar al proveedor "${nombre}"? Esta acción se puede revertir.`)) return;
    await api.deleteProveedor(id);
    if (selectedProveedor?.id === id) {
      setSelectedProveedor(null);
      setProveedorProductos([]);
    }
    cargarProveedores();
  };

  // --- Product mapping CRUD ---
  const abrirMap = (map?: any) => {
    if (map) {
      setEditMapId(map.id);
      setMapForm({
        productoId: map.productoId?.toString() || '',
        nombreProveedor: map.nombreProveedor || '',
        codigoProveedor: map.codigoProveedor || '',
        unidadProveedor: map.unidadProveedor || '',
        factorConversion: map.factorConversion ?? 1,
        ultimoPrecio: map.ultimoPrecio ?? 0,
      });
    } else {
      setEditMapId(null);
      setMapForm(emptyMapForm);
    }
    setErrorMap('');
    setModalMapOpen(true);
  };

  const guardarMap = async () => {
    if (!selectedProveedor) return;
    setErrorMap('');
    try {
      const data = {
        ...mapForm,
        productoId: Number(mapForm.productoId),
        factorConversion: Number(mapForm.factorConversion),
        ultimoPrecio: Number(mapForm.ultimoPrecio),
      };
      if (editMapId) {
        await api.updateProveedorProducto(selectedProveedor.id, editMapId, data);
      } else {
        await api.createProveedorProducto(selectedProveedor.id, data);
      }
      setModalMapOpen(false);
      cargarProductosProveedor(selectedProveedor);
    } catch (e: any) {
      setErrorMap(e.message);
    }
  };

  const eliminarMap = async (mapId: number, productoNombre: string) => {
    if (!selectedProveedor) return;
    if (!confirm(`¿Eliminar el mapeo del producto "${productoNombre}" de ${selectedProveedor.nombre}?`)) return;
    await api.deleteProveedorProducto(selectedProveedor.id, mapId);
    cargarProductosProveedor(selectedProveedor);
  };

  const formatPrecio = (v: number | null) =>
    v != null ? `$${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-';

  const formatFecha = (f: string | null) => {
    if (!f) return '-';
    return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  return (
    <div>
      <PageTour pageKey="proveedores" />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Compras</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Proveedores</h1>
        </div>
        <Button onClick={() => abrirProv()}>
          <Plus size={16} /> Nuevo proveedor
        </Button>
      </div>

      {/* Proveedores grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {proveedores.map(prov => (
          <div
            key={prov.id}
            onClick={() => cargarProductosProveedor(prov)}
            className={`glass rounded-xl p-4 cursor-pointer transition-all ${
              selectedProveedor?.id === prov.id
                ? 'ring-2 ring-primary/60'
                : 'hover:ring-1 hover:ring-border'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Truck size={16} className="text-primary" />
                </div>
                <div>
                  <p className="font-mono text-xs text-primary">{prov.codigo}</p>
                  <p className="font-bold text-foreground text-sm">{prov.nombre}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={e => { e.stopPropagation(); abrirProv(prov); }}
                  className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); eliminarProv(prov.id, prov.nombre); }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="space-y-1.5 text-xs text-on-surface-variant">
              {prov.contacto && (
                <p className="font-medium">{prov.contacto}</p>
              )}
              {prov.telefono && (
                <div className="flex items-center gap-1.5">
                  <Phone size={12} />
                  <span>{prov.telefono}</span>
                </div>
              )}
              {prov.email && (
                <div className="flex items-center gap-1.5">
                  <Mail size={12} />
                  <span>{prov.email}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {proveedores.length === 0 && (
          <div className="col-span-full text-center py-12 text-on-surface-variant font-medium">
            No hay proveedores activos
          </div>
        )}
      </div>

      {/* Productos del proveedor seleccionado */}
      {selectedProveedor && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Productos de</p>
                <h2 className="text-base font-extrabold text-foreground">{selectedProveedor.nombre}</h2>
              </div>
            </div>
            <Button size="sm" onClick={() => abrirMap()}>
              <Plus size={14} /> Agregar producto
            </Button>
          </div>

          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Producto</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Nombre proveedor</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden md:table-cell">Código prov.</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Unidad</th>
                    <th className="text-left p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden lg:table-cell">Factor</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Últ. precio</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hidden sm:table-cell">Fecha</th>
                    <th className="text-right p-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {proveedorProductos.map(pp => {
                    const prod = productos.find(p => p.id === pp.productoId);
                    return (
                      <tr key={pp.id} className="hover:bg-surface-high/50 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-foreground">{prod?.nombre || `#${pp.productoId}`}</p>
                          <p className="font-mono text-xs text-primary">{prod?.codigo}</p>
                        </td>
                        <td className="p-3 text-on-surface-variant hidden sm:table-cell">{pp.nombreProveedor || '-'}</td>
                        <td className="p-3 font-mono text-xs text-on-surface-variant hidden md:table-cell">{pp.codigoProveedor || '-'}</td>
                        <td className="p-3 text-on-surface-variant hidden lg:table-cell">{pp.unidadProveedor || '-'}</td>
                        <td className="p-3 text-on-surface-variant hidden lg:table-cell">{pp.factorConversion ?? '-'}</td>
                        <td className="p-3 text-right font-bold text-foreground">{formatPrecio(pp.ultimoPrecio)}</td>
                        <td className="p-3 text-right text-on-surface-variant hidden sm:table-cell">{formatFecha(pp.fechaPrecio)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirMap(pp)}
                              className="p-1.5 rounded-lg hover:bg-surface-high text-on-surface-variant hover:text-foreground transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => eliminarMap(pp.id, prod?.nombre || `#${pp.productoId}`)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-on-surface-variant hover:text-destructive transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {proveedorProductos.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-on-surface-variant font-medium">
                        Este proveedor no tiene productos asignados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal proveedor */}
      <Modal
        open={modalProvOpen}
        onClose={() => setModalProvOpen(false)}
        title={editProvId ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <div className="space-y-3">
          <Input
            label="Código"
            id="prov-codigo"
            value={provForm.codigo}
            onChange={e => setProvForm({ ...provForm, codigo: e.target.value })}
            placeholder="PROV-001"
          />
          <Input
            label="Nombre"
            id="prov-nombre"
            value={provForm.nombre}
            onChange={e => setProvForm({ ...provForm, nombre: e.target.value })}
            placeholder="Nombre del proveedor"
          />
          <Input
            label="Contacto"
            id="prov-contacto"
            value={provForm.contacto}
            onChange={e => setProvForm({ ...provForm, contacto: e.target.value })}
            placeholder="Nombre de contacto"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Teléfono"
              id="prov-telefono"
              value={provForm.telefono}
              onChange={e => setProvForm({ ...provForm, telefono: e.target.value })}
              placeholder="+54 11 1234-5678"
            />
            <Input
              label="Email"
              id="prov-email"
              type="email"
              value={provForm.email}
              onChange={e => setProvForm({ ...provForm, email: e.target.value })}
              placeholder="email@proveedor.com"
            />
          </div>

          {error && <p className="text-sm text-destructive font-semibold">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={guardarProv} className="flex-1">
              {editProvId ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
            <Button variant="secondary" onClick={() => setModalProvOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal mapeo producto */}
      <Modal
        open={modalMapOpen}
        onClose={() => setModalMapOpen(false)}
        title={editMapId ? 'Editar producto' : 'Agregar producto'}
      >
        <div className="space-y-3">
          <Select
            label="Producto"
            id="map-producto"
            value={mapForm.productoId}
            onChange={e => setMapForm({ ...mapForm, productoId: e.target.value })}
            options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
            placeholder="Seleccionar producto..."
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre del proveedor"
              id="map-nombreProv"
              value={mapForm.nombreProveedor}
              onChange={e => setMapForm({ ...mapForm, nombreProveedor: e.target.value })}
              placeholder="Nombre que usa el proveedor"
            />
            <Input
              label="Código proveedor"
              id="map-codigoProv"
              value={mapForm.codigoProveedor}
              onChange={e => setMapForm({ ...mapForm, codigoProveedor: e.target.value })}
              placeholder="Código del proveedor"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Unidad proveedor"
              id="map-unidadProv"
              value={mapForm.unidadProveedor}
              onChange={e => setMapForm({ ...mapForm, unidadProveedor: e.target.value })}
              placeholder="ej: cajón"
            />
            <Input
              label="Factor conv."
              id="map-factor"
              type="number"
              value={mapForm.factorConversion}
              onChange={e => setMapForm({ ...mapForm, factorConversion: Number(e.target.value) })}
            />
            <Input
              label="Último precio"
              id="map-precio"
              type="number"
              value={mapForm.ultimoPrecio}
              onChange={e => setMapForm({ ...mapForm, ultimoPrecio: Number(e.target.value) })}
            />
          </div>

          {errorMap && <p className="text-sm text-destructive font-semibold">{errorMap}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={guardarMap} className="flex-1">
              {editMapId ? 'Guardar cambios' : 'Agregar producto'}
            </Button>
            <Button variant="secondary" onClick={() => setModalMapOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
