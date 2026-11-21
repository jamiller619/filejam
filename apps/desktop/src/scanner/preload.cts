import type { ServerApi } from '@filejam/server'
import type { CustomIcon } from '@filejam/server/icons'
import type { ScannerApi } from '@filejam/server/scanner'
import type {
  PresentedFolderListing,
  PresentedLibrary,
} from '../entries/types.js'
import type { SettingsApi } from '../settings/index.js'

// Sandboxed preloads need CommonJS and can only require Electron's allowed modules.
import electron = require('electron')

const { contextBridge, ipcRenderer } = electron

type FilejamApi = {
  operations: import('../operations/types.js').OperationsApi
  filesystem: {
    list(
      input: import('../browser/filesystem.js').FilesystemRequest,
    ): Promise<PresentedFolderListing>
    open(path: string): Promise<void>
    chooseFolder(): Promise<string | null>
  }
  getDroppedFilePath: (file: File) => string
  addFavoriteFolders: (paths: string[]) => Promise<string[]>
  openImage: (libraryId: number, path: string) => Promise<void>
  canInspect: () => Promise<boolean>
  inspectElement: (x: number, y: number) => Promise<void>
  setControlsColor: (color: string) => Promise<void>
  appearance: Pick<ServerApi['appearance'], 'list' | 'set'> & {
    import: () => Promise<CustomIcon | null>
  }
  collections: ServerApi['collections']
  settings: SettingsApi
  libraries: {
    list: () => Promise<PresentedLibrary[]>
    add: () => Promise<
      Awaited<ReturnType<ServerApi['libraries']['list']>>[number] | null
    >
  }
  entries: {
    listChildren: (
      folder: Parameters<ServerApi['entries']['listChildren']>[0],
    ) => Promise<PresentedFolderListing>
    activate: (id: number) => Promise<void>
  }
}

const filejam: FilejamApi = {
  canInspect: () => ipcRenderer.invoke('window:canInspect'),
  inspectElement: (x, y) => ipcRenderer.invoke('window:inspectElement', x, y),
  operations: {
    rename: (paths, name) =>
      ipcRenderer.invoke('operations:rename', { paths, name }),
    start: (request) => ipcRenderer.invoke('operations:start', request),
    trash: (paths) => ipcRenderer.invoke('operations:trash', paths),
    list: () => ipcRenderer.invoke('operations:list'),
    cancel: (id) => ipcRenderer.invoke('operations:cancel', id),
    undo: (id) => ipcRenderer.invoke('operations:undo', id),
    redo: () => ipcRenderer.invoke('operations:redo'),
    recover: (id) => ipcRenderer.invoke('operations:recover', id),
    retry: (id) => ipcRenderer.invoke('operations:retry', id),
    items: (id, offset) =>
      ipcRenderer.invoke('operations:items', { id, offset }),
  },
  filesystem: {
    list: (input) => ipcRenderer.invoke('filesystem:list', input),
    open: (path) => ipcRenderer.invoke('filesystem:open', path),
    chooseFolder: () => ipcRenderer.invoke('browser:choose-folder'),
  },
  getDroppedFilePath: (file) => electron.webUtils.getPathForFile(file),
  addFavoriteFolders: (paths) =>
    ipcRenderer.invoke('favorites:addFolders', paths),
  openImage: (libraryId, path) =>
    ipcRenderer.invoke('window:openImage', libraryId, path),
  setControlsColor: (color) =>
    ipcRenderer.invoke('window:setControlsColor', color),
  appearance: {
    list: () => ipcRenderer.invoke('appearance:list'),
    set: (target, icon) => ipcRenderer.invoke('appearance:set', target, icon),
    import: () => ipcRenderer.invoke('appearance:import'),
  },
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
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  entries: {
    listChildren: (folder) =>
      ipcRenderer.invoke('entries:listChildren', folder),
    activate: (id) => ipcRenderer.invoke('entries:activate', id),
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

contextBridge.exposeInMainWorld('locations', {
  get: () => ipcRenderer.invoke('browser:locations'),
})
