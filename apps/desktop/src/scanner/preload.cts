import type { ScannerApi } from '@files/server/scanner'

// Sandboxed preloads need CommonJS and can only require Electron's allowed modules.
import electron = require('electron')
const { contextBridge, ipcRenderer } = electron

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
    scanner: ScannerApi
  }
}

exposeScannerApi()
