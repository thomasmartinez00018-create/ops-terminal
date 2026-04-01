const { app, BrowserWindow, utilityProcess, Menu, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const http = require('http')

const isDev = !app.isPackaged
const PORT  = 3001

// ── Paths ──────────────────────────────────────────────────────────────────────
function resourcePath (...parts) {
  return isDev
    ? path.join(__dirname, '..', ...parts)
    : path.join(process.resourcesPath, ...parts)
}

// ── Database: first-run copy de template ──────────────────────────────────────
const userData = app.getPath('userData')
const dbPath   = path.join(userData, 'stock.db')
// Prisma en Windows necesita forward-slashes en la URL
const dbUrl    = 'file:' + dbPath.replace(/\\/g, '/')

if (!fs.existsSync(dbPath)) {
  const tpl = isDev
    ? path.join(__dirname, '../backend/prisma/data/stock-gastro.db')
    : path.join(process.resourcesPath, 'template.db')
  if (fs.existsSync(tpl)) {
    fs.mkdirSync(userData, { recursive: true })
    fs.copyFileSync(tpl, dbPath)
    console.log('[electron] DB inicializada →', dbPath)
  } else {
    console.warn('[electron] template.db no encontrado')
  }
}

// ── Iniciar backend (utilityProcess) ──────────────────────────────────────────
let serverProcess = null

function startServer () {
  const script = isDev
    ? path.join(__dirname, '../backend/dist/server.js')
    : path.join(process.resourcesPath, 'backend', 'dist', 'server.js')

  if (!fs.existsSync(script)) {
    console.error('[electron] server.js no encontrado:', script)
    return
  }

  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    NODE_ENV:     'production',
    PORT:         String(PORT),
  }

  // Ayudar a Prisma a encontrar el engine empaquetado
  if (!isDev) {
    const engineDir = path.join(
      process.resourcesPath, 'backend', 'node_modules', '.prisma', 'client'
    )
    env.PRISMA_QUERY_ENGINE_LIBRARY = engineDir
  }

  serverProcess = utilityProcess.fork(script, [], { env, stdio: 'pipe' })

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', d => process.stdout.write('[server] ' + d))
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', d => process.stderr.write('[server] ' + d))
  }
  serverProcess.on('exit', code => console.log('[server] salió con código', code))
}

// ── Esperar que el servidor responda ──────────────────────────────────────────
function waitForServer (maxMs = 25000) {
  const start = Date.now()
  return new Promise(resolve => {
    function check () {
      http.get(`http://localhost:${PORT}/api/health`, res => {
        if (res.statusCode === 200) return resolve(true)
        retry()
      }).on('error', retry)
      function retry () {
        if (Date.now() - start > maxMs) return resolve(false)
        setTimeout(check, 400)
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

  console.log('[electron] esperando backend en puerto', PORT)
  const ready = await waitForServer()

  if (ready) {
    console.log('[electron] backend listo')
    mainWindow.loadURL(`http://localhost:${PORT}`)
  } else {
    console.error('[electron] timeout — backend no respondió')
    mainWindow.loadFile(path.join(__dirname, 'error.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startServer()
  await createWindow()
})

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
})
