import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';

const router = Router();

// ── Prompt para Gemini ──────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `Analizá esta imagen de factura/remito de un proveedor gastronómico argentino.
Extraé la información en formato JSON estricto (sin markdown, sin backticks, solo JSON puro):

{
  "proveedor": "nombre del proveedor",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "número de factura o remito",
  "items": [
    {
      "descripcion": "nombre del producto tal como aparece",
      "cantidad": 10.5,
      "unidad": "kg",
      "precio_unitario": 150.50
    }
  ]
}

Reglas:
- Cantidades siempre como número decimal
- Precios en pesos argentinos sin símbolo $
- Si no podés leer un campo, poné null
- Normalizá unidades: "KILO"/"KG"/"Kg"/"Kilogramo" → "kg", "LITRO"/"LT"/"Lt" → "lt", "UN"/"UNID" → "unidad", "CJ"/"CAJA" → "caja"
- Incluí TODOS los items/líneas de la factura
- Respondé SOLO con el JSON, sin texto adicional`;

// ── Fuzzy match de productos ────────────────────────────────────────────────
function matchProducto(descripcion: string, productos: any[]) {
  const desc = descripcion.toLowerCase().trim();

  // 1. Exact match por nombre
  const exact = productos.find(p => p.nombre.toLowerCase() === desc);
  if (exact) return { productoId: exact.id, productoNombre: exact.nombre, confidence: 'exact' as const };

  // 2. Fuzzy: descripción contiene nombre o viceversa
  const fuzzy = productos.find(p => {
    const nombre = p.nombre.toLowerCase();
    return desc.includes(nombre) || nombre.includes(desc);
  });
  if (fuzzy) return { productoId: fuzzy.id, productoNombre: fuzzy.nombre, confidence: 'fuzzy' as const };

  // 3. Fuzzy: alguna palabra clave coincide (>= 4 chars)
  const descWords = desc.split(/\s+/).filter(w => w.length >= 4);
  const partial = productos.find(p => {
    const nombre = p.nombre.toLowerCase();
    return descWords.some(w => nombre.includes(w));
  });
  if (partial) return { productoId: partial.id, productoNombre: partial.nombre, confidence: 'fuzzy' as const };

  return { productoId: null, productoNombre: null, confidence: 'none' as const };
}

// ── POST /api/facturas/escanear ─────────────────────────────────────────────
router.post('/escanear', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no configurada. Contactá al administrador.' });
    }

    const { imagen, mimeType = 'image/jpeg' } = req.body;
    if (!imagen) {
      return res.status(400).json({ error: 'Imagen requerida (base64)' });
    }

    // Llamar a Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const result = await model.generateContent([
      EXTRACTION_PROMPT,
      {
        inlineData: {
          mimeType,
          data: imagen.replace(/^data:[^;]+;base64,/, ''), // strip data URL prefix if present
        },
      },
    ]);

    const responseText = result.response.text();

    // Parsear JSON de la respuesta (Gemini a veces envuelve en ```json)
    let parsed;
    try {
      const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      return res.status(422).json({
        error: 'No se pudo interpretar la factura. Intentá con una imagen más clara.',
        raw: responseText,
      });
    }

    // Match items con productos existentes
    const productos = await prisma.producto.findMany({ where: { activo: true } });

    const items = (parsed.items || []).map((item: any, idx: number) => ({
      index: idx,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precioUnitario: item.precio_unitario,
      ...matchProducto(item.descripcion || '', productos),
    }));

    // Match proveedor
    let proveedorMatch = null;
    if (parsed.proveedor) {
      const proveedores = await prisma.proveedor.findMany();
      const provNombre = parsed.proveedor.toLowerCase();
      const match = proveedores.find(p => {
        const n = p.nombre.toLowerCase();
        return n === provNombre || n.includes(provNombre) || provNombre.includes(n);
      });
      if (match) proveedorMatch = { id: match.id, nombre: match.nombre };
    }

    res.json({
      factura: {
        proveedor: parsed.proveedor,
        proveedorMatch,
        fecha: parsed.fecha,
        numeroFactura: parsed.numero_factura,
      },
      items,
    });
  } catch (err: any) {
    console.error('[facturas/escanear]', err);
    res.status(500).json({ error: err.message || 'Error al procesar la factura' });
  }
});

// ── POST /api/facturas/confirmar ────────────────────────────────────────────
router.post('/confirmar', async (req, res) => {
  try {
    const { items, proveedorId, depositoDestinoId, usuarioId, fecha, documentoRef } = req.body;

    if (!items?.length) {
      return res.status(400).json({ error: 'No hay items para registrar' });
    }

    const now = new Date();
    const hora = now.toTimeString().slice(0, 5);
    const fechaFinal = fecha || now.toISOString().split('T')[0];

    const movimientos = await prisma.$transaction(
      items.map((item: any) =>
        prisma.movimiento.create({
          data: {
            tipo: 'ingreso',
            productoId: Number(item.productoId),
            cantidad: Number(item.cantidad),
            unidad: item.unidad || 'unidad',
            costoUnitario: item.precioUnitario ? Number(item.precioUnitario) : null,
            usuarioId: Number(usuarioId),
            proveedorId: proveedorId ? Number(proveedorId) : null,
            depositoDestinoId: depositoDestinoId ? Number(depositoDestinoId) : null,
            depositoOrigenId: null,
            fecha: fechaFinal,
            hora,
            documentoRef: documentoRef || null,
            observacion: `Ingreso desde factura escaneada`,
            motivo: null,
            lote: null,
            responsableId: null,
          },
        })
      )
    );

    res.json({
      ok: true,
      registrados: movimientos.length,
      mensaje: `${movimientos.length} ingresos registrados desde factura`,
    });
  } catch (err: any) {
    console.error('[facturas/confirmar]', err);
    res.status(500).json({ error: err.message || 'Error al registrar ingresos' });
  }
});

export default router;
