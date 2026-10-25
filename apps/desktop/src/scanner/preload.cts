import type { ServerApi } from '@filejam/server'
import type { ScannerApi } from '@filejam/server/scanner'

// Sandboxed preloads need CommonJS and can only require Electron's allowed modules.
import electron = require('electron')

const { contextBridge, ipcRenderer } = electron

type FilejamApi = {
  getDroppedFilePath: (file: File) => string
  addFavoriteFolders: (paths: string[]) => Promise<string[]>
  openImage: (libraryId: number, path: string) => Promise<void>
  previewCapabilities: (
    libraryId: number,
    path: string,
  ) => Promise<{ original: boolean }>
  setControlsColor: (color: string) => Promise<void>
  collections: ServerApi['collections']
  config: ServerApi['config']
  libraries: Pick<ServerApi['libraries'], 'list'> & {
    add: () => Promise<
      Awaited<ReturnType<ServerApi['libraries']['list']>>[number] | null
    >
  }
  entries: Pick<ServerApi['entries'], 'listChildren'> & {
    moveFolders: (paths: string[], destination: string) => Promise<string[]>
  }
  moveHistory: Pick<ServerApi['moveHistory'], 'list'>
}

const filejam: FilejamApi = {
  getDroppedFilePath: (file) => electron.webUtils.getPathForFile(file),
  addFavoriteFolders: (paths) =>
    ipcRenderer.invoke('favorites:addFolders', paths),
  openImage: (libraryId, path) =>
    ipcRenderer.invoke('window:openImage', libraryId, path),
  previewCapabilities: (libraryId, path) =>
    ipcRenderer.invoke('preview:capabilities', libraryId, path),
  setControlsColor: (color) =>
    ipcRenderer.invoke('window:setControlsColor', color),
  collections: {
    list: () => ipcRenderer.invoke('collections:list'),
    create: (input) => ipcRenderer.invoke('collections:create', input),
    update: (id, input) => ipcRenderer.invoke('collections:update', id, input),
    delete: (id) => ipcRenderer.invoke('collections:delete', id),
    listEntries: (id) => ipcRenderer.invoke('collections:listEntries', id),
    forEntry: (id) => ipcRenderer.invoke('collections:forEntry', id),
    getEntryState: (id) => ipcRenderer.invoke('collections:getEntryState', id),
    setFavorite: (id, included) =>
      ipcRenderer.invoke('collections:setFavorite', id, included),
    recordView: (id) => ipcRenderer.invoke('collections:recordView', id),
  },
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
  },
  entries: {
    listChildren: (folder) =>
      ipcRenderer.invoke('entries:listChildren', folder),
    moveFolders: (paths, destination) =>
      ipcRenderer.invoke('entries:moveFolders', paths, destination),
  },
  moveHistory: {
    list: () => ipcRenderer.invoke('moveHistory:list'),
  },
  libraries: {
    list: () => ipcRenderer.invoke('libraries:list'),
    add: () => ipcRenderer.invoke('libraries:add'),
  },
}

contextBridge.exposeInMainWorld('filejam', filejam)

const scanner: ScannerApi & { onUpdated(listener: () => void): () => void } = {
  onUpdated: (listener) => {
    const handler = () => listener()

    ipcRenderer.on('scanner:updated', handler)

    return () => {
      ipcRenderer.removeListener('scanner:updated', handler)
    }
  },
  start: (root) => ipcRenderer.invoke('scanner:start', root),
  status: () => ipcRenderer.invoke('scanner:status'),
  results: (root) => ipcRenderer.invoke('scanner:results', root),
  cancel: () => ipcRenderer.invoke('scanner:cancel'),
}

contextBridge.exposeInMainWorld('scanner', scanner)

declare global {
  interface Window {
    filejam: FilejamApi
    scanner: ScannerApi & { onUpdated(listener: () => void): () => void }
  }
}
