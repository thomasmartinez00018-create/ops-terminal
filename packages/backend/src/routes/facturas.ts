import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';

const router = Router();

// ── Prompt para Gemini — detecta tipo comprobante + IVA ────────────────────
const EXTRACTION_PROMPT = `Analizá esta imagen de factura/remito de un proveedor gastronómico argentino.
Extraé la información en formato JSON estricto (sin markdown, sin backticks, solo JSON puro):

{
  "proveedor": "nombre del proveedor",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "número de factura o remito",
  "tipo_comprobante": "A",
  "items": [
    {
      "descripcion": "nombre del producto tal como aparece",
      "cantidad": 10.5,
      "unidad": "kg",
      "precio_unitario": 150.50,
      "alicuota_iva": 21
    }
  ],
  "subtotal": 1500.00,
  "iva_total": 315.00,
  "total": 1815.00
}

Reglas:
- Detectá el tipo de comprobante: "A", "B", "C", "ticket" o "remito".
  Buscá la letra grande en el centro-superior del documento. Si dice "FACTURA" con una letra (A, B, C), usá esa. Si parece un ticket de caja, poné "ticket". Si dice REMITO, poné "remito".
- Para Factura A: el IVA está discriminado. Extraé alicuota_iva por item (21, 10.5, 27 o 0).
- Para Factura B/C/Ticket: el IVA está incluido en el precio. Poné alicuota_iva: 0 en cada item.
- Incluí subtotal, iva_total, total si están impresos en el documento.
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
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

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
      alicuotaIva: item.alicuota_iva ?? 0,
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
        tipoComprobante: parsed.tipo_comprobante || 'ticket',
        subtotal: parsed.subtotal ?? null,
        ivaTotal: parsed.iva_total ?? null,
        total: parsed.total ?? null,
      },
      items,
    });
  } catch (err: any) {
    console.error('[facturas/escanear]', err);
    res.status(500).json({ error: err.message || 'Error al procesar la factura' });
  }
});

// ── POST /api/facturas/confirmar ── Persiste Factura + Items + Movimientos ──
router.post('/confirmar', async (req, res) => {
  try {
    const {
      items, proveedorId, depositoDestinoId, usuarioId,
      fecha, documentoRef,
      tipoComprobante, fechaVencimiento,
      subtotal, iva, total,
      imagenBase64,
    } = req.body;

    if (!items?.length) {
      return res.status(400).json({ error: 'No hay items para registrar' });
    }

    const now = new Date();
    const hora = now.toTimeString().slice(0, 5);
    const fechaFinal = fecha || now.toISOString().split('T')[0];

    const resultado = await prisma.$transaction(async (tx) => {
      // Generar código FAC-NNNN dentro de la transacción para evitar race conditions
      const last = await tx.factura.findFirst({ orderBy: { id: 'desc' } });
      const nextNum = (last?.id || 0) + 1;
      const codigo = `FAC-${String(nextNum).padStart(4, '0')}`;

      // 1. Crear Factura
      const factura = await tx.factura.create({
        data: {
          codigo,
          tipoComprobante: tipoComprobante || 'ticket',
          numero: documentoRef || '',
          fecha: fechaFinal,
          fechaVencimiento: fechaVencimiento || null,
          proveedorId: proveedorId ? Number(proveedorId) : 1, // fallback
          subtotal: Number(subtotal || 0),
          iva: Number(iva || 0),
          total: Number(total || 0),
          estado: 'pendiente',
          imagenBase64: imagenBase64 || null,
          observacion: `Ingreso desde factura escaneada`,
          creadoPorId: Number(usuarioId),
        },
      });

      // 2. Crear FacturaItems
      const itemsValidos = items.filter((i: any) => i.productoId && i.cantidad);
      for (const item of items) {
        await tx.facturaItem.create({
          data: {
            facturaId: factura.id,
            productoId: item.productoId ? Number(item.productoId) : null,
            descripcion: item.descripcion || '',
            cantidad: Number(item.cantidad || 0),
            unidad: item.unidad || 'unidad',
            precioUnitario: Number(item.precioUnitario || 0),
            alicuotaIva: Number(item.alicuotaIva ?? 0),
            subtotal: Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
            iva: Number(item.cantidad || 0) * Number(item.precioUnitario || 0) * Number(item.alicuotaIva ?? 0) / 100,
          },
        });
      }

      // 3. Crear Movimientos de ingreso (solo items con producto asignado)
      const movimientos = [];
      for (const item of itemsValidos) {
        const mov = await tx.movimiento.create({
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
            documentoRef: factura.codigo,
            observacion: `Ingreso desde ${factura.codigo}`,
            motivo: null,
            lote: null,
            responsableId: null,
            facturaId: factura.id,
          },
        });
        movimientos.push(mov);
      }

      // 4. Actualizar ultimoPrecio en ProveedorProducto si hay proveedor
      if (proveedorId) {
        for (const item of itemsValidos) {
          if (item.precioUnitario) {
            try {
              await tx.proveedorProducto.updateMany({
                where: {
                  proveedorId: Number(proveedorId),
                  productoId: Number(item.productoId),
                },
                data: {
                  ultimoPrecio: Number(item.precioUnitario),
                },
              });
            } catch {
              // ProveedorProducto puede no existir, está bien
            }
          }
        }
      }

      return { factura, movimientos };
    });

    res.json({
      ok: true,
      facturaCodigo: resultado.factura.codigo,
      facturaId: resultado.factura.id,
      registrados: resultado.movimientos.length,
      mensaje: `Factura ${resultado.factura.codigo} registrada con ${resultado.movimientos.length} ingresos`,
    });
  } catch (err: any) {
    console.error('[facturas/confirmar]', err);
    res.status(500).json({ error: err.message || 'Error al registrar factura' });
  }
});

export default router;
