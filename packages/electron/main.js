const { app, BrowserWindow, utilityProcess, Menu, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const http = require('http')

const isDev = !app.isPackaged
const PORT  = 3001

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
  const tpl = isDev
    ? path.join(__dirname, '../backend/prisma/data/stock-gastro.db')
    : path.join(process.resourcesPath, 'template.db')
  log('template.db path:', tpl, '| exists:', fs.existsSync(tpl))
  if (fs.existsSync(tpl)) {
    fs.mkdirSync(userData, { recursive: true })
    fs.copyFileSync(tpl, dbPath)
    log('DB inicializada →', dbPath)
  } else {
    log('WARN: template.db no encontrado')
  }
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
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1',
  }

  // Ayudar a Prisma a encontrar el engine: apuntar al ARCHIVO .node, no al directorio
  if (!isDev) {
    const engineDir = path.join(
      process.resourcesPath, 'backend', 'node_modules', '.prisma', 'client'
    )
    log('engineDir:', engineDir, '| exists:', fs.existsSync(engineDir))

    if (fs.existsSync(engineDir)) {
      const files = fs.readdirSync(engineDir)
      log('engineDir contents:', files.join(', '))
      const nodeFile = files.find(f => f.endsWith('.node'))
      if (nodeFile) {
        env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(engineDir, nodeFile)
        log('PRISMA_QUERY_ENGINE_LIBRARY:', env.PRISMA_QUERY_ENGINE_LIBRARY)
      } else {
        log('WARN: no .node file found in engineDir')
      }
    } else {
      log('WARN: engineDir no existe')
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
      http.get(`http://localhost:${PORT}/api/health`, res => {
        if (res.statusCode === 200) return resolve(true)
        retry()
      }).on('error', retry)
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

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('=== OPS Terminal iniciando ===')
  startServer()
  await createWindow()
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
})
