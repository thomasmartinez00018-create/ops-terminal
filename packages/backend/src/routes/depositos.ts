import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// Helper: sanitiza el body aceptado en create/update. Solo permite los
// campos conocidos — evita que un cliente malicioso escriba organizacion_id
// u otros campos del sistema.
function pickDepositoBody(body: any) {
  const out: any = {};
  if (body.codigo !== undefined) out.codigo = String(body.codigo).trim();
  if (body.nombre !== undefined) out.nombre = String(body.nombre).trim();
  if (body.tipo !== undefined) out.tipo = body.tipo == null ? null : String(body.tipo);
  if (body.activo !== undefined) out.activo = Boolean(body.activo);
  if (body.depositoPadreId !== undefined) {
    out.depositoPadreId =
      body.depositoPadreId == null || body.depositoPadreId === '' ? null : parseInt(body.depositoPadreId);
  }
  return out;
}

// Detecta ciclos en la cadena padre → hijo.
// Sube por la cadena desde `padreId` hasta `null`; si encuentra `depositoId`
// en el camino → hay ciclo. Profundidad máx 50 por seguridad.
async function creariaCiclo(depositoId: number, padreId: number): Promise<boolean> {
  if (depositoId === padreId) return true;
  let actual: number | null = padreId;
  let pasos = 0;
  while (actual != null && pasos < 50) {
    if (actual === depositoId) return true;
    const p: { depositoPadreId: number | null } | null = await prisma.deposito.findUnique({
      where: { id: actual },
      select: { depositoPadreId: true },
    });
    actual = p?.depositoPadreId ?? null;
    pasos++;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /api/depositos — lista plana
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const { activo } = req.query;
    const where: any = {};
    if (activo !== undefined) where.activo = activo === 'true';

    const depositos = await prisma.deposito.findMany({
      where,
      orderBy: { nombre: 'asc' },
      // Incluimos conteos útiles para el frontend: cuántos hijos tiene un
      // depósito padre (para mostrar chevron), y el nombre del padre si
      // existe (para mostrar breadcrumb "Garage → Gamuza").
      include: {
        depositoPadre: { select: { id: true, nombre: true } },
        _count: { select: { depositosHijos: true } },
      },
    });
    res.json(depositos);
  } catch (error) {
    console.error('GET /depositos error:', error);
    res.status(500).json({ error: 'Error al obtener depósitos' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/depositos/arbol — jerarquía recursiva (para selects y tree views)
// ---------------------------------------------------------------------------
// Devuelve un árbol con raíces (sin padre) y sus hijos anidados recursivamente.
// Úsalo para dibujar el picker de padre al editar un depósito, o la vista
// de reposición encadenada.
router.get('/arbol', async (_req: Request, res: Response) => {
  try {
    const depositos = await prisma.deposito.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        tipo: true,
        depositoPadreId: true,
      },
    });

    // Indexa y arma árbol en memoria.
    type Nodo = typeof depositos[number] & { hijos: Nodo[] };
    const byId = new Map<number, Nodo>();
    for (const d of depositos) {
      byId.set(d.id, { ...d, hijos: [] });
    }

    const raices: Nodo[] = [];
    for (const d of depositos) {
      const nodo = byId.get(d.id)!;
      if (d.depositoPadreId && byId.has(d.depositoPadreId)) {
        byId.get(d.depositoPadreId)!.hijos.push(nodo);
      } else {
        raices.push(nodo);
      }
    }

    res.json(raices);
  } catch (error) {
    console.error('GET /depositos/arbol error:', error);
    res.status(500).json({ error: 'Error al construir árbol de depósitos' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/depositos/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const deposito = await prisma.deposito.findUnique({
      where: { id: parseInt(req.params.id as string) },
      include: {
        depositoPadre: { select: { id: true, nombre: true } },
        depositosHijos: { select: { id: true, nombre: true, activo: true } },
      },
    });
    if (!deposito) {
      res.status(404).json({ error: 'Depósito no encontrado' });
      return;
    }
    res.json(deposito);
  } catch (error) {
    console.error('GET /depositos/:id error:', error);
    res.status(500).json({ error: 'Error al obtener depósito' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/depositos
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = pickDepositoBody(req.body);
    // Validación mínima
    if (!data.codigo || !data.nombre) {
      res.status(400).json({ error: 'codigo y nombre son obligatorios' });
      return;
    }
    const deposito = await prisma.deposito.create({ data });
    res.status(201).json(deposito);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un depósito con ese código' });
      return;
    }
    console.error('POST /depositos error:', error);
    res.status(500).json({ error: 'Error al crear depósito' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/depositos/:id
// ---------------------------------------------------------------------------
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = pickDepositoBody(req.body);

    // Si cambia el padre, verificar que no cree un ciclo.
    if (data.depositoPadreId != null) {
      const ciclo = await creariaCiclo(id, data.depositoPadreId);
      if (ciclo) {
        res.status(400).json({ error: 'El depósito padre seleccionado crearía un ciclo en la jerarquía' });
        return;
      }
    }

    const deposito = await prisma.deposito.update({
      where: { id },
      data,
    });
    res.json(deposito);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ya existe un depósito con ese código' });
      return;
    }
    console.error('PUT /depositos/:id error:', error);
    res.status(500).json({ error: 'Error al actualizar depósito' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/depositos/:id (soft delete)
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.deposito.update({
      where: { id: parseInt(req.params.id as string) },
      data: { activo: false },
    });
    res.json({ message: 'Depósito desactivado' });
  } catch (error) {
    console.error('DELETE /depositos/:id error:', error);
    res.status(500).json({ error: 'Error al desactivar depósito' });
  }
});

export default router;
