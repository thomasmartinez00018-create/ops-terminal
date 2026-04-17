import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import SearchableSelect from '../components/ui/SearchableSelect';
import PageTour from '../components/PageTour';
import DrawerModal from '../components/ui/DrawerModal';
import { Plus, Pencil, Trash2, Truck, Package, Phone, Mail, FileText, Search, DollarSign } from 'lucide-react';
import ExportMenu from '../components/ui/ExportMenu';
import type { ExportConfig } from '../lib/exportUtils';
import { todayStr } from '../lib/exportUtils';
import { useNavigate } from 'react-router-dom';

const RUBROS_SUGERIDOS = [
  'Verdulería', 'Carnicería', 'Fiambrería', 'Bebidas', 'Limpieza',
  'Descartables', 'Lácteos', 'Secos/Almacén', 'Panadería', 'Congelados',
  'Especias', 'Aceites', 'Pescadería',
];

const emptyProveedorForm = {
  codigo: '',
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  whatsapp: '',
  rubro: '',
  descuentoPct: 0,
  aplicaIva: false,
  aplicaPercepcion: false,
  impuestoInterno: 0,
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
  const navigate = useNavigate();
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

  const [buscarProv, setBuscarProv] = useState('');
  const productosSectionRef = useRef<HTMLDivElement | null>(null);

  const cargarProveedores = () => {
    api.getProveedores({ activo: 'true' }).then(setProveedores).catch(console.error);
  };

  useEffect(() => {
    cargarProveedores();
    api.getProductos({ activo: 'true' }).then(setProductos).catch(console.error);
  }, []);

  // Filtrado client-side — la lista de proveedores rara vez pasa de 100,
  // así que no vale la pena round-trip al backend.
  const proveedoresFiltrados = useMemo(() => {
    const q = buscarProv.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p: any) => {
      const blob = [p.codigo, p.nombre, p.rubro, p.contacto, p.telefono, p.email, p.whatsapp]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [proveedores, buscarProv]);

  const cargarProductosProveedor = (prov: any, opts?: { scroll?: boolean }) => {
    setSelectedProveedor(prov);
    api.getProveedorProductos(prov.id).then(setProveedorProductos).catch(console.error);
    if (opts?.scroll) {
      // Dar un tick al render de la sección antes de scrollear
      setTimeout(() => {
        productosSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
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
        whatsapp: prov.whatsapp || '',
        rubro: prov.rubro || '',
        descuentoPct: prov.descuentoPct || 0,
        aplicaIva: prov.aplicaIva || false,
        aplicaPercepcion: prov.aplicaPercepcion || false,
        impuestoInterno: prov.impuestoInterno || 0,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Compras</p>
          <h1 className="text-xl font-extrabold text-foreground mt-1">Proveedores</h1>
        </div>
        <div className="flex gap-2">
          <ExportMenu size="sm" disabled={proveedores.length === 0} getConfig={() => ({
            title: 'Proveedores',
            filename: `proveedores-${todayStr()}`,
            headers: ['Codigo', 'Nombre', 'Rubro', 'Contacto', 'Telefono', 'Email'],
            rows: proveedores.map((p: any) => [p.codigo, p.nombre, p.rubro || '', p.contacto || '', p.telefono || '', p.email || '']),
            summary: [{ label: 'Total proveedores', value: proveedores.length }],
          } as ExportConfig)} />
          <Button onClick={() => abrirProv()}>
            <Plus size={16} /> Nuevo proveedor
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-5 relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
        <Input
          value={buscarProv}
          onChange={e => setBuscarProv(e.target.value)}
          placeholder="Buscar por nombre, código, rubro, contacto, teléfono…"
          className="pl-9"
        />
        {buscarProv && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant">
            {proveedoresFiltrados.length} / {proveedores.length}
          </span>
        )}
      </div>

      {/* Proveedores grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 stagger-children">
        {proveedoresFiltrados.map(prov => (
          <div
            key={prov.id}
            onClick={() => cargarProductosProveedor(prov, { scroll: true })}
            className={`glass card-glow rounded-xl p-4 cursor-pointer transition-all ${
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
            {prov.rubro && (
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">{prov.rubro}</span>
            )}
            {/* Tax badges */}
            {(prov.aplicaIva || prov.aplicaPercepcion || prov.descuentoPct > 0 || prov.impuestoInterno > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {prov.aplicaIva && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400">IVA 21%</span>}
                {prov.aplicaPercepcion && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-400">Perc 3%</span>}
                {prov.descuentoPct > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400">-{prov.descuentoPct}%</span>}
                {prov.impuestoInterno > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400">II {prov.impuestoInterno}%</span>}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                onClick={e => { e.stopPropagation(); cargarProductosProveedor(prov, { scroll: true }); }}
                className="flex items-center gap-1.5 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors uppercase tracking-wider"
                title="Ver lista de precios y productos de este proveedor"
              >
                <DollarSign size={11} />
                Ver precios
              </button>
              <button
                onClick={e => { e.stopPropagation(); navigate(`/facturas?proveedorId=${prov.id}`); }}
                className="flex items-center gap-1.5 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors uppercase tracking-wider"
              >
                <FileText size={11} />
                Ver facturas
              </button>
            </div>
          </div>
        ))}
        {proveedoresFiltrados.length === 0 && (
          <div className="col-span-full text-center py-12 text-on-surface-variant font-medium">
            {buscarProv
              ? `No hay proveedores que coincidan con "${buscarProv}"`
              : 'No hay proveedores activos'}
          </div>
        )}
      </div>

      {/* Productos del proveedor seleccionado */}
      {selectedProveedor && (
        <div ref={productosSectionRef} className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">Lista de precios de</p>
                <h2 className="text-base font-extrabold text-foreground">{selectedProveedor.nombre}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ExportMenu
                size="sm"
                disabled={proveedorProductos.length === 0}
                getConfig={() => {
                  const rows = proveedorProductos.map(pp => {
                    const prod = pp.productoId ? productos.find(p => p.id === pp.productoId) : null;
                    const esPendiente = pp.fuente === 'lista';
                    return [
                      prod?.codigo || (esPendiente ? '(pendiente)' : ''),
                      prod?.nombre || (esPendiente ? pp.nombreProveedor : ''),
                      pp.nombreProveedor || '',
                      pp.codigoProveedor || '',
                      pp.unidadProveedor || pp.presentacionOriginal || '',
                      pp.factorConversion ?? 1,
                      pp.ultimoPrecio ?? 0,
                      pp.fechaPrecio || '',
                    ];
                  });
                  return {
                    title: `Lista de precios — ${selectedProveedor.nombre}`,
                    filename: `lista-precios-${selectedProveedor.nombre.toLowerCase().replace(/\s+/g, '-')}-${todayStr()}`,
                    headers: ['Código', 'Producto', 'Nombre prov.', 'Código prov.', 'Unidad prov.', 'Factor', 'Último precio', 'Fecha'],
                    rows,
                    summary: [
                      { label: 'Proveedor', value: selectedProveedor.nombre },
                      { label: 'Productos', value: proveedorProductos.length },
                      { label: 'Generado', value: new Date().toLocaleDateString('es-AR') },
                    ],
                    currencyColumns: [6],
                    numberColumns: [5],
                  } as ExportConfig;
                }}
              />
              <Button size="sm" onClick={() => abrirMap()}>
                <Plus size={14} /> Agregar producto
              </Button>
            </div>
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
                    const prod = pp.productoId
                      ? productos.find(p => p.id === pp.productoId)
                      : null;
                    const esPendiente = pp.fuente === 'lista';
                    return (
                      <tr key={pp.id} className={`hover:bg-surface-high/50 transition-colors ${esPendiente ? 'bg-amber-500/[0.04]' : ''}`}>
                        <td className="p-3">
                          {prod ? (
                            <>
                              <p className="font-semibold text-foreground">{prod.nombre}</p>
                              <p className="font-mono text-xs text-primary">{prod.codigo}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-semibold text-foreground">{pp.nombreProveedor || `#${pp.productoId ?? '—'}`}</p>
                              {esPendiente && (
                                <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400"
                                      title="Importado desde lista de precios, falta vincular con un producto interno">
                                  PENDIENTE · {pp.listaPrecioCodigo || 'Lista'}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="p-3 text-on-surface-variant hidden sm:table-cell">
                          {pp.nombreProveedor || '-'}
                          {pp.presentacionOriginal && (
                            <p className="text-[10px] text-on-surface-variant/70 mt-0.5">{pp.presentacionOriginal}</p>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs text-on-surface-variant hidden md:table-cell">{pp.codigoProveedor || '-'}</td>
                        <td className="p-3 text-on-surface-variant hidden lg:table-cell">{pp.unidadProveedor || '-'}</td>
                        <td className="p-3 text-on-surface-variant hidden lg:table-cell">{pp.factorConversion ?? '-'}</td>
                        <td className="p-3 text-right font-bold text-foreground">{formatPrecio(pp.ultimoPrecio)}</td>
                        <td className="p-3 text-right text-on-surface-variant hidden sm:table-cell">{formatFecha(pp.fechaPrecio)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {esPendiente ? (
                              <button
                                onClick={() => navigate(`/importar-lista?listaId=${pp.listaPrecioId}`)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors uppercase tracking-wider"
                                title="Ir a la lista de precios para vincular este item"
                              >
                                Vincular
                              </button>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {proveedorProductos.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-on-surface-variant font-medium">
                        <p>Este proveedor no tiene precios cargados todavía.</p>
                        <p className="text-xs mt-2 text-on-surface-variant/70">
                          Podés agregar productos manualmente, importar una lista de precios (PDF/Excel)
                          o confirmar una factura de este proveedor — se auto-cargan acá.
                        </p>
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
      <DrawerModal
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
          <Input
            label="WhatsApp"
            id="prov-whatsapp"
            value={provForm.whatsapp}
            onChange={e => setProvForm({ ...provForm, whatsapp: e.target.value })}
            placeholder="1145678901"
          />
          <div>
            <label htmlFor="prov-rubro" className="block text-xs font-semibold text-on-surface-variant mb-1">Rubro</label>
            <input
              list="rubros-sugeridos"
              id="prov-rubro"
              value={provForm.rubro}
              onChange={e => setProvForm({ ...provForm, rubro: e.target.value })}
              placeholder="Ej: Verdulería, Carnicería..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <datalist id="rubros-sugeridos">
              {RUBROS_SUGERIDOS.map(r => <option key={r} value={r} />)}
            </datalist>
          </div>

          {/* Tax/discount fields */}
          <div className="border-t border-border pt-3 mt-3">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Impuestos y descuentos</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Descuento %"
                id="prov-descuento"
                type="number"
                value={provForm.descuentoPct}
                onChange={e => setProvForm({ ...provForm, descuentoPct: Number(e.target.value) })}
              />
              <Input
                label="Impuesto Interno %"
                id="prov-impInt"
                type="number"
                value={provForm.impuestoInterno}
                onChange={e => setProvForm({ ...provForm, impuestoInterno: Number(e.target.value) })}
              />
            </div>
            <div className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                <input type="checkbox" checked={provForm.aplicaIva}
                  onChange={e => setProvForm({ ...provForm, aplicaIva: e.target.checked })}
                  className="accent-primary" />
                IVA 21%
              </label>
              <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                <input type="checkbox" checked={provForm.aplicaPercepcion}
                  onChange={e => setProvForm({ ...provForm, aplicaPercepcion: e.target.checked })}
                  className="accent-primary" />
                Percepcion 3%
              </label>
            </div>
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
      </DrawerModal>

      {/* Modal mapeo producto */}
      <DrawerModal
        open={modalMapOpen}
        onClose={() => setModalMapOpen(false)}
        title={editMapId ? 'Editar producto' : 'Agregar producto'}
      >
        <div className="space-y-3">
          <SearchableSelect
            label="Producto"
            id="map-producto"
            value={mapForm.productoId}
            onChange={v => setMapForm({ ...mapForm, productoId: v })}
            options={productos.map(p => ({ value: p.id.toString(), label: `${p.codigo} - ${p.nombre}` }))}
            placeholder="Buscar producto..."
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
              label="Unidades por compra"
              id="map-factor"
              type="number"
              inputMode="decimal"
              value={mapForm.factorConversion}
              onChange={e => setMapForm({ ...mapForm, factorConversion: Number(e.target.value) })}
              placeholder="ej: 12 si viene cajón de 12"
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
      </DrawerModal>
    </div>
  );
}
