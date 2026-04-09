const { app, BrowserWindow, utilityProcess, Menu, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const http  = require('http')
const { execSync } = require('child_process')

const isDev = !app.isPackaged
// Puerto activo — se determina al arrancar (fallback si 3001 está ocupado)
let PORT = 3001
const PORT_CANDIDATES = [3001, 3002, 3003, 3004, 8080, 8081]

// ── Log file (para debug en producción) ───────────────────────────────────────
const logPath = path.join(app.getPath('userData'), 'ops-terminal.log')
function log (...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(logPath, line) } catch (_) {}
}

// ── Paths ──────────────────────────────────────────────────────────────────────
function resourcePath (...parts) {
  return isDev
    ? path.join(__dirname, '..', ...parts)
    : path.join(process.resourcesPath, ...parts)
}

// ── Database: first-run copy de template ──────────────────────────────────────
const userData = app.getPath('userData')
const dbPath   = path.join(userData, 'stock.db')
const dbUrl    = 'file:' + dbPath.replace(/\\/g, '/')

log('userData:', userData)
log('dbPath:', dbPath)

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(userData, { recursive: true })
  const tpl = isDev
    ? path.join(__dirname, '../backend/prisma/data/stock-gastro.db')
    : path.join(process.resourcesPath, 'template.db')
  log('template.db path:', tpl, '| exists:', fs.existsSync(tpl))
  if (fs.existsSync(tpl)) {
    fs.copyFileSync(tpl, dbPath)
    log('DB copiada de template →', dbPath)
  } else {
    // Sin template: crear DB vacía — Prisma la inicializará con db push
    log('WARN: template.db no encontrado, creando DB vacía')
    fs.writeFileSync(dbPath, '')
  }
}

// ── Encontrar puerto libre ─────────────────────────────────────────────────────
function findFreePort () {
  return new Promise((resolve, reject) => {
    let i = 0
    function tryNext () {
      if (i >= PORT_CANDIDATES.length) return reject(new Error('No free port found'))
      const p = PORT_CANDIDATES[i++]
      const server = http.createServer()
      server.once('error', tryNext)
      server.once('listening', () => {
        server.close(() => resolve(p))
      })
      server.listen(p, '127.0.0.1')
    }
    tryNext()
  })
}

// ── Iniciar backend (utilityProcess) ──────────────────────────────────────────
let serverProcess  = null
let serverExitCode = null
const serverLogs   = []

function startServer () {
  const script = isDev
    ? path.join(__dirname, '../backend/dist/server.js')
    : path.join(process.resourcesPath, 'backend', 'dist', 'server.js')

  log('server.js path:', script, '| exists:', fs.existsSync(script))

  if (!fs.existsSync(script)) {
    log('ERROR: server.js no encontrado')
    return
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    NODE_ENV:     'production',
    PORT:         String(PORT),
  }

  // Leer .env.production para GEMINI_API_KEY y otros secretos
  if (!isDev) {
    const envFile = path.join(process.resourcesPath, 'backend', 'dist', '.env.production')
    log('.env.production path:', envFile, '| exists:', fs.existsSync(envFile))
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf-8').split('\n')
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)=(.+)$/)
        if (match) {
          env[match[1]] = match[2].trim()
          log('env loaded:', match[1], '=', match[1].includes('KEY') ? '***' : match[2].trim())
        }
      }
    }
  }

  // Prisma 6 usa WASM engine — no necesita .node binary ni PRISMA_QUERY_ENGINE_LIBRARY.
  // Solo verificar que .prisma/client existe para logging.
  if (!isDev) {
    const prismaClientDir = path.join(
      process.resourcesPath, 'backend', 'node_modules', '.prisma', 'client'
    )
    log('prisma client dir:', prismaClientDir, '| exists:', fs.existsSync(prismaClientDir))
    if (fs.existsSync(prismaClientDir)) {
      log('prisma client files:', fs.readdirSync(prismaClientDir).join(', '))
    }

    // Listar backend/node_modules top-level para verificar que express etc. están
    const backendNM = path.join(process.resourcesPath, 'backend', 'node_modules')
    if (fs.existsSync(backendNM)) {
      const pkgs = fs.readdirSync(backendNM).filter(f => !f.startsWith('.'))
      log('backend node_modules:', pkgs.length, 'packages -', pkgs.slice(0, 15).join(', '), '...')
    } else {
      log('ERROR: backend/node_modules not found!')
    }
  }

  serverProcess = utilityProcess.fork(script, [], { env, stdio: 'pipe' })

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', d => {
      const msg = d.toString()
      log('[server]', msg.trim())
      serverLogs.push(msg)
    })
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', d => {
      const msg = d.toString()
      log('[server:err]', msg.trim())
      serverLogs.push('[ERR] ' + msg)
    })
  }
  serverProcess.on('exit', code => {
    serverExitCode = code
    log('[server] salió con código', code)
  })
}

// ── Esperar que el servidor responda ──────────────────────────────────────────
function waitForServer (maxMs = 30000) {
  const start = Date.now()
  return new Promise(resolve => {
    function check () {
      // Fix: usar 127.0.0.1 explícito — en Windows 'localhost' puede resolver
      // a ::1 (IPv6) pero Express escucha solo en IPv4 (0.0.0.0)
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, res => {
        if (res.statusCode === 200) return resolve(true)
        retry()
      })
      req.on('error', retry)
      req.setTimeout(1500, () => { req.destroy(); retry() })
      function retry () {
        if (Date.now() - start > maxMs) return resolve(false)
        setTimeout(check, 500)
      }
    }
    check()
  })
}

// ── Ventana principal ─────────────────────────────────────────────────────────
let mainWindow = null

async function createWindow () {
  mainWindow = new BrowserWindow({
    width:           1400,
    height:          900,
    minWidth:        1024,
    minHeight:       700,
    backgroundColor: '#0A0A0A',
    show:            false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'OPS Terminal',
      submenu: [
        { label: 'Acerca de', role: 'about' },
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

  mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())

  log('esperando backend en puerto', PORT)
  const ready = await waitForServer()

  if (ready) {
    log('backend listo ✓')
    mainWindow.loadURL(`http://localhost:${PORT}`)
  } else {
    log('ERROR: timeout — backend no respondió')
    // Pasar el log al error.html via query param
    const snippet = serverLogs.slice(-20).join('').replace(/"/g, "'").slice(0, 2000)
    const params  = new URLSearchParams({
      logPath,
      detail: snippet || 'Sin logs del servidor',
    })
    mainWindow.loadFile(path.join(__dirname, 'error.html'), {
      query: { data: params.toString() },
    })
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Windows Firewall: abrir puerto automáticamente ───────────────────────────
function firewallRuleExists () {
  const ruleName = 'OPS Terminal Server'
  try {
    const out = execSync(
      `netsh advfirewall firewall show rule name="${ruleName}"`,
      { encoding: 'utf-8', windowsHide: true }
    )
    return out.includes(ruleName)
  } catch (_) {
    return false
  }
}

function ensureFirewallRule () {
  if (process.platform !== 'win32') return
  if (firewallRuleExists()) { log('Firewall rule ya existe ✓'); return }

  const ruleName = 'OPS Terminal Server'
  const netshCmd = `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${PORT} profile=any`

  // Solo intento directo (no bloquea si ya corre como admin)
  // Si falla por permisos, el usuario usa el botón en la app → UAC on-demand
  try {
    execSync(netshCmd, { encoding: 'utf-8', windowsHide: true, timeout: 3000 })
    log('Firewall rule creada ✓')
  } catch (_) {
    log('INFO: firewall rule no creada en startup (sin admin) — disponible vía botón en la app')
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('=== OPS Terminal iniciando ===')

  // Detectar puerto libre antes de arrancar el backend
  try {
    PORT = await findFreePort()
    log('Puerto seleccionado:', PORT)
  } catch (e) {
    log('WARN: no se encontró puerto libre, usando 3001 por defecto')
    PORT = 3001
  }

  // Firewall en background — no bloquea el arranque
  setImmediate(() => ensureFirewallRule())
  startServer()

  // Timeout de seguridad: si la ventana no es visible en 12s, mostrarla igual
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      log('WARN: timeout de visibilidad — forzando show()')
      mainWindow.show()
    }
  }, 12000)

  await createWindow()
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
})
