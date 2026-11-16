import type { BridgeEvent, LiveBrowserApi } from './protocol.js'

import electron = require('electron')

const { contextBridge, ipcRenderer } = electron

const channels = {
  chooseFolder: 'live-browser:choose-folder',
  start: 'live-browser:start',
  next: 'live-browser:next',
  cancel: 'live-browser:cancel',
  event: 'live-browser:event',
} as const

const liveBrowser: LiveBrowserApi = {
  mode: 'live-browser-poc',
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

contextBridge.exposeInMainWorld('liveBrowser', liveBrowser)
