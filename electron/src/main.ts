import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, session, Notification } from 'electron'
import { join } from 'path'
import fs from 'fs'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const DEV_URL = 'http://localhost:5174'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pendingPair: { serverUrl: string; pairToken: string } | null = null

// Register pilot:// URL scheme so the web UI can launch the app
if (!app.isDefaultProtocolClient('pilot')) app.setAsDefaultProtocolClient('pilot')

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'pair') {
      const serverUrl = parsed.searchParams.get('url')
      const pairToken = parsed.searchParams.get('token')
      if (serverUrl && pairToken) {
        pendingPair = { serverUrl, pairToken }
        if (win) {
          win.show(); win.focus()
          win.webContents.send('deep-link-pair', { serverUrl, pairToken })
        }
      }
    }
  } catch {}
}

// macOS: app already running, new URL opened
app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url) })

// Windows/Linux: enforce single instance so deep links reach the running app
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find(a => a.startsWith('pilot://'))
    if (url) handleDeepLink(url)
    if (win) { win.show(); win.focus() }
  })
}

// ─── Settings ────────────────────────────────────────────────────────────────
const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

function readSettings(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) } catch { return {} }
}
function writeSettings(data: Record<string, string>) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data))
}

// ─── CORS bypass ─────────────────────────────────────────────────────────────
// In production the renderer loads from file:// — the server will block requests
// with a null Origin. We inject permissive CORS headers on all server responses.
function setupCors() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin':  ['*'],
        'Access-Control-Allow-Headers': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, PATCH, DELETE, OPTIONS'],
      },
    })
  })
}

// ─── Asset proxy ─────────────────────────────────────────────────────────────
// The office scene uses hardcoded /kaykit/ paths. In production the renderer is
// on file://, so those paths resolve to file:///kaykit/... and 404. Rewrite them
// to {serverUrl}/kaykit/... so Three.js loads them from the server.
function setupAssetProxy() {
  const filter = { urls: ['file:///kaykit/*', 'file://*/kaykit/*'] }
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    const serverUrl = readSettings()['pilot.server']
    if (!serverUrl) { callback({}); return }
    const path = details.url.replace(/^file:\/\/[^/]*/i, '')
    callback({ redirectURL: `${serverUrl}${path}` })
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#111111',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    loadWithRetry(DEV_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in browser, internal ones in new Electron window
    if (url.startsWith(DEV_URL) || url.startsWith('file://')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => { win = null })
}

function loadWithRetry(url: string, attempts = 0) {
  win?.loadURL(url).catch(() => {
    if (attempts < 20) setTimeout(() => loadWithRetry(url, attempts + 1), 500)
  })
}

function createTray() {
  // Use a blank 16x16 image as placeholder — replace assets/tray.png with real icon
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Pilot')
  updateTrayMenu()
}

function updateTrayMenu(status?: string) {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: status ?? 'Pilot', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Office',
      click: () => {
        if (win) { win.show(); win.focus() }
        else createWindow()
      },
    },
    { type: 'separator' },
    { label: 'Quit Pilot', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}

// IPC — renderer can request navigation or status updates
ipcMain.on('navigate', (_e, path: string) => {
  win?.loadURL(isDev ? `${DEV_URL}${path}` : `file://${join(__dirname, '../renderer/dist/index.html')}#${path}`)
})

ipcMain.on('status', (_e, status: string) => {
  updateTrayMenu(status)
  tray?.setToolTip(`Pilot — ${status}`)
})

ipcMain.handle('settings:get', (_e, key: string) => readSettings()[key] ?? null)
ipcMain.handle('settings:set', (_e, key: string, value: string) => {
  const s = readSettings(); s[key] = value; writeSettings(s)
})

ipcMain.handle('pair:pending', () => {
  const p = pendingPair; pendingPair = null; return p
})

ipcMain.on('open-external', (_e, url: string) => { shell.openExternal(url) })

ipcMain.on('notify', (_e, title: string, body: string) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show()
})

ipcMain.on('badge', (_e, count: number) => {
  if (process.platform === 'darwin') app.dock.setBadge(count > 0 ? String(count) : '')
})

app.whenReady().then(() => {
  setupCors()
  setupAssetProxy()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win?.show()
  })
})

// Keep app alive in tray on Mac when all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
