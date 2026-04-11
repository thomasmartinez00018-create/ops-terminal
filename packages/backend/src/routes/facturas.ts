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

// ── Prompt para matching semántico de productos con IA ─────────────────────
function buildMatchingPrompt(itemsDescripciones: string[], catalogo: { id: number; codigo: string; nombre: string; rubro: string }[]) {
  const catalogoStr = catalogo.map(p => `${p.id}|${p.codigo}|${p.nombre}|${p.rubro}`).join('\n');
  const itemsStr = itemsDescripciones.map((d, i) => `${i}|${d}`).join('\n');

  return `Sos un asistente de un sistema de stock gastronómico argentino.
Tu tarea: para cada item de factura, buscá el producto MÁS PROBABLE del catálogo.

CATÁLOGO DE PRODUCTOS (id|codigo|nombre|rubro):
${catalogoStr}

ITEMS DE LA FACTURA (index|descripcion):
${itemsStr}

REGLAS:
- Cada item puede matchear con UN solo producto del catálogo, o con ninguno.
- Considerá sinónimos, abreviaciones, marcas, presentaciones. Ej: "Queso Crema Ilolay x500g" → "Queso Cremoso", "Tom. cherry" → "Tomate Cherry", "Muz." → "Muzzarella".
- Ignorá marcas, pesos y presentaciones al comparar — enfocate en QUÉ producto es.
- Si hay un match claro, confianza "alta". Si es probable pero ambiguo, "media". Si no hay match razonable, "ninguna".
- NO inventes IDs. Usá SOLO IDs que existan en el catálogo.
- Si dos items de la factura parecen el mismo producto, asigná el mismo ID a ambos.

Respondé SOLO con JSON puro (sin markdown, sin backticks):
[
  { "index": 0, "productoId": 45, "confianza": "alta" },
  { "index": 1, "productoId": 12, "confianza": "media" },
  { "index": 2, "productoId": null, "confianza": "ninguna" }
]`;
}

// ── Matching con IA — Gemini como matcher semántico ────────────────────────
async function matchProductosConIA(
  items: { descripcion: string }[],
  productos: { id: number; codigo: string; nombre: string; rubro: string }[],
  apiKey: string
): Promise<{ productoId: number | null; productoNombre: string | null; confidence: 'alta' | 'media' | 'ninguna' }[]> {
  if (!items.length || !productos.length) {
    return items.map(() => ({ productoId: null, productoNombre: null, confidence: 'ninguna' as const }));
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Matching semántico: lite alcanza y es más barato
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const catalogo = productos.map(p => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      rubro: p.rubro,
    }));

    const prompt = buildMatchingPrompt(
      items.map(i => i.descripcion),
      catalogo
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonStr = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const matches: { index: number; productoId: number | null; confianza: string }[] = JSON.parse(jsonStr);

    // Mapear resultados indexados a array ordenado
    const prodMap = new Map(productos.map(p => [p.id, p]));
    return items.map((_, idx) => {
      const m = matches.find(x => x.index === idx);
      if (!m || !m.productoId) return { productoId: null, productoNombre: null, confidence: 'ninguna' as const };
      const prod = prodMap.get(m.productoId);
      if (!prod) return { productoId: null, productoNombre: null, confidence: 'ninguna' as const };
      const conf = m.confianza === 'alta' ? 'alta' : m.confianza === 'media' ? 'media' : 'ninguna';
      return { productoId: prod.id, productoNombre: prod.nombre, confidence: conf as 'alta' | 'media' | 'ninguna' };
    });
  } catch (err) {
    console.error('[matchProductosConIA] Error en matching:', err);
    // Fallback: sin match
    return items.map(() => ({ productoId: null, productoNombre: null, confidence: 'ninguna' as const }));
  }
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
    // Para OCR/visión de facturas usamos gemini-3.1-flash (no lite):
    // flash-lite puede no rendir bien con imágenes complejas, flash es
    // el sweet spot entre calidad de visión y costo.
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash' });

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

    // Match items con productos existentes usando IA semántica
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rubro: true },
    });

    const rawItems = (parsed.items || []).map((item: any, idx: number) => ({
      index: idx,
      descripcion: item.descripcion || '',
      cantidad: item.cantidad,
      unidad: item.unidad,
      precioUnitario: item.precio_unitario,
      alicuotaIva: item.alicuota_iva ?? 0,
    }));

    // Matching semántico con Gemini
    const matches = await matchProductosConIA(rawItems, productos, apiKey);

    const items = rawItems.map((item: any, idx: number) => ({
      ...item,
      productoId: matches[idx]?.productoId ?? null,
      productoNombre: matches[idx]?.productoNombre ?? null,
      confidence: matches[idx]?.confidence ?? 'ninguna',
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
