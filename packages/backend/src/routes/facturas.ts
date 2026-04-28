import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';
import { detectarVariaciones, persistirAlertas, type VariacionDetectada } from '../lib/alertasPrecio';

const router = Router();

// ── Prompt para Gemini — detecta tipo comprobante + IVA ────────────────────
const EXTRACTION_PROMPT = `TAREA: Extraer datos estructurados de esta imagen de factura/remito de un proveedor gastronómico argentino.

FORMATO DE RESPUESTA — JSON estricto, sin markdown, sin backticks, sin texto antes o después:
{
  "proveedor": "nombre comercial del proveedor (no razón social CUIT)",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "número completo incluyendo punto de venta (ej: 0003-00001234)",
  "tipo_comprobante": "A",
  "items": [
    {
      "descripcion": "nombre del producto TAL COMO APARECE en la factura",
      "cantidad": 10.5,
      "unidad": "kg",
      "precio_unitario": 150.50,
      "alicuota_iva": 21
    }
  ],
  "subtotal": 1500.00,
  "iva_total": 315.00,
  "otros_impuestos": 0,
  "total": 1815.00
}

CAMPO otros_impuestos — MUY IMPORTANTE para facturas argentinas de bebidas/alimentos:
Algunas facturas tienen impuestos ADEMÁS del IVA, como:
- "Imp. Interno" / "Impuesto Interno" / "IMP. INTERNO" → impuesto al consumo de bebidas, cigarrillos, etc.
- "Percepción IIBB" / "PERC. IIBB" → percepción de ingresos brutos
- "Perc. Ganancias" / "PERC. GANANCIAS" → percepción de ganancias
- "Int. No Grav." / "INT. NO GRAV." → intereses no gravados
Suma TODOS estos impuestos adicionales en "otros_impuestos". Si no hay ninguno, poné 0.
Ejemplo: si subtotal=$253.530,94, IVA=$53.241,49, Imp.Interno=$35.958,92 → otros_impuestos=35958.92, total=342731.35

TIPO DE COMPROBANTE — determinalo así:
1. Buscá la letra grande (A, B, C) en el recuadro central superior del documento → "A", "B" o "C".
2. Si dice "REMITO" o "R" → "remito".
3. Si es un ticket de caja o factura simplificada sin letra → "ticket".
4. Si no podés determinarlo → "ticket" (valor seguro por defecto).

REGLAS DE IVA según tipo:
- Factura A: IVA discriminado. Extraé alicuota_iva real por item (21, 10.5, 27 o 0). Verificá que la suma de (precio_unitario × cantidad × alicuota/100) sea coherente con el iva_total impreso.
- Factura B, C, ticket, remito: IVA incluido en precio. Poné alicuota_iva: 0 en todos los items.

REGLAS DE PRECIOS — formato argentino:
- "17.007,31" → 17007.31 (punto = separador de miles, coma = decimal).
- "$17.007" sin coma → 17007 (entero, no 17.007).
- Si un precio parece < $1 o > $5.000.000 por unidad, revisá si leíste mal el separador de miles/decimales.
- NUNCA incluir el símbolo $ en los números.

REGLAS DE CANTIDADES Y UNIDADES:
- Cantidades siempre como número decimal (10 → 10, 2.5 → 2.5).
- Normalizá unidades: "KILO"/"KG"/"Kg"/"Kilogramo"/"kgs" → "kg" | "LITRO"/"LT"/"Lt"/"lts" → "lt" | "UN"/"UNID"/"UNI"/"c/u" → "unidad" | "CJ"/"CAJA" → "caja" | "DOCENA"/"DOC" → "docena" | "ATADO"/"AT" → "atado" | "BOLSA"/"BLS" → "bolsa" | "PACK" → "pack".
- Si la unidad no es clara, usá "unidad".

VALIDACIÓN — antes de responder, verificá:
1. ¿La suma de (precio_unitario × cantidad) de todos los items es cercana al subtotal? Si difiere mucho, revisá los precios.
2. ¿El total ≈ subtotal + iva_total + otros_impuestos? Si no cuadra, revisá.
3. ¿Incluiste TODOS los items/líneas de la factura? No te saltes ninguno.

CAMPOS ILEGIBLES: Si no podés leer un campo con certeza, poné null. Es preferible null a inventar un valor.

Respondé SOLO con el JSON.`;

// ── Prompt para matching semántico de productos con IA ─────────────────────
function buildMatchingPrompt(itemsDescripciones: string[], catalogo: { id: number; codigo: string; nombre: string; rubro: string }[]) {
  const catalogoStr = catalogo.map(p => `${p.id}|${p.codigo}|${p.nombre}|${p.rubro}`).join('\n');
  const itemsStr = itemsDescripciones.map((d, i) => `${i}|${d}`).join('\n');

  return `TAREA: Matchear cada item de una factura de proveedor con el producto interno más probable del catálogo de un restaurante argentino.

CATÁLOGO DE PRODUCTOS INTERNOS (id|codigo|nombre|rubro):
${catalogoStr}

ITEMS DE LA FACTURA A MATCHEAR (index|descripcion):
${itemsStr}

CRITERIOS DE MATCHING — en orden de prioridad:
1. ¿Es el mismo producto base? Ignorá marca, presentación, peso y envase. "Queso Crema Ilolay x500g" y "Queso Cremoso" son lo mismo. "Muz. Barra 5kg" y "Muzzarella" son lo mismo.
2. Usá el rubro como contexto: si el item dice "Barra" y hay un producto "Barra de Chocolate" en rubro lácteos Y otro "Barra Danbo" en rubro quesos, el rubro te ayuda a desambiguar.
3. Cada item matchea con UN producto o con ninguno.

ABREVIACIONES COMUNES EN GASTRONOMÍA ARGENTINA:
- "Muz."/"Mozza"/"Muzza" → Muzzarella
- "Tom." → Tomate
- "Ceb." → Cebolla
- "Morr." → Morrón
- "Prov." → Provolone
- "Criolla" → Cebolla criolla
- "Rúc." → Rúcula
- "Parm." → Parmesano
- "Crema" sin especificar → Crema de leche
- "Jamón" sin especificar → Jamón cocido (no crudo)
- "Aceite" sin especificar → Aceite de girasol (el más común)
- "Harina" sin especificar → Harina 000

CONFIANZA:
- "alta": match claro e inequívoco (mismo producto, sin dudas).
- "media": probablemente el mismo producto pero hay ambigüedad (ej: "Tomate" podría ser perita o redondo, pero solo hay un "Tomate" en el catálogo).
- "ninguna": no hay producto interno que corresponda. Usá productoId: null.

REGLAS ESTRICTAS:
- SOLO usá IDs que existan en el catálogo de arriba. Si inventás un ID, el sistema falla.
- Si dos items de la factura son el mismo producto interno, asigná el mismo ID a ambos.
- Respondé SOLO con JSON array puro (sin markdown, sin backticks, sin texto extra):
[
  { "index": 0, "productoId": 45, "confianza": "alta" },
  { "index": 1, "productoId": null, "confianza": "ninguna" }
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
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

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

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
    });
    const responseText = result.response.text();

    // Parseo robusto — IA puede devolver markdown, JSON malformado o truncado.
    let matches: { index: number; productoId: number | null; confianza: string }[] = [];
    try {
      const clean = responseText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      const arrMatch = clean.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) {
          matches = parsed.filter((m: any) =>
            m && typeof m === 'object' && Number.isInteger(m.index) && m.index >= 0
          );
        }
      }
    } catch {
      matches = []; // Fallback: no matches en vez de crashear
    }

    // Mapear resultados indexados a array ordenado. Solo aceptamos productoId
    // presente en el catálogo enviado — defensa contra IA que inventa IDs.
    const prodMap = new Map(productos.map(p => [p.id, p]));
    return items.map((_, idx) => {
      const m = matches.find(x => x.index === idx);
      if (!m || m.productoId == null) return { productoId: null, productoNombre: null, confidence: 'ninguna' as const };
      const prod = prodMap.get(Number(m.productoId));
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
    // Usamos gemini-3.1-flash-lite-preview tambien para vision — es
    // multimodal (acepta imagenes) y lo pidio el usuario explicitamente.
    // Si la calidad de OCR resulta floja, considerar subir a flash (no lite).
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [
        { text: EXTRACTION_PROMPT },
        { inlineData: { mimeType, data: imagen.replace(/^data:[^;]+;base64,/, '') } },
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
    });

    const responseText = result.response.text();

    // Parsear JSON de la respuesta (Gemini a veces envuelve en ```json)
    let parsed: any;
    try {
      const jsonStr = responseText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      // Buscar primer objeto top-level {...} para tolerar texto antes/después
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(objMatch ? objMatch[0] : jsonStr);
    } catch (parseErr) {
      return res.status(422).json({
        error: 'No se pudo interpretar la factura. Intentá con una imagen más clara.',
        // No devolvemos raw en prod para evitar filtrar contenido del OCR
        raw: process.env.NODE_ENV === 'production' ? undefined : responseText,
      });
    }
    if (!parsed || typeof parsed !== 'object') {
      return res.status(422).json({ error: 'La IA devolvió un formato inesperado. Intentá con otra imagen.' });
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
        otrosImpuestos: parsed.otros_impuestos ?? null,
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
    // Capturamos el tenant ACÁ (primer tick del handler) porque dentro del
    // $transaction interactivo el ALS puede perderse si una operación async
    // interna salta fuera del frame. Lo inyectamos explícitamente en los
    // creates que tienen FK a Organizacion — sin esto, si la extensión
    // multi-tenant no interceptó la query, el default organizacionId=0 viola
    // el FK y la transacción entera se rollea back → "Error al registrar
    // factura" en el frontend.
    const { organizacionId } = getTenant();

    const {
      items, proveedorId, depositoDestinoId, usuarioId,
      fecha, documentoRef,
      tipoComprobante, fechaVencimiento,
      subtotal, iva, otrosImpuestos, total,
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

      const esRemito = (tipoComprobante || 'ticket') === 'remito';

      // 1. Crear Factura — organizacionId explícito por defensa.
      const factura = await tx.factura.create({
        data: {
          organizacionId,
          codigo,
          tipoComprobante: tipoComprobante || 'ticket',
          numero: documentoRef || '',
          fecha: fechaFinal,
          fechaVencimiento: fechaVencimiento || null,
          proveedorId: proveedorId ? Number(proveedorId) : 1, // fallback
          subtotal: Number(subtotal || 0),
          iva: Number(iva || 0),
          otrosImpuestos: Number(otrosImpuestos || 0),
          total: Number(total || 0),
          // Remitos: quedan como "pagados" automáticamente (no hay importe real).
          // Cuando llegue la factura correspondiente se registra por separado.
          estado: esRemito ? 'pagada' : 'pendiente',
          imagenBase64: imagenBase64 || null,
          observacion: esRemito ? `Remito registrado (sin importe)` : `Ingreso desde factura escaneada`,
          creadoPorId: Number(usuarioId),
        },
      });

      // 2. Crear FacturaItems en batch (1 query vs N).
      // Normalizamos números a no-NaN para evitar registros corruptos por
      // cantidades/precios ausentes o strings basura.
      const toNum = (v: any, d = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
      };
      // Para remitos la cantidad puede venir 0 o null — defaulteamos a 1 para
      // que el movimiento de ingreso quede registrado aunque no sepamos la
      // cantidad exacta (precio también puede ser 0).
      const normalizarCantidad = (i: any) => esRemito
        ? (toNum(i.cantidad) > 0 ? toNum(i.cantidad) : 1)
        : toNum(i.cantidad);
      // Items válidos para crear movimientos: remito solo necesita productoId.
      const itemsValidos = items.filter((i: any) =>
        i.productoId && (esRemito ? true : toNum(i.cantidad) > 0)
      );
      await tx.facturaItem.createMany({
        data: items.map((item: any) => {
          const qty = normalizarCantidad(item);
          const precio = toNum(item.precioUnitario);
          const alic = toNum(item.alicuotaIva);
          const subtotal = qty * precio;
          return {
            facturaId: factura.id,
            productoId: item.productoId ? Number(item.productoId) : null,
            descripcion: (item.descripcion || '').slice(0, 500),
            cantidad: qty,
            unidad: item.unidad || 'unidad',
            precioUnitario: precio,
            alicuotaIva: alic,
            subtotal,
            iva: subtotal * alic / 100,
          };
        }),
      });

      // 3. Crear Movimientos de ingreso en batch (solo items con producto asignado).
      // Después los leemos ordenados para devolver al cliente y para que
      // detectarVariaciones reciba el contexto correcto.
      if (itemsValidos.length) {
        await tx.movimiento.createMany({
          data: itemsValidos.map((item: any) => ({
            organizacionId,
            tipo: 'ingreso',
            productoId: Number(item.productoId),
            cantidad: normalizarCantidad(item),
            unidad: item.unidad || 'unidad',
            costoUnitario: item.precioUnitario ? toNum(item.precioUnitario) : null,
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
          })),
        });
      }
      const movimientos = await tx.movimiento.findMany({
        where: { facturaId: factura.id },
        orderBy: { id: 'asc' },
      });

      // 4. Detectar variaciones de precio ANTES de sobrescribir ultimoPrecio.
      // Importante: excluimos la factura recién creada para no compararla
      // contra sí misma (ya insertó sus propios facturaItems). El snapshot
      // del precio previo queda persistido en AlertaPrecio aunque después
      // se actualice ProveedorProducto.ultimoPrecio.
      const variaciones: VariacionDetectada[] = await detectarVariaciones(
        tx,
        proveedorId ? Number(proveedorId) : null,
        itemsValidos.map((i: any) => ({
          productoId: Number(i.productoId),
          precioUnitario: Number(i.precioUnitario || 0),
          unidad: i.unidad || 'unidad',
        })),
        { excluirFacturaId: factura.id },
      );
      const alertasIds = await persistirAlertas(tx, factura.id, variaciones);

      // 5. Actualizar/crear ProveedorProducto si hay proveedor.
      // Deduplicamos por productoId: si un producto aparece N veces, solo
      // persistimos el último precio visto.
      //
      // Antes hacíamos updateMany — que NO creaba el mapping si no existía.
      // Consecuencia: cargabas una factura de "Don Juan" con 3 productos, la
      // IA los matcheaba contra el catálogo, pero en la pantalla de
      // "Lista de precios de Don Juan" no aparecía nada (porque el mapping
      // Proveedor×Producto no se creaba). El cliente tenía que ir a
      // Proveedores → "Agregar producto" manualmente para cada uno.
      //
      // Ahora hacemos upsert: si ya existe el mapping, update. Si no, lo
      // creamos con el nombre del producto como nombreProveedor (placeholder
      // editable después). Esto hace que el flujo factura → lista de precios
      // sea automático, que es lo que el cliente siempre esperó.
      if (proveedorId) {
        // Necesitamos el nombre del producto para el caso de create. Traemos
        // un map una sola vez (evita N queries).
        const pidsUnicos: number[] = Array.from(new Set(
          itemsValidos
            .map((i: any) => Number(i.productoId))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        )) as number[];
        const productosBase = pidsUnicos.length
          ? await tx.producto.findMany({
              where: { id: { in: pidsUnicos } },
              select: { id: true, nombre: true },
            })
          : [];
        const nombrePorId = new Map<number, string>(
          productosBase.map((p: any) => [p.id, p.nombre])
        );

        const precioPorProducto = new Map<number, { precio: number; descripcion: string }>();
        for (const item of itemsValidos) {
          const pid = Number(item.productoId);
          const precio = toNum(item.precioUnitario);
          if (pid > 0 && precio > 0) {
            // Dedupe: último precio gana. Conservamos la descripción original
            // de la factura por si es la primera vez que vemos el mapping.
            precioPorProducto.set(pid, { precio, descripcion: item.descripcion || '' });
          }
        }

        for (const [pid, { precio, descripcion }] of precioPorProducto) {
          try {
            // findFirst + update/create en lugar de upsert porque no hay
            // índice único compuesto proveedorId+productoId garantizado.
            // organizacionId explícito para no depender de la extensión
            // dentro de $transaction.
            const existing = await tx.proveedorProducto.findFirst({
              where: { organizacionId, proveedorId: Number(proveedorId), productoId: pid },
              select: { id: true },
            });
            if (existing) {
              await tx.proveedorProducto.update({
                where: { id: existing.id },
                data: { ultimoPrecio: precio, fechaPrecio: fechaFinal },
              });
            } else {
              const nombreFallback = descripcion?.trim()
                || nombrePorId.get(pid)
                || `Producto #${pid}`;
              await tx.proveedorProducto.create({
                data: {
                  organizacionId,
                  proveedorId: Number(proveedorId),
                  productoId: pid,
                  nombreProveedor: nombreFallback.slice(0, 200),
                  ultimoPrecio: precio,
                  fechaPrecio: fechaFinal,
                },
              });
            }
          } catch (e: any) {
            // Log pero no romper la transacción entera — el registro de la
            // factura y los movimientos son más importantes que este side-effect.
            console.warn('[facturas/confirmar] upsert PP fallo:', e?.message);
          }
        }
      }

      return { factura, movimientos, variaciones, alertasIds };
    });

    res.json({
      ok: true,
      facturaCodigo: resultado.factura.codigo,
      facturaId: resultado.factura.id,
      registrados: resultado.movimientos.length,
      mensaje: `Factura ${resultado.factura.codigo} registrada con ${resultado.movimientos.length} ingresos`,
      alertasPrecio: resultado.variaciones,
      alertasPrecioIds: resultado.alertasIds,
    });
  } catch (err: any) {
    console.error('[facturas/confirmar]', err);
    res.status(500).json({ error: err.message || 'Error al registrar factura' });
  }
});

export default router;
