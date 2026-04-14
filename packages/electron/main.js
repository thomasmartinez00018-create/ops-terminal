// ── OPS Terminal — Cloud Shell ───────────────────────────────────────────────
// v2.0: la app ya no bundlea backend ni base de datos. Es un wrapper thin
// que carga el frontend alojado en la nube (Vercel) que a su vez pega al
// backend alojado en la nube (Railway). Ventajas:
//   1. Cero problemas de firewall/antivirus (nada levanta puerto local)
//   2. Datos centralizados — acceso desde cualquier dispositivo
//   3. Actualizaciones instantáneas sin reinstalar
//   4. .exe chiquito (~80MB vs ~350MB antes)

const { app, BrowserWindow, Menu, shell, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')
const http = require('http')
const https = require('https')

const isDev = !app.isPackaged

// URL del frontend cloud. Se puede sobreescribir con OPS_CLOUD_URL (para
// staging / dev). Por default apunta al deploy de producción de Vercel.
const CLOUD_URL = process.env.OPS_CLOUD_URL || 'https://ops-terminal-alpha.vercel.app'

// ── Log file (para debug en producción) ────────────────────────────────
const logPath = path.join(app.getPath('userData'), 'ops-terminal.log')
function log (...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(logPath, line) } catch (_) {}
}

// ── Chequear conectividad antes de cargar ──────────────────────────────
// Si no hay internet o el servidor cloud está caído, queremos mostrar
// un error bonito en vez de un WEB_CONTENT_FAILED_TO_LOAD críptico.
function checkConnectivity (url, timeoutMs = 8000) {
  return new Promise(resolve => {
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, res => {
      // 2xx o 3xx → OK
      resolve(res.statusCode && res.statusCode < 400)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false) })
  })
}

// ── Ventana principal ──────────────────────────────────────────────────
let mainWindow = null

function showError (detail) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0A0A0A;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:2rem;font-family:'Segoe UI',system-ui,sans-serif;color:#fff}h1{font-size:1.4rem;color:#ef4444;margin-bottom:.75rem}.sub{color:#888;font-size:.85rem;margin-bottom:1.5rem}.log-box{background:#111;border:1px solid #333;border-radius:6px;padding:1rem;width:100%;max-width:700px;font-family:monospace;font-size:.75rem;color:#f87171;max-height:260px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;margin-bottom:1.5rem}.buttons{display:flex;gap:.75rem}button{padding:.55rem 1.25rem;background:#D4AF37;color:#000;border:none;border-radius:4px;font-weight:700;cursor:pointer;font-size:.85rem}</style></head><body><h1>⚠ No se pudo cargar la app</h1><p class="sub">Verificá tu conexión a internet e intentá de nuevo.</p><div class="log-box">${detail.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div><div class="buttons"><button onclick="location.reload()">↺ Reintentar</button></div></body></html>`
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

async function createWindow () {
  mainWindow = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        1024,
    minHeight:       700,
    backgroundColor: '#0A0A0A',
    show:            false,
    icon:            path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      // Permitir carga de recursos cross-origin (Vercel + Railway + Gemini)
      webSecurity: true,
    },
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'OPS Terminal',
      submenu: [
        { label: 'Acerca de', role: 'about' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { label: 'Pantalla completa', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' },  { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ]))

  // 1. Mostrar splash mientras chequeamos conectividad
  // Usamos loadURL con HTML inline para evitar problemas de rutas dentro del .asar
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0A0A0A;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:'Segoe UI',system-ui,sans-serif;color:#D4AF37;user-select:none}.logo{font-size:2.5rem;font-weight:800;letter-spacing:0.1em;margin-bottom:0.25rem}.sub{font-size:0.75rem;letter-spacing:0.3em;color:#666;text-transform:uppercase;margin-bottom:3rem}.spinner{width:40px;height:40px;border:3px solid #262626;border-top-color:#D4AF37;border-radius:50%;animation:spin 0.8s linear infinite}.msg{margin-top:1.5rem;font-size:0.8rem;color:#555;letter-spacing:0.05em}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="logo"><span style="color:#D4AF37">OPS</span>TERMINAL</div><div class="sub">Stock Gastro</div><div class="spinner"></div><div class="msg">Conectando...</div></body></html>`))
  mainWindow.once('ready-to-show', () => mainWindow.show())

  log('comprobando conectividad con', CLOUD_URL)
  const reachable = await checkConnectivity(CLOUD_URL)

  if (!reachable) {
    log('ERROR: no se pudo alcanzar', CLOUD_URL)
    showError(`No se pudo conectar con ${CLOUD_URL}.\nVerificá tu conexión a internet e intentá nuevamente.`)
    return
  }

  log('cargando', CLOUD_URL)
  mainWindow.loadURL(CLOUD_URL).catch(err => {
    log('ERROR: loadURL falló:', err.message)
    showError('No se pudo cargar la app: ' + err.message)
  })

  // Links externos → abrir en el browser del usuario
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Si una navegación sale del dominio cloud, abrir externo
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url)
    const cloud = new URL(CLOUD_URL)
    if (target.hostname !== cloud.hostname && target.protocol !== 'file:') {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Ciclo de vida ──────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('=== OPS Terminal (cloud shell) iniciando ===')
  log('isDev:', isDev, '| CLOUD_URL:', CLOUD_URL)
  log('userData:', app.getPath('userData'))
  await createWindow()
})

app.on('window-all-closed', () => app.quit())

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
