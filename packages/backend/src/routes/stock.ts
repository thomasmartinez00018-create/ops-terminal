import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Tipos que suman stock a un depósito destino
const TIPOS_ENTRADA = ['ingreso', 'elaboracion', 'devolucion'];
// Tipos que restan stock de un depósito origen
const TIPOS_SALIDA = ['merma', 'consumo_interno', 'venta'];
// Transferencia: resta de origen, suma a destino

// GET /api/stock - Stock actual por producto y depósito
router.get('/', async (req: Request, res: Response) => {
  try {
    const { depositoId, rubro, soloConStock, bajosDeMinimo } = req.query;

    // Obtener todos los movimientos
    const movimientos = await prisma.movimiento.findMany({
      select: {
        tipo: true,
        productoId: true,
        depositoOrigenId: true,
        depositoDestinoId: true,
        cantidad: true
      }
    });

    // Calcular stock por producto+depósito
    const stockMap = new Map<string, number>();

    for (const mov of movimientos) {
      const { tipo, productoId, depositoOrigenId, depositoDestinoId, cantidad } = mov;

      if (tipo === 'transferencia') {
        // Resta de origen
        if (depositoOrigenId) {
          const keyOrigen = `${productoId}-${depositoOrigenId}`;
          stockMap.set(keyOrigen, (stockMap.get(keyOrigen) || 0) - cantidad);
        }
        // Suma a destino
        if (depositoDestinoId) {
          const keyDestino = `${productoId}-${depositoDestinoId}`;
          stockMap.set(keyDestino, (stockMap.get(keyDestino) || 0) + cantidad);
        }
      } else if (tipo === 'ajuste') {
        // Ajuste puede ser positivo o negativo, va a depósito destino
        if (depositoDestinoId) {
          const key = `${productoId}-${depositoDestinoId}`;
          stockMap.set(key, (stockMap.get(key) || 0) + cantidad);
        }
      } else if (TIPOS_ENTRADA.includes(tipo)) {
        const depId = depositoDestinoId || depositoOrigenId;
        if (depId) {
          const key = `${productoId}-${depId}`;
          stockMap.set(key, (stockMap.get(key) || 0) + cantidad);
        }
      } else if (TIPOS_SALIDA.includes(tipo)) {
        const depId = depositoOrigenId || depositoDestinoId;
        if (depId) {
          const key = `${productoId}-${depId}`;
          stockMap.set(key, (stockMap.get(key) || 0) - cantidad);
        }
      }
    }

    // Obtener info de productos y depósitos
    const productosWhere: any = { activo: true };
    if (rubro) productosWhere.rubro = rubro;

    const productos = await prisma.producto.findMany({
      where: productosWhere,
      select: {
        id: true, codigo: true, nombre: true, rubro: true,
        tipo: true, unidadUso: true, stockMinimo: true, stockIdeal: true
      }
    });

    const depositos = await prisma.deposito.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true }
    });

    const depositoMap = new Map(depositos.map(d => [d.id, d]));

    // Armar resultado
    let resultado = [];
    for (const prod of productos) {
      // Stock total del producto (suma de todos los depósitos)
      let stockTotal = 0;
      const porDeposito = [];

      for (const dep of depositos) {
        const key = `${prod.id}-${dep.id}`;
        const cant = stockMap.get(key) || 0;
        if (cant !== 0 || !soloConStock) {
          porDeposito.push({
            depositoId: dep.id,
            depositoCodigo: dep.codigo,
            depositoNombre: dep.nombre,
            cantidad: Math.round(cant * 100) / 100
          });
        }
        stockTotal += cant;
      }

      stockTotal = Math.round(stockTotal * 100) / 100;

      // Filtros
      if (soloConStock === 'true' && stockTotal === 0) continue;
      if (depositoId) {
        const depStock = porDeposito.find(d => d.depositoId === parseInt(depositoId as string));
        if (!depStock || depStock.cantidad === 0) continue;
      }
      if (bajosDeMinimo === 'true' && stockTotal >= prod.stockMinimo) continue;

      resultado.push({
        productoId: prod.id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        rubro: prod.rubro,
        tipo: prod.tipo,
        unidad: prod.unidadUso,
        stockTotal,
        stockMinimo: prod.stockMinimo,
        stockIdeal: prod.stockIdeal,
        bajoMinimo: stockTotal < prod.stockMinimo,
        porDeposito: depositoId
          ? porDeposito.filter(d => d.depositoId === parseInt(depositoId as string))
          : porDeposito.filter(d => d.cantidad !== 0)
      });
    }

    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al calcular stock' });
  }
});

export default router;
