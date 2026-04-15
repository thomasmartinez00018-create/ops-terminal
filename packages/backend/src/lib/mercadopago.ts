// ============================================================================
// MERCADO PAGO — cliente HTTP para la API REST de MP
// ============================================================================
// Wrappers delgados sobre los endpoints que usamos para suscripciones
// recurrentes. No depende del SDK oficial de MP porque el SDK mete
// dependencias pesadas y su API cambia seguido — preferimos controlar los
// request/response a mano.
//
// Endpoints cubiertos:
//   - POST   /preapproval_plan  → crea un PLAN template (catálogo)
//   - POST   /preapproval       → crea una SUSCRIPCIÓN de un payer al plan
//   - GET    /preapproval/:id   → lee el estado de una suscripción
//   - PUT    /preapproval/:id   → pausa / reactiva / cancela una suscripción
//   - GET    /v1/payments/:id   → lee un pago puntual (lo usa el webhook)
//
// Docs: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval_plan/post
// ============================================================================

const MP_API_BASE = 'https://api.mercadopago.com';

// ── Resolver credencial según MP_MODE ───────────────────────────────────────
// MP_MODE=test → MP_ACCESS_TOKEN_TEST
// MP_MODE=production → MP_ACCESS_TOKEN_PROD
// Fallback: MP_ACCESS_TOKEN (legacy, por si alguien lo seteó suelto)
function getAccessToken(): string {
  const mode = (process.env.MP_MODE || 'test').toLowerCase();
  const token =
    mode === 'production'
      ? process.env.MP_ACCESS_TOKEN_PROD
      : process.env.MP_ACCESS_TOKEN_TEST;
  const fallback = process.env.MP_ACCESS_TOKEN;
  const resolved = token || fallback;
  if (!resolved) {
    throw new Error(
      `MP access token no configurado (MP_MODE=${mode}). ` +
        `Seteá MP_ACCESS_TOKEN_${mode === 'production' ? 'PROD' : 'TEST'} en el env.`,
    );
  }
  return resolved;
}

export function getMpMode(): 'test' | 'production' {
  return (process.env.MP_MODE || 'test').toLowerCase() === 'production'
    ? 'production'
    : 'test';
}

export function getMpPublicKey(): string | null {
  const mode = getMpMode();
  return (
    (mode === 'production'
      ? process.env.MP_PUBLIC_KEY_PROD
      : process.env.MP_PUBLIC_KEY_TEST) || null
  );
}

interface MPError extends Error {
  status?: number;
  body?: any;
}

async function mpFetch<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any,
): Promise<T> {
  const url = `${MP_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
      // Idempotency key para POSTs — MP lo respeta en varios endpoints y
      // evita duplicados si la llamada se reintenta.
      ...(method === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) {
    const err: MPError = new Error(
      `MP API ${method} ${path} → ${res.status}: ${parsed?.message || text}`,
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }

  return parsed as T;
}

// ============================================================================
// PREAPPROVAL PLAN — el "template" de plan. Se crea una vez por precio y
// periodicidad y se reutiliza para todas las suscripciones de ese plan.
// ============================================================================
export interface PreapprovalPlanCreate {
  reason: string;                                  // nombre visible del plan
  auto_recurring: {
    frequency: number;                             // 1
    frequency_type: 'months' | 'days';
    transaction_amount: number;
    currency_id: 'ARS';
    repetitions?: number;                          // ausente = indefinido
    billing_day?: number;
    billing_day_proportional?: boolean;
    free_trial?: { frequency: number; frequency_type: 'days' | 'months' };
  };
  payment_methods_allowed?: {
    payment_types?: { id: string }[];
    payment_methods?: { id: string }[];
  };
  back_url: string;                                // a dónde vuelve el user después
}

export interface PreapprovalPlan {
  id: string;
  status: string;
  reason: string;
  init_point: string;                              // URL de checkout (solo para el flow de subscribe)
}

export async function createPreapprovalPlan(
  data: PreapprovalPlanCreate,
): Promise<PreapprovalPlan> {
  return mpFetch<PreapprovalPlan>('POST', '/preapproval_plan', data);
}

// ============================================================================
// PREAPPROVAL — suscripción concreta de un payer a un plan.
// ============================================================================
export interface PreapprovalCreate {
  preapproval_plan_id?: string;                    // si viene del plan template
  reason: string;
  payer_email: string;
  auto_recurring?: {
    frequency: number;
    frequency_type: 'months' | 'days';
    transaction_amount: number;
    currency_id: 'ARS';
    start_date?: string;                           // ISO 8601
    end_date?: string;
  };
  back_url: string;
  external_reference?: string;                     // lo usamos para guardar la organizacionId
  status?: 'pending' | 'authorized' | 'paused' | 'cancelled';
}

export interface Preapproval {
  id: string;
  status: string;                                  // pending | authorized | paused | cancelled
  reason: string;
  payer_id?: number;
  payer_email: string;
  init_point: string;
  sandbox_init_point?: string;
  external_reference?: string;
  date_created: string;
  next_payment_date?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
  };
}

export async function createPreapproval(
  data: PreapprovalCreate,
): Promise<Preapproval> {
  return mpFetch<Preapproval>('POST', '/preapproval', data);
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  return mpFetch<Preapproval>('GET', `/preapproval/${id}`);
}

export async function updatePreapprovalStatus(
  id: string,
  status: 'paused' | 'authorized' | 'cancelled',
): Promise<Preapproval> {
  return mpFetch<Preapproval>('PUT', `/preapproval/${id}`, { status });
}

// ============================================================================
// PAYMENT — un cobro individual. El webhook nos manda un payment.id y lo
// usamos para sincronizar PagoSuscripcion.
// ============================================================================
export interface Payment {
  id: number;
  status: string;                                  // approved | rejected | pending | refunded | cancelled | in_process
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  date_approved?: string;
  date_created: string;
  payment_method_id?: string;
  payment_type_id?: string;
  external_reference?: string;
  metadata?: Record<string, any>;
  card?: {
    last_four_digits?: string;
    first_six_digits?: string;
  };
  payer?: {
    id?: string;
    email?: string;
  };
  // Cuando el payment viene de una preapproval, este campo trae el preapproval_id
  metadata_preapproval_id?: string;
  preapproval_id?: string;
}

export async function getPayment(id: string | number): Promise<Payment> {
  return mpFetch<Payment>('GET', `/v1/payments/${id}`);
}

// ============================================================================
// HELPER — mapear el status de MP al enum interno de Suscripcion.estado
// ============================================================================
export function mapPreapprovalStatus(mpStatus: string): string {
  switch (mpStatus) {
    case 'authorized':  return 'active';
    case 'paused':      return 'paused';
    case 'cancelled':   return 'cancelled';
    case 'pending':     return 'pending_authorization';
    default:            return mpStatus;
  }
}

export function mapPaymentStatus(mpStatus: string): string {
  // MP usa estos valores: pending, approved, authorized, in_process, in_mediation,
  // rejected, cancelled, refunded, charged_back
  return mpStatus;
}
