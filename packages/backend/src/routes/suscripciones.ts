import { Router, Request, Response } from 'express';
import { prismaRaw } from '../lib/prisma';
import { getTenant, runWithoutTenant } from '../lib/tenantContext';
import { listPlanesMensuales, listPlanesAnuales, getPlan, PLANES } from '../lib/planes';
import {
  createPreapproval,
  getPreapproval,
  updatePreapprovalStatus,
} from '../lib/mercadopago';

const router = Router();

// ============================================================================
// SUSCRIPCIONES — billing público de OPS Terminal via Mercado Pago
// ============================================================================
// Todas las rutas acá asumen que ya corrió requireStaff + tenantMiddleware
// (montadas bajo businessApi en server.ts), así que podemos leer org del
// token. Usamos prismaRaw para las escrituras de Suscripcion/Organizacion
// porque el webhook y las mutaciones tocan la tabla Organizacion cruzando
// el tenant filter (es legit, somos el dueño del dato).
// ============================================================================

// ----------------------------------------------------------------------------
// GET /api/suscripciones/planes — catálogo público (no requiere auth de staff)
// ----------------------------------------------------------------------------
// Va montada fuera del businessApi en server.ts — es consultada por la
// landing antes del login. Se expone acá por cercanía semántica.
// ----------------------------------------------------------------------------
router.get('/planes', (_req: Request, res: Response) => {
  res.json({
    mensuales: listPlanesMensuales(),
    anuales: listPlanesAnuales(),
  });
});

// ----------------------------------------------------------------------------
// GET /api/suscripciones/actual — estado de la suscripción de la org actual
// ----------------------------------------------------------------------------
router.get('/actual', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    await runWithoutTenant(async () => {
      const [org, suscripcion] = await Promise.all([
        prismaRaw.organizacion.findUnique({
          where: { id: organizacionId },
          select: {
            plan: true,
            estadoSuscripcion: true,
            trialHasta: true,
            limiteUsuarios: true,
            limiteProductos: true,
            limiteDepositos: true,
          },
        }),
        prismaRaw.suscripcion.findUnique({
          where: { organizacionId },
        }),
      ]);

      if (!org) {
        res.status(404).json({ error: 'Organización no encontrada' });
        return;
      }

      const planCatalogo = org.plan ? getPlan(org.plan) : null;

      // Dias restantes de trial (si aplica)
      let diasRestantesTrial: number | null = null;
      if (org.estadoSuscripcion === 'trialing' && org.trialHasta) {
        const ms = org.trialHasta.getTime() - Date.now();
        diasRestantesTrial = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
      }

      res.json({
        plan: org.plan,
        estado: org.estadoSuscripcion,
        trialHasta: org.trialHasta,
        diasRestantesTrial,
        limites: {
          usuarios: org.limiteUsuarios,
          productos: org.limiteProductos,
          depositos: org.limiteDepositos,
        },
        planCatalogo,
        suscripcion: suscripcion
          ? {
              id: suscripcion.id,
              proveedor: suscripcion.proveedor,
              precioMensual: suscripcion.precioMensual,
              moneda: suscripcion.moneda,
              frecuencia: suscripcion.frecuencia,
              proximoCobroEn: suscripcion.proximoCobroEn,
              periodoActualFin: suscripcion.periodoActualFin,
              canceladaEn: suscripcion.canceladaEn,
              mpInitPoint: suscripcion.mpInitPoint,
            }
          : null,
      });
    });
  } catch (err: any) {
    console.error('[suscripciones/actual]', err);
    res.status(500).json({ error: 'Error al leer suscripción' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/suscripciones/subscribe
// ----------------------------------------------------------------------------
// Inicia el flow de autorización con Mercado Pago. Crea un preapproval de MP,
// guarda la suscripción en estado pending_authorization y devuelve el
// init_point (URL a la que el front redirige al user).
//
// Body: { plan: 'basico'|'pro'|'pro_anual', payerEmail: string }
//
// Los webhooks de MP van a llegar a /api/webhooks/mercadopago después de
// que el user autorice, y ahí marcamos estado = 'active' y disparamos el
// primer cobro. No esperamos acá.
// ----------------------------------------------------------------------------
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { organizacionId, cuentaId } = getTenant();
    const { plan: planId, payerEmail } = req.body ?? {};

    const plan = getPlan(planId);
    if (!plan) {
      res.status(400).json({ error: 'Plan inválido', disponibles: Object.keys(PLANES) });
      return;
    }
    if (typeof payerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      res.status(400).json({ error: 'payerEmail inválido' });
      return;
    }

    // Back URL — a dónde vuelve el user desde MP después de autorizar.
    // Usa FRONTEND_URL env o fallback al dominio oficial de producción.
    const frontend = process.env.FRONTEND_URL || 'https://www.ops-terminal.com.ar';
    const backUrl = `${frontend}/suscripcion?mp_return=1`;

    // Fecha de inicio: hoy + 1 min (MP requiere futuro)
    const startDate = new Date(Date.now() + 60 * 1000).toISOString();

    // Para planes anuales, MP cobra una vez cada 12 meses.
    // Para mensuales, cada mes. Ambos usan months como unidad.
    const freq = plan.frecuencia === 'anual' ? 12 : 1;
    // Para el anual la transaction_amount es el total anual (precio mensual × 10 meses efectivos)
    const montoCobro =
      plan.frecuencia === 'anual'
        ? plan.precioMensual * 12
        : plan.precioMensual;

    const externalRef = `org-${organizacionId}-plan-${plan.id}-${Date.now()}`;

    // 1) Crear el preapproval en MP
    const preapproval = await createPreapproval({
      reason: `OPS Terminal — Plan ${plan.nombre}`,
      payer_email: payerEmail,
      back_url: backUrl,
      external_reference: externalRef,
      auto_recurring: {
        frequency: freq,
        frequency_type: 'months',
        transaction_amount: montoCobro,
        currency_id: 'ARS',
        start_date: startDate,
      },
    });

    // 2) Upsert Suscripcion local
    await runWithoutTenant(async () => {
      await prismaRaw.suscripcion.upsert({
        where: { organizacionId },
        update: {
          plan: plan.id,
          estado: 'pending_authorization',
          precioMensual: plan.precioMensual,
          moneda: 'ARS',
          frecuencia: plan.frecuencia,
          mpPreapprovalId: preapproval.id,
          mpInitPoint: preapproval.init_point,
          mpPayerEmail: payerEmail,
        },
        create: {
          organizacionId,
          proveedor: 'mercadopago',
          plan: plan.id,
          estado: 'pending_authorization',
          precioMensual: plan.precioMensual,
          moneda: 'ARS',
          frecuencia: plan.frecuencia,
          mpPreapprovalId: preapproval.id,
          mpInitPoint: preapproval.init_point,
          mpPayerEmail: payerEmail,
        },
      });
    });

    res.json({
      initPoint: preapproval.init_point,
      preapprovalId: preapproval.id,
      plan: plan.id,
      externalReference: externalRef,
    });
  } catch (err: any) {
    console.error('[suscripciones/subscribe]', err?.body || err?.message || err);
    res.status(500).json({
      error: 'No se pudo crear la suscripción en Mercado Pago',
      detalle: err?.body?.message || err?.message,
    });
  }
});

// ----------------------------------------------------------------------------
// POST /api/suscripciones/pause — pausar suscripción activa
// ----------------------------------------------------------------------------
router.post('/pause', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findUnique({ where: { organizacionId } });
      if (!sus || !sus.mpPreapprovalId) {
        res.status(404).json({ error: 'No hay suscripción activa para pausar' });
        return;
      }
      await updatePreapprovalStatus(sus.mpPreapprovalId, 'paused');
      await prismaRaw.suscripcion.update({
        where: { id: sus.id },
        data: { estado: 'paused' },
      });
      // NO tocamos Organizacion.estadoSuscripcion acá — el webhook lo hace.
      // Por si la API de MP falla silenciosamente, el middleware sigue
      // leyendo 'active' hasta que el webhook confirme.
      res.json({ ok: true, estado: 'paused' });
    });
  } catch (err: any) {
    console.error('[suscripciones/pause]', err);
    res.status(500).json({ error: 'Error al pausar suscripción' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/suscripciones/resume — reactivar suscripción pausada
// ----------------------------------------------------------------------------
router.post('/resume', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findUnique({ where: { organizacionId } });
      if (!sus || !sus.mpPreapprovalId) {
        res.status(404).json({ error: 'No hay suscripción para reactivar' });
        return;
      }
      await updatePreapprovalStatus(sus.mpPreapprovalId, 'authorized');
      await prismaRaw.suscripcion.update({
        where: { id: sus.id },
        data: { estado: 'active' },
      });
      res.json({ ok: true, estado: 'active' });
    });
  } catch (err: any) {
    console.error('[suscripciones/resume]', err);
    res.status(500).json({ error: 'Error al reactivar suscripción' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/suscripciones/cancel — cancelar definitivamente
// ----------------------------------------------------------------------------
// Al cancelar, el user mantiene acceso hasta el final del periodo pagado.
// Seteamos canceladaEn pero dejamos el estado en Organizacion como 'active'
// hasta que el periodo venza (gracia) — eso lo maneja el webhook o un cron.
// ----------------------------------------------------------------------------
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();
    const { motivo } = req.body ?? {};

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findUnique({ where: { organizacionId } });
      if (!sus || !sus.mpPreapprovalId) {
        res.status(404).json({ error: 'No hay suscripción para cancelar' });
        return;
      }
      await updatePreapprovalStatus(sus.mpPreapprovalId, 'cancelled');
      await prismaRaw.suscripcion.update({
        where: { id: sus.id },
        data: {
          estado: 'cancelled',
          canceladaEn: new Date(),
          motivoCancelacion: typeof motivo === 'string' ? motivo.slice(0, 500) : null,
        },
      });
      res.json({
        ok: true,
        estado: 'cancelled',
        // El user mantiene acceso hasta periodoActualFin
        mantieneAccesoHasta: sus.periodoActualFin,
      });
    });
  } catch (err: any) {
    console.error('[suscripciones/cancel]', err);
    res.status(500).json({ error: 'Error al cancelar suscripción' });
  }
});

// ----------------------------------------------------------------------------
// GET /api/suscripciones/pagos — historial de cobros
// ----------------------------------------------------------------------------
router.get('/pagos', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findUnique({
        where: { organizacionId },
        include: {
          pagos: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      });

      if (!sus) {
        res.json({ pagos: [] });
        return;
      }

      res.json({
        pagos: sus.pagos.map(p => ({
          id: p.id,
          mpPaymentId: p.mpPaymentId,
          monto: p.monto,
          moneda: p.moneda,
          estado: p.estado,
          metodoPago: p.metodoPago,
          marca: p.marca,
          ultimos4: p.ultimos4,
          fechaPago: p.fechaPago,
          periodoDesde: p.periodoDesde,
          periodoHasta: p.periodoHasta,
          facturado: p.facturado,
          cae: p.cae,
          facturaNumero: p.facturaNumero,
          facturaPdfUrl: p.facturaPdfUrl,
        })),
      });
    });
  } catch (err: any) {
    console.error('[suscripciones/pagos]', err);
    res.status(500).json({ error: 'Error al leer historial de pagos' });
  }
});

// ----------------------------------------------------------------------------
// POST /api/suscripciones/sync — refresh manual contra MP
// ----------------------------------------------------------------------------
// Fallback para cuando el webhook no llegó (MP falla, red caída, etc).
// Trae el estado actual del preapproval desde MP y actualiza la DB.
// ----------------------------------------------------------------------------
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    const { organizacionId } = getTenant();

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findUnique({ where: { organizacionId } });
      if (!sus || !sus.mpPreapprovalId) {
        res.status(404).json({ error: 'Sin suscripción para sincronizar' });
        return;
      }
      const mp = await getPreapproval(sus.mpPreapprovalId);

      const nuevoEstadoLocal =
        mp.status === 'authorized' ? 'active'
        : mp.status === 'paused' ? 'paused'
        : mp.status === 'cancelled' ? 'cancelled'
        : 'pending_authorization';

      await prismaRaw.suscripcion.update({
        where: { id: sus.id },
        data: {
          estado: nuevoEstadoLocal,
          mpPayerId: mp.payer_id ? String(mp.payer_id) : sus.mpPayerId,
          proximoCobroEn: mp.next_payment_date ? new Date(mp.next_payment_date) : sus.proximoCobroEn,
        },
      });

      // Propagar a Organizacion (hot path del middleware)
      if (nuevoEstadoLocal === 'active') {
        await prismaRaw.organizacion.update({
          where: { id: organizacionId },
          data: {
            estadoSuscripcion: 'active',
            plan: sus.plan,
          },
        });
      }

      res.json({
        ok: true,
        estadoMp: mp.status,
        estadoLocal: nuevoEstadoLocal,
      });
    });
  } catch (err: any) {
    console.error('[suscripciones/sync]', err);
    res.status(500).json({ error: 'Error al sincronizar con MP' });
  }
});

export default router;
