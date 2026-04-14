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
  mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())

  log('comprobando conectividad con', CLOUD_URL)
  const reachable = await checkConnectivity(CLOUD_URL)

  if (!reachable) {
    log('ERROR: no se pudo alcanzar', CLOUD_URL)
    mainWindow.loadFile(path.join(__dirname, 'error.html'), {
      query: {
        data: new URLSearchParams({
          logPath,
          detail: `No se pudo conectar con ${CLOUD_URL}. Verificá tu conexión a internet e intentá nuevamente.`,
        }).toString(),
      },
    })
    return
  }

  log('cargando', CLOUD_URL)
  mainWindow.loadURL(CLOUD_URL).catch(err => {
    log('ERROR: loadURL falló:', err.message)
    mainWindow.loadFile(path.join(__dirname, 'error.html'), {
      query: {
        data: new URLSearchParams({
          logPath,
          detail: 'No se pudo cargar la app: ' + err.message,
        }).toString(),
      },
    })
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
