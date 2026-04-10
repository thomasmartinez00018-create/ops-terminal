import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import prisma from './lib/prisma';
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rutas API
app.use('/api/auth', authRouter);
app.use('/api/productos', productosRouter);
app.use('/api/depositos', depositosRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/movimientos', movimientosRouter);
app.use('/api/stock', stockRouter);
app.use('/api/recetas', recetasRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/inventarios', inventariosRouter);
app.use('/api/importar', importarRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/ordenes-compra', ordenesCompraRouter);
app.use('/api/scanner', scannerRouter);
app.use('/api/facturas', facturasRouter);
app.use('/api/tareas', tareasRouter);
app.use('/api/elaboraciones', elaboracionesRouter);
app.use('/api/contabilidad', contabilidadRouter);
app.use('/api/config', configRouter);
app.use('/api/ai', aiChatRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Link de red local para compartir con el equipo
app.get('/api/network-url', (_req, res) => {
  const details = getLocalIPDetails();
  const ip = details[0]?.address ?? null;
  res.json({
    ip,
    port: PORT,
    url: ip ? `http://${ip}:${PORT}` : null,
    allUrls: details.map(d => `http://${d.address}:${PORT}`),
    interfaces: details.map(d => ({
      ip: d.address,
      name: d.iface,
      netmask: d.netmask,
      subnet: d.address.split('.').slice(0, 3).join('.'),
    })),
  });
});

// Ping endpoint — para que el celular pueda verificar conectividad
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Abrir puerto en Windows Firewall via UAC (solo Windows)
// Fix: restringir a conexiones locales — este endpoint ejecuta comandos con
// elevación; no debería ser accesible desde la red
app.post('/api/fix-firewall', (req, res) => {
  const remote = req.socket.remoteAddress ?? '';
  const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({ ok: false, message: 'Solo disponible desde la PC servidor' });
    return;
  }

  if (process.platform !== 'win32') {
    res.json({ ok: true, message: 'No aplica en este sistema operativo' });
    return;
  }
  const { execSync } = require('child_process') as typeof import('child_process');
  const ruleName = 'OPS Terminal Server';
  const netshCmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${PORT} profile=any`;

  // Fix: si ya existe pero con otro puerto, borrarla antes de crear la nueva
  try {
    const check = execSync(`netsh advfirewall firewall show rule name="${ruleName}"`, { encoding: 'utf-8', windowsHide: true });
    if (check.includes(ruleName)) {
      const portMatch = check.match(/(?:LocalPort|Puerto local)\s*:\s*(\d+)/i);
      const existingPort = portMatch ? Number(portMatch[1]) : null;
      if (existingPort === Number(PORT)) {
        res.json({ ok: true, message: 'La regla de firewall ya estaba configurada correctamente' });
        return;
      }
      // Port mismatch — intentar borrar
      try {
        execSync(`netsh advfirewall firewall delete rule name="${ruleName}"`, { encoding: 'utf-8', windowsHide: true });
      } catch (_) {}
    }
  } catch (_) {}

  // Intento directo (si corre como admin)
  try {
    execSync(netshCmd, { encoding: 'utf-8', windowsHide: true });
    res.json({ ok: true, message: 'Firewall configurado correctamente' });
    return;
  } catch (_) {}

  // Elevar via PowerShell UAC — sin -Wait, responde inmediato
  // La ventana UAC aparece sola; la regla se aplica al aceptar
  try {
    execSync(
      `powershell -NoProfile -Command "Start-Process cmd -Verb RunAs -WindowStyle Hidden -ArgumentList '/c ${netshCmd}'"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 8000 }
    );
    res.json({ ok: true, message: 'Aceptá el permiso de Windows que apareció en pantalla. Luego probá el celular.' });
  } catch (_) {
    res.json({ ok: false, message: 'No se pudo abrir la ventana de permisos de Windows' });
  }
});

// Verificar estado actual del firewall (para el botón de AccesoRed)
app.get('/api/firewall-status', (req, res) => {
  const remote = req.socket.remoteAddress ?? '';
  const isLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({ ok: false });
    return;
  }
  if (process.platform !== 'win32') {
    res.json({ configured: true, platform: process.platform });
    return;
  }
  const { execSync } = require('child_process') as typeof import('child_process');
  try {
    const check = execSync(`netsh advfirewall firewall show rule name="OPS Terminal Server"`, { encoding: 'utf-8', windowsHide: true, timeout: 2000 });
    const hasRule = check.includes('OPS Terminal Server');
    const portMatch = check.match(/(?:LocalPort|Puerto local)\s*:\s*(\d+)/i);
    const rulePort = portMatch ? Number(portMatch[1]) : null;
    res.json({
      configured: hasRule && rulePort === Number(PORT),
      rulePort,
      currentPort: Number(PORT),
    });
  } catch (_) {
    res.json({ configured: false });
  }
});

// En producción: servir el frontend compilado
if (IS_PROD) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  // SPA fallback — cualquier ruta no-API devuelve index.html
  // SPA fallback — Express 5 requiere named wildcard, no bare '*'
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Detalles de cada interfaz de red (IP, nombre, máscara).
interface IPDetail {
  address: string;
  iface: string;
  netmask: string;
}

// Scoring de interfaz: premia WiFi/Ethernet reales, penaliza virtuales.
// Fix Node 18+: family puede ser número 4 en vez de string 'IPv4'.
function ifaceScore(name: string, addr: string): number {
  let score = 0;
  const n = name.toLowerCase();

  // Penalizar adaptadores virtuales / VM
  const virtual = ['vethernet', 'vmware', 'virtualbox', 'vbox', 'docker', 'wsl',
                   'loopback', 'bluetooth', 'teredo', 'isatap', '6to4'];
  if (virtual.some(k => n.includes(k))) score -= 50;

  // Penalizar subnets típicas de VMs
  if (addr.startsWith('192.168.56.') || addr.startsWith('192.168.99.') ||
      addr.startsWith('169.254.'))    score -= 40;

  // Premiar interfaces reales
  if (n.includes('wi-fi') || n.includes('wlan') || n.includes('wireless')) score += 20;
  if (n.includes('ethernet') || n.includes('eth') || n.includes('local area')) score += 15;

  // Premiar subnets privadas reales (RFC 1918)
  if (addr.startsWith('192.168.')) score += 10;
  if (addr.startsWith('10.'))      score += 8;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) score += 6; // válido, muchos ISPs argentinos

  return score;
}

function getLocalIPDetails(): IPDetail[] {
  const interfaces = os.networkInterfaces();
  const all: IPDetail[] = [];
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      // Fix Node 18+: family puede ser 4 (número) o 'IPv4' (string)
      const isIPv4 = (addr.family === 'IPv4' || (addr.family as unknown) === 4);
      if (isIPv4 && !addr.internal) {
        all.push({ address: addr.address, iface: name, netmask: addr.netmask });
      }
    }
  }
  // Ordenar por score descendente (mayor score = más real)
  return all.sort((a, b) => ifaceScore(b.iface, b.address) - ifaceScore(a.iface, a.address));
}

function getLocalIPs(): string[] {
  return getLocalIPDetails().map(d => d.address);
}

// ── Auto-migrate: agregar columnas/tablas faltantes en DBs existentes ────────
async function autoMigrate() {
  try {
    const migrations = [
      `ALTER TABLE productos ADD COLUMN subrubro TEXT`,
      `ALTER TABLE movimientos ADD COLUMN elaboracion_lote_id INTEGER REFERENCES elaboracion_lotes(id)`,
      `ALTER TABLE recepcion_items ADD COLUMN cantidad_pedida REAL`,
      `ALTER TABLE recepcion_items ADD COLUMN atribucion TEXT`,
      `ALTER TABLE recepcion_items ADD COLUMN motivo_diferencia TEXT`,
      `ALTER TABLE recetas ADD COLUMN producto_resultado_id INTEGER REFERENCES productos(id)`,
      `ALTER TABLE recetas ADD COLUMN cantidad_producida REAL`,
      `ALTER TABLE recetas ADD COLUMN unidad_producida TEXT`,
    ];

    // Crear tabla tareas si no existe (módulo de checklist operativo)
    // Schema debe coincidir EXACTAMENTE con model Tarea de schema.prisma
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS tareas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      tipo TEXT NOT NULL DEFAULT 'general',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      prioridad TEXT NOT NULL DEFAULT 'normal',
      fecha TEXT NOT NULL,
      hora_limite TEXT,
      creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
      asignado_a_id INTEGER NOT NULL REFERENCES usuarios(id),
      completada_at DATETIME,
      observacion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Crear tabla elaboracion_lotes si no existe
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS elaboracion_lotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      receta_id INTEGER REFERENCES recetas(id),
      producto_resultado_id INTEGER NOT NULL REFERENCES productos(id),
      cantidad_producida REAL NOT NULL,
      unidad_producida TEXT NOT NULL,
      deposito_destino_id INTEGER REFERENCES depositos(id),
      observacion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Crear tablas de contabilidad
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      tipo_comprobante TEXT NOT NULL DEFAULT 'ticket',
      numero TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL,
      fecha_vencimiento TEXT,
      proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
      orden_compra_id INTEGER REFERENCES ordenes_compra(id),
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0,
      total REAL DEFAULT 0,
      estado TEXT DEFAULT 'pendiente',
      imagen_base64 TEXT,
      observacion TEXT,
      creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS factura_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      producto_id INTEGER REFERENCES productos(id),
      descripcion TEXT NOT NULL,
      cantidad REAL NOT NULL,
      unidad TEXT NOT NULL,
      precio_unitario REAL NOT NULL,
      alicuota_iva REAL DEFAULT 21,
      subtotal REAL DEFAULT 0,
      iva REAL DEFAULT 0
    )`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL REFERENCES facturas(id),
      fecha TEXT NOT NULL,
      monto REAL NOT NULL,
      medio_pago TEXT NOT NULL DEFAULT 'efectivo',
      referencia TEXT,
      observacion TEXT,
      creado_por_id INTEGER NOT NULL REFERENCES usuarios(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    migrations.push(`ALTER TABLE movimientos ADD COLUMN factura_id INTEGER REFERENCES facturas(id)`);
    migrations.push(`ALTER TABLE usuarios ADD COLUMN configuracion TEXT`);

    // Agregar columnas faltantes (SQLite ignora si ya existen con este pattern)
    for (const sql of migrations) {
      try {
        await prisma.$executeRawUnsafe(sql);
        console.log(`MIGRATE OK: ${sql.substring(0, 60)}...`);
      } catch (e: any) {
        // "duplicate column" es esperado si ya existe — silenciar
        if (!e.message?.includes('duplicate column')) {
          console.log(`MIGRATE SKIP: ${e.message?.substring(0, 80)}`);
        }
      }
    }
  } catch (e: any) {
    console.error('Auto-migrate error:', e.message);
  }
}

// Fix root cause: autoMigrate DEBE completar antes de aceptar requests.
// Antes era fire-and-forget → race condition: el server atendía queries
// a columnas/tablas que Prisma esperaba pero que aún no habían sido
// migradas → errores P2021/P2022 constantes en los clientes en producción.
async function start() {
  console.log('Verificando schema de DB...');
  await autoMigrate();
  console.log('DB schema verificado ✓');

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║          OPS TERMINAL — Stock Gastro             ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Local:    http://localhost:${PORT}                ║`);
    if (ips.length > 0) {
      ips.forEach(ip => {
        const url = `http://${ip}:${PORT}`;
        const padded = url.padEnd(42);
        console.log(`║  Red:      ${padded}  ║`);
      });
    }
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  Abrí la URL en cualquier dispositivo de la red  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });

  // Fix: detectar EADDRINUSE y otros errores del listener
  server.on('error', (err: any) => {
    console.error('SERVER LISTEN ERROR:', err.code || err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Puerto ${PORT} ya está en uso. Electron debería elegir otro puerto libre.`);
    }
    process.exit(1);
  });
}

start().catch(err => {
  console.error('FATAL: no se pudo iniciar el server:', err?.message || err);
  console.error(err?.stack || '');
  process.exit(1);
});
