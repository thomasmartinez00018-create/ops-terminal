// ── API base URL ────────────────────────────────────────────────────────────
// - En prod cloud: VITE_API_URL=https://ops-terminal-backend.up.railway.app
// - En dev local: VITE_API_URL=http://localhost:3001 (o sin setear → /api)
// - En Electron cloud shell: VITE_API_URL baked al build time
// Si VITE_API_URL no existe, usamos /api relativo (modo legacy single-server).
const RAW_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = RAW_BASE ? `${RAW_BASE}/api` : '/api';

// ── Token storage ───────────────────────────────────────────────────────────
const TOKEN_KEY = 'ops_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// ── Evento global para 401 → forzar logout/redirect ─────────────────────────
// Listener se registra en AuthContext. Así cualquier 401 desde cualquier
// ruta de la app cierra sesión y vuelve al login automáticamente.
export const AUTH_ERROR_EVENT = 'ops:auth-error';

// ── JWT stage decoder (client-side, sin firma) ──────────────────────────────
// El backend firma tokens en 3 "stages": cuenta, org, staff. Lo usamos para
// decidir qué pantalla mostrar al cargar la app (login / workspaces / staff
// login / main). NO es una validación de seguridad — solo es para routing.
// La validación real la hace el backend en cada request.
export type TokenStage = 'none' | 'cuenta' | 'org' | 'staff';
export function getTokenStage(): TokenStage {
  const token = getToken();
  if (!token) return 'none';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.kind === 'cuenta') return 'cuenta';
    if (payload.kind === 'org') return 'org';
    if (payload.kind === 'staff') return 'staff';
  } catch {}
  return 'none';
}
export function decodeToken(): any | null {
  const token = getToken();
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

// Indica si el token actual fue emitido por un canje de device pairing code.
// Si es así, la UI oculta opciones de "cambiar workspace", "crear workspace"
// y "generar código de pairing" (un dispositivo bindeado no debería hacer
// esas cosas porque expondrían datos del dueño).
export function isPairedDevice(): boolean {
  const p = decodeToken();
  return Boolean(p && p.pairedDevice === true);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    // Token inválido o expirado → disparar evento global
    setToken(null);
    window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
    const err = await res.json().catch(() => ({ error: 'Sesión expirada' }));
    throw new Error(err.error || 'Sesión expirada');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Error de servidor' }));
    throw new Error(error.error || `Error ${res.status}`);
  }
  return res.json();
}

function qs(params?: Record<string, string>) {
  return params ? '?' + new URLSearchParams(params).toString() : '';
}

// ── Tipos expuestos para el frontend ────────────────────────────────────────
export interface CuentaInfo {
  id: number;
  email: string;
  nombre: string;
  emailVerificado?: boolean;
}
export interface WorkspaceInfo {
  id: number;
  nombre: string;
  slug: string;
  plan: string;
  estadoSuscripcion: string;
  rol: string;
}
export interface CuentaLoginResponse {
  token: string;
  cuenta: CuentaInfo;
  workspaces: WorkspaceInfo[];
  claimedDefault?: boolean;
}
export interface SwitchWorkspaceResponse {
  token: string;
  workspace: WorkspaceInfo;
}
// ── Alertas de precio (variaciones detectadas en facturas) ─────────────────
// Producida por el backend cuando una factura trae un item con precio
// distinto al del histórico (producto × proveedor). Ver
// packages/backend/src/lib/alertasPrecio.ts.
export interface AlertaPrecio {
  id: number;
  productoId: number;
  proveedorId: number | null;
  facturaId: number | null;
  facturaItemId: number | null;
  precioAnterior: number;
  precioNuevo: number;
  variacionPct: number;          // signed: +15.2 | -8.1
  severidad: 'leve' | 'media' | 'alta';
  direccion: 'sube' | 'baja';
  unidad: string | null;
  fuenteAnterior: 'factura' | 'proveedor_producto' | null;
  fechaAnterior: string | null;
  estado: 'pendiente' | 'revisada' | 'descartada';
  revisadoPorId: number | null;
  fechaRevision: string | null;
  observacion: string | null;
  createdAt: string;
  // Relaciones que puede incluir el backend en el GET /lista y /detalle
  producto?: { id: number; codigo: string; nombre: string; unidadCompra?: string | null };
  proveedor?: { id: number; nombre: string } | null;
  factura?: { id: number; numero: string; fecha: string; tipoComprobante: string } | null;
  revisadoPor?: { id: number; nombre: string } | null;
}

// Variación detectada ANTES de persistirse. Es lo que el backend devuelve en
// el response de /facturas/confirmar y /contabilidad/facturas para que la
// UI muestre un modal inmediatamente después del confirm.
export interface VariacionDetectada {
  productoId: number;
  productoNombre: string;
  productoCodigo: string;
  proveedorId: number | null;
  precioAnterior: number;
  precioNuevo: number;
  variacionPct: number;
  variacionAbs: number;
  severidad: 'leve' | 'media' | 'alta';
  direccion: 'sube' | 'baja';
  unidad: string | null;
  fuenteAnterior: 'factura' | 'proveedor_producto';
  fechaAnterior: string | null;
  facturaItemId: number | null;
}

// Historial de precios para el detalle de una alerta (últimas N compras)
export interface AlertaPrecioHistorialItem {
  facturaItemId: number;
  facturaId: number;
  facturaNumero: string;
  fecha: string;
  precio: number;
  cantidad: number;
  unidad: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
}

// ── Template de rubro (onboarding de workspace nuevo) ──────────────────────
export interface WorkspaceTemplateSummary {
  id: string;                    // 'kiosco' | 'restaurante' | 'sushi' | ...
  nombre: string;                // label visible
  descripcion: string;           // 1 línea para la card
  icono: string;                 // nombre del ícono lucide-react
  color: string;                 // acento visual (hex)
  totalDepositos: number;
  totalProductos: number;
  previewProductos: string[];    // primeros 6 productos para el preview
  rubros: string[];              // lista de rubros únicos cubiertos
}

export const api = {
  // ── Cuenta (stage 1) — signup, login, workspaces, switch ──────────────────
  cuentaSignup: (data: { email: string; password: string; nombre: string; orgNombre?: string }) =>
    request<CuentaLoginResponse>('/cuenta/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  cuentaLogin: (email: string, password: string) =>
    request<CuentaLoginResponse>('/cuenta/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  cuentaMe: () => request<CuentaInfo>('/cuenta/me'),
  listWorkspaces: () => request<WorkspaceInfo[]>('/cuenta/workspaces'),
  createWorkspace: (nombre: string, templateId?: string) =>
    request<WorkspaceInfo>('/cuenta/workspaces', {
      method: 'POST',
      body: JSON.stringify({ nombre, templateId: templateId ?? null }),
    }),
  // Templates de rubro disponibles para precargar un workspace nuevo
  listTemplates: () => request<WorkspaceTemplateSummary[]>('/cuenta/templates'),
  switchWorkspace: (organizacionId: number) =>
    request<SwitchWorkspaceResponse>('/cuenta/switch', {
      method: 'POST',
      body: JSON.stringify({ organizacionId }),
    }),
  cuentaLogout: () => request<{ ok: boolean }>('/cuenta/logout', { method: 'POST' }),
  // Baja un token stage 2/3 a stage 1 (selector de workspace) sin pedir
  // password. Se usa desde dentro de la app para "Cambiar workspace".
  downgradeToStage1: () =>
    request<CuentaLoginResponse>('/cuenta/to-stage-1', { method: 'POST' }),

  // ── Device pairing — vincular un dispositivo nuevo sin compartir credenciales
  // Admin en dispositivo autenticado → genera código de 6 dígitos (TTL 10 min)
  pairGenerate: () =>
    request<{ codigo: string; expiraEn: string; ttlSegundos: number }>(
      '/cuenta/pair/generate',
      { method: 'POST' },
    ),
  // Empleado en dispositivo nuevo (sin auth) → canjea código → recibe stage 2
  pairRedeem: (codigo: string) =>
    request<SwitchWorkspaceResponse>('/cuenta/pair/redeem', {
      method: 'POST',
      body: JSON.stringify({ codigo }),
    }),

  // ── Auth staff (stage 2 → 3) — selector de usuario + PIN ──────────────────
  getUsuariosLogin: () => request<any[]>('/auth/usuarios'),
  login: (codigo: string, pin: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ codigo, pin }),
    }),
  me: () => request<any>('/auth/me'),
  bootstrapAdmin: (data: { codigo: string; nombre: string; pin: string }) =>
    request<{ id: number; codigo: string; nombre: string; rol: string }>(
      '/auth/bootstrap-admin',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Productos
  getProductos: (params?: Record<string, string>) => request<any[]>(`/productos${qs(params)}`),
  getProducto: (id: number) => request<any>(`/productos/${id}`),
  createProducto: (data: any) =>
    request<any>('/productos', { method: 'POST', body: JSON.stringify(data) }),
  updateProducto: (id: number, data: any) =>
    request<any>(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProducto: (id: number) =>
    request<any>(`/productos/${id}`, { method: 'DELETE' }),
  getSubrubros: (rubro?: string) =>
    request<string[]>(`/productos/subrubros/lista${rubro ? `?rubro=${encodeURIComponent(rubro)}` : ''}`),
  getRubrosConConteo: () =>
    request<{ rubro: string; cantProductos: number }[]>(`/productos/rubros/con-conteo`),
  renameRubro: (rubroViejo: string, rubroNuevo: string) =>
    request<{ actualizados: number; rubroViejo: string; rubroNuevo: string }>(
      `/productos/rubros/rename`,
      { method: 'PUT', body: JSON.stringify({ rubroViejo, rubroNuevo }) }
    ),

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
  createMovimientosBatch: (data: any) =>
    request<any>('/movimientos/batch', { method: 'POST', body: JSON.stringify(data) }),

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

  // Porcionado
  getPorcionados: (params?: Record<string, string>) => request<any[]>(`/porcionado${qs(params)}`),
  createPorcionado: (data: any) =>
    request<any>('/porcionado', { method: 'POST', body: JSON.stringify(data) }),
  getPorcionado: (id: number) => request<any>(`/porcionado/${id}`),

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
  getCogsDetalle: (params: { rubro: string; desde?: string; hasta?: string }) =>
    request<any>(`/contabilidad/cogs/detalle${qs(params as any)}`),
  getHistorialPrecios: (productoId: number) => request<any[]>(`/contabilidad/historial-precios/${productoId}`),

  // Listas de Precio
  getListasPrecio: () => request<any[]>('/listas-precio'),
  getListaPrecio: (id: number) => request<any>(`/listas-precio/${id}`),
  importarListaPrecio: (formData: FormData) => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
    return fetch(`${API_BASE}/listas-precio/importar`, { method: 'POST', headers, body: formData, signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (res.status === 401) { setToken(null); window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT)); throw new Error('Sesión expirada'); }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        return data;
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error('La importación tardó demasiado. Intentá con un archivo más chico.');
        throw err;
      });
  },
  matchListaItem: (listaId: number, data: { itemId: number; productoId: number }) =>
    request<any>(`/listas-precio/${listaId}/match`, { method: 'POST', body: JSON.stringify(data) }),
  matchListaAI: (listaId: number) =>
    request<any>(`/listas-precio/${listaId}/match-ai`, { method: 'POST' }),
  applyMatches: (listaId: number, data: { matches: { itemId: number; productoId: number }[] }) =>
    request<any>(`/listas-precio/${listaId}/apply-matches`, { method: 'POST', body: JSON.stringify(data) }),
  deleteListaPrecio: (id: number) =>
    request<any>(`/listas-precio/${id}`, { method: 'DELETE' }),

  // Comparador
  getComparativa: (params?: Record<string, string>) => request<any[]>(`/comparador${qs(params)}`),
  getEvolucion: (productoId: number, params?: Record<string, string>) =>
    request<any[]>(`/comparador/evolucion/${productoId}${qs(params)}`),
  getProveedoresImpuestos: () => request<any[]>('/comparador/proveedores-impuestos'),

  // ── Suscripciones / Billing (Mercado Pago) ────────────────────────────
  getPlanesPublicos: () =>
    request<{ mensuales: any[]; anuales: any[] }>('/planes'),
  getSuscripcionActual: () =>
    request<any>('/suscripciones/actual'),
  getSuscripcionPagos: () =>
    request<{ pagos: any[] }>('/suscripciones/pagos'),
  subscribePlan: (plan: string, payerEmail: string) =>
    request<{ initPoint: string; preapprovalId: string; plan: string }>(
      '/suscripciones/subscribe',
      { method: 'POST', body: JSON.stringify({ plan, payerEmail }) },
    ),
  pauseSuscripcion: () =>
    request<any>('/suscripciones/pause', { method: 'POST' }),
  resumeSuscripcion: () =>
    request<any>('/suscripciones/resume', { method: 'POST' }),
  cancelSuscripcion: (motivo?: string) =>
    request<any>('/suscripciones/cancel', {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    }),
  syncSuscripcion: () =>
    request<any>('/suscripciones/sync', { method: 'POST' }),

  // ── Reposición encadenada ─────────────────────────────────────────────
  // Alertas calculadas en vivo (no se persisten hasta que se genera una orden)
  getAlertasReposicion: () =>
    request<{
      total: number;
      alertas: Array<{
        productoId: number;
        productoCodigo: string;
        productoNombre: string;
        unidad: string;
        depositoId: number;
        depositoCodigo: string;
        depositoNombre: string;
        stockActual: number;
        stockMinimo: number;
        stockObjetivo: number;
        puntoReposicion: number;
        cantidadSugerida: number;
        fuenteParametros: 'parametro' | 'producto' | 'vacio';
        depositoPadreId: number | null;
        depositoPadreNombre: string | null;
        stockEnPadre: number | null;
        puedeReponerDesdePadre: boolean;
        requiereCompra: boolean;
      }>;
      resumen: { paraTransferir: number; paraComprar: number; conStockPadreSuficiente: number };
    }>('/reposicion/alertas'),

  generarOrdenesReposicion: () =>
    request<{
      ordenesCreadas: number;
      ordenes: any[];
      paraComprar?: number;
      mensaje?: string;
    }>('/reposicion/generar-ordenes', { method: 'POST' }),

  getOrdenesReposicion: (params?: Record<string, string>) =>
    request<any[]>(`/reposicion${qs(params)}`),

  getOrdenReposicion: (id: number) =>
    request<any>(`/reposicion/${id}`),

  confirmarOrdenReposicion: (id: number, data: {
    asignadoAId?: number;
    items?: Array<{ id: number; cantidadConfirmada: number; observacion?: string }>;
    observacion?: string;
  }) =>
    request<any>(`/reposicion/${id}/confirmar`, { method: 'PUT', body: JSON.stringify(data) }),

  ejecutarOrdenReposicion: (id: number) =>
    request<any>(`/reposicion/${id}/ejecutar`, { method: 'PUT' }),

  cancelarOrdenReposicion: (id: number) =>
    request<any>(`/reposicion/${id}/cancelar`, { method: 'PUT' }),

  createOrdenReposicionManual: (data: {
    depositoOrigenId: number;
    depositoDestinoId: number;
    items: Array<{ productoId: number; cantidad: number; unidad: string; observacion?: string }>;
    observacion?: string;
    asignadoAId?: number;
  }) =>
    request<any>('/reposicion/manual', { method: 'POST', body: JSON.stringify(data) }),

  // Parámetros de reposición por producto × depósito
  getParametrosReposicion: (params?: Record<string, string>) =>
    request<any[]>(`/reposicion/parametros/lista${qs(params)}`),

  saveParametrosReposicion: (parametros: Array<{
    productoId: number;
    depositoId: number;
    stockMinimo?: number | null;
    stockObjetivo?: number | null;
    puntoReposicion?: number | null;
  }>) =>
    request<{ actualizados: number; parametros: any[] }>('/reposicion/parametros', {
      method: 'PUT',
      body: JSON.stringify({ parametros }),
    }),

  // Depósitos — árbol jerárquico
  getDepositosArbol: () => request<any[]>('/depositos/arbol'),

  // ── Alertas de precio ─────────────────────────────────────────────────────
  // Bandeja de variaciones detectadas al confirmar facturas. Ver
  // packages/backend/src/routes/alertas-precio.ts
  getAlertasPrecio: (params?: Record<string, string>) =>
    request<{ total: number; alertas: AlertaPrecio[] }>(`/alertas-precio${qs(params)}`),

  getAlertasPrecioCount: () =>
    request<{ pendientes: number; altaPendientes: number }>('/alertas-precio/count'),

  getAlertasPrecioResumen: () =>
    request<{
      porEstado: Record<string, number>;
      porSeveridad: Record<string, number>;
      porDireccion: Record<string, number>;
      topProductos: Array<{ id?: number; codigo?: string; nombre?: string; count: number }>;
      topProveedores: Array<{ id?: number; nombre?: string; count: number }>;
    }>('/alertas-precio/resumen'),

  getAlertaPrecio: (id: number) =>
    request<{ alerta: AlertaPrecio; historial: AlertaPrecioHistorialItem[] }>(
      `/alertas-precio/${id}`,
    ),

  revisarAlertaPrecio: (id: number, observacion?: string) =>
    request<AlertaPrecio>(`/alertas-precio/${id}/revisar`, {
      method: 'PUT',
      body: JSON.stringify({ observacion }),
    }),

  descartarAlertaPrecio: (id: number, observacion?: string) =>
    request<AlertaPrecio>(`/alertas-precio/${id}/descartar`, {
      method: 'PUT',
      body: JSON.stringify({ observacion }),
    }),

  bulkRevisarAlertasPrecio: (ids: number[], observacion?: string) =>
    request<{ actualizadas: number }>('/alertas-precio/bulk/revisar', {
      method: 'PUT',
      body: JSON.stringify({ ids, observacion }),
    }),

  deleteAlertaPrecio: (id: number) =>
    request<{ ok: boolean }>(`/alertas-precio/${id}`, { method: 'DELETE' }),
};
