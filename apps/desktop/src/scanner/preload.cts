import type { ServerApi } from '@files/server'
import type { ScannerApi } from '@files/server/scanner'

// Sandboxed preloads need CommonJS and can only require Electron's allowed modules.
import electron = require('electron')
const { contextBridge, ipcRenderer } = electron

type FilesApi = {
  setControlsColor: (color: string) => Promise<void>
  collections: ServerApi['collections']
  config: ServerApi['config']
  libraries: Pick<ServerApi['libraries'], 'list'>
  entries: Pick<ServerApi['entries'], 'listChildren' | 'setAppTags'>
}

const files: FilesApi = {
  setControlsColor: (color) =>
    ipcRenderer.invoke('window:setControlsColor', color),
  collections: {
    list: () => ipcRenderer.invoke('collections:list'),
    create: (name) => ipcRenderer.invoke('collections:create', name),
    listEntries: (id) => ipcRenderer.invoke('collections:listEntries', id),
    forEntry: (id) => ipcRenderer.invoke('collections:forEntry', id),
    setMembership: (id, entryId, included) =>
      ipcRenderer.invoke('collections:setMembership', id, entryId, included),
    recordView: (id) => ipcRenderer.invoke('collections:recordView', id),
  },
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  entries: {
    setAppTags: (id, tags) =>
      ipcRenderer.invoke('entries:setAppTags', id, tags),
    listChildren: (folder) =>
      ipcRenderer.invoke('entries:listChildren', folder),
  },
  libraries: {
    list: () => ipcRenderer.invoke('libraries:list'),
  },
}
contextBridge.exposeInMainWorld('files', files)

function exposeScannerApi() {
  const scanner: ScannerApi = {
    start: (root) => ipcRenderer.invoke('scanner:start', root),
    status: () => ipcRenderer.invoke('scanner:status'),
    results: () => ipcRenderer.invoke('scanner:results'),
    cancel: () => ipcRenderer.invoke('scanner:cancel'),
  }
  contextBridge.exposeInMainWorld('scanner', scanner)
}

declare global {
  interface Window {
    files: FilesApi
    scanner: ScannerApi
  }
}

exposeScannerApi()
