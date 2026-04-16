import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Gemini model — same as aiChat.ts
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse Argentine price: "17.007,31" → 17007.31 */
function parseArgPrice(str: string | number | null | undefined): number | null {
  if (str == null) return null;
  const s = String(str).replace(/[^0-9.,]/g, '');
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s);
}

/** Parse presentation to base unit qty */
function parsePresentacion(str: string | null): { totalQty: number; baseUnit: string } | null {
  if (!str || typeof str !== 'string') return null;
  const s = str.toUpperCase().replace(/,/g, '.').replace(/[()]/g, ' ');
  const UNITS = 'KGS?|KILOS?|GRS?|G|LTS?|L|LITROS?|ML|CC';
  const N = '(\\d+\\.?\\d*)';

  function toBase(qty: number, rawUnit: string) {
    const u = rawUnit.trim();
    if (/^(KGS?|KILOS?)$/.test(u)) return { totalQty: qty, baseUnit: 'kg' };
    if (/^(GRS?|G)$/.test(u)) return { totalQty: qty / 1000, baseUnit: 'kg' };
    if (/^(LTS?|L|LITROS?)$/.test(u)) return { totalQty: qty, baseUnit: 'litro' };
    if (/^(ML|CC)$/.test(u)) return { totalQty: qty / 1000, baseUnit: 'litro' };
    return null;
  }

  // Pattern 1: N [words] X N UNIT
  const m1 = s.match(new RegExp(`${N}\\s*[A-Z\\s]*?[X×]\\s*${N}\\s*(${UNITS})\\b`));
  if (m1) {
    const n1 = parseFloat(m1[1]), n2 = parseFloat(m1[2]);
    if (!isNaN(n1) && !isNaN(n2) && n1 > 0 && n2 > 0) {
      const r = toBase(n1 * n2, m1[3]);
      if (r) return r;
    }
  }

  // Pattern 2: X N [words] N UNIT
  const m2 = s.match(new RegExp(`[X×]\\s*${N}\\s*(?:[A-Z\\.]+\\s*)?${N}\\s*(${UNITS})\\b`));
  if (m2) {
    const n1 = parseFloat(m2[1]), n2 = parseFloat(m2[2]);
    if (!isNaN(n1) && !isNaN(n2) && n1 > 0 && n2 > 0) {
      const r = toBase(n1 * n2, m2[3]);
      if (r) return r;
    }
  }

  // Pattern 3: simple N UNIT
  const m3 = s.match(new RegExp(`${N}\\s*(${UNITS})\\b`));
  if (m3) {
    const qty = parseFloat(m3[1]);
    if (!isNaN(qty) && qty > 0) {
      const r = toBase(qty, m3[2]);
      if (r) return r;
    }
  }

  return null;
}

async function callGemini(prompt: string, maxTokens = 4000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
  });
  return result.response.text();
}

/**
 * Parsea y valida la respuesta JSON de Gemini contra un schema mínimo.
 * Gemini a veces devuelve:
 *  - JSON con markdown envolvente (```json ... ```)
 *  - JSON con texto antes/después
 *  - JSON malformado por truncación de maxOutputTokens
 *  - Array con objetos de schema incorrecto
 *
 * Este helper convierte todos esos casos en un array vacío en vez de
 * crashear el handler con TypeError. Filtra items inválidos.
 */
function safeParseAIArray<T>(raw: string, validator: (x: any) => T | null): T[] {
  if (!raw || typeof raw !== 'string') return [];
  // Quitar markdown fences si existen
  const clean = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  // Buscar primer array top-level
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: T[] = [];
  for (const item of parsed) {
    const v = validator(item);
    if (v !== null) result.push(v);
  }
  return result;
}

// Validadores de schema — defensa ante respuestas inconsistentes de la IA.
function isValidExtractedRow(x: any): { producto: string; presentacion: string | null; precio: number; ambiguo?: boolean } | null {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.producto !== 'string' || !x.producto.trim()) return null;
  const precio = Number(x.precio);
  if (!Number.isFinite(precio) || precio <= 0 || precio > 100_000_000) return null;
  const presentacion = typeof x.presentacion === 'string' && x.presentacion.trim()
    ? x.presentacion.trim()
    : null;
  return {
    producto: x.producto.trim().slice(0, 200),
    presentacion: presentacion ? presentacion.slice(0, 100) : null,
    precio,
    ambiguo: Boolean(x.ambiguo),
  };
}
function isValidMatch(x: any): { idx: number; productoId: number | null; confianza: string } | null {
  if (!x || typeof x !== 'object') return null;
  if (typeof x.idx !== 'number' || !Number.isInteger(x.idx) || x.idx < 0) return null;
  const productoId = x.productoId == null ? null : Number(x.productoId);
  if (productoId !== null && (!Number.isInteger(productoId) || productoId <= 0)) return null;
  const confianza = typeof x.confianza === 'string' ? x.confianza : 'baja';
  return { idx: x.idx, productoId, confianza };
}

// ── AI Prompt: Extract prices from text ──────────────────────────────────────
const EXTRACTION_PROMPT = (chunk: string) => `TAREA: Extraer productos, presentaciones y precios de un fragmento de lista de precios de un proveedor gastronómico argentino.

FORMATO DE RESPUESTA — JSON array estricto, sin markdown, sin backticks, sin texto extra:
[{"producto":"NOMBRE","presentacion":"PRESENTACIÓN","precio":NUMERO,"ambiguo":false}]

REGLAS DE PRECIOS — formato argentino:
- "17.007,31" → 17007.31 (punto = miles, coma = decimal). SIEMPRE.
- "$17.007" sin coma → 17007 (entero). El punto es separador de miles, NO decimal.
- "$ 850" → 850. "$ 1.200" → 1200.
- Si el precio resulta < $10 o > $5.000.000 → probablemente leíste mal el formato. Revisá el separador.
- NUNCA dejes el precio como 17.007 (float) cuando debería ser 17007 (entero con punto de miles).

REGLAS DE NOMBRE DE PRODUCTO:
- Extraé el nombre comercial completo incluyendo marca si aparece: "Crema de Leche La Paulina", no solo "Crema de Leche".
- Capitalizá tipo título: "BARRA DANBO LA PAULINA" → "Barra Danbo La Paulina".
- NO incluyas la presentación/peso en el nombre: "BURRATA MOZZARI X 250 GRS" → producto: "Burrata Mozzari", presentacion: "x 250 GRS".

REGLAS DE PRESENTACIÓN Y UNIDADES:
- "x 250 GRS" / "250 gr" / "250 grs" / "250g" → presentacion: "x 250 GRS"
- "1/2 kg" / "1/2KG" / "medio kilo" → presentacion: "x 500 GRS"
- "1/4 kg" → presentacion: "x 250 GRS"
- "x 5 LT" / "5 lts" / "5 litros" / "5L" → presentacion: "x 5 LT"
- "x 12 UN" / "x12 uds" / "caja x 12" / "cajón x 12" → presentacion: "Caja x 12 UN"
- "KG" / "KG." / "por kilo" / "x kg" al final → presentacion: "KG" (se vende por kilo)
- "UD." / "UN." / "unidad" / "c/u" → presentacion: "UN"
- "BALDE" / "BIDON" → incluirlo: "Balde x 5 LT", "Bidón x 10 LT"
- Si NO hay información de presentación/unidad → presentacion: null, ambiguo: true

EJEMPLOS COMPLETOS:
- "BARRA DANBO LA PAULINA SIN TACC KG. 9.000,00" → {"producto":"Barra Danbo La Paulina Sin TACC","presentacion":"KG","precio":9000,"ambiguo":false}
- "BURRATA MOZZARI X 250 GRS 8.053,39" → {"producto":"Burrata Mozzari","presentacion":"x 250 GRS","precio":8053.39,"ambiguo":false}
- "CREMA DE LECHE LA PAULINA BALDE X 5LT 43.287,24" → {"producto":"Crema de Leche La Paulina","presentacion":"Balde x 5 LT","precio":43287.24,"ambiguo":false}
- "ACEITE GIRASOL COCINERO 15.500" → {"producto":"Aceite Girasol Cocinero","presentacion":null,"precio":15500,"ambiguo":true}

QUÉ OMITIR (no incluir en el array):
- Encabezados de categoría/sección (ej: "LÁCTEOS", "FIAMBRES", "--- CARNES ---")
- Totales, subtotales, IVA, descuentos
- Líneas sin precio numérico
- Texto promocional, condiciones de venta, datos del proveedor
- Líneas duplicadas (si el mismo producto aparece dos veces con el mismo precio, incluilo una sola vez)

TEXTO A PROCESAR:
${chunk}

Respondé SOLO con el JSON array.`;

// ── AI Prompt: Match items to products ───────────────────────────────────────
function buildMatchPrompt(prodList: string, itemList: string) {
  return `TAREA: Matchear productos de un proveedor con los productos internos de un restaurante argentino.

PRODUCTOS INTERNOS DEL RESTAURANTE (ID|CODIGO|NOMBRE|RUBRO):
${prodList}

PRODUCTOS DEL PROVEEDOR A MATCHEAR (IDX|NOMBRE|PRESENTACIÓN):
${itemList}

CRITERIOS DE MATCHING — en orden de prioridad:
1. ¿Es el mismo insumo base? Ignorá marca, presentación, peso y envase.
   "Crema de Leche La Paulina Balde x 5LT" → matchea con "Crema de Leche" interno.
   "Muzza. La Serenísima 5kg" → matchea con "Muzzarella" interno.
2. Usá el rubro del producto interno como contexto para desambiguar.
3. Si el proveedor vende una variedad específica y el catálogo tiene el genérico, matcheá igual (ej: "Tomate Perita" → "Tomate").
4. Si el catálogo tiene la variedad específica, preferí esa sobre el genérico.

ABREVIACIONES COMUNES:
- "Muzza"/"Muz."/"Mozza" → Muzzarella | "Tom." → Tomate | "Ceb." → Cebolla
- "Morr." → Morrón | "Prov." → Provolone | "Parm." → Parmesano
- "Rúc." → Rúcula | "Criolla" → Cebolla Criolla | "Yerba" → Yerba mate
- "Harina 000"/"H. 000"/"H000" → Harina 000

CONFIANZA:
- "alta": match claro e inequívoco.
- "media": probablemente el mismo producto pero hay ambigüedad.
- "baja": match muy dudoso o no hay correspondencia → usá productoId: null.

REGLAS ESTRICTAS:
- SOLO usá IDs que existan en la lista de productos internos de arriba. Si inventás un ID, el sistema falla.
- Si no hay match razonable → productoId: null.
- Respondé SOLO con JSON array (sin markdown, sin backticks, sin texto):
[
  {"idx":0,"productoId":123,"confianza":"alta"},
  {"idx":1,"productoId":null,"confianza":"baja"}
]`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/listas-precio — List all price list batches
router.get('/', async (_req: Request, res: Response) => {
  try {
    const listas = await prisma.listaPrecio.findMany({
      include: {
        proveedor: { select: { nombre: true, codigo: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Add match stats — un solo groupBy reemplaza N×2 counts.
    const listaIds = listas.map((l: any) => l.id);
    const stats = listaIds.length ? await prisma.listaPrecioItem.groupBy({
      by: ['listaPrecioId', 'estadoMatch'],
      where: { listaPrecioId: { in: listaIds }, activo: true },
      _count: { _all: true },
    }) : [];
    const statsMap = new Map<number, { pendientes: number; ok: number }>();
    for (const s of stats) {
      const cur = statsMap.get(s.listaPrecioId) || { pendientes: 0, ok: 0 };
      if (s.estadoMatch === 'PENDIENTE') cur.pendientes = s._count._all;
      if (s.estadoMatch === 'OK') cur.ok = s._count._all;
      statsMap.set(s.listaPrecioId, cur);
    }
    const result = listas.map((l: any) => {
      const s = statsMap.get(l.id) || { pendientes: 0, ok: 0 };
      return { ...l, stats: { total: l._count.items, pendientes: s.pendientes, ok: s.ok } };
    });

    res.json(result);
  } catch (error: any) {
    console.error('[listas-precio/get]', error);
    res.status(500).json({ error: 'Error al obtener listas de precio' });
  }
});

// GET /api/listas-precio/:id — Get single batch with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lista = await prisma.listaPrecio.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        proveedor: { select: { nombre: true, codigo: true } },
        items: {
          where: { activo: true },
          include: {
            proveedorProducto: {
              include: { producto: { select: { id: true, codigo: true, nombre: true, rubro: true, unidadUso: true } } },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!lista) { res.status(404).json({ error: 'Lista no encontrada' }); return; }
    res.json(lista);
  } catch (error: any) {
    console.error('[listas-precio/get/:id]', error);
    res.status(500).json({ error: 'Error al obtener lista' });
  }
});

// POST /api/listas-precio/importar — Upload file + AI extraction
router.post('/importar', upload.single('archivo'), async (req: Request, res: Response) => {
  try {
    // Capturamos el tenant context INMEDIATAMENTE, antes de cualquier trabajo
    // async pesado (parseo de PDF/xlsx, llamadas paralelas a Gemini via
    // Promise.allSettled, prisma.$transaction interactiva). Varias de esas
    // operaciones crean async resources nuevos (undici fetch, workers de
    // pdf-parse, conexiones dedicadas de transaction interactiva) que, en
    // combinación con multer consumiendo el stream del req, pueden saltar
    // fuera del frame ALS aunque tenantMiddleware haya seteado el store.
    //
    // Al leer getTenant() ACÁ — primer tick del handler, mientras el ALS
    // frame recién inicializado por tenantMiddleware todavía está vivo —
    // metemos organizacionId en una variable local y eliminamos toda
    // dependencia del contexto para el resto del request.
    const { organizacionId } = getTenant();

    const { proveedorId, fecha } = req.body;
    const file = req.file;

    if (!proveedorId || !file) {
      res.status(400).json({ error: 'Faltan proveedorId y archivo' });
      return;
    }

    const fechaFinal = fecha || new Date().toISOString().split('T')[0];
    const ext = file.originalname.toLowerCase().split('.').pop();
    let textLines: string[] = [];

    // Parse file content
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      textLines = rows
        .filter((r: any[]) => r.some((c: any) => c != null && String(c).trim()))
        .map((r: any[]) => r.map((c: any) => c ?? '').join(' | '));
    } else if (ext === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: file.buffer });
      const result = await pdf.getText();
      await pdf.destroy();
      textLines = result.text.split('\n').filter((l: string) => l.trim());
    } else {
      // Plain text
      textLines = file.buffer.toString('utf-8').split('\n').filter((l: string) => l.trim());
    }

    if (!textLines.length) {
      res.status(400).json({ error: 'No se pudo extraer contenido del archivo' });
      return;
    }

    // AI extraction in chunks — parallel for speed
    const CHUNK = 150;
    const chunks: string[] = [];
    for (let i = 0; i < textLines.length; i += CHUNK) {
      chunks.push(textLines.slice(i, i + CHUNK).join('\n'));
    }

    const allRows: Array<{ producto: string; presentacion: string | null; precio: number; ambiguo?: boolean }> = [];
    const chunkResults = await Promise.allSettled(
      chunks.map(async (chunk) => {
        const text = await callGemini(EXTRACTION_PROMPT(chunk), 8000);
        return safeParseAIArray(text, isValidExtractedRow);
      })
    );
    for (const r of chunkResults) {
      if (r.status === 'fulfilled' && r.value.length) allRows.push(...r.value);
      else if (r.status === 'rejected') console.warn('[listas-precio] chunk error:', r.reason?.message);
    }

    if (!allRows.length) {
      res.status(400).json({ error: 'La IA no pudo extraer productos del archivo' });
      return;
    }

    // Create in transaction
    // NOTE: `tx` inside $transaction is a raw PrismaClient — the multi-tenant
    // extension does NOT apply to it. Usamos el organizacionId que capturamos
    // al principio del handler (línea ~231) y lo inyectamos explícitamente en
    // cada operación tenant-aware dentro de la transacción.
    const resultado = await prisma.$transaction(async (tx: any) => {
      // Auto-generate code LP-XXX (scoped to this org)
      const last = await tx.listaPrecio.findFirst({
        where: { organizacionId },
        orderBy: { id: 'desc' },
        select: { codigo: true },
      });
      let nextNum = 1;
      if (last) {
        const m = last.codigo.match(/LP-(\d+)/);
        if (m) nextNum = parseInt(m[1]) + 1;
      }
      const codigo = `LP-${String(nextNum).padStart(3, '0')}`;

      const lista = await tx.listaPrecio.create({
        data: {
          organizacionId,
          codigo,
          proveedorId: Number(proveedorId),
          fecha: fechaFinal,
          archivoOrigen: file.originalname,
          estado: 'pendiente',
        },
      });

      // Try auto-match by name against existing ProveedorProducto
      const existingMaps = await tx.proveedorProducto.findMany({
        where: { organizacionId, proveedorId: Number(proveedorId) },
        select: { id: true, nombreProveedor: true },
      });
      const nameIndex: Record<string, number> = {};
      existingMaps.forEach((m: any) => {
        nameIndex[m.nombreProveedor.toLowerCase().trim()] = m.id;
      });

      // Create items
      for (const row of allRows) {
        const nombre = String(row.producto).trim();
        const pres = row.presentacion || null;
        const precio = Number(row.precio);
        const tipoCompra = pres && /caja/i.test(pres) ? 'CAJA' : 'UNIDAD';

        // Calculate derived prices.
        // `unidades_por_caja` no es parte del schema validado (opcional/legacy);
        // lo leemos defensivamente como any para mantener compat.
        const unidadesPorCaja = Number((row as any).unidades_por_caja);
        const parsed = parsePresentacion(pres);
        const precioPorUnidad = tipoCompra === 'CAJA' && Number.isFinite(unidadesPorCaja) && unidadesPorCaja > 0
          ? precio / unidadesPorCaja
          : precio;
        const precioPorMedidaBase = parsed && parsed.totalQty > 0
          ? precioPorUnidad / parsed.totalQty
          : null;

        // Auto-match
        const matchedId = nameIndex[nombre.toLowerCase()];

        await tx.listaPrecioItem.create({
          data: {
            listaPrecioId: lista.id,
            productoOriginal: nombre,
            presentacionOriginal: pres,
            tipoCompra,
            precioInformado: precio,
            precioPorUnidad,
            precioPorMedidaBase,
            unidadMedida: parsed?.baseUnit || null,
            cantidadPorUnidad: parsed?.totalQty || null,
            proveedorProductoId: matchedId || null,
            estadoMatch: matchedId ? 'OK' : 'PENDIENTE',
          },
        });
      }

      return lista;
    });

    // Return full object
    const full = await prisma.listaPrecio.findUnique({
      where: { id: resultado.id },
      include: {
        proveedor: { select: { nombre: true } },
        items: { where: { activo: true } },
      },
    });

    res.status(201).json(full);
  } catch (error: any) {
    console.error('[listas-precio/importar]', error);
    res.status(500).json({ error: error.message || 'Error al importar lista' });
  }
});

// POST /api/listas-precio/:id/match — Manual match single item
router.post('/:id/match', async (req: Request, res: Response) => {
  try {
    const { itemId, productoId } = req.body;
    if (!itemId || !productoId) {
      res.status(400).json({ error: 'Faltan itemId y productoId' });
      return;
    }

    const item = await prisma.listaPrecioItem.findUnique({
      where: { id: Number(itemId) },
      include: { listaPrecio: { select: { proveedorId: true } } },
    });
    if (!item) { res.status(404).json({ error: 'Item no encontrado' }); return; }

    const proveedorId = (item as any).listaPrecio.proveedorId;

    // Find or create ProveedorProducto
    let mapping = await prisma.proveedorProducto.findFirst({
      where: { proveedorId, productoId: Number(productoId) },
    });

    if (!mapping) {
      mapping = await prisma.proveedorProducto.create({
        data: {
          proveedorId,
          productoId: Number(productoId),
          nombreProveedor: item.productoOriginal,
          ultimoPrecio: item.precioPorUnidad || item.precioInformado,
          fechaPrecio: (item as any).listaPrecio?.fecha || new Date().toISOString().split('T')[0],
        },
      });
    } else {
      // Update price
      await prisma.proveedorProducto.update({
        where: { id: mapping.id },
        data: {
          ultimoPrecio: item.precioPorUnidad || item.precioInformado,
          fechaPrecio: new Date().toISOString().split('T')[0],
        },
      });
    }

    // Update item
    await prisma.listaPrecioItem.update({
      where: { id: Number(itemId) },
      data: { proveedorProductoId: mapping.id, estadoMatch: 'OK' },
    });

    res.json({ ok: true, proveedorProductoId: mapping.id });
  } catch (error: any) {
    console.error('[listas-precio/match]', error);
    res.status(500).json({ error: 'Error al matchear item' });
  }
});

// POST /api/listas-precio/:id/match-ai — AI auto-match pending items
router.post('/:id/match-ai', async (req: Request, res: Response) => {
  try {
    const listaId = parseInt(req.params.id as string);
    const lista = await prisma.listaPrecio.findUnique({ where: { id: listaId } });
    if (!lista) { res.status(404).json({ error: 'Lista no encontrada' }); return; }

    // Get pending items
    const pendientes = await prisma.listaPrecioItem.findMany({
      where: { listaPrecioId: listaId, estadoMatch: 'PENDIENTE', activo: true },
    });
    if (!pendientes.length) {
      res.json({ results: [], message: 'No hay items pendientes' });
      return;
    }

    // Get all products for matching
    const productos = await prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true, rubro: true },
    });
    const prodList = productos.map((p: any) => `${p.id}|${p.codigo}|${p.nombre}|${p.rubro || ''}`).join('\n');

    // Process in batches of 20
    const BATCH = 20;
    const allResults: any[] = [];
    for (let b = 0; b < pendientes.length; b += BATCH) {
      const batch = pendientes.slice(b, b + BATCH);
      const itemList = batch.map((it: any, i: number) =>
        `${i}|${it.productoOriginal}|${it.presentacionOriginal || ''}`
      ).join('\n');

      try {
        const resp = await callGemini(buildMatchPrompt(prodList, itemList), 3000);
        const parsed = safeParseAIArray(resp, isValidMatch);
        // Solo aceptamos productoId que exista en el catálogo enviado — blindaje
        // contra IA que inventa IDs.
        const validIds = new Set(productos.map((p: any) => p.id));
        for (const m of parsed) {
          if (m.idx < batch.length) {
            const pid = m.productoId && validIds.has(m.productoId) ? m.productoId : null;
            allResults.push({
              itemId: batch[m.idx].id,
              productoOriginal: batch[m.idx].productoOriginal,
              productoId: pid,
              confianza: pid ? m.confianza : 'baja',
            });
          }
        }
      } catch (e: any) {
        console.warn('[match-ai] batch error:', e.message);
        batch.forEach((item: any) => {
          allResults.push({ itemId: item.id, productoOriginal: item.productoOriginal, productoId: null, confianza: 'error' });
        });
      }
    }

    // Enrich results with product info
    const prodMap = new Map(productos.map((p: any) => [p.id, p]));
    const enriched = allResults.map((r: any) => ({
      ...r,
      producto: r.productoId ? prodMap.get(r.productoId) : null,
    }));

    res.json({ results: enriched });
  } catch (error: any) {
    console.error('[listas-precio/match-ai]', error);
    res.status(500).json({ error: 'Error en auto-match IA' });
  }
});

// POST /api/listas-precio/:id/apply-matches — Apply reviewed matches in bulk
router.post('/:id/apply-matches', async (req: Request, res: Response) => {
  try {
    const listaId = parseInt(req.params.id as string);
    const { matches } = req.body; // [{ itemId, productoId }]
    if (!matches?.length) { res.status(400).json({ error: 'No matches to apply' }); return; }

    const lista = await prisma.listaPrecio.findUnique({ where: { id: listaId } });
    if (!lista) { res.status(404).json({ error: 'Lista no encontrada' }); return; }

    let applied = 0;
    await prisma.$transaction(async (tx: any) => {
      for (const m of matches) {
        if (!m.itemId || !m.productoId) continue;

        const item = await tx.listaPrecioItem.findUnique({ where: { id: Number(m.itemId) } });
        if (!item || item.listaPrecioId !== listaId) continue;

        // Find or create ProveedorProducto
        let mapping = await tx.proveedorProducto.findFirst({
          where: { proveedorId: lista.proveedorId, productoId: Number(m.productoId) },
        });
        if (!mapping) {
          mapping = await tx.proveedorProducto.create({
            data: {
              proveedorId: lista.proveedorId,
              productoId: Number(m.productoId),
              nombreProveedor: item.productoOriginal,
              ultimoPrecio: item.precioPorUnidad || item.precioInformado,
              fechaPrecio: lista.fecha,
            },
          });
        } else {
          await tx.proveedorProducto.update({
            where: { id: mapping.id },
            data: {
              ultimoPrecio: item.precioPorUnidad || item.precioInformado,
              fechaPrecio: lista.fecha,
            },
          });
        }

        await tx.listaPrecioItem.update({
          where: { id: Number(m.itemId) },
          data: { proveedorProductoId: mapping.id, estadoMatch: 'OK' },
        });
        applied++;
      }
    });

    res.json({ ok: true, applied });
  } catch (error: any) {
    console.error('[listas-precio/apply-matches]', error);
    res.status(500).json({ error: 'Error al aplicar matches' });
  }
});

// DELETE /api/listas-precio/:id — Delete batch
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.listaPrecio.delete({ where: { id: parseInt(req.params.id as string) } });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[listas-precio/delete]', error);
    res.status(500).json({ error: 'Error al eliminar lista' });
  }
});

export default router;
