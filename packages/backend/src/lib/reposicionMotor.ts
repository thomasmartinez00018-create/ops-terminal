import prisma from './prisma';

// ============================================================================
// Motor de reposición encadenada
// ============================================================================
// Calcula el stock actual por producto×depósito usando la misma lógica que
// /api/stock (on-demand desde movimientos — no hay tabla persistida), y
// detecta qué depósitos están por debajo del punto de reposición según los
// parámetros vigentes. Para cada (producto, depósito destino) deficitario,
// propone una reposición desde el depósito PADRE (cadena jerárquica) o, si
// no hay padre, la marca como "requiere compra externa".
//
// La parametrización es en cascada:
//   1. Si existe StockParametro específico (producto × depósito) → usarlo.
//   2. Si no, usar los valores globales de Producto (stockMinimo/stockIdeal).
//   3. Si ambos son 0/null → no genera alerta (el producto no se controla).
//
// El motor NUNCA toca la tabla movimientos — solo DETECTA y SUGIERE. La
// confirmación y el movimiento real los ejecuta el router cuando un humano
// aprueba una OrdenReposicion. Esto preserva la regla crítica del cliente:
// "nada se descuenta sin confirmación humana".
// ============================================================================

export interface ParametrosEfectivos {
  stockMinimo: number;
  stockObjetivo: number;
  puntoReposicion: number;
  fuente: 'parametro' | 'producto' | 'vacio';
}

export interface AlertaReposicion {
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
  fuenteParametros: ParametrosEfectivos['fuente'];
  // Fuente de reposición propuesta
  depositoPadreId: number | null;
  depositoPadreNombre: string | null;
  stockEnPadre: number | null; // null si no hay padre
  puedeReponerDesdePadre: boolean; // true si hay padre y tiene suficiente stock
  requiereCompra: boolean; // true si no hay padre (compra a proveedor)
}

export interface StockDetalle {
  productoId: number;
  depositoId: number;
  cantidad: number;
}

// Tipos de movimiento (mismos que stock.ts)
const TIPOS_ENTRADA = ['ingreso', 'elaboracion', 'devolucion'];
const TIPOS_SALIDA = ['merma', 'consumo_interno', 'venta'];

/**
 * Calcula el stock actual por (producto × depósito) leyendo TODOS los
 * movimientos de la org. Devuelve un Map con key `${productoId}-${depositoId}`.
 * Esto es O(N) sobre movimientos — aceptable porque el motor corre on-demand
 * cuando el usuario pide "detectar reposiciones", no en cada request.
 */
export async function calcularStockMap(): Promise<Map<string, number>> {
  const movimientos = await prisma.movimiento.findMany({
    select: {
      tipo: true,
      productoId: true,
      depositoOrigenId: true,
      depositoDestinoId: true,
      cantidad: true,
    },
  });

  const stockMap = new Map<string, number>();

  for (const mov of movimientos) {
    const { tipo, productoId, depositoOrigenId, depositoDestinoId, cantidad } = mov;

    if (tipo === 'transferencia') {
      if (depositoOrigenId) {
        const k = `${productoId}-${depositoOrigenId}`;
        stockMap.set(k, (stockMap.get(k) || 0) - cantidad);
      }
      if (depositoDestinoId) {
        const k = `${productoId}-${depositoDestinoId}`;
        stockMap.set(k, (stockMap.get(k) || 0) + cantidad);
      }
    } else if (tipo === 'ajuste') {
      if (depositoDestinoId) {
        const k = `${productoId}-${depositoDestinoId}`;
        stockMap.set(k, (stockMap.get(k) || 0) + cantidad);
      }
    } else if (TIPOS_ENTRADA.includes(tipo)) {
      const depId = depositoDestinoId || depositoOrigenId;
      if (depId) {
        const k = `${productoId}-${depId}`;
        stockMap.set(k, (stockMap.get(k) || 0) + cantidad);
      }
    } else if (TIPOS_SALIDA.includes(tipo)) {
      const depId = depositoOrigenId || depositoDestinoId;
      if (depId) {
        const k = `${productoId}-${depId}`;
        stockMap.set(k, (stockMap.get(k) || 0) - cantidad);
      }
    }
  }

  return stockMap;
}

/**
 * Helper: obtiene el stock de un producto en un depósito puntual desde el Map.
 */
export function getStock(stockMap: Map<string, number>, productoId: number, depositoId: number): number {
  const v = stockMap.get(`${productoId}-${depositoId}`) || 0;
  return Math.round(v * 100) / 100;
}

/**
 * Resuelve los parámetros de reposición efectivos para un (producto, depósito).
 * Prioriza StockParametro específico; fallback a Producto.stockMinimo/stockIdeal.
 * Si el producto no tiene controles configurados, devuelve { fuente: 'vacio' }.
 */
export function resolverParametros(
  producto: { stockMinimo: number; stockIdeal: number },
  parametroEspecifico: {
    stockMinimo: number | null;
    stockObjetivo: number | null;
    puntoReposicion: number | null;
  } | null,
): ParametrosEfectivos {
  if (parametroEspecifico) {
    const min = parametroEspecifico.stockMinimo ?? producto.stockMinimo ?? 0;
    const obj = parametroEspecifico.stockObjetivo ?? producto.stockIdeal ?? 0;
    // Punto de reposición: si no se especifica, usar el mínimo.
    const punto = parametroEspecifico.puntoReposicion ?? min;
    if (min === 0 && obj === 0) return { stockMinimo: 0, stockObjetivo: 0, puntoReposicion: 0, fuente: 'vacio' };
    return { stockMinimo: min, stockObjetivo: obj, puntoReposicion: punto, fuente: 'parametro' };
  }

  const min = producto.stockMinimo ?? 0;
  const obj = producto.stockIdeal ?? 0;
  if (min === 0 && obj === 0) return { stockMinimo: 0, stockObjetivo: 0, puntoReposicion: 0, fuente: 'vacio' };
  return {
    stockMinimo: min,
    stockObjetivo: obj,
    // Sin parámetro específico, el mínimo oficia de punto de reposición.
    puntoReposicion: min,
    fuente: 'producto',
  };
}

/**
 * Detecta TODAS las alertas de reposición de la organización:
 * - Recorre productos activos × depósitos activos.
 * - Aplica la jerarquía de parámetros.
 * - Para cada par deficitario, propone desde padre (si existe) o marca compra.
 *
 * Devuelve el array ordenado por urgencia (déficit relativo descendente).
 */
export async function detectarAlertas(): Promise<AlertaReposicion[]> {
  const [productos, depositos, parametros, stockMap] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        unidadUso: true,
        stockMinimo: true,
        stockIdeal: true,
      },
    }),
    prisma.deposito.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, depositoPadreId: true },
    }),
    prisma.stockParametro.findMany({
      where: { activo: true },
      select: {
        productoId: true,
        depositoId: true,
        stockMinimo: true,
        stockObjetivo: true,
        puntoReposicion: true,
      },
    }),
    calcularStockMap(),
  ]);

  // Indexar parámetros por (producto, depósito)
  const paramMap = new Map<string, typeof parametros[number]>();
  for (const p of parametros) {
    paramMap.set(`${p.productoId}-${p.depositoId}`, p);
  }
  const depositoById = new Map(depositos.map(d => [d.id, d]));

  const alertas: AlertaReposicion[] = [];

  for (const prod of productos) {
    for (const dep of depositos) {
      const paramKey = `${prod.id}-${dep.id}`;
      const paramEsp = paramMap.get(paramKey);
      const efectivos = resolverParametros(prod, paramEsp ?? null);
      // Si el producto no tiene controles en este depósito, saltamos.
      if (efectivos.fuente === 'vacio') continue;

      const stockActual = getStock(stockMap, prod.id, dep.id);
      // Solo alertar si está estrictamente por debajo del punto de reposición.
      if (stockActual >= efectivos.puntoReposicion) continue;

      // Cantidad sugerida: la diferencia hasta stockObjetivo (o hasta el
      // mínimo si no hay objetivo definido). Redondeada a 2 decimales.
      const objetivo = efectivos.stockObjetivo > 0 ? efectivos.stockObjetivo : efectivos.stockMinimo;
      const cantidadSugerida = Math.max(0, Math.round((objetivo - stockActual) * 100) / 100);
      if (cantidadSugerida <= 0) continue;

      const padre = dep.depositoPadreId ? depositoById.get(dep.depositoPadreId) ?? null : null;
      const stockEnPadre = padre ? getStock(stockMap, prod.id, padre.id) : null;
      const puedeReponerDesdePadre = padre != null && stockEnPadre != null && stockEnPadre >= cantidadSugerida;

      alertas.push({
        productoId: prod.id,
        productoCodigo: prod.codigo,
        productoNombre: prod.nombre,
        unidad: prod.unidadUso,
        depositoId: dep.id,
        depositoCodigo: dep.codigo,
        depositoNombre: dep.nombre,
        stockActual,
        stockMinimo: efectivos.stockMinimo,
        stockObjetivo: efectivos.stockObjetivo,
        puntoReposicion: efectivos.puntoReposicion,
        cantidadSugerida,
        fuenteParametros: efectivos.fuente,
        depositoPadreId: padre?.id ?? null,
        depositoPadreNombre: padre?.nombre ?? null,
        stockEnPadre,
        puedeReponerDesdePadre,
        requiereCompra: padre == null,
      });
    }
  }

  // Orden: déficit relativo (cuánto falta vs objetivo) descendente — lo más
  // crítico primero.
  alertas.sort((a, b) => {
    const deficitA = (a.stockObjetivo > 0 ? (a.stockObjetivo - a.stockActual) / a.stockObjetivo : 1);
    const deficitB = (b.stockObjetivo > 0 ? (b.stockObjetivo - b.stockActual) / b.stockObjetivo : 1);
    return deficitB - deficitA;
  });

  return alertas;
}

/**
 * Agrupa alertas por par (depósito origen, depósito destino) para armar
 * órdenes de reposición candidatas. Cada grupo = una OrdenReposicion con
 * sus items. Las alertas que `requiereCompra` quedan fuera (se manejan
 * por /reposicion/compra).
 */
export function agruparAlertasParaOrdenes(alertas: AlertaReposicion[]): Map<string, {
  depositoOrigenId: number;
  depositoDestinoId: number;
  items: AlertaReposicion[];
}> {
  const grupos = new Map<string, {
    depositoOrigenId: number;
    depositoDestinoId: number;
    items: AlertaReposicion[];
  }>();

  for (const a of alertas) {
    if (a.requiereCompra || !a.depositoPadreId) continue;
    const key = `${a.depositoPadreId}->${a.depositoId}`;
    const grupo = grupos.get(key);
    if (grupo) {
      grupo.items.push(a);
    } else {
      grupos.set(key, {
        depositoOrigenId: a.depositoPadreId,
        depositoDestinoId: a.depositoId,
        items: [a],
      });
    }
  }

  return grupos;
}

/**
 * Genera el siguiente código de orden de reposición: OR-001, OR-002, etc.
 * Escanea los existentes y busca el máximo + 1. Idempotente-ish: si dos
 * usuarios generan al mismo tiempo, el unique [org, codigo] hará fallar a
 * uno y el router reintenta.
 */
export async function siguienteCodigoReposicion(): Promise<string> {
  const existentes = await prisma.ordenReposicion.findMany({
    select: { codigo: true },
    orderBy: { id: 'desc' },
    take: 50,
  });
  let max = 0;
  for (const { codigo } of existentes) {
    const m = codigo.match(/^OR-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `OR-${String(max + 1).padStart(3, '0')}`;
}
