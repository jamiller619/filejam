import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  opendir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { OperationJournal } from './journal.js'
import { NativeMoves } from './native.js'
import type {
  FileOperation,
  NativeTrashOutcome,
  OperationItem,
  OperationRequest,
  TrashResult,
} from './types.js'

function hasUndoableItems(operation: FileOperation) {
  return (
    ['completed', 'partial'].includes(operation.status) &&
    operation.items.some((item) => item.status === 'completed')
  )
}

function contains(root: string, path: string) {
  const child = relative(root, path)

  return (
    child === '' ||
    (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
  )
}

async function exists(path: string) {
  try {
    await lstat(path)

    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function identity(path: string) {
  const info = await lstat(path, { bigint: true })

  return `${info.dev}:${info.ino}`
}

function nextName(name: string, directory: boolean) {
  const parts = parse(name)
  const extension = directory ? '' : parts.ext
  let base = directory ? parts.base : parts.name
  const numbered = /^(.*) \((\d+)\)$/.exec(base)
  let suffix = 2

  if (
    numbered &&
    Number.isSafeInteger(Number(numbered[2])) &&
    Number(numbered[2]) < Number.MAX_SAFE_INTEGER
  ) {
    base = numbered[1] ?? base
    suffix = Math.max(2, Number(numbered[2]) + 1)
  }

  return `${base} (${suffix})${extension}`
}

async function availableTarget(target: string, directory: boolean) {
  let candidate = target

  do {
    candidate = join(dirname(target), nextName(basename(candidate), directory))
  } while (await exists(candidate))

  return candidate
}

function renameValue(
  source: string,
  name: string,
  index: number,
  literal: boolean,
) {
  if (literal) {
    return name
  }

  const original = parse(source)

  return name
    .replaceAll('{name}', () => original.name)
    .replaceAll('{ext}', () => original.ext)
    .replaceAll('{n}', String(index + 1))
}

async function renameCollision(
  items: OperationItem[],
  pattern?: string,
  literal = false,
) {
  for (const item of items) {
    const target =
      pattern === undefined
        ? item.target
        : join(
            dirname(item.source),
            renameValue(item.source, pattern, item.sequence ?? 0, literal),
          )
    const caseOnly =
      process.platform === 'win32' &&
      item.source.toLowerCase() === target.toLowerCase() &&
      item.source !== target

    if (!caseOnly && (await exists(target))) {
      return target
    }
  }

  return null
}

/** Includes descendant identities so undo cannot silently remove edited copies. */
async function fingerprint(path: string, check?: () => void): Promise<string> {
  let sum = 0n
  const visit = async (current: string): Promise<void> => {
    check?.()
    const info = await lstat(current, { bigint: true })

    const hash = createHash('sha256')
      .update(
        `${relative(path, current)}:${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}:${info.mode}`,
      )
      .digest('hex')
    sum ^= BigInt(`0x${hash}`)

    if (info.isDirectory() && !info.isSymbolicLink()) {
      for await (const entry of await opendir(current)) {
        await visit(join(current, entry.name))
      }
    }
  }

  await visit(path)

  return sum.toString(16)
}

function outputFingerprint(
  operation: FileOperation,
  path: string,
  check?: () => void,
) {
  // Moving a folder preserves descendant edits. Only copy undo needs a tree check.
  return operation.kind === 'copy' ? fingerprint(path, check) : identity(path)
}

/** One serialized writer; browsing uses separate filesystem service processes. */
export class OperationService {
  history: FileOperation[] = []
  pending = Promise.resolve()
  cancelled = new Set<string>()
  ready: Promise<void>
  aborts = new Map<string, AbortController>()
  moves = new NativeMoves()
  closing = false
  journal: OperationJournal | undefined

  constructor(
    readonly root: string,
    readonly updatePaths: (
      mappings: { source: string; target: string }[],
    ) => Promise<void> = async () => {},
  ) {
    this.ready = this.load()
    // IPC callers receive initialization failures; avoid an early unhandled rejection.
    void this.ready.catch(() => {})
  }

  async load() {
    await mkdir(this.root, { recursive: true })
    this.journal = new OperationJournal(join(this.root, 'history.sqlite'))
    this.history = this.journal.load()

    for (const operation of this.history) {
      if (operation.status === 'running' || operation.status === 'queued') {
        operation.status = 'interrupted'
        operation.error =
          'Interrupted operation. Inspect source and destination before retrying; recovery files have been retained.'
        await this.save(operation)
      }

      await this.updateMetadata(operation)
    }

    this.history.sort((a, b) => a.createdAt - b.createdAt)
  }

  async save(operation: FileOperation, item?: OperationItem) {
    if (!this.journal) {
      throw new Error('Operation journal is unavailable.')
    }

    this.journal.save(operation, item)
  }

  async updateMetadata(operation: FileOperation) {
    const items = operation.items.filter((item) => item.metadataPending)

    if (!items.length) {
      return
    }

    const mappings = items.map((item) =>
      item.status === 'undone'
        ? { source: item.target, target: item.source }
        : { source: item.source, target: item.target },
    )

    try {
      await this.updatePaths(mappings)

      for (const item of items) {
        delete item.metadataPending
      }

      delete operation.metadataWarning
    } catch (error) {
      operation.metadataWarning =
        'Files changed successfully, but saved paths need repair: ' +
        String(error)
    }

    await this.save(operation)
  }

  async close() {
    this.closing = true
    await this.ready

    for (const operation of this.history) {
      if (['running', 'queued'].includes(operation.status)) {
        await this.cancel(operation.id)
      }
    }

    await this.pending
    this.moves.close()
    this.journal?.close()
    this.journal = undefined
  }

  async list(summary = false) {
    await this.ready

    const history = this.history.slice().reverse()

    if (summary) {
      const undoCandidate = history.find(hasUndoableItems)
      const undoAvailable =
        !!undoCandidate && !undoCandidate.undoUnavailableReason
      const redoAvailable = this.history.some(
        (operation) => operation.status === 'undone' && operation.redoable,
      )

      return history.slice(0, 50).map((operation) =>
        structuredClone({
          ...operation,
          undoAvailable,
          redoAvailable,
          itemCount: operation.items.length,
          completedCount: operation.items.filter(
            (item) => item.status === 'completed',
          ).length,
          items: operation.items.slice(0, 100),
        }),
      )
    }

    return structuredClone(history)
  }

  async items(id: string, offset: number) {
    await this.ready

    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('Invalid history page.')
    }

    return structuredClone(
      this.history
        .find((operation) => operation.id === id)
        ?.items.slice(offset, offset + 100) ?? [],
    )
  }

  async cancel(id: string) {
    if (
      !this.history.some(
        (operation) =>
          operation.id === id &&
          ['queued', 'running'].includes(operation.status),
      )
    ) {
      return
    }

    this.cancelled.add(id)
    this.aborts.get(id)?.abort()
  }

  checkCancelled(id: string) {
    if (this.cancelled.has(id)) {
      throw new Error('Cancelled. Completed items remain available for undo.')
    }
  }

  enqueue(work: () => Promise<void>) {
    const result = this.pending.then(work)

    this.pending = result.catch(() => {})

    return result
  }

  async rename(
    paths: string[],
    name: string,
  ): ReturnType<import('./types.js').OperationsApi['rename']> {
    const literal = paths.length === 1
    const operation = await this.plan({
      kind: 'rename',
      paths,
      name,
      literalName: literal,
    })
    let collision = await renameCollision(operation.items)

    if (!collision) {
      const { done } = await this.submit(operation)
      await done

      if (operation.status === 'completed') {
        return { status: 'completed' }
      }

      const failed = operation.items.find((item) => item.errorCode === 'EEXIST')

      if (
        !failed ||
        operation.items.some((item) => item.status === 'completed')
      ) {
        throw new Error(operation.error ?? 'Unable to rename these items.')
      }

      collision = failed.target
    }

    let suggestion: string

    if (literal) {
      suggestion = basename(
        await availableTarget(
          collision,
          operation.items[0]?.directory ?? false,
        ),
      )
    } else {
      suggestion = name

      do {
        const extension = suggestion.endsWith('{ext}') ? '{ext}' : ''
        const stem = extension
          ? suggestion.slice(0, -extension.length)
          : suggestion
        suggestion = nextName(stem, true) + extension
      } while (await renameCollision(operation.items, suggestion))
    }

    return { status: 'conflict', name, suggestion }
  }

  async start(request: OperationRequest) {
    const operation = await this.plan(request)
    await this.submit(operation)

    return operation.id
  }

  async trash(paths: string[]): Promise<TrashResult> {
    const operation = await this.plan({ kind: 'trash', paths })
    const { done } = await this.submit(operation)

    await done

    return {
      id: operation.id,
      completedCount: operation.items.reduce(
        (count, item) => count + Number(item.status === 'completed'),
        0,
      ),
      undoAvailable:
        hasUndoableItems(operation) && !operation.undoUnavailableReason,
      ...(operation.error ? { error: operation.error } : {}),
      ...(operation.undoUnavailableReason
        ? { undoUnavailableReason: operation.undoUnavailableReason }
        : {}),
    }
  }

  async plan(request: OperationRequest) {
    await this.ready

    if (
      !request ||
      !['copy', 'move', 'rename', 'trash'].includes(request.kind) ||
      !Array.isArray(request.paths) ||
      !request.paths.length ||
      request.paths.some(
        (path) => typeof path !== 'string' || !isAbsolute(path),
      )
    ) {
      throw new Error('Select files or folders using absolute paths.')
    }

    if (
      request.kind === 'rename' &&
      (typeof request.name !== 'string' ||
        !request.name ||
        /[<>:"/\\|?*]/.test(request.name) ||
        [...request.name].some((character) => character.charCodeAt(0) < 32) ||
        /[. ]$/.test(request.name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(request.name))
    ) {
      throw new Error('Enter a valid filename or rename template.')
    }

    if (
      ['copy', 'move'].includes(request.kind) &&
      (!request.destination ||
        !isAbsolute(request.destination) ||
        !(await lstat(request.destination)).isDirectory())
    ) {
      throw new Error('Choose an existing destination folder.')
    }

    if (
      request.destination
        ?.split(/[\\/]/)
        .some((part) =>
          ['.filejam-trash', '.filejam-recovery'].includes(part.toLowerCase()),
        )
    ) {
      throw new Error('Choose a destination outside Filejam recovery storage.')
    }

    const unique = new Map(
      request.paths.map((path) => {
        const absolute = resolve(path)
        const key =
          process.platform === 'win32' ? absolute.toLowerCase() : absolute

        return [key, absolute] as const
      }),
    )
    const ordered = [...unique].sort(([left], [right]) => {
      const a = left + sep
      const b = right + sep

      return a < b ? -1 : Number(a > b)
    })
    const paths: string[] = []

    for (const [, source] of ordered) {
      const parent = paths.at(-1)

      if (!parent || !contains(parent, source)) {
        paths.push(source)
      }
    }

    const operation: FileOperation = {
      id: randomUUID(),
      kind: request.kind,
      status: 'queued',
      createdAt: Date.now(),
      items: [],
      conflict: request.conflict ?? 'error',
      ...(request.kind === 'trash' ? { trashBackend: 'native' as const } : {}),
    }

    for (const [index, source] of paths.entries()) {
      if (
        source === parse(source).root ||
        contains(this.root, source) ||
        contains(source, this.root) ||
        source
          .split(/[\\/]/)
          .some((part) =>
            ['.filejam-trash', '.filejam-recovery'].includes(
              part.toLowerCase(),
            ),
          )
      ) {
        throw new Error(
          'Filesystem roots and Filejam recovery storage cannot be changed.',
        )
      }

      let target = join(
        request.destination ?? dirname(source),
        basename(source),
      )

      if (request.kind === 'trash') {
        target = process.platform === 'win32' ? 'Recycle Bin' : 'Trash'
      } else if (request.kind === 'rename') {
        const name = renameValue(
          source,
          request.name ?? '',
          index,
          request.literalName ?? false,
        )

        if (
          !name ||
          name === '.' ||
          name === '..' ||
          /[<>:"/\\|?*]/.test(name) ||
          /[. ]$/.test(name) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
        ) {
          throw new Error(
            `The rename template produces an invalid name for ${source}`,
          )
        }

        target = join(dirname(source), name)
      }

      const info = await lstat(source, { bigint: true })
      const canonicalSource = info.isSymbolicLink()
        ? source
        : await realpath(source)
      const canonicalParent =
        request.kind === 'trash'
          ? dirname(source)
          : await realpath(dirname(target))

      if (contains(canonicalSource, canonicalParent) || source === target) {
        throw new Error('An item cannot be copied or moved into itself.')
      }

      operation.items.push({
        sequence: index,
        source,
        target,
        status: 'pending',
        sourceIdentity: `${info.dev}:${info.ino}`,
        directory: info.isDirectory(),
      })
    }

    if (request.kind === 'rename') {
      const targets = new Set<string>()
      const key = (path: string) =>
        process.platform === 'win32' ? path.toLowerCase() : path
      const sources = new Set(paths.map(key))

      for (const item of operation.items) {
        if (
          targets.has(key(item.target)) ||
          (sources.has(key(item.target)) &&
            key(item.target) !== key(item.source))
        ) {
          throw new Error(
            'The rename template creates overlapping names. Choose unique names for the selection.',
          )
        }

        targets.add(key(item.target))
      }
    }

    return operation
  }

  async submit(operation: FileOperation) {
    await this.save(operation)
    this.history.push(operation)
    const done = this.enqueue(() => this.execute(operation, false))
    void done.catch((error) => {
      operation.status = 'interrupted'
      operation.error = `Journal failure; inspect retained files before continuing: ${String(error)}`
    })

    return { done }
  }

  async copy(source: string, target: string, id: string): Promise<void> {
    this.checkCancelled(id)
    const info = await lstat(source)

    if (info.isSymbolicLink()) {
      const link = await readlink(source)
      const directoryLink =
        process.platform === 'win32' &&
        (await stat(source).then(
          (info) => info.isDirectory(),
          () => false,
        ))
      await symlink(link, target, directoryLink ? 'junction' : undefined)
    } else if (info.isDirectory()) {
      await mkdir(target, { mode: info.mode })

      for await (const entry of await opendir(source)) {
        await this.copy(join(source, entry.name), join(target, entry.name), id)
      }

      await utimes(target, info.atime, info.mtime)
    } else if (info.isFile()) {
      const controller = new AbortController()
      this.aborts.set(id, controller)
      const operation = this.history.find((operation) => operation.id === id)

      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          if (operation) {
            operation.bytesCopied = (operation.bytesCopied ?? 0) + chunk.length
          }

          callback(null, chunk)
        },
      })

      try {
        await pipeline(
          createReadStream(source),
          progress,
          createWriteStream(target, { flags: 'wx', mode: info.mode }),
          { signal: controller.signal },
        )
        const output = await open(target, 'r+')

        try {
          await output.sync()
        } finally {
          await output.close()
        }
      } finally {
        this.aborts.delete(id)
      }

      await utimes(target, info.atime, info.mtime)
    } else {
      throw new Error('Special filesystem entries cannot be copied.')
    }
  }

  async removeSource(path: string) {
    await rm(path, { recursive: true })
  }

  async transfer(operation: FileOperation, item: OperationItem, undo: boolean) {
    if (operation.kind === 'trash' && operation.trashBackend === 'native') {
      if (!undo || !item.nativeTrash) {
        throw new Error(
          operation.undoUnavailableReason ??
            'Restore this item from the OS trash; its native restore reference is unavailable.',
        )
      }

      if (await exists(item.source)) {
        throw new Error(
          'The restore destination already exists. Move or rename it before undoing trash.',
        )
      }

      if (item.sourceIdentity) {
        item.outputIdentity = item.sourceIdentity
      }

      // Restore through an owned staging path so an external destination race
      // cannot make the OS shell overwrite a newly created original path.
      const staging = join(
        dirname(item.source),
        '.filejam-recovery',
        operation.id,
        'restore',
        basename(item.source),
      )
      item.recoveryPath = staging
      await this.save(operation, item)

      if (!(await exists(staging))) {
        await mkdir(dirname(staging), { recursive: true, mode: 0o700 })
        await this.moves.restoreTrash({
          ...item.nativeTrash,
          originalParent: dirname(staging),
        })
      }

      if (
        item.sourceIdentity &&
        (await identity(staging)) !== item.sourceIdentity
      ) {
        throw new Error(
          `The restored item identity changed. Inspect ${staging} before proceeding.`,
        )
      }

      await this.moves.move(staging, item.source)
      delete item.recoveryPath

      return
    }

    const source = undo ? item.target : item.source
    const target = undo ? item.source : item.target

    if (
      !undo &&
      item.sourceFingerprint &&
      operation.kind !== 'copy' &&
      item.sourceFingerprint !==
        (await outputFingerprint(operation, source, () =>
          this.checkCancelled(operation.id),
        ))
    ) {
      throw new Error(
        'The source changed after undo. Redo stopped to preserve it.',
      )
    }

    if (
      undo &&
      item.fingerprint !==
        (await outputFingerprint(operation, source, () =>
          this.checkCancelled(operation.id),
        ))
    ) {
      throw new Error(
        'This item changed outside Filejam. Restore it manually to avoid losing changes.',
      )
    }

    if (undo && operation.kind === 'copy') {
      const recoveryPath = join(
        dirname(source),
        '.filejam-recovery',
        operation.id,
        'undo',
        basename(source),
      )

      if (await exists(recoveryPath)) {
        throw new Error(`Recovery path already exists: ${recoveryPath}`)
      }

      item.recoveryPath = recoveryPath
      item.outputIdentity = await identity(source)
      await this.save(operation, item)
      await mkdir(dirname(recoveryPath), { recursive: true, mode: 0o700 })
      await this.moves.move(source, recoveryPath)
      item.fingerprint = await fingerprint(recoveryPath)

      await this.restoreBackup(operation, item)

      return
    }

    const caseOnly =
      process.platform === 'win32' &&
      source.toLowerCase() === target.toLowerCase() &&
      source !== target

    if (!caseOnly && (await exists(target))) {
      throw new Error(
        `Destination already exists: ${target}. Rename it or choose another destination.`,
      )
    }

    if (operation.kind !== 'copy') {
      try {
        item.outputIdentity = await identity(source)
        await this.save(operation, item)
        await this.moves.move(source, target)

        if (undo) {
          await this.restoreBackup(operation, item)
        }

        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
          throw error
        }
      }
    }

    if (!undo && operation.kind === 'copy' && item.recoveryPath) {
      if (item.fingerprint !== (await fingerprint(item.recoveryPath))) {
        throw new Error(
          'The retained copy changed. Redo stopped to preserve it.',
        )
      }

      item.outputIdentity = await identity(item.recoveryPath)
      await this.save(operation, item)
      await this.moves.move(item.recoveryPath, target)
      delete item.recoveryPath

      return
    }

    const temporary = join(
      dirname(target),
      '.filejam-recovery',
      operation.id,
      randomUUID(),
      basename(target),
    )

    if (item.temporaryPath && (await exists(item.temporaryPath))) {
      item.retainedPaths ??= []
      item.retainedPaths.push(item.temporaryPath)
    }

    item.temporaryPath = temporary
    await this.save(operation, item)
    await mkdir(dirname(temporary), { recursive: true, mode: 0o700 })
    const before = await fingerprint(source, () =>
      this.checkCancelled(operation.id),
    )

    await this.copy(source, temporary, operation.id)
    this.checkCancelled(operation.id)

    if (
      before !==
      (await fingerprint(source, () => this.checkCancelled(operation.id)))
    ) {
      throw new Error(
        `Source changed while copying. Recovery copy retained at ${temporary}`,
      )
    }

    if (await exists(target)) {
      throw new Error(
        `Destination appeared while copying. Recovery copy retained at ${temporary}`,
      )
    }

    item.outputIdentity = await identity(temporary)
    await this.save(operation, item)
    await this.moves.move(temporary, target)
    delete item.temporaryPath
    item.published = true
    await this.save(operation, item)

    if (operation.kind !== 'copy') {
      // Never delete the destination if source cleanup fails partway through.
      await this.removeSource(source)
    }

    if (undo) {
      await this.restoreBackup(operation, item)
    }
  }

  async restoreBackup(operation: FileOperation, item: OperationItem) {
    if (!item.backupPath) {
      return
    }

    if (
      (await exists(item.target)) ||
      (await fingerprint(item.backupPath)) !== item.backupFingerprint
    ) {
      throw new Error(
        `Cannot restore replaced item automatically. Original retained at ${item.backupPath}`,
      )
    }

    await this.moves.move(item.backupPath, item.target)
    delete item.backupPath
    delete item.backupFingerprint
    await this.save(operation, item)
  }

  async resolveConflict(operation: FileOperation, item: OperationItem) {
    if (
      !(await exists(item.target)) ||
      (process.platform === 'win32' &&
        item.source.toLowerCase() === item.target.toLowerCase() &&
        item.source !== item.target)
    ) {
      return true
    }

    if (operation.conflict === 'skip') {
      item.status = 'skipped'

      return false
    }

    if (operation.conflict === 'keepBoth') {
      const source = await lstat(item.source)
      item.target = await availableTarget(item.target, source.isDirectory())

      return true
    }

    if (operation.conflict === 'replace') {
      const backupPath = join(
        dirname(item.target),
        '.filejam-recovery',
        operation.id,
        'replaced',
        basename(item.target),
      )

      if (await exists(backupPath)) {
        throw new Error(`Recovery path already exists: ${backupPath}`)
      }

      item.backupPath = backupPath
      await this.save(operation, item)
      await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 })
      await this.moves.move(item.target, backupPath)
      item.backupFingerprint = await fingerprint(backupPath)
      await this.save(operation, item)

      return true
    }

    throw Object.assign(
      new Error(`Destination already exists: ${item.target}`),
      { code: 'EEXIST' },
    )
  }

  async recordNativeTrash(
    operation: FileOperation,
    outcomes: NativeTrashOutcome[],
  ) {
    const itemsBySource = new Map(
      operation.items.map((item) => [item.source, item]),
    )

    for (const outcome of outcomes) {
      const item = itemsBySource.get(outcome.source)

      if (!item) {
        throw new Error('Native trash returned an unexpected item.')
      }

      if (outcome.reference) {
        item.nativeTrash = outcome.reference
      }

      item.status = outcome.error ? 'failed' : 'completed'

      if (outcome.error) {
        item.error = outcome.error
      } else {
        delete item.error
      }
    }

    const completed = operation.items.some(
      (item) => item.status === 'completed',
    )
    const failed = operation.items.find((item) => item.status === 'failed')

    if (completed && !operation.hasCommitted) {
      for (const previous of this.history.filter(
        (entry) => entry.status === 'undone' && entry.id !== operation.id,
      )) {
        previous.redoable = false
        await this.save(previous)
      }

      operation.hasCommitted = true
    }

    if (failed) {
      operation.status = completed ? 'partial' : 'failed'
    } else {
      operation.status = 'completed'
    }

    if (failed?.error) {
      operation.error = failed.error
    } else {
      delete operation.error
    }

    await this.save(operation)
  }

  async executeNativeTrash(operation: FileOperation) {
    operation.status = 'running'
    operation.direction = 'forward'
    operation.trashBackend = 'native'
    delete operation.error

    if (process.platform === 'darwin') {
      operation.undoUnavailableReason =
        'Restore this item using Finder’s Put Back command. Native trash undo is not available in Filejam on macOS.'
    }

    const items = operation.items.filter((item) =>
      ['pending', 'undone'].includes(item.status),
    )
    await this.save(operation)

    try {
      this.checkCancelled(operation.id)

      for (const item of items) {
        if (item.sourceIdentity !== (await identity(item.source))) {
          throw new Error('A selected item was replaced before trash started.')
        }
      }

      const sources = items.map((item) => item.source)
      operation.trashBaseline = await this.moves.trashSnapshot(sources)
      this.checkCancelled(operation.id)

      for (const item of items) {
        item.status = 'running'
        item.target = process.platform === 'win32' ? 'Recycle Bin' : 'Trash'
        delete item.nativeTrash
      }

      await this.save(operation)
      const outcomes = await this.moves.trash(sources, operation.trashBaseline)
      await this.recordNativeTrash(operation, outcomes)
    } catch (error) {
      operation.status = items.some(
        (item) =>
          item.status === 'running' ||
          item.status === 'completed' ||
          item.nativeTrash,
      )
        ? 'interrupted'
        : 'failed'
      operation.error = String(error)
      await this.save(operation)
    } finally {
      this.cancelled.delete(operation.id)
    }
  }

  async recoverNativeTrash(operation: FileOperation) {
    if (!['interrupted', 'failed', 'partial'].includes(operation.status)) {
      return
    }

    if (operation.direction === 'undo') {
      for (const item of operation.items) {
        if (
          !(await exists(item.source)) &&
          item.recoveryPath &&
          (await exists(item.recoveryPath)) &&
          (await identity(item.recoveryPath)) === item.sourceIdentity
        ) {
          await this.moves.move(item.recoveryPath, item.source)
          delete item.recoveryPath
        }

        if (
          (await exists(item.source)) &&
          (await identity(item.source)) === item.sourceIdentity
        ) {
          item.status = 'undone'
          delete item.error
        } else if (item.status === 'running') {
          item.status = 'completed'
          item.error =
            'Restore was interrupted. Retry undo or inspect the OS trash.'
        }
      }

      operation.status = operation.items.every((item) =>
        ['undone', 'skipped'].includes(item.status),
      )
        ? 'undone'
        : 'partial'
      operation.redoable = operation.status === 'undone'

      if (operation.status === 'undone') {
        delete operation.error
      }
      await this.save(operation)

      return
    }

    const items = operation.items.filter(
      (item) =>
        ['running', 'failed'].includes(item.status) ||
        (operation.status === 'interrupted' && item.status === 'completed'),
    )

    if (!items.length) {
      return
    }

    const outcomes = await this.moves.findTrash(
      items.map((item) => item.source),
      operation.trashBaseline ?? [],
    )
    await this.recordNativeTrash(operation, outcomes)
  }

  async execute(operation: FileOperation, undo: boolean) {
    if (operation.kind === 'trash' && !undo) {
      await this.executeNativeTrash(operation)

      return
    }

    operation.status = 'running'
    operation.direction = undo ? 'undo' : 'forward'
    delete operation.error
    await this.save(operation)

    for (const item of undo
      ? [...operation.items].reverse()
      : operation.items) {
      if (
        undo
          ? item.status !== 'completed'
          : !['pending', 'undone'].includes(item.status)
      ) {
        continue
      }

      try {
        this.checkCancelled(operation.id)

        if (
          !undo &&
          !item.recoveryPath &&
          item.sourceIdentity &&
          item.sourceIdentity !== (await identity(item.source))
        ) {
          throw new Error(
            'The selected source was replaced before this operation started.',
          )
        }

        if (!undo && !(await this.resolveConflict(operation, item))) {
          await this.save(operation, item)

          continue
        }

        item.status = 'running'
        item.published = false
        delete item.error
        delete item.errorCode
        await this.save(operation, item)
        await this.transfer(operation, item, undo)

        if (!undo) {
          item.fingerprint = await outputFingerprint(
            operation,
            item.target,
            () => this.checkCancelled(operation.id),
          )
        } else if (operation.kind !== 'copy') {
          item.sourceFingerprint = await outputFingerprint(
            operation,
            item.source,
          )
          item.sourceIdentity = await identity(item.source)
        }

        item.status = undo ? 'undone' : 'completed'

        if (!undo && !operation.hasCommitted) {
          for (const previous of this.history.filter(
            (entry) => entry.status === 'undone' && entry.id !== operation.id,
          )) {
            previous.redoable = false
            await this.save(previous)
          }

          operation.hasCommitted = true
        }

        if (operation.kind === 'move' || operation.kind === 'rename') {
          item.metadataPending = true
        }
      } catch (error) {
        item.status = undo ? 'completed' : 'failed'
        item.error = error instanceof Error ? error.message : String(error)
        if (
          error instanceof Error &&
          'code' in error &&
          typeof error.code === 'string'
        ) {
          item.errorCode = error.code
        }
        operation.error = item.error

        if (
          !undo &&
          item.backupPath &&
          !item.published &&
          !(await exists(item.target))
        ) {
          try {
            await this.restoreBackup(operation, item)
          } catch (recoveryError) {
            item.error += ` Recovery: ${String(recoveryError)}`
            operation.error = item.error
          }
        }
      }

      await this.save(operation, item)

      if (operation.error) {
        break
      }
    }

    if (!undo && !operation.error) {
      const failed = operation.items.find((item) => item.status === 'failed')

      if (failed?.error) {
        operation.error = failed.error
      }
    }

    operation.redoable = undo && !operation.error
    if (operation.error) {
      operation.status = operation.items.some(
        (item) => item.status === 'completed',
      )
        ? 'partial'
        : 'failed'
    } else {
      operation.status = undo ? 'undone' : 'completed'
    }
    this.cancelled.delete(operation.id)
    await this.save(operation)
    await this.updateMetadata(operation)
  }

  async recover(id: string) {
    await this.ready

    return this.enqueue(async () => {
      const operation = this.history.find((operation) => operation.id === id)

      if (operation?.kind === 'trash' && operation.trashBackend === 'native') {
        await this.recoverNativeTrash(operation)

        return
      }

      if (operation?.metadataWarning) {
        await this.updateMetadata(operation)
      }

      if (
        !operation ||
        !['interrupted', 'failed', 'partial'].includes(operation.status)
      ) {
        return
      }

      for (const item of operation.items) {
        if (!['running', 'failed'].includes(item.status)) {
          continue
        }

        const undo = operation.direction === 'undo'
        const output = undo ? item.source : item.target
        const input = undo ? item.target : item.source
        const targetMatches =
          item.outputIdentity &&
          (await exists(output)) &&
          (await identity(output)) === item.outputIdentity
        const sourceMissing = !(await exists(input))

        if (
          undo &&
          operation.kind === 'copy' &&
          item.recoveryPath &&
          (await exists(item.recoveryPath)) &&
          (await identity(item.recoveryPath)) === item.outputIdentity
        ) {
          if (item.backupPath) {
            await this.restoreBackup(operation, item)
          }

          item.fingerprint = await fingerprint(item.recoveryPath)
          item.status = 'undone'
          delete item.error

          continue
        }

        if (targetMatches && (operation.kind === 'copy' || sourceMissing)) {
          if (undo && item.backupPath) {
            await this.restoreBackup(operation, item)
          }

          item.status = undo ? 'undone' : 'completed'

          if (undo) {
            item.sourceFingerprint = await outputFingerprint(operation, output)
            item.sourceIdentity = await identity(output)
          } else {
            item.fingerprint = await outputFingerprint(operation, output)
          }

          delete item.error

          if (operation.kind === 'move' || operation.kind === 'rename') {
            item.metadataPending = true
          }
        } else if (item.backupPath && !(await exists(item.target))) {
          await this.restoreBackup(operation, item)
        }
      }

      const uncertain = operation.items.some((item) =>
        ['running', 'failed'].includes(item.status),
      )
      operation.status = uncertain ? 'interrupted' : 'partial'

      if (
        !uncertain &&
        operation.items.every((item) =>
          ['undone', 'skipped'].includes(item.status),
        )
      ) {
        operation.status = 'undone'
        operation.redoable = true
      }

      if (uncertain) {
        operation.error =
          'Recovery could not prove completion. Files were retained; inspect the paths below before changing them.'
      } else {
        delete operation.error
      }

      await this.save(operation)
      await this.updateMetadata(operation)
    })
  }

  async retry(id: string) {
    await this.ready

    return this.enqueue(async () => {
      const operation = this.history.find((operation) => operation.id === id)

      if (
        !operation ||
        !['failed', 'partial'].includes(operation.status) ||
        operation.direction === 'undo'
      ) {
        throw new Error(
          'This operation cannot be retried. Check recovery first.',
        )
      }

      const items = operation.items.filter((item) =>
        ['pending', 'failed'].includes(item.status),
      )

      if (operation.kind === 'trash' && operation.trashBackend === 'native') {
        for (const item of items) {
          if (
            item.nativeTrash ||
            item.sourceIdentity !== (await identity(item.source))
          ) {
            throw new Error(
              'Check the original paths and OS trash before retrying these items.',
            )
          }
        }

        for (const item of items) {
          item.status = 'pending'
        }

        operation.hasCommitted = false
        await this.executeNativeTrash(operation)

        return
      }

      for (const item of items) {
        if (item.published || item.backupPath || (await exists(item.target))) {
          throw new Error(
            `Inspect the existing destination and recovery files before retrying: ${item.target}`,
          )
        }

        if (item.sourceIdentity !== (await identity(item.source))) {
          throw new Error(
            `Source changed since the operation was submitted: ${item.source}`,
          )
        }
      }

      for (const item of items) {
        item.status = 'pending'
      }

      // Retrying adds new mutations to the action and must invalidate later redo.
      operation.hasCommitted = false
      await this.execute(operation, false)
    })
  }

  async undo(id?: string) {
    await this.ready

    return this.enqueue(async () => {
      const operation = [...this.history]
        .reverse()
        .find(
          (operation) =>
            (id === undefined || operation.id === id) &&
            hasUndoableItems(operation),
        )

      if (!operation) {
        if (id !== undefined) {
          throw new Error('This operation is no longer available to undo.')
        }

        return
      }

      if (operation.undoUnavailableReason) {
        throw new Error(operation.undoUnavailableReason)
      }

      await this.execute(operation, true)

      if (id !== undefined && operation.error) {
        throw new Error(operation.error)
      }
    })
  }

  async redo() {
    await this.ready

    return this.enqueue(async () => {
      const operation = this.history.find(
        (item) => item.status === 'undone' && item.redoable,
      )

      if (operation) {
        await this.execute(operation, false)
      }
    })
  }
}
