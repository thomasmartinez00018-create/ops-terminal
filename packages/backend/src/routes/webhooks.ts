import { Router, Request, Response } from 'express';
import { prismaRaw } from '../lib/prisma';
import { runWithoutTenant } from '../lib/tenantContext';
import {
  getPayment,
  getPreapproval,
  mapPreapprovalStatus,
} from '../lib/mercadopago';
import { getPlan } from '../lib/planes';

const router = Router();

// ============================================================================
// WEBHOOKS DE MERCADO PAGO
// ============================================================================
// MP envía notificaciones a este endpoint con cada evento relevante de
// suscripciones/pagos. La integración usa el flow "IPN v2 Webhooks":
//
//   POST /api/webhooks/mercadopago
//   Body (JSON): {
//     id: "123456",                 // notification id
//     type: "payment" | "preapproval" | "subscription_preapproval" | ...,
//     action: "payment.created" | "payment.updated" | ...,
//     data: { id: "<resource_id>" },
//     live_mode: true,
//     date_created: "2026-01-01T10:00:00Z",
//     user_id: 389653560,           // nuestro user id
//     api_version: "v1"
//   }
//
// Estrategia:
// 1) Responder 200 OK rápido (MP retry hasta 5 veces si tarda).
// 2) Por cada evento, leer el recurso completo desde la API de MP (no
//    confiamos en el body del webhook) y actualizar la DB en consecuencia.
// 3) Idempotencia: usar mp_payment_id como unique en PagoSuscripcion para
//    que no se dupliquen filas si MP retrysea.
//
// IMPORTANTE: esta ruta NO requiere auth ni tenant. La montamos bajo
// /api/webhooks/mercadopago directamente en server.ts antes del businessApi.
// ============================================================================

router.post('/mercadopago', async (req: Request, res: Response) => {
  // Responder rápido — MP nos quita de la cola si tardamos >22s
  res.status(200).json({ received: true });

  try {
    const body = req.body ?? {};
    const type: string = body.type || body.topic || '';
    const action: string = body.action || '';
    const resourceId: string | number | undefined =
      body.data?.id || body.resource?.split('/').pop();

    console.log('[webhook/mp] recibido', { type, action, resourceId, body });

    if (!resourceId) {
      console.warn('[webhook/mp] sin resourceId en body', body);
      return;
    }

    // ── Pagos (cobros individuales de la suscripción) ──────────────────
    if (type === 'payment' || type === 'payments') {
      await handlePaymentEvent(String(resourceId));
      return;
    }

    // ── Preapproval (suscripción completa — authorized/paused/cancelled) ──
    if (
      type === 'preapproval' ||
      type === 'subscription_preapproval' ||
      type === 'subscription_authorized_payment'
    ) {
      await handlePreapprovalEvent(String(resourceId));
      return;
    }

    console.log('[webhook/mp] tipo ignorado', type);
  } catch (err: any) {
    // Ya respondimos 200 OK, loggeamos para debug pero no podemos rechazar
    console.error('[webhook/mp] error procesando', err?.message || err);
  }
});

// ============================================================================
// handlePaymentEvent — sincronizar un pago puntual contra DB
// ============================================================================
async function handlePaymentEvent(paymentId: string): Promise<void> {
  try {
    const payment = await getPayment(paymentId);
    // Un pago puede no venir de una suscripción (ej: pago único).
    // Para suscripciones, MP incluye el preapproval_id en el body, o en
    // metadata. Probamos ambos.
    const preapprovalId: string | undefined =
      (payment as any).preapproval_id ||
      (payment as any).metadata?.preapproval_id ||
      payment.metadata?.preapproval_id;

    if (!preapprovalId) {
      console.log('[webhook/mp] pago sin preapproval_id — ignorando', paymentId);
      return;
    }

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findFirst({
        where: { mpPreapprovalId: preapprovalId },
      });

      if (!sus) {
        console.warn('[webhook/mp] suscripción no encontrada para', preapprovalId);
        return;
      }

      const mpPaymentIdStr = String(payment.id);

      // Upsert por mpPaymentId para idempotencia
      const existing = await prismaRaw.pagoSuscripcion.findUnique({
        where: { mpPaymentId: mpPaymentIdStr },
      });

      const ultimos4 = payment.card?.last_four_digits || null;
      const marca = payment.payment_method_id || null;
      const metodoPago = payment.payment_type_id || null;
      const fechaPago = payment.date_approved
        ? new Date(payment.date_approved)
        : new Date(payment.date_created);

      if (existing) {
        await prismaRaw.pagoSuscripcion.update({
          where: { id: existing.id },
          data: {
            estado: payment.status,
            fechaPago,
            rawPayload: JSON.stringify(payment),
          },
        });
      } else {
        await prismaRaw.pagoSuscripcion.create({
          data: {
            suscripcionId: sus.id,
            mpPaymentId: mpPaymentIdStr,
            monto: payment.transaction_amount,
            moneda: payment.currency_id || 'ARS',
            estado: payment.status,
            metodoPago,
            ultimos4,
            marca,
            referencia: payment.external_reference || null,
            fechaPago,
            rawPayload: JSON.stringify(payment),
          },
        });
      }

      // Si el pago quedó aprobado, avanzar el estado de la suscripción
      // y el "hot path" de Organizacion.
      if (payment.status === 'approved') {
        const proximoCobro = calcularProximoCobro(sus.frecuencia, fechaPago);

        await prismaRaw.suscripcion.update({
          where: { id: sus.id },
          data: {
            estado: 'active',
            periodoActualInicio: fechaPago,
            periodoActualFin: proximoCobro,
            proximoCobroEn: proximoCobro,
          },
        });

        const plan = getPlan(sus.plan);
        await prismaRaw.organizacion.update({
          where: { id: sus.organizacionId },
          data: {
            plan: sus.plan,
            estadoSuscripcion: 'active',
            trialHasta: null,
            limiteUsuarios: plan?.limites.usuarios ?? 9999,
            limiteProductos: plan?.limites.productos ?? 99999,
            limiteDepositos: plan?.limites.depositos ?? 99,
          },
        });

        console.log('[webhook/mp] pago aprobado', {
          suscripcionId: sus.id,
          monto: payment.transaction_amount,
          proximoCobro,
        });
      }

      // Si rechazado, marcar past_due (el middleware bloquea)
      if (payment.status === 'rejected' || payment.status === 'cancelled') {
        await prismaRaw.organizacion.update({
          where: { id: sus.organizacionId },
          data: { estadoSuscripcion: 'past_due' },
        });
      }
    });
  } catch (err: any) {
    console.error('[webhook/mp] handlePaymentEvent error', err?.message || err);
  }
}

// ============================================================================
// handlePreapprovalEvent — sincronizar el estado de la suscripción
// ============================================================================
async function handlePreapprovalEvent(preapprovalId: string): Promise<void> {
  try {
    const preapp = await getPreapproval(preapprovalId);

    await runWithoutTenant(async () => {
      const sus = await prismaRaw.suscripcion.findFirst({
        where: { mpPreapprovalId: preapprovalId },
      });
      if (!sus) {
        console.warn('[webhook/mp] preapproval sin suscripción local', preapprovalId);
        return;
      }

      const estadoLocal = mapPreapprovalStatus(preapp.status);

      await prismaRaw.suscripcion.update({
        where: { id: sus.id },
        data: {
          estado: estadoLocal,
          mpPayerId: preapp.payer_id ? String(preapp.payer_id) : sus.mpPayerId,
          mpPayerEmail: preapp.payer_email || sus.mpPayerEmail,
          proximoCobroEn: preapp.next_payment_date
            ? new Date(preapp.next_payment_date)
            : sus.proximoCobroEn,
        },
      });

      // Propagar al hot path
      let estadoOrg: string;
      switch (preapp.status) {
        case 'authorized': estadoOrg = 'active'; break;
        case 'paused':     estadoOrg = 'past_due'; break;     // se bloquea
        case 'cancelled':  estadoOrg = 'canceled'; break;
        default:           estadoOrg = 'trialing'; break;     // pending
      }

      const plan = getPlan(sus.plan);
      await prismaRaw.organizacion.update({
        where: { id: sus.organizacionId },
        data: {
          estadoSuscripcion: estadoOrg,
          plan: sus.plan,
          ...(preapp.status === 'authorized' && {
            trialHasta: null,
            limiteUsuarios: plan?.limites.usuarios ?? 9999,
            limiteProductos: plan?.limites.productos ?? 99999,
            limiteDepositos: plan?.limites.depositos ?? 99,
          }),
        },
      });

      console.log('[webhook/mp] preapproval sincronizado', {
        suscripcionId: sus.id,
        estadoMp: preapp.status,
        estadoLocal,
      });
    });
  } catch (err: any) {
    console.error('[webhook/mp] handlePreapprovalEvent error', err?.message || err);
  }
}

// ============================================================================
// helper: calcular próximo cobro
// ============================================================================
function calcularProximoCobro(frecuencia: string, desde: Date): Date {
  const next = new Date(desde);
  if (frecuencia === 'anual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export default router;
