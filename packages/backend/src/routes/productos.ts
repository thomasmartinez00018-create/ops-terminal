import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getTenant } from '../lib/tenantContext';

const router = Router();

// GET /api/productos - Listar productos
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo, rubro, subrubro, tipo, buscar } = req.query;
    const where: any = {};

    if (activo !== undefined) where.activo = activo === 'true';
    if (rubro) where.rubro = rubro;
    if (subrubro) where.subrubro = subrubro;
    if (tipo) where.tipo = tipo;
    if (buscar) {
      where.OR = [
        { nombre: { contains: buscar as string } },
        { codigo: { contains: buscar as string } }
      ];
    }

    const productos = await prisma.producto.findMany({
      where,
      include: { depositoDefecto: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/ultimos-costos?ids=1,2,3
// Devuelve último costo de compra por producto. Uso en formulario de recetas (preview live).
// OOM-safe + pool-safe: un solo `DISTINCT ON (producto_id)` en lugar de N
// findFirst paralelos. La versión previa hacía Promise.all sobre findFirst
// por cada id — con 20 ingredientes saturaba el pool de conexiones Prisma.
router.get('/ultimos-costos', async (req: Request, res: Response) => {
  try {
    const idsParam = (req.query.ids as string) || '';
    const ids = idsParam
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => Number.isFinite(n));
    if (ids.length === 0) {
      res.json({});
      return;
    }

    const { organizacionId } = getTenant();
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<Array<{
      producto_id: number;
      costo_unitario: number | null;
      fecha: string;
    }>>(
      `SELECT DISTINCT ON (producto_id) producto_id, costo_unitario, fecha
       FROM movimientos
       WHERE tipo = 'ingreso'
         AND costo_unitario IS NOT NULL
         AND organizacion_id = $1
         AND producto_id IN (${placeholders})
       ORDER BY producto_id, fecha DESC, hora DESC`,
      organizacionId,
      ...ids
    );

    const results: Record<number, { costoUnitario: number; fecha: string }> = {};
    for (const row of rows) {
      if (row.costo_unitario != null) {
        results[Number(row.producto_id)] = {
          costoUnitario: Number(row.costo_unitario),
          fecha: row.fecha,
        };
      }
    }
    res.json(results);
  } catch (error) {
    console.error('[productos/ultimos-costos]', error);
    res.status(500).json({ error: 'Error al obtener últimos costos' });
  }
});

// GET /api/productos/tipos-circuito
// Devuelve los IDs de productos según su rol en el circuito de
// elaboración/porcionado:
//   - porcion: productos que son output de un porcionado (PorcionadoItem)
//   - elaborado: productos que son output de una elaboración (ElaboracionLote)
// Un mismo producto puede estar en ambas (es raro pero posible).
// Uso: el frontend marca visualmente los ingredientes de receta que
// vienen de estas fuentes, para que el chef entienda el circuito
// bruto → elaboración → porción → receta.
router.get('/tipos-circuito', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    // Porciones: productos usados en PorcionadoItem (porcionado.organizacion_id
    // filtra por tenant).
    const porcionRows = await prisma.$queryRaw<Array<{ producto_id: number }>>`
      SELECT DISTINCT pi.producto_id
      FROM porcionado_items pi
      JOIN porcionados p ON p.id = pi.porcionado_id
      WHERE p.organizacion_id = ${organizacionId}
    `;
    // Elaborados: productos que son resultado de elaboraciones (producto_resultado_id).
    const elaboradoRows = await prisma.$queryRaw<Array<{ producto_id: number }>>`
      SELECT DISTINCT producto_resultado_id AS producto_id
      FROM elaboracion_lotes
      WHERE organizacion_id = ${organizacionId}
        AND producto_resultado_id IS NOT NULL
    `;

    res.json({
      porcion: porcionRows.map(r => Number(r.producto_id)),
      elaborado: elaboradoRows.map(r => Number(r.producto_id)),
    });
  } catch (error) {
    console.error('[productos/tipos-circuito]', error);
    res.status(500).json({ error: 'Error al obtener tipos de circuito' });
  }
});

// GET /api/productos/vendibles?depositoId=X
// Lista productos marcados como vendibleDirecto=true con su stock en el
// depósito indicado (para mostrar en pantalla de Punto de Venta).
//
// IMPORTANTE: esta ruta debe declararse ANTES de `router.get('/:id', ...)`
// — Express matchea por orden y `:id` es un wildcard que captura cualquier
// string. Si /:id va antes, /vendibles cae acá y validateNumericParam('id')
// devuelve 400 ("Parámetro id inválido").
router.get('/vendibles', async (req: Request, res: Response) => {
  try {
    const depositoId = req.query.depositoId ? parseInt(String(req.query.depositoId)) : null;
    const productos = await prisma.producto.findMany({
      where: { vendibleDirecto: true, activo: true },
      select: {
        id: true, codigo: true, nombre: true, rubro: true, subrubro: true,
        unidadUso: true, codigoBarras: true, precioVenta: true,
      },
      orderBy: [{ rubro: 'asc' }, { nombre: 'asc' }],
    });
    if (!depositoId) return res.json(productos.map(p => ({ ...p, stockDeposito: null })));

    const ids = productos.map(p => p.id);
    if (!ids.length) return res.json([]);
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const stockRows = await prisma.$queryRawUnsafe<Array<{ producto_id: number; stock: number }>>(
      `SELECT producto_id::int as producto_id,
              COALESCE(SUM(CASE WHEN deposito_destino_id = $1 THEN cantidad
                                WHEN deposito_origen_id  = $1 THEN -cantidad
                                ELSE 0 END), 0)::float AS stock
         FROM movimientos
        WHERE (deposito_destino_id = $1 OR deposito_origen_id = $1)
          AND producto_id IN (${placeholders})
        GROUP BY producto_id`,
      depositoId, ...ids,
    );
    const stockMap = new Map(stockRows.map(r => [Number(r.producto_id), Number(r.stock)]));
    res.json(productos.map(p => ({ ...p, stockDeposito: stockMap.get(p.id) ?? 0 })));
  } catch (error: any) {
    console.error('[productos/vendibles]', error);
    res.status(500).json({ error: error?.message || 'Error' });
  }
});

// PATCH /api/productos/:id/precio-venta
// Endpoint liviano para actualizar precio de venta sin tocar el resto.
router.patch('/:id/precio-venta', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    const { precioVenta, vendibleDirecto } = req.body || {};
    const data: any = {};
    if (precioVenta !== undefined) {
      data.precioVenta = precioVenta === null || precioVenta === '' ? null : Number(precioVenta);
    }
    if (vendibleDirecto !== undefined) data.vendibleDirecto = Boolean(vendibleDirecto);
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Sin cambios' });
    const out = await prisma.producto.update({ where: { id }, data });
    res.json(out);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Error' });
  }
});

// GET /api/productos/:id
// Va DESPUÉS de las rutas con segmento fijo (/vendibles, /ultimos-costos,
// /tipos-circuito, /:id/precio-venta) — sino /:id captura todo.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: { depositoDefecto: true }
    });
    if (!producto) {
      res.status(404).json({ error: 'Producto no encontrado' });
      return;
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// POST /api/productos
router.post('/', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.create({ data: req.body });
    res.status(201).json(producto);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un producto con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// PUT /api/productos/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const producto = await prisma.producto.update({
      where: { id: parseInt(req.params.id as string) },
      data: req.body
    });
    res.json(producto);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un producto con ese código' });
      return;
    }
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// DELETE /api/productos/:id (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.producto.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false }
    });
    res.json({ message: 'Producto desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar producto' });
  }
});

// GET /api/productos/rubros/lista - Rubros únicos
router.get('/rubros/lista', async (_req: Request, res: Response) => {
  try {
    const rubros = await prisma.producto.findMany({
      select: { rubro: true },
      distinct: ['rubro'],
      orderBy: { rubro: 'asc' }
    });
    res.json(rubros.map(r => r.rubro));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener rubros' });
  }
});

// GET /api/productos/rubros/con-conteo - Rubros con cantidad de productos
// Une los rubros derivados de productos con los rubros "extra" creados
// manualmente por el usuario (Organizacion.extraRubros) que aún no tienen
// productos. Los manuales aparecen con cantProductos = 0.
router.get('/rubros/con-conteo', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const [productosRubros, org] = await Promise.all([
      prisma.producto.groupBy({
        by: ['rubro'],
        _count: { _all: true },
        where: { activo: true },
        orderBy: { rubro: 'asc' },
      }),
      prisma.organizacion.findUnique({
        where: { id: organizacionId },
        select: { extraRubros: true },
      }),
    ]);
    const conteo = new Map<string, number>();
    for (const r of productosRubros) {
      conteo.set(r.rubro, r._count._all);
    }
    // Sumar extras (con cantProductos 0 si no aparecen en productos)
    const extras: string[] = (() => {
      try { return JSON.parse(org?.extraRubros || '[]'); } catch { return []; }
    })();
    for (const e of extras) {
      if (!conteo.has(e)) conteo.set(e, 0);
    }
    const lista = Array.from(conteo.entries())
      .map(([rubro, cantProductos]) => ({ rubro, cantProductos }))
      .sort((a, b) => a.rubro.localeCompare(b.rubro, 'es'));
    res.json(lista);
  } catch (error) {
    console.error('[productos/rubros/con-conteo]', error);
    res.status(500).json({ error: 'Error al obtener rubros con conteo' });
  }
});

// POST /api/productos/rubros - Crear un nuevo rubro manual
// Body: { nombre: string }
// Lo guarda en Organizacion.extraRubros (JSON array). Si ya existe (en
// extras o en algún producto), devuelve 409 sin error fatal.
router.post('/rubros', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) {
      res.status(400).json({ error: 'El nombre del rubro es requerido' });
      return;
    }
    if (nombre.length > 60) {
      res.status(400).json({ error: 'El nombre del rubro es demasiado largo (máx 60)' });
      return;
    }
    // ¿Ya existe en productos?
    const yaEnProductos = await prisma.producto.findFirst({
      where: { rubro: nombre },
      select: { id: true },
    });
    const org = await prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { extraRubros: true },
    });
    const extras: string[] = (() => {
      try { return JSON.parse(org?.extraRubros || '[]'); } catch { return []; }
    })();
    if (yaEnProductos || extras.includes(nombre)) {
      res.status(409).json({ error: 'Ese rubro ya existe' });
      return;
    }
    const nuevosExtras = [...extras, nombre].sort((a, b) => a.localeCompare(b, 'es'));
    await prisma.organizacion.update({
      where: { id: organizacionId },
      data: { extraRubros: JSON.stringify(nuevosExtras) },
    });
    res.json({ rubro: nombre, cantProductos: 0 });
  } catch (error: any) {
    console.error('[productos/rubros POST]', error);
    res.status(500).json({ error: 'Error al crear rubro' });
  }
});

// DELETE /api/productos/rubros/:nombre - Eliminar un rubro manual
// Solo permite borrar rubros sin productos asociados (los que están solo en
// extraRubros). Si hay productos con ese rubro, devuelve 409.
router.delete('/rubros/:nombre', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const nombre = decodeURIComponent(String(req.params.nombre || '')).trim();
    if (!nombre) {
      res.status(400).json({ error: 'Nombre requerido' });
      return;
    }
    const conProductos = await prisma.producto.findFirst({
      where: { rubro: nombre },
      select: { id: true },
    });
    if (conProductos) {
      res.status(409).json({ error: 'Hay productos en este rubro. Reasignalos primero.' });
      return;
    }
    const org = await prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { extraRubros: true },
    });
    const extras: string[] = (() => {
      try { return JSON.parse(org?.extraRubros || '[]'); } catch { return []; }
    })();
    const filtrados = extras.filter(e => e !== nombre);
    await prisma.organizacion.update({
      where: { id: organizacionId },
      data: { extraRubros: JSON.stringify(filtrados) },
    });
    res.json({ borrado: true });
  } catch (error: any) {
    console.error('[productos/rubros DELETE]', error);
    res.status(500).json({ error: 'Error al eliminar rubro' });
  }
});

// PUT /api/productos/rubros/rename - Renombrar un rubro en todos los productos
// Body: { rubroViejo: string, rubroNuevo: string }
router.put('/rubros/rename', async (req: Request, res: Response) => {
  try {
    const { rubroViejo, rubroNuevo } = req.body;
    if (!rubroViejo || !rubroNuevo) {
      res.status(400).json({ error: 'rubroViejo y rubroNuevo son requeridos' });
      return;
    }
    const nuevo = String(rubroNuevo).trim();
    if (!nuevo) {
      res.status(400).json({ error: 'El rubro nuevo no puede estar vacío' });
      return;
    }
    if (nuevo === rubroViejo) {
      res.json({ actualizados: 0 });
      return;
    }
    const result = await prisma.producto.updateMany({
      where: { rubro: String(rubroViejo) },
      data: { rubro: nuevo },
    });
    // También actualizar extraRubros si el rubroViejo aparece ahí.
    try {
      const { organizacionId } = getTenant();
      const org = await prisma.organizacion.findUnique({
        where: { id: organizacionId },
        select: { extraRubros: true },
      });
      const extras: string[] = (() => {
        try { return JSON.parse(org?.extraRubros || '[]'); } catch { return []; }
      })();
      if (extras.includes(String(rubroViejo))) {
        const nuevos = extras
          .filter(e => e !== String(rubroViejo))
          .filter(e => e !== nuevo); // evitar duplicado si ya existía
        // Solo agregamos a extras si NO hay productos con el nuevo nombre
        // (si hay productos, el rubro ya aparece via groupBy).
        const tieneProductos = await prisma.producto.findFirst({
          where: { rubro: nuevo },
          select: { id: true },
        });
        if (!tieneProductos) nuevos.push(nuevo);
        nuevos.sort((a, b) => a.localeCompare(b, 'es'));
        await prisma.organizacion.update({
          where: { id: organizacionId },
          data: { extraRubros: JSON.stringify(nuevos) },
        });
      }
    } catch (e) {
      console.error('[productos/rubros/rename] extraRubros sync error', e);
    }
    res.json({ actualizados: result.count, rubroViejo, rubroNuevo: nuevo });
  } catch (error: any) {
    console.error('[productos/rubros/rename]', error);
    res.status(500).json({ error: 'Error al renombrar rubro' });
  }
});

// GET /api/productos/subrubros/lista?rubro=Vinos - Sub-rubros únicos por rubro
router.get('/subrubros/lista', async (req: Request, res: Response) => {
  try {
    const { rubro } = req.query;
    const where: any = { subrubro: { not: null } };
    if (rubro) where.rubro = rubro;

    const subrubros = await (prisma.producto as any).findMany({
      where,
      select: { subrubro: true },
      distinct: ['subrubro'],
      orderBy: { subrubro: 'asc' }
    });
    res.json(subrubros.map((s: any) => s.subrubro).filter(Boolean));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener sub-rubros' });
  }
});

// ============================================================================
// MULTI-PACK BARCODES — un producto puede tener N códigos (botella, caja x6…)
// ============================================================================

// GET /api/productos/:id/codigos-barras — lista los códigos de un producto
router.get('/:id/codigos-barras', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(String(req.params.id));
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({ error: 'id de producto inválido' });
    }
    const codigos = await prisma.productoCodigoBarras.findMany({
      where: { productoId },
      orderBy: [{ activo: 'desc' }, { factor: 'asc' }, { id: 'asc' }],
    });
    res.json(codigos);
  } catch (e: any) {
    console.error('[productos/codigos-barras] GET', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// POST /api/productos/:id/codigos-barras — UPSERT idempotente
// Body: { codigo, factor?=1, descripcion?, reasignar?=false }
//
// Lógica:
//  · No existe → CREATE (201)
//  · Existe en MISMO producto → UPDATE factor/descripción/activo (200)
//    (caso típico: el código ya estaba como "Unidad" y se cambia a "Caja x6")
//  · Existe en OTRO producto + reasignar=false → 409 con info para que el
//    frontend pregunte "está en producto X, ¿reasignar?"
//  · Existe en OTRO producto + reasignar=true → UPDATE moviendo productoId
//    al actual + actualiza factor/descripción (200)
//
// Esto evita la fricción del usuario que ve "ese código ya está en uso"
// cuando en realidad solo quiere actualizar la presentación del mismo producto.
router.post('/:id/codigos-barras', async (req: Request, res: Response) => {
  try {
    const productoId = parseInt(String(req.params.id));
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({ error: 'id de producto inválido' });
    }
    const { codigo, factor, descripcion, reasignar } = req.body || {};
    const codigoClean = String(codigo || '').trim();
    if (!codigoClean) return res.status(400).json({ error: 'codigo requerido' });
    const factorNum = Number(factor);
    const factorClean = Number.isFinite(factorNum) && factorNum > 0 ? factorNum : 1;
    const descripcionClean = descripcion ? String(descripcion).slice(0, 60) : null;

    // Buscar si el código ya existe (en el mismo producto o en otro)
    const existente = await prisma.productoCodigoBarras.findFirst({
      where: { codigo: codigoClean },
      include: { producto: { select: { id: true, nombre: true } } },
    });

    if (existente) {
      // Mismo producto → actualizar inplace (UPSERT idempotente)
      if (existente.productoId === productoId) {
        const out = await prisma.productoCodigoBarras.update({
          where: { id: existente.id },
          data: {
            factor: factorClean,
            descripcion: descripcionClean ?? existente.descripcion,
            activo: true,
          },
        });
        return res.status(200).json({ ...out, _accion: 'actualizado' });
      }
      // Otro producto: si reasignar=true, mover; sino, 409 informativo
      if (reasignar === true) {
        const out = await prisma.productoCodigoBarras.update({
          where: { id: existente.id },
          data: {
            productoId,
            factor: factorClean,
            descripcion: descripcionClean,
            activo: true,
          },
        });
        return res.status(200).json({
          ...out,
          _accion: 'reasignado',
          _desde: existente.producto,
        });
      }
      return res.status(409).json({
        error: `Ese código ya está en uso por "${existente.producto.nombre}"`,
        conflictoCon: existente.producto,
        puedeReasignar: true,
        // El frontend pregunta "querés mover este código a este producto?"
        // y reenvía con reasignar=true.
      });
    }

    // No existe → crear nuevo
    try {
      const out = await prisma.productoCodigoBarras.create({
        data: {
          productoId,
          codigo: codigoClean,
          factor: factorClean,
          descripcion: descripcionClean,
          activo: true,
        },
      });
      return res.status(201).json({ ...out, _accion: 'creado' });
    } catch (err: any) {
      // Race condition: alguien creó el mismo código entre el find y el create
      if (err.code === 'P2002') {
        const recheck = await prisma.productoCodigoBarras.findFirst({
          where: { codigo: codigoClean },
          include: { producto: { select: { id: true, nombre: true } } },
        });
        return res.status(409).json({
          error: recheck
            ? `Ese código se cargó en paralelo en "${recheck.producto.nombre}"`
            : 'Conflicto creando el código',
          conflictoCon: recheck?.producto || null,
          puedeReasignar: !!recheck && recheck.productoId !== productoId,
        });
      }
      throw err;
    }
  } catch (e: any) {
    console.error('[productos/codigos-barras] POST', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// PATCH /api/productos/codigos-barras/:id — editar (factor, descripcion, activo)
router.patch('/codigos-barras/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    const { factor, descripcion, activo, codigo } = req.body || {};
    const data: any = {};
    if (factor !== undefined) {
      const f = Number(factor);
      if (!Number.isFinite(f) || f <= 0) return res.status(400).json({ error: 'factor debe ser > 0' });
      data.factor = f;
    }
    if (descripcion !== undefined) data.descripcion = descripcion ? String(descripcion).slice(0, 60) : null;
    if (activo !== undefined) data.activo = Boolean(activo);
    if (codigo !== undefined) {
      const c = String(codigo).trim();
      if (!c) return res.status(400).json({ error: 'codigo no puede estar vacío' });
      data.codigo = c;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Sin cambios' });
    const out = await prisma.productoCodigoBarras.update({ where: { id }, data });
    res.json(out);
  } catch (e: any) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ese código ya existe' });
    }
    if (e.code === 'P2025') {
      return res.status(404).json({ error: 'Código no encontrado' });
    }
    console.error('[productos/codigos-barras] PATCH', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// DELETE /api/productos/codigos-barras/:id
router.delete('/codigos-barras/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' });
    await prisma.productoCodigoBarras.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Código no encontrado' });
    console.error('[productos/codigos-barras] DELETE', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// GET /api/productos/codigos-barras/scan/:codigo — EL ENDPOINT CLAVE
// Resuelve un código escaneado → producto + factor + descripción.
// Lo usan: Movimientos, Punto de Venta, Inventarios, Control Scanner.
// Fallback: si el código no está en la tabla nueva, busca en
// Producto.codigoBarras (compat con el campo legacy) con factor=1.
router.get('/codigos-barras/scan/:codigo', async (req: Request, res: Response) => {
  try {
    const codigo = String(req.params.codigo || '').trim();
    if (!codigo) return res.status(400).json({ error: 'código vacío' });

    // 1. Tabla nueva (multi-pack)
    const match = await prisma.productoCodigoBarras.findFirst({
      where: { codigo, activo: true },
      include: {
        producto: {
          select: {
            id: true, codigo: true, nombre: true, rubro: true, subrubro: true,
            unidadUso: true, unidadCompra: true, precioVenta: true, precioReferencia: true,
            vendibleDirecto: true,
          },
        },
      },
    });
    if (match) {
      return res.json({
        producto: match.producto,
        factor: match.factor,
        descripcion: match.descripcion || (match.factor === 1 ? 'Unidad' : `× ${match.factor}`),
        codigoBarrasId: match.id,
        fuente: 'multipack',
      });
    }

    // 2. Compat: campo legacy Producto.codigoBarras
    const legacy = await prisma.producto.findFirst({
      where: { codigoBarras: codigo, activo: true },
      select: {
        id: true, codigo: true, nombre: true, rubro: true, subrubro: true,
        unidadUso: true, unidadCompra: true, precioVenta: true, precioReferencia: true,
        vendibleDirecto: true,
      },
    });
    if (legacy) {
      return res.json({
        producto: legacy,
        factor: 1,
        descripcion: 'Unidad',
        codigoBarrasId: null,
        fuente: 'legacy',
      });
    }

    res.status(404).json({ error: 'Código no encontrado', codigo });
  } catch (e: any) {
    console.error('[productos/codigos-barras/scan]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

// POST /api/productos/codigos-barras/bulk — importar masivo
// Body: { items: [{ codigoProducto, codigo, factor?, descripcion? }] }
// Para que el cliente cargue de un saque la lista de packs de las bodegas.
router.post('/codigos-barras/bulk', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = { insertados: 0, actualizados: 0, errores: [] as string[] };
    for (const it of items) {
      try {
        const codProd = String(it?.codigoProducto || '').trim();
        const codigo = String(it?.codigo || '').trim();
        if (!codProd || !codigo) {
          result.errores.push(`Fila sin códigoProducto o código: ${JSON.stringify(it).slice(0, 80)}`);
          continue;
        }
        const prod = await prisma.producto.findFirst({ where: { codigo: codProd } });
        if (!prod) {
          result.errores.push(`Producto "${codProd}" no encontrado`);
          continue;
        }
        const factorNum = Number(it.factor);
        const factor = Number.isFinite(factorNum) && factorNum > 0 ? factorNum : 1;
        const descripcion = it.descripcion ? String(it.descripcion).slice(0, 60) : null;

        const existente = await prisma.productoCodigoBarras.findFirst({ where: { codigo } });
        if (existente) {
          if (existente.productoId !== prod.id) {
            result.errores.push(`Código "${codigo}" ya está asignado a otro producto`);
            continue;
          }
          await prisma.productoCodigoBarras.update({
            where: { id: existente.id },
            data: { factor, descripcion, activo: true },
          });
          result.actualizados++;
        } else {
          await prisma.productoCodigoBarras.create({
            data: { productoId: prod.id, codigo, factor, descripcion, activo: true },
          });
          result.insertados++;
        }
      } catch (err: any) {
        result.errores.push(err?.message?.slice(0, 120) || 'Error desconocido');
      }
    }
    res.json(result);
  } catch (e: any) {
    console.error('[productos/codigos-barras/bulk]', e);
    res.status(500).json({ error: e?.message || 'Error' });
  }
});

export default router;
