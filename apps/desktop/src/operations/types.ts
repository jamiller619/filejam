export type NativeTrashReference = {
  id: string
  name: string
  originalParent: string
  timeDeleted: number
}

export type NativeTrashOutcome = {
  source: string
  reference: NativeTrashReference | null
  error: string | null
}

export type OperationRequest = {
  kind: 'copy' | 'move' | 'rename' | 'trash'
  paths: string[]
  destination?: string
  name?: string
  literalName?: boolean
  conflict?: 'error' | 'skip' | 'keepBoth' | 'replace'
}

export type OperationItem = {
  source: string
  target: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'undone' | 'skipped'
  fingerprint?: string
  error?: string
  errorCode?: string
  recoveryPath?: string
  backupPath?: string
  backupFingerprint?: string
  temporaryPath?: string
  sourceFingerprint?: string
  published?: boolean
  sourceIdentity?: string
  outputIdentity?: string
  retainedPaths?: string[]
  sequence?: number
  metadataPending?: boolean
  directory?: boolean
  nativeTrash?: NativeTrashReference
}

export type FileOperation = {
  id: string
  kind: OperationRequest['kind']
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'partial'
    | 'failed'
    | 'interrupted'
    | 'undone'
  createdAt: number
  items: OperationItem[]
  error?: string
  redoable?: boolean
  conflict?: OperationRequest['conflict']
  direction?: 'forward' | 'undo'
  bytesCopied?: number
  metadataWarning?: string
  hasCommitted?: boolean
  itemCount?: number
  completedCount?: number
  undoAvailable?: boolean
  redoAvailable?: boolean
  trashBackend?: 'native'
  trashBaseline?: string[]
  undoUnavailableReason?: string
}

export type TrashResult = Pick<
  FileOperation,
  'id' | 'error' | 'undoUnavailableReason'
> & { completedCount: number; undoAvailable: boolean }

export type OperationsApi = {
  rename(
    paths: string[],
    name: string,
  ): Promise<
    | { status: 'completed' }
    | { status: 'conflict'; name: string; suggestion: string }
  >
  start(request: OperationRequest): Promise<string>
  trash(paths: string[]): Promise<TrashResult>
  list(): Promise<FileOperation[]>
  cancel(id: string): Promise<void>
  undo(id?: string): Promise<void>
  redo(): Promise<void>
  recover(id: string): Promise<void>
  retry(id: string): Promise<void>
  items(id: string, offset: number): Promise<OperationItem[]>
}
