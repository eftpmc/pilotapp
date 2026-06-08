"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = __importDefault(require("fs"));
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
const DEV_URL = 'http://localhost:5174';
let win = null;
let tray = null;
// ─── Settings ────────────────────────────────────────────────────────────────
const SETTINGS_PATH = (0, path_1.join)(electron_1.app.getPath('userData'), 'settings.json');
function readSettings() {
    try {
        return JSON.parse(fs_1.default.readFileSync(SETTINGS_PATH, 'utf8'));
    }
    catch {
        return {};
    }
}
function writeSettings(data) {
    fs_1.default.writeFileSync(SETTINGS_PATH, JSON.stringify(data));
}
// ─── CORS bypass ─────────────────────────────────────────────────────────────
// In production the renderer loads from file:// — the server will block requests
// with a null Origin. We inject permissive CORS headers on all server responses.
function setupCors() {
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Access-Control-Allow-Origin': ['*'],
                'Access-Control-Allow-Headers': ['*'],
                'Access-Control-Allow-Methods': ['GET, POST, PUT, PATCH, DELETE, OPTIONS'],
            },
        });
    });
}
// ─── Asset proxy ─────────────────────────────────────────────────────────────
// The office scene uses hardcoded /kaykit/ paths. In production the renderer is
// on file://, so those paths resolve to file:///kaykit/... and 404. Rewrite them
// to {serverUrl}/kaykit/... so Three.js loads them from the server.
function setupAssetProxy() {
    const filter = { urls: ['file:///kaykit/*', 'file://*/kaykit/*'] };
    electron_1.session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
        const serverUrl = readSettings()['pilot.server'];
        if (!serverUrl) {
            callback({});
            return;
        }
        const path = details.url.replace(/^file:\/\/[^/]*/i, '');
        callback({ redirectURL: `${serverUrl}${path}` });
    });
}
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 14 },
        backgroundColor: '#111111',
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (isDev) {
        loadWithRetry(DEV_URL);
    }
    else {
        win.loadFile((0, path_1.join)(__dirname, '../renderer/dist/index.html'));
    }
    win.webContents.setWindowOpenHandler(({ url }) => {
        // Open external links in browser, internal ones in new Electron window
        if (url.startsWith(DEV_URL) || url.startsWith('file://'))
            return { action: 'allow' };
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    win.on('closed', () => { win = null; });
}
function loadWithRetry(url, attempts = 0) {
    win?.loadURL(url).catch(() => {
        if (attempts < 20)
            setTimeout(() => loadWithRetry(url, attempts + 1), 500);
    });
}
function createTray() {
    // Use a blank 16x16 image as placeholder — replace assets/tray.png with real icon
    const icon = electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(icon);
    tray.setToolTip('Pilot');
    updateTrayMenu();
}
function updateTrayMenu(status) {
    if (!tray)
        return;
    const menu = electron_1.Menu.buildFromTemplate([
        { label: status ?? 'Pilot', enabled: false },
        { type: 'separator' },
        {
            label: 'Open Office',
            click: () => {
                if (win) {
                    win.show();
                    win.focus();
                }
                else
                    createWindow();
            },
        },
        { type: 'separator' },
        { label: 'Quit Pilot', click: () => electron_1.app.quit() },
    ]);
    tray.setContextMenu(menu);
}
// IPC — renderer can request navigation or status updates
electron_1.ipcMain.on('navigate', (_e, path) => {
    win?.loadURL(isDev ? `${DEV_URL}${path}` : `file://${(0, path_1.join)(__dirname, '../renderer/dist/index.html')}#${path}`);
});
electron_1.ipcMain.on('status', (_e, status) => {
    updateTrayMenu(status);
    tray?.setToolTip(`Pilot — ${status}`);
});
electron_1.ipcMain.handle('settings:get', (_e, key) => readSettings()[key] ?? null);
electron_1.ipcMain.handle('settings:set', (_e, key, value) => {
    const s = readSettings();
    s[key] = value;
    writeSettings(s);
});
electron_1.ipcMain.on('open-external', (_e, url) => { electron_1.shell.openExternal(url); });
electron_1.ipcMain.on('notify', (_e, title, body) => {
    if (electron_1.Notification.isSupported())
        new electron_1.Notification({ title, body, silent: false }).show();
});
electron_1.ipcMain.on('badge', (_e, count) => {
    if (process.platform === 'darwin')
        electron_1.app.dock.setBadge(count > 0 ? String(count) : '');
});
electron_1.app.whenReady().then(() => {
    setupCors();
    setupAssetProxy();
    createWindow();
    createTray();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
        else
            win?.show();
    });
});
// Keep app alive in tray on Mac when all windows closed
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
