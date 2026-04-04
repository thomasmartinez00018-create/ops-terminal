const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error de servidor' }));
    throw new Error(error.error || `Error ${res.status}`);
  }
  return res.json();
}

function qs(params?: Record<string, string>) {
  return params ? '?' + new URLSearchParams(params).toString() : '';
}

export const api = {
  // Auth
  getUsuariosLogin: () => request<any[]>('/auth/usuarios'),
  login: (codigo: string, pin: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ codigo, pin }) }),

  // Productos
  getProductos: (params?: Record<string, string>) => request<any[]>(`/productos${qs(params)}`),
  getProducto: (id: number) => request<any>(`/productos/${id}`),
  createProducto: (data: any) =>
    request<any>('/productos', { method: 'POST', body: JSON.stringify(data) }),
  updateProducto: (id: number, data: any) =>
    request<any>(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProducto: (id: number) =>
    request<any>(`/productos/${id}`, { method: 'DELETE' }),

  // Depósitos
  getDepositos: (params?: Record<string, string>) => request<any[]>(`/depositos${qs(params)}`),
  createDeposito: (data: any) =>
    request<any>('/depositos', { method: 'POST', body: JSON.stringify(data) }),
  updateDeposito: (id: number, data: any) =>
    request<any>(`/depositos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDeposito: (id: number) =>
    request<any>(`/depositos/${id}`, { method: 'DELETE' }),

  // Usuarios
  getUsuarios: (params?: Record<string, string>) => request<any[]>(`/usuarios${qs(params)}`),
  createUsuario: (data: any) =>
    request<any>('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  updateUsuario: (id: number, data: any) =>
    request<any>(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUsuario: (id: number) =>
    request<any>(`/usuarios/${id}`, { method: 'DELETE' }),

  // Movimientos
  getMovimientos: (params?: Record<string, string>) => request<any[]>(`/movimientos${qs(params)}`),
  createMovimiento: (data: any) =>
    request<any>('/movimientos', { method: 'POST', body: JSON.stringify(data) }),

  // Stock
  getStock: (params?: Record<string, string>) => request<any[]>(`/stock${qs(params)}`),

  // Recetas
  getRecetas: (params?: Record<string, string>) => request<any[]>(`/recetas${qs(params)}`),
  getReceta: (id: number) => request<any>(`/recetas/${id}`),
  createReceta: (data: any) =>
    request<any>('/recetas', { method: 'POST', body: JSON.stringify(data) }),
  updateReceta: (id: number, data: any) =>
    request<any>(`/recetas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReceta: (id: number) =>
    request<any>(`/recetas/${id}`, { method: 'DELETE' }),
  getRecetaCosto: (id: number) => request<any>(`/recetas/${id}/costo`),

  // Proveedores
  getProveedores: (params?: Record<string, string>) => request<any[]>(`/proveedores${qs(params)}`),
  getProveedor: (id: number) => request<any>(`/proveedores/${id}`),
  createProveedor: (data: any) =>
    request<any>('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  updateProveedor: (id: number, data: any) =>
    request<any>(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedor: (id: number) =>
    request<any>(`/proveedores/${id}`, { method: 'DELETE' }),
  getProveedorProductos: (id: number) => request<any[]>(`/proveedores/${id}/productos`),
  createProveedorProducto: (proveedorId: number, data: any) =>
    request<any>(`/proveedores/${proveedorId}/productos`, { method: 'POST', body: JSON.stringify(data) }),
  updateProveedorProducto: (proveedorId: number, mapId: number, data: any) =>
    request<any>(`/proveedores/${proveedorId}/productos/${mapId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedorProducto: (proveedorId: number, mapId: number) =>
    request<any>(`/proveedores/${proveedorId}/productos/${mapId}`, { method: 'DELETE' }),
  compararPrecios: (productoId: number) => request<any[]>(`/proveedores/comparar-precios/${productoId}`),

  // Inventarios
  getInventarios: (params?: Record<string, string>) => request<any[]>(`/inventarios${qs(params)}`),
  getInventario: (id: number) => request<any>(`/inventarios/${id}`),
  createInventario: (data: any) =>
    request<any>('/inventarios', { method: 'POST', body: JSON.stringify(data) }),
  addInventarioDetalle: (id: number, data: any) =>
    request<any>(`/inventarios/${id}/detalles`, { method: 'POST', body: JSON.stringify(data) }),
  cerrarInventario: (id: number) =>
    request<any>(`/inventarios/${id}/cerrar`, { method: 'PUT' }),
  deleteInventario: (id: number) =>
    request<any>(`/inventarios/${id}`, { method: 'DELETE' }),
  getInventarioResumen: (id: number) => request<any>(`/inventarios/${id}/resumen`),

  // Importar
  importarCSV: (data: { tipo: string; datos: any[]; mapeo?: Record<string, string> }) =>
    request<any>('/importar/csv', { method: 'POST', body: JSON.stringify(data) }),
  getPlantilla: (tipo: string) => request<any>(`/importar/plantillas/${tipo}`),
  getMapeoMaxirest: () => request<any>('/importar/mapeo-maxirest'),

  // Reportes
  getDashboardStats: () => request<any>('/reportes/dashboard'),
  getReporteMovimientosPorTipo: (params?: Record<string, string>) =>
    request<any[]>(`/reportes/movimientos-por-tipo${qs(params)}`),
  getReporteMermas: (params?: Record<string, string>) =>
    request<any>(`/reportes/mermas${qs(params)}`),
  getStockValorizado: () => request<any[]>('/reportes/stock-valorizado'),
  getMovimientosPorProducto: (productoId: number, params?: Record<string, string>) =>
    request<any[]>(`/reportes/movimientos-por-producto/${productoId}${qs(params)}`),

  // Órdenes de Compra
  getOrdenesCompra: (params?: Record<string, string>) => request<any[]>(`/ordenes-compra${qs(params)}`),
  getOrdenCompra: (id: number) => request<any>(`/ordenes-compra/${id}`),
  createOrdenCompra: (data: any) =>
    request<any>('/ordenes-compra', { method: 'POST', body: JSON.stringify(data) }),
  updateOrdenCompra: (id: number, data: any) =>
    request<any>(`/ordenes-compra/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelarOrdenCompra: (id: number) =>
    request<any>(`/ordenes-compra/${id}/cancelar`, { method: 'PUT' }),
  recibirOrdenCompra: (id: number, data: any) =>
    request<any>(`/ordenes-compra/${id}/recibir`, { method: 'POST', body: JSON.stringify(data) }),

  // Scanner / Control
  scannerBuscarProducto: (barcode: string) => request<any>(`/scanner/producto/${encodeURIComponent(barcode)}`),
  scannerStockTeorico: (productoId: number, depositoId: number) =>
    request<any>(`/scanner/stock-teorico/${productoId}/${depositoId}`),
  scannerProductosDeposito: (depositoId: number) => request<any[]>(`/scanner/productos-deposito/${depositoId}`),

  // Discrepancias
  getDiscrepancias: () => request<any[]>('/reportes/discrepancias'),
  getTrazabilidad: (productoId: number, depositoId: number) =>
    request<any>(`/reportes/trazabilidad/${productoId}/${depositoId}`),

  // Tareas
  getTareas: (params?: Record<string, string>) => request<any[]>(`/tareas${qs(params)}`),
  getMisPendientes: (userId: number) => request<any>(`/tareas/mis-pendientes/${userId}`),
  createTarea: (data: any) =>
    request<any>('/tareas', { method: 'POST', body: JSON.stringify(data) }),
  updateTarea: (id: number, data: any) =>
    request<any>(`/tareas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  completarTarea: (id: number, observacion?: string) =>
    request<any>(`/tareas/${id}/completar`, { method: 'PUT', body: JSON.stringify({ observacion }) }),
  deleteTarea: (id: number) =>
    request<any>(`/tareas/${id}`, { method: 'DELETE' }),

  // Facturas / Escaner IA
  escanearFactura: (data: { imagen: string; mimeType?: string }) =>
    request<any>('/facturas/escanear', { method: 'POST', body: JSON.stringify(data) }),
  confirmarFactura: (data: any) =>
    request<any>('/facturas/confirmar', { method: 'POST', body: JSON.stringify(data) }),

  // Sync / Vincular
  syncExport: () => request<any>('/sync/export'),
  syncImport: (data: any) =>
    request<any>('/sync/import', { method: 'POST', body: JSON.stringify(data) }),

  // Elaboraciones
  getElaboraciones: (params?: Record<string, string>) => request<any[]>('/elaboraciones' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  createElaboracion: (data: any) => request<any>('/elaboraciones', { method: 'POST', body: JSON.stringify(data) }),
  getElaboracion: (id: number) => request<any>(`/elaboraciones/${id}`),
  getRecetasConProducto: () => request<any[]>('/recetas?activo=true'),

  // Contabilidad — Facturas
  getFacturas: (params?: Record<string, string>) => request<any[]>(`/contabilidad/facturas${qs(params)}`),
  getFactura: (id: number) => request<any>(`/contabilidad/facturas/${id}`),
  createFacturaManual: (data: any) =>
    request<any>('/contabilidad/facturas', { method: 'POST', body: JSON.stringify(data) }),
  updateFactura: (id: number, data: any) =>
    request<any>(`/contabilidad/facturas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  anularFactura: (id: number) =>
    request<any>(`/contabilidad/facturas/${id}/anular`, { method: 'PUT' }),
  vincularFacturaOC: (id: number, ordenCompraId: number | null) =>
    request<any>(`/contabilidad/facturas/${id}/vincular-oc`, { method: 'PUT', body: JSON.stringify({ ordenCompraId }) }),

  // Contabilidad — Pagos
  registrarPago: (facturaId: number, data: any) =>
    request<any>(`/contabilidad/facturas/${facturaId}/pagos`, { method: 'POST', body: JSON.stringify(data) }),
  eliminarPago: (pagoId: number) =>
    request<any>(`/contabilidad/pagos/${pagoId}`, { method: 'DELETE' }),

  // Asistente IA
  aiChat: (data: { message: string; pageContext?: string; historial?: { role: string; text: string }[] }) =>
    request<{ reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify(data) }),

  // Config / Reseteo
  getConfigStats: () => request<any>('/config/stats'),
  resetOperativo: (usuarioId: number) => request<any>('/config/reset-operativo', { method: 'POST', body: JSON.stringify({ usuarioId }) }),
  resetTotal: (usuarioId: number) => request<any>('/config/reset-total', { method: 'POST', body: JSON.stringify({ usuarioId }) }),

  // Contabilidad — Reportes
  getCuentasPorPagar: () => request<any>('/contabilidad/cuentas-por-pagar'),
  getSaldoProveedor: (proveedorId: number) => request<any>(`/contabilidad/saldo-proveedor/${proveedorId}`),
  getCogs: (params?: Record<string, string>) => request<any>(`/contabilidad/cogs${qs(params)}`),
  getHistorialPrecios: (productoId: number) => request<any[]>(`/contabilidad/historial-precios/${productoId}`),
};
