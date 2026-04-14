import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
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

// ── AI Prompt: Extract prices from text ──────────────────────────────────────
const EXTRACTION_PROMPT = (chunk: string) => `Sos un experto en listas de precios de proveedores gastronómicos argentinos.
Tu tarea: extraer productos con nombre, presentación y precio de este fragmento de lista.

REGLAS DE PRECIOS:
- Formato argentino: 17.007,31 → 17007.31 (punto=miles, coma=decimal)
- Si ves "$17.007,31" o "$ 17.007" tratalo igual
- Si el precio parece por encima de $5.000.000 o por debajo de $1, marcalo como sospechoso

REGLAS DE PRESENTACIÓN Y UNIDADES (MUY IMPORTANTES):
- "x 250 GRS" o "250 gr" o "250 grs" → presentacion:"x 250 GRS"
- "1/2 kg" o "1/2KG" → presentacion:"x 500 GRS"
- "1/4 kg" → presentacion:"x 250 GRS"
- "x 5 LT" o "5 lts" o "5 litros" → presentacion:"x 5 LT"
- "x 12 UN" o "x12 uds" o "caja x 12" → tipo_compra:"CAJA", presentacion:"Caja x 12 UN"
- "KG." al final → vendido por kg, presentacion:"KG"
- "UD." o "UN." al final → unidad, presentacion:"UN"
- Si la cantidad/unidad es ambigua → ambiguo:true

EJEMPLOS:
- "BARRA DANBO LA PAULINA SIN TACC KG. 9.000,00" → {producto:"Barra Danbo La Paulina Sin TACC", presentacion:"KG", precio:9000}
- "BURRATA MOZZARI X 250 GRS 8.053,39" → {producto:"Burrata Mozzari", presentacion:"x 250 GRS", precio:8053.39}
- "CREMA DE LECHE LA PAULINA BALDE X 5LT 43.287,24" → {producto:"Crema de Leche La Paulina", presentacion:"Balde x 5 LT", precio:43287.24}

QUÉ OMITIR: Encabezados de categoría, totales/IVA/subtotales, líneas sin precio, promociones.

TEXTO A PROCESAR:
${chunk}

Respondé SOLO con JSON array válido, sin markdown ni texto extra:
[{"producto":"NOMBRE","presentacion":"PRESENTACIÓN","precio":NUMERO,"ambiguo":false},...]`;

// ── AI Prompt: Match items to products ───────────────────────────────────────
function buildMatchPrompt(prodList: string, itemList: string) {
  return `Sos un experto en insumos gastronómicos de Argentina.
Tenés que identificar a qué producto interno corresponde cada producto de proveedor.

PRODUCTOS INTERNOS (ID|CODIGO|NOMBRE|RUBRO):
${prodList}

PRODUCTOS DE PROVEEDOR (IDX|NOMBRE|PRESENTACIÓN):
${itemList}

Respondé ÚNICAMENTE con JSON válido (sin markdown ni texto extra):
[
  {"idx":0,"productoId":123,"confianza":"alta"},
  {"idx":1,"productoId":null,"confianza":"baja"}
]

Reglas:
- Si el producto del proveedor es claramente el mismo insumo que uno interno → ponés su productoId (el ID numérico)
- Si no hay match claro → productoId:null
- confianza: "alta" (muy seguro), "media" (razonablemente seguro), "baja" (con dudas)`;
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

    // Add match stats
    const result = await Promise.all(listas.map(async (l: any) => {
      const pendientes = await prisma.listaPrecioItem.count({
        where: { listaPrecioId: l.id, estadoMatch: 'PENDIENTE', activo: true },
      });
      const ok = await prisma.listaPrecioItem.count({
        where: { listaPrecioId: l.id, estadoMatch: 'OK', activo: true },
      });
      return { ...l, stats: { total: l._count.items, pendientes, ok } };
    }));

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

    // AI extraction in chunks
    const CHUNK = 80;
    const allRows: any[] = [];
    for (let i = 0; i < textLines.length; i += CHUNK) {
      const chunk = textLines.slice(i, i + CHUNK).join('\n');
      try {
        const text = await callGemini(EXTRACTION_PROMPT(chunk));
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          allRows.push(...parsed.filter((r: any) => r.producto && typeof r.precio === 'number' && r.precio > 0));
        }
      } catch (e: any) {
        console.warn('[listas-precio] chunk error:', e.message);
      }
    }

    if (!allRows.length) {
      res.status(400).json({ error: 'La IA no pudo extraer productos del archivo' });
      return;
    }

    // Create in transaction
    const resultado = await prisma.$transaction(async (tx: any) => {
      // Auto-generate code LP-XXX
      const last = await tx.listaPrecio.findFirst({ orderBy: { id: 'desc' }, select: { codigo: true } });
      let nextNum = 1;
      if (last) {
        const m = last.codigo.match(/LP-(\d+)/);
        if (m) nextNum = parseInt(m[1]) + 1;
      }
      const codigo = `LP-${String(nextNum).padStart(3, '0')}`;

      const lista = await tx.listaPrecio.create({
        data: {
          codigo,
          proveedorId: Number(proveedorId),
          fecha: fechaFinal,
          archivoOrigen: file.originalname,
          estado: 'pendiente',
        },
      });

      // Try auto-match by name against existing ProveedorProducto
      const existingMaps = await tx.proveedorProducto.findMany({
        where: { proveedorId: Number(proveedorId) },
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

        // Calculate derived prices
        const parsed = parsePresentacion(pres);
        const precioPorUnidad = tipoCompra === 'CAJA' && row.unidades_por_caja
          ? precio / row.unidades_por_caja
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
        const clean = resp.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const match = clean.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          for (const m of parsed) {
            if (typeof m.idx === 'number' && m.idx >= 0 && m.idx < batch.length) {
              allResults.push({
                itemId: batch[m.idx].id,
                productoOriginal: batch[m.idx].productoOriginal,
                productoId: m.productoId || null,
                confianza: m.confianza || 'baja',
              });
            }
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
