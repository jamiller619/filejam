import type { ServerApi } from '@files/server'
import type { ScannerApi } from '@files/server/scanner'

// Sandboxed preloads need CommonJS and can only require Electron's allowed modules.
import electron = require('electron')

const { contextBridge, ipcRenderer } = electron

type FilesApi = {
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

const files: FilesApi = {
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

contextBridge.exposeInMainWorld('files', files)

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
    files: FilesApi
    scanner: ScannerApi & { onUpdated(listener: () => void): () => void }
  }
}
