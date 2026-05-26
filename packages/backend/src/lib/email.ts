// ============================================================================
// EMAIL SENDER — best-effort, no rompe si no hay configuración
// ============================================================================
// Estrategia: si está RESEND_API_KEY seteado, manda con Resend (fetch directo,
// sin SDK para evitar dep). Si no, loguea el mail a stdout y devuelve ok=false.
// El caller debe asumir que el envío PUEDE no haber salido y, en ese caso,
// caer al fallback (devolver el link en la respuesta, mostrarlo en logs, etc.).
//
// Resend free tier: 100 emails/día. Suficiente para password resets.
// Setup: RESEND_API_KEY=re_xxx · EMAIL_FROM="OPS Terminal <noreply@dominio>"
// ============================================================================

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: 'resend' | 'log';
  error?: string;
}

const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'OPS Terminal <onboarding@resend.dev>';

  if (!apiKey) {
    console.log('[email/log] (sin RESEND_API_KEY — no se envía)', {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, provider: 'log', error: 'RESEND_API_KEY no configurado' };
  }

  try {
    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[email/resend] fallo', r.status, body);
      return { ok: false, provider: 'resend', error: `${r.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, provider: 'resend' };
  } catch (err: any) {
    console.error('[email/resend] excepción', err?.message);
    return { ok: false, provider: 'resend', error: err?.message || 'error desconocido' };
  }
}

// Plantilla simple de reset de contraseña
export function buildResetEmail(opts: { nombre: string; link: string }): { subject: string; html: string; text: string } {
  const { nombre, link } = opts;
  const subject = 'Recuperá tu contraseña — OPS Terminal';
  const text = `Hola ${nombre},

Recibimos un pedido para resetear tu contraseña.

Entrá a este link y elegí una nueva (vence en 1 hora):
${link}

Si no lo pediste vos, ignorá este mail. Tu contraseña actual sigue funcionando.

— OPS Terminal`;

  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background:#0a0a0a; color:#e4e4e7; padding:32px;">
  <div style="max-width:480px; margin:0 auto; background:#18181b; border:1px solid #27272a; border-radius:12px; padding:32px;">
    <h1 style="margin:0 0 16px; color:#fafafa; font-size:22px;">Recuperá tu contraseña</h1>
    <p style="margin:0 0 12px; color:#a1a1aa;">Hola ${escapeHtml(nombre)},</p>
    <p style="margin:0 0 20px; color:#a1a1aa;">Recibimos un pedido para resetear tu contraseña. Apretá el botón y elegí una nueva. El link vence en <strong style="color:#fbbf24;">1 hora</strong>.</p>
    <p style="margin:24px 0;">
      <a href="${link}" style="display:inline-block; background:#fbbf24; color:#0a0a0a; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Elegir nueva contraseña</a>
    </p>
    <p style="margin:24px 0 0; color:#71717a; font-size:13px;">¿No anda el botón? Copiá este link:<br/><span style="word-break:break-all; color:#a1a1aa;">${link}</span></p>
    <hr style="border:none; border-top:1px solid #27272a; margin:24px 0;" />
    <p style="margin:0; color:#71717a; font-size:12px;">Si no lo pediste vos, ignorá este mail. Tu contraseña actual sigue funcionando.</p>
  </div>
</body></html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
