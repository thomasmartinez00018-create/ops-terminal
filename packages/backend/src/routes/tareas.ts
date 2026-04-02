import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

const INCLUDES = {
  creadoPor: { select: { id: true, nombre: true, rol: true } },
  asignadoA: { select: { id: true, nombre: true, rol: true } },
};

// GET /api/tareas — listar con filtros
router.get('/', async (req, res) => {
  const { asignadoAId, creadoPorId, estado, fecha, pendientes } = req.query;
  const where: any = {};

  if (asignadoAId) where.asignadoAId = parseInt(asignadoAId as string);
  if (creadoPorId) where.creadoPorId = parseInt(creadoPorId as string);
  if (estado) where.estado = estado;
  if (fecha) where.fecha = fecha;
  if (pendientes === 'true') where.estado = { in: ['pendiente', 'en_progreso'] };

  const tareas = await prisma.tarea.findMany({
    where,
    include: INCLUDES,
    orderBy: [
      { prioridad: 'desc' }, // urgente primero
      { fecha: 'asc' },
      { createdAt: 'desc' },
    ],
  });

  res.json(tareas);
});

// GET /api/tareas/mis-pendientes/:userId — shortcut para dashboard
router.get('/mis-pendientes/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const hoy = new Date().toISOString().split('T')[0];

  const [tareas, ordenesCompra] = await Promise.all([
    prisma.tarea.findMany({
      where: {
        asignadoAId: userId,
        estado: { in: ['pendiente', 'en_progreso'] },
      },
      include: INCLUDES,
      orderBy: [{ prioridad: 'desc' }, { fecha: 'asc' }],
    }),
    prisma.ordenCompra.findMany({
      where: {
        responsableId: userId,
        estado: { in: ['pendiente', 'parcial'] },
      },
      include: {
        proveedor: { select: { nombre: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  // Unificar en un formato consistente
  const pendientes = [
    ...tareas.map(t => ({
      id: t.id,
      origen: 'tarea' as const,
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipo: t.tipo,
      estado: t.estado,
      prioridad: t.prioridad,
      fecha: t.fecha,
      horaLimite: t.horaLimite,
      creadoPor: t.creadoPor,
      vencida: t.fecha < hoy,
    })),
    ...ordenesCompra.map(oc => ({
      id: oc.id,
      origen: 'orden_compra' as const,
      titulo: `Recibir ${oc.codigo}`,
      descripcion: `${oc.proveedor?.nombre || 'Proveedor'} — ${oc._count?.items || 0} productos`,
      tipo: 'recibir_mercaderia',
      estado: oc.estado,
      prioridad: 'normal',
      fecha: oc.fecha,
      horaLimite: null,
      creadoPor: null,
      vencida: oc.fecha < hoy,
    })),
  ].sort((a, b) => {
    // Urgentes y vencidas primero
    if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
    const prio: Record<string, number> = { urgente: 4, alta: 3, normal: 2, baja: 1 };
    return (prio[b.prioridad] || 0) - (prio[a.prioridad] || 0);
  });

  res.json({ pendientes, totalTareas: tareas.length, totalOC: ordenesCompra.length });
});

// POST /api/tareas — crear
router.post('/', async (req, res) => {
  const { titulo, descripcion, tipo, prioridad, fecha, horaLimite, asignadoAId, creadoPorId } = req.body;

  if (!titulo || !asignadoAId || !creadoPorId || !fecha) {
    return res.status(400).json({ error: 'titulo, asignadoAId, creadoPorId y fecha son requeridos' });
  }

  const tarea = await prisma.tarea.create({
    data: {
      titulo,
      descripcion: descripcion || null,
      tipo: tipo || 'general',
      prioridad: prioridad || 'normal',
      fecha,
      horaLimite: horaLimite || null,
      asignadoAId: Number(asignadoAId),
      creadoPorId: Number(creadoPorId),
    },
    include: INCLUDES,
  });

  res.json(tarea);
});

// PUT /api/tareas/:id — actualizar
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { titulo, descripcion, tipo, prioridad, fecha, horaLimite, asignadoAId, estado } = req.body;

  const data: any = {};
  if (titulo !== undefined) data.titulo = titulo;
  if (descripcion !== undefined) data.descripcion = descripcion;
  if (tipo !== undefined) data.tipo = tipo;
  if (prioridad !== undefined) data.prioridad = prioridad;
  if (fecha !== undefined) data.fecha = fecha;
  if (horaLimite !== undefined) data.horaLimite = horaLimite;
  if (asignadoAId !== undefined) data.asignadoAId = Number(asignadoAId);
  if (estado !== undefined) data.estado = estado;

  const tarea = await prisma.tarea.update({ where: { id }, data, include: INCLUDES });
  res.json(tarea);
});

// PUT /api/tareas/:id/completar — marcar como completada
router.put('/:id/completar', async (req, res) => {
  const id = parseInt(req.params.id);
  const { observacion } = req.body;

  const tarea = await prisma.tarea.update({
    where: { id },
    data: {
      estado: 'completada',
      completadaAt: new Date(),
      observacion: observacion || null,
    },
    include: INCLUDES,
  });

  res.json(tarea);
});

// DELETE /api/tareas/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  await prisma.tarea.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
