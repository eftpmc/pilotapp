"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isElectron: true,
    onTheme: (cb) => {
        electron_1.ipcRenderer.on('theme', (_e, t) => cb(t));
    },
    navigate: (path) => electron_1.ipcRenderer.send('navigate', path),
    openExternal: (url) => electron_1.ipcRenderer.send('open-external', url),
    notify: (title, body) => electron_1.ipcRenderer.send('notify', title, body),
    badge: (count) => electron_1.ipcRenderer.send('badge', count),
    settings: {
        get: (key) => electron_1.ipcRenderer.invoke('settings:get', key),
        set: (key, value) => electron_1.ipcRenderer.invoke('settings:set', key, value),
    },
});
