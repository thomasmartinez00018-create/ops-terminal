// ============================================================================
// PLANES — catálogo hardcodeado de la grilla de precios
// ============================================================================
// Diseño de pricing (2026-Q2):
//
// Filosofía: OPS Terminal NO es un POS. Es el "segundo software" que un
// restaurante serio necesita (stock + compras + contabilidad). No compite
// con Fudo/Maxirest — los complementa. El pricing refleja eso: no más caro
// que un POS entry-level, pero con valor que el POS no da.
//
// Tres planes + modalidad anual (20% off, dos meses gratis):
//   Starter     $19.990/mes   → bar/café chico, dark kitchen, 1 local
//   Pro     ⭐  $39.990/mes   → restaurante establecido (sweet spot)
//   Multi-local $89.990/mes   → cadenas de 2 a 5 locales
//
// Pagando por año:
//   Starter anual:     $199.900  → equivalente $16.658/mes  (16% off)
//   Pro anual:         $399.900  → equivalente $33.325/mes  (17% off)
//   Multi-local anual: $899.900  → equivalente $74.991/mes  (17% off)
//
// Anchoring: 3 tiers en paralelo hacen que Pro parezca razonable (el del
// medio). Es donde querés que caiga la mayoría (~60% del funnel).
//
// Trial: 14 días con todas las features de Pro, SIN tarjeta. Arranca con
// signup, a los 14 días si no convirtió, la app bloquea con 402 y muestra
// la pantalla de upgrade.
// ============================================================================

export interface Plan {
  id: string;                    // key interna (también se guarda en Organizacion.plan)
  nombre: string;                // nombre visible
  tagline: string;               // one-liner para la UI (ej: "Para restaurantes chicos")
  precioMensual: number;         // ARS por mes (lo que cobra cada mes en mensual, o 1/12 del anual)
  precioAnual?: number;          // ARS totales del año (solo en planes anuales)
  frecuencia: 'mensual' | 'anual';
  mesesCobrados: number;         // 1 para mensual, 12 para anual
  destacado?: boolean;           // marca el plan "recomendado"
  orden: number;                 // orden de display en la UI (1..n)
  features: string[];            // bullets
  limites: {
    usuarios: number;
    productos: number;
    depositos: number;
    locales: number;
  };
}

export const PLANES: Record<string, Plan> = {
  // ── STARTER ───────────────────────────────────────────────────────────────
  starter: {
    id: 'starter',
    nombre: 'Starter',
    tagline: 'Para arrancar a controlar de verdad',
    precioMensual: 19990,
    frecuencia: 'mensual',
    mesesCobrados: 1,
    orden: 1,
    features: [
      '1 local',
      'Hasta 2 depósitos',
      'Hasta 5 usuarios',
      'Productos ilimitados',
      'Stock en tiempo real',
      'Movimientos y transferencias',
      'Recetas y elaboraciones',
      'Inventarios y conteos',
      'Proveedores y compras básicas',
      'Reportes y dashboard',
      'App desktop (Windows)',
      'Soporte por email',
    ],
    limites: {
      usuarios: 5,
      productos: 99999,
      depositos: 2,
      locales: 1,
    },
  },

  // ── STARTER ANUAL ─────────────────────────────────────────────────────────
  starter_anual: {
    id: 'starter_anual',
    nombre: 'Starter Anual',
    tagline: 'Starter con 2 meses gratis',
    precioMensual: 16658,      // 199900 / 12
    precioAnual: 199900,
    frecuencia: 'anual',
    mesesCobrados: 12,
    orden: 2,
    features: [
      'Todo lo de Starter',
      '2 meses gratis (ahorrás $39.980)',
      'Precio fijo 12 meses',
    ],
    limites: {
      usuarios: 5,
      productos: 99999,
      depositos: 2,
      locales: 1,
    },
  },

  // ── PRO ───────────────────────────────────────────────────────────────────
  pro: {
    id: 'pro',
    nombre: 'Pro',
    tagline: 'Todo el control de operaciones en un solo lugar',
    precioMensual: 39990,
    frecuencia: 'mensual',
    mesesCobrados: 1,
    destacado: true,
    orden: 3,
    features: [
      '1 local',
      'Depósitos ilimitados',
      'Usuarios ilimitados',
      'Productos ilimitados',
      'Todo lo de Starter',
      'Órdenes de compra',
      'Recepciones con control de diferencias',
      'Escaneo de facturas con IA',
      'Contabilidad y cuentas por pagar',
      'Comparador de precios entre proveedores',
      'Equivalencias automáticas',
      'Importación de listas de precios',
      'Tareas y delegaciones',
      'Control con lector de código de barras',
      'Facturación electrónica ARCA (próximamente)',
      'Soporte prioritario por WhatsApp',
    ],
    limites: {
      usuarios: 9999,
      productos: 99999,
      depositos: 99,
      locales: 1,
    },
  },

  // ── PRO ANUAL ─────────────────────────────────────────────────────────────
  pro_anual: {
    id: 'pro_anual',
    nombre: 'Pro Anual',
    tagline: 'Pro con 2 meses gratis',
    precioMensual: 33325,      // 399900 / 12
    precioAnual: 399900,
    frecuencia: 'anual',
    mesesCobrados: 12,
    orden: 4,
    features: [
      'Todo lo de Pro',
      '2 meses gratis (ahorrás $79.980)',
      'Precio fijo 12 meses',
      'Onboarding personalizado incluido',
    ],
    limites: {
      usuarios: 9999,
      productos: 99999,
      depositos: 99,
      locales: 1,
    },
  },

  // ── MULTI-LOCAL ──────────────────────────────────────────────────────────
  multi: {
    id: 'multi',
    nombre: 'Multi-local',
    tagline: 'Para cadenas con 2 a 5 locales',
    precioMensual: 89990,
    frecuencia: 'mensual',
    mesesCobrados: 1,
    orden: 5,
    features: [
      'Hasta 5 locales con consolidado',
      'Todo lo de Pro en cada local',
      'Dashboard consolidado multi-local',
      'Transferencias entre locales',
      'Comparativa de performance por local',
      'Usuarios ilimitados',
      'Onboarding + training on-site',
      'Soporte dedicado WhatsApp + email',
      'Local adicional (+5): $15.000/mes cada uno',
    ],
    limites: {
      usuarios: 9999,
      productos: 999999,
      depositos: 999,
      locales: 5,
    },
  },

  // ── MULTI-LOCAL ANUAL ────────────────────────────────────────────────────
  multi_anual: {
    id: 'multi_anual',
    nombre: 'Multi-local Anual',
    tagline: 'Multi-local con 2 meses gratis',
    precioMensual: 74991,      // 899900 / 12
    precioAnual: 899900,
    frecuencia: 'anual',
    mesesCobrados: 12,
    orden: 6,
    features: [
      'Todo lo de Multi-local',
      '2 meses gratis (ahorrás $179.980)',
      'Precio fijo 12 meses',
      'Onboarding + training on-site incluido',
    ],
    limites: {
      usuarios: 9999,
      productos: 999999,
      depositos: 999,
      locales: 5,
    },
  },
};

/** Todos los planes (incluye mensuales y anuales) */
export function listPlanes(): Plan[] {
  return Object.values(PLANES).sort((a, b) => a.orden - b.orden);
}

/** Solo los planes mensuales — para la grilla principal de la landing */
export function listPlanesMensuales(): Plan[] {
  return Object.values(PLANES)
    .filter(p => p.frecuencia === 'mensual')
    .sort((a, b) => a.orden - b.orden);
}

/** Solo los planes anuales */
export function listPlanesAnuales(): Plan[] {
  return Object.values(PLANES)
    .filter(p => p.frecuencia === 'anual')
    .sort((a, b) => a.orden - b.orden);
}

export function getPlan(id: string): Plan | null {
  return PLANES[id] ?? null;
}

/** Dado un plan mensual, devuelve su versión anual si existe. */
export function getPlanAnual(idMensual: string): Plan | null {
  const map: Record<string, string> = {
    starter: 'starter_anual',
    pro: 'pro_anual',
    multi: 'multi_anual',
  };
  const anualId = map[idMensual];
  return anualId ? PLANES[anualId] : null;
}

/** Duración del trial en días */
export const TRIAL_DIAS = 14;
