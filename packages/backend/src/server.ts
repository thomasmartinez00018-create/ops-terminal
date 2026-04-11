import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import prisma from './lib/prisma';
import { tenantMiddleware, requireSuscripcionActiva } from './lib/middleware';
import { requireOrg, requireStaff } from './lib/auth';
import cuentaRouter from './routes/cuenta';
import productosRouter from './routes/productos';
import depositosRouter from './routes/depositos';
import usuariosRouter from './routes/usuarios';
import movimientosRouter from './routes/movimientos';
import stockRouter from './routes/stock';
import authRouter from './routes/auth';
import recetasRouter from './routes/recetas';
import proveedoresRouter from './routes/proveedores';
import inventariosRouter from './routes/inventarios';
import importarRouter from './routes/importar';
import reportesRouter from './routes/reportes';
import syncRouter from './routes/sync';
import ordenesCompraRouter from './routes/ordenesCompra';
import scannerRouter from './routes/controlScanner';
import facturasRouter from './routes/facturas';
import tareasRouter from './routes/tareas';
import elaboracionesRouter from './routes/elaboraciones';
import contabilidadRouter from './routes/contabilidad';
import configRouter from './routes/config';
import aiChatRouter from './routes/aiChat';

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Railway / Vercel / cualquier proxy cloud termina TLS antes del app.
// express-rate-limit necesita trust proxy para leer X-Forwarded-For y
// hacer rate limit por IP real en vez de la IP del edge.
app.set('trust proxy', 1);

// ── Seguridad: helmet headers ────────────────────────────────────────────────
// CSP desactivado porque el frontend está en otro dominio y Helmet default
// bloquea inline scripts que Vite necesita. El frontend queda protegido por
// su propio host (Vercel ya añade CSP razonable).
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── CORS ────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGINS es una lista separada por comas de dominios permitidos.
// Ej: https://ops-terminal.vercel.app,https://ops.masorganicos.com.ar
// En dev, sin esta var, se permite cualquier origen (para localhost + LAN).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Requests sin origin (curl, healthchecks, Electron file://) → permitidos.
    if (!origin) return cb(null, true);
    // Sin lista configurada → permisivo (dev).
    if (allowedOrigins.length === 0) return cb(null, true);
    // Con lista → whitelist estricto.
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origen no permitido (${origin})`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── Multi-tenant context ────────────────────────────────────────────────────
// Corre GLOBALMENTE antes de cualquier ruta. Si el request trae un token de
// stage 2 o 3, abre un AsyncLocalStorage con { organizacionId, ... } y todo
// lo async que venga después (Prisma queries incluidas) recibe el filtro
// de tenant automáticamente. Si no hay token, el request pasa sin contexto.
app.use(tenantMiddleware);

// ── Rutas de nivel cuenta (pre-workspace) ───────────────────────────────────
// Estas rutas NO requieren workspace seleccionado — son el login/signup/
// switch. Corren antes del middleware de suscripción.
app.use('/api/cuenta', cuentaRouter);

// ── Rutas de negocio (requieren workspace + suscripción activa) ─────────────
// El orden importa:
//   1. Primero aplicamos requireOrg/requireStaff dentro de cada router
//      (o a nivel router con app.use).
//   2. requireSuscripcionActiva va DESPUÉS de tener req.token pero ANTES de
//      ejecutar la lógica de la ruta.
// Como todas estas rutas necesitan suscripción, la aplicamos globalmente al
// prefijo /api excluyendo /api/cuenta, /api/auth y /api/health.
app.use('/api/auth', authRouter);
// Todo lo que sigue requiere suscripción activa. Lo hacemos con un router
// que monta el middleware antes de delegar a cada router específico.
const businessApi = express.Router();
// Todas las rutas de negocio requieren staff autenticado (stage 3) + suscripción
// activa. Esto cierra de un plumazo el hueco de seguridad anterior donde rutas
// como POST /api/usuarios estaban públicas.
businessApi.use(requireStaff);
businessApi.use(requireSuscripcionActiva);
businessApi.use('/productos', productosRouter);
businessApi.use('/depositos', depositosRouter);
businessApi.use('/usuarios', usuariosRouter);
businessApi.use('/movimientos', movimientosRouter);
businessApi.use('/stock', stockRouter);
businessApi.use('/recetas', recetasRouter);
businessApi.use('/proveedores', proveedoresRouter);
businessApi.use('/inventarios', inventariosRouter);
businessApi.use('/importar', importarRouter);
businessApi.use('/reportes', reportesRouter);
businessApi.use('/sync', syncRouter);
businessApi.use('/ordenes-compra', ordenesCompraRouter);
businessApi.use('/scanner', scannerRouter);
businessApi.use('/facturas', facturasRouter);
businessApi.use('/tareas', tareasRouter);
businessApi.use('/elaboraciones', elaboracionesRouter);
businessApi.use('/contabilidad', contabilidadRouter);
businessApi.use('/config', configRouter);
businessApi.use('/ai', aiChatRouter);
app.use('/api', businessApi);

// ── Health check (usado por Railway/Vercel) ─────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    // Verificar que la DB responde (toca un SELECT 1)
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(503).json({ status: 'error', db: 'down', error: e?.message });
  }
});

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ── En producción: servir frontend compilado (opcional) ─────────────────────
// Si SERVE_FRONTEND=true, el mismo backend sirve el /dist del frontend.
// Así podemos deployar todo en un solo container en Railway, o dejar que
// Vercel sirva el frontend y el backend solo expone /api (modo split).
if (IS_PROD && process.env.SERVE_FRONTEND === 'true') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Error handler global ────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error:', err?.message || err);
  // Errores de CORS vienen acá
  if (err?.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Start ───────────────────────────────────────────────────────────────────
// En Postgres + Railway ya no hacemos autoMigrate raw. Prisma migrate deploy
// corre en el Dockerfile ENTRYPOINT antes de que Node arranque, así que
// cuando llegamos acá el schema ya está al día.
async function start() {
  console.log('[server] boot — NODE_ENV=', process.env.NODE_ENV);
  console.log('[server] PORT=', PORT);
  console.log('[server] DATABASE_URL set?', !!process.env.DATABASE_URL);
  console.log('[server] JWT_SECRET set?', !!process.env.JWT_SECRET);
  console.log('[server] ALLOWED_ORIGINS=', allowedOrigins.length ? allowedOrigins.join(',') : '(permisivo)');

  // Bindear explícitamente a 0.0.0.0 para Railway (el default de Express ya
  // lo hace, pero ser explícito ayuda si alguna vez cambian el comportamiento).
  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('');
    console.log('┌─────────────────────────────────────────────────┐');
    console.log(`│  OPS Terminal API — escuchando en 0.0.0.0:${PORT}   `);
    console.log(`│  NODE_ENV=${process.env.NODE_ENV || 'development'}`);
    console.log(`│  CORS origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : '(permisivo dev)'}`);
    console.log('└─────────────────────────────────────────────────┘');
    console.log('');
  });

  server.on('error', (err: any) => {
    console.error('SERVER LISTEN ERROR:', err.code || err.message);
    process.exit(1);
  });

  // Graceful shutdown (importante en Railway — manda SIGTERM al redeploy)
  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} recibido — cerrando gracefully`);
    server.close(() => {
      console.log('[server] HTTP server cerrado');
    });
    try { await prisma.$disconnect(); } catch (_) {}
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('FATAL: no se pudo iniciar el server:', err?.message || err);
  console.error(err?.stack || '');
  process.exit(1);
});
