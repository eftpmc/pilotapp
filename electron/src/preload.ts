import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isElectron: true,
  onTheme: (cb: (theme: 'light' | 'dark') => void) => {
    ipcRenderer.on('theme', (_e, t) => cb(t))
  },
  navigate: (path: string) => ipcRenderer.send('navigate', path),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  onDeepLinkPair: (cb: (data: { serverUrl: string; pairToken: string }) => void) => {
    ipcRenderer.on('deep-link-pair', (_e, data) => cb(data))
  },
  getPendingPair: (): Promise<{ serverUrl: string; pairToken: string } | null> =>
    ipcRenderer.invoke('pair:pending'),
  notify: (title: string, body: string) => ipcRenderer.send('notify', title, body),
  badge: (count: number) => ipcRenderer.send('badge', count),
  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('settings:set', key, value),
  },
})
