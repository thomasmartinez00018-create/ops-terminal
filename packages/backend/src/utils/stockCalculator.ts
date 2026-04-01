import prisma from '../lib/prisma';

// Tipos que suman stock a un depósito destino
const TIPOS_ENTRADA = ['ingreso', 'elaboracion', 'devolucion'];
// Tipos que restan stock de un depósito origen
const TIPOS_SALIDA = ['merma', 'consumo_interno'];

/**
 * Calcula el stock teórico de un producto en un depósito específico
 * a partir de todos los movimientos.
 */
export async function calcularStockTeorico(productoId: number, depositoId: number): Promise<number> {
  const movimientos = await prisma.movimiento.findMany({
    where: { productoId },
    select: {
      tipo: true,
      depositoOrigenId: true,
      depositoDestinoId: true,
      cantidad: true
    }
  });

  let stock = 0;

  for (const mov of movimientos) {
    const { tipo, depositoOrigenId, depositoDestinoId, cantidad } = mov;

    if (tipo === 'transferencia') {
      if (depositoOrigenId === depositoId) stock -= cantidad;
      if (depositoDestinoId === depositoId) stock += cantidad;
    } else if (tipo === 'ajuste') {
      if (depositoDestinoId === depositoId) stock += cantidad;
    } else if (TIPOS_ENTRADA.includes(tipo)) {
      const depId = depositoDestinoId || depositoOrigenId;
      if (depId === depositoId) stock += cantidad;
    } else if (TIPOS_SALIDA.includes(tipo)) {
      const depId = depositoOrigenId || depositoDestinoId;
      if (depId === depositoId) stock -= cantidad;
    }
  }

  return Math.round(stock * 100) / 100;
}

/**
 * Calcula el stock total por producto (global, todos los depósitos).
 */
export async function calcularStockPorProducto(): Promise<Map<number, number>> {
  const movimientos = await prisma.movimiento.findMany({
    select: {
      tipo: true,
      productoId: true,
      depositoOrigenId: true,
      depositoDestinoId: true,
      cantidad: true
    }
  });

  const stockMap = new Map<number, number>();

  for (const mov of movimientos) {
    const { tipo, productoId, depositoDestinoId, cantidad } = mov;

    if (tipo === 'transferencia') {
      // No cambia stock total global
    } else if (tipo === 'ajuste') {
      if (depositoDestinoId) {
        stockMap.set(productoId, (stockMap.get(productoId) || 0) + cantidad);
      }
    } else if (TIPOS_ENTRADA.includes(tipo)) {
      stockMap.set(productoId, (stockMap.get(productoId) || 0) + cantidad);
    } else if (TIPOS_SALIDA.includes(tipo)) {
      stockMap.set(productoId, (stockMap.get(productoId) || 0) - cantidad);
    }
  }

  return stockMap;
}
