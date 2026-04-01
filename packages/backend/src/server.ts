import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Link de red local para compartir con el equipo
app.get('/api/network-url', (_req, res) => {
  const ips = getLocalIPs();
  const ip = ips[0] ?? null;
  res.json({
    ip,
    port: PORT,
    url: ip ? `http://${ip}:${PORT}` : null,
    allUrls: ips.map(i => `http://${i}:${PORT}`),
  });
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

// Obtener las IPs locales para mostrarlas al iniciar
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

app.listen(Number(PORT), '0.0.0.0', () => {
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
