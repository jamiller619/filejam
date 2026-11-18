import type { BridgeEvent, BrowserApi } from './protocol.js'

import electron = require('electron')

const { contextBridge, ipcRenderer } = electron

const channels = {
  chooseFolder: 'browser:choose-folder',
  start: 'browser:start',
  next: 'browser:next',
  cancel: 'browser:cancel',
  event: 'browser:event',
} as const

const browser: BrowserApi = {
  mode: 'browser-poc',
  chooseFolder: () => ipcRenderer.invoke(channels.chooseFolder),
  start: (input) => ipcRenderer.invoke(channels.start, input),
  next: (id) => ipcRenderer.invoke(channels.next, id),
  cancel: (id) => ipcRenderer.invoke(channels.cancel, id),
  onEvent: (listener) => {
    const wrapper = (_event: Electron.IpcRendererEvent, event: BridgeEvent) => {
      listener(event)
    }

    ipcRenderer.on(channels.event, wrapper)

    return () => {
      ipcRenderer.removeListener(channels.event, wrapper)
    }
  },
}

contextBridge.exposeInMainWorld('browser', browser)
if (process.argv.includes('--filejam-desktop-browser')) {
  contextBridge.exposeInMainWorld('locations', {
    get: () => ipcRenderer.invoke('browser:locations'),
    favorite: (path: string, enabled: boolean) =>
      ipcRenderer.invoke('browser:favorite', path, enabled),
  })
}
