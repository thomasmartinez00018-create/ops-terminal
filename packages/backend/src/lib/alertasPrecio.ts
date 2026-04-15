// ============================================================================
// ALERTAS DE PRECIO — helper de detección
// ============================================================================
// Detecta variaciones de precio entre lo que viene en una factura nueva y el
// histórico del mismo (producto × proveedor). Reusable desde:
//   - POST /api/facturas/confirmar      (facturas escaneadas por OCR)
//   - POST /api/contabilidad/facturas   (facturas cargadas manualmente)
//   - PUT  /api/contabilidad/facturas/:id  (edición que reemplaza items)
//
// Diseño:
// - El "precio anterior" se busca en 2 fuentes, por prioridad:
//     1. Último FacturaItem anterior del mismo (producto × proveedor)
//        → lo más confiable, porque representa una compra real.
//     2. ProveedorProducto.ultimoPrecio
//        → fallback, útil cuando la primer compra no tenía proveedor asignado.
// - Si no hay precio anterior, NO se genera alerta (es la primer compra).
// - La variación se calcula como (nuevo - anterior) / anterior * 100, signed.
// - Severidad default: leve (0-3%), media (3-10%), alta (>10%).
// - Los registros se crean dentro de la misma transacción que la factura para
//   mantener consistencia (si la factura rollback, las alertas también).
// ============================================================================

// El tipo del tx del $transaction del prisma extendido difiere del
// Prisma.TransactionClient base — usamos any para que el helper sea
// compatible con ambos (base y extendido) sin pelearnos con los tipos.
// Internamente solo usamos operaciones standard (findFirst/create/...).
type Tx = any;

// Threshold mínimo para registrar una alerta. Por debajo de esto es ruido
// (redondeo, centavos, cambios triviales). Se puede subir/bajar sin migrar.
const UMBRAL_MINIMO_PCT = 0.5;

// Umbrales de severidad (absolutos, signed por separado).
const UMBRAL_MEDIO_PCT = 3;
const UMBRAL_ALTO_PCT = 10;

export interface FacturaItemInput {
  productoId: number | null | undefined;
  precioUnitario: number | null | undefined;
  unidad?: string | null;
  facturaItemId?: number; // si ya fue creado, para referenciar
}

export interface VariacionDetectada {
  productoId: number;
  productoNombre: string;
  productoCodigo: string;
  proveedorId: number | null;
  precioAnterior: number;
  precioNuevo: number;
  variacionPct: number;    // signed: +15.2 | -8.1
  variacionAbs: number;    // |diferencia|
  severidad: 'leve' | 'media' | 'alta';
  direccion: 'sube' | 'baja';
  unidad: string | null;
  fuenteAnterior: 'factura' | 'proveedor_producto';
  fechaAnterior: string | null;
  facturaItemId: number | null;
}

// ---------------------------------------------------------------------------
// detectarVariaciones — lee precios anteriores y devuelve las variaciones
// ---------------------------------------------------------------------------
// Recibe un array de items (de la factura que se está confirmando) y el
// proveedorId. Consulta en la DB los últimos precios registrados para cada
// (producto × proveedor) y arma la lista de variaciones detectadas. NO
// escribe nada — solo detecta. La escritura la hace persistirAlertas().
// ---------------------------------------------------------------------------
export async function detectarVariaciones(
  tx: Tx,
  proveedorId: number | null,
  items: FacturaItemInput[],
  opts: { excluirFacturaId?: number } = {},
): Promise<VariacionDetectada[]> {
  const variaciones: VariacionDetectada[] = [];

  for (const item of items) {
    if (!item.productoId || !item.precioUnitario) continue;
    const productoId = Number(item.productoId);
    const precioNuevo = Number(item.precioUnitario);
    if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) continue;

    // ── 1. Buscar último FacturaItem previo del mismo producto × proveedor ──
    let precioAnterior: number | null = null;
    let fuenteAnterior: 'factura' | 'proveedor_producto' = 'factura';
    let fechaAnterior: string | null = null;

    const facturaItemPrevio = await tx.facturaItem.findFirst({
      where: {
        productoId,
        precioUnitario: { gt: 0 },
        ...(proveedorId ? { factura: { proveedorId } } : {}),
        ...(opts.excluirFacturaId ? { facturaId: { not: opts.excluirFacturaId } } : {}),
      },
      include: { factura: { select: { fecha: true, proveedorId: true } } },
      orderBy: { factura: { fecha: 'desc' } },
    });

    if (facturaItemPrevio) {
      precioAnterior = Number(facturaItemPrevio.precioUnitario);
      fechaAnterior = facturaItemPrevio.factura.fecha;
      fuenteAnterior = 'factura';
    } else if (proveedorId) {
      // ── 2. Fallback: ProveedorProducto.ultimoPrecio ───────────────────
      const pp = await tx.proveedorProducto.findFirst({
        where: { proveedorId, productoId },
      });
      if (pp?.ultimoPrecio && pp.ultimoPrecio > 0) {
        precioAnterior = Number(pp.ultimoPrecio);
        fechaAnterior = pp.fechaPrecio ?? null;
        fuenteAnterior = 'proveedor_producto';
      }
    }

    if (precioAnterior == null) continue; // primer compra, nada que comparar

    // Si es exactamente el mismo precio, skip (no es variación).
    if (Math.abs(precioNuevo - precioAnterior) < 0.0001) continue;

    const variacionPct = ((precioNuevo - precioAnterior) / precioAnterior) * 100;
    const absPct = Math.abs(variacionPct);

    // Descartar ruido por debajo del umbral mínimo
    if (absPct < UMBRAL_MINIMO_PCT) continue;

    // Calcular severidad
    let severidad: 'leve' | 'media' | 'alta' = 'leve';
    if (absPct >= UMBRAL_ALTO_PCT) severidad = 'alta';
    else if (absPct >= UMBRAL_MEDIO_PCT) severidad = 'media';

    // Cargar metadata del producto para el display
    const producto = await tx.producto.findUnique({
      where: { id: productoId },
      select: { id: true, codigo: true, nombre: true, unidadCompra: true },
    });
    if (!producto) continue;

    variaciones.push({
      productoId,
      productoNombre: producto.nombre,
      productoCodigo: producto.codigo,
      proveedorId,
      precioAnterior,
      precioNuevo,
      variacionPct: Number(variacionPct.toFixed(2)),
      variacionAbs: Number(Math.abs(precioNuevo - precioAnterior).toFixed(2)),
      severidad,
      direccion: variacionPct > 0 ? 'sube' : 'baja',
      unidad: item.unidad || producto.unidadCompra || null,
      fuenteAnterior,
      fechaAnterior,
      facturaItemId: item.facturaItemId ?? null,
    });
  }

  return variaciones;
}

// ---------------------------------------------------------------------------
// persistirAlertas — crea los registros de AlertaPrecio en la DB
// ---------------------------------------------------------------------------
// Se llama dentro de la misma transacción que crea la factura. Recibe las
// variaciones ya detectadas y un facturaId. Si no hay variaciones, no hace
// nada. Devuelve los IDs de las alertas creadas.
// ---------------------------------------------------------------------------
export async function persistirAlertas(
  tx: Tx,
  facturaId: number,
  variaciones: VariacionDetectada[],
): Promise<number[]> {
  if (variaciones.length === 0) return [];

  const ids: number[] = [];
  for (const v of variaciones) {
    const alerta = await tx.alertaPrecio.create({
      data: {
        productoId: v.productoId,
        proveedorId: v.proveedorId,
        facturaId,
        facturaItemId: v.facturaItemId,
        precioAnterior: v.precioAnterior,
        precioNuevo: v.precioNuevo,
        variacionPct: v.variacionPct,
        severidad: v.severidad,
        direccion: v.direccion,
        unidad: v.unidad,
        fuenteAnterior: v.fuenteAnterior,
        fechaAnterior: v.fechaAnterior,
        estado: 'pendiente',
      },
    });
    ids.push(alerta.id);
  }
  return ids;
}
