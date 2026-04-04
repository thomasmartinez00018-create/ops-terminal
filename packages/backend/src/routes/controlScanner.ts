import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { calcularStockTeorico } from '../utils/stockCalculator';

const router = Router();

// GET /api/scanner/producto/:barcode - Busca producto por código de barras
router.get('/producto/:barcode', async (req: Request, res: Response) => {
  try {
    const barcode = req.params.barcode as string;
    // Normalize: strip leading zeros to handle EAN-13 vs UPC-A differences
    const barcodeNorm = barcode.replace(/^0+/, '');

    const producto = await prisma.producto.findFirst({
      where: {
        OR: [
          { codigoBarras: barcode },
          { codigoBarras: barcodeNorm },
          { codigo: barcode },
          { codigo: barcodeNorm },
        ],
        activo: true
      },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        rubro: true,
        tipo: true,
        unidadCompra: true,
        unidadUso: true,
        codigoBarras: true
      }
    });

    if (!producto) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }

    res.json(producto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al buscar producto' });
  }
});

// GET /api/scanner/stock-teorico/:productoId/:depositoId
router.get('/stock-teorico/:productoId/:depositoId', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(req.params.productoId as string);
    const depositoId = parseInt(req.params.depositoId as string);

    const stock = await calcularStockTeorico(productoId, depositoId);
    res.json({ productoId, depositoId, stockTeorico: stock });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al calcular stock teórico' });
  }
});

// GET /api/scanner/productos-deposito/:depositoId - Todos los productos con stock en un depósito
router.get('/productos-deposito/:depositoId', async (req: Request, res: Response) => {
  try {
    const depositoId = parseInt(req.params.depositoId as string);

    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rubro: true, unidadUso: true, codigoBarras: true }
    });

    const result = [];
    for (const prod of productos) {
      const stock = await calcularStockTeorico(prod.id, depositoId);
      if (stock !== 0) {
        result.push({ ...prod, stockTeorico: stock });
      }
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener productos del depósito' });
  }
});

export default router;
