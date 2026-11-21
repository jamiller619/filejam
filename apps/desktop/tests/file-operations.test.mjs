import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, toNamespacedPath } from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { OperationService } from '../dist/operations/service.js'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'filejam-operations-'))
  const source = join(root, 'source')
  const destination = join(root, 'destination')
  const journal = join(root, 'journal')

  await mkdir(source)
  await mkdir(destination)

  const services = []
  const createService = (updatePaths) => {
    const service = new OperationService(journal, updatePaths)
    services.push(service)
    return service
  }
  const service = createService()
  await service.ready

  try {
    await run({
      root,
      source,
      destination,
      journal,
      service,
      createService,
    })
  } finally {
    await Promise.all(services.map((service) => service.close()))
    await rm(root, { recursive: true, force: true })
  }
}

async function execute(service, request) {
  const id = await service.start(request)
  await service.pending

  return (await service.list()).find((operation) => operation.id === id)
}

test('inline rename suggests available numbered filenames without modifying either entry', async () => {
  await fixture(async ({ source, service }) => {
    const file = join(source, 'original.txt')
    await writeFile(file, 'original')
    await writeFile(join(source, 'report.txt'), 'existing')
    await writeFile(join(source, 'report (2).txt'), 'second')
    const conflict = await service.rename([file], 'report.txt')
    assert.deepEqual(conflict, {
      status: 'conflict',
      name: 'report.txt',
      suggestion: 'report (3).txt',
    })
    assert.equal((await service.list()).length, 0)
    assert.equal(await readFile(file, 'utf8'), 'original')
    assert.equal(await readFile(join(source, 'report.txt'), 'utf8'), 'existing')
    assert.equal(
      (await service.rename([file], conflict.suggestion)).status,
      'completed',
    )
    assert.equal(
      await readFile(join(source, 'report (3).txt'), 'utf8'),
      'original',
    )
    await service.undo()
    assert.equal(await readFile(file, 'utf8'), 'original')
  })
})

test('inline folder rename keeps dotted names intact and single names are literal', async () => {
  await fixture(async ({ source, service }) => {
    const folder = join(source, 'folder')
    await mkdir(folder)
    await mkdir(join(source, 'project.v2'))
    assert.deepEqual(await service.rename([folder], 'project.v2'), {
      status: 'conflict',
      name: 'project.v2',
      suggestion: 'project.v2 (2)',
    })
    assert.equal(
      (await service.rename([folder], 'literal-{n}')).status,
      'completed',
    )
    assert.equal((await stat(join(source, 'literal-{n}'))).isDirectory(), true)
  })
})

test('inline bulk rename checks all proposed names before mutating a selection', async () => {
  await fixture(async ({ source, service }) => {
    const files = [join(source, 'a.txt'), join(source, 'b.txt')]
    await writeFile(files[0], 'a')
    await writeFile(files[1], 'b')
    await writeFile(join(source, 'item-1.txt'), 'existing')
    await writeFile(join(source, 'item-2 (2).txt'), 'second conflict')
    const conflict = await service.rename(files, 'item-{n}{ext}')
    assert.deepEqual(conflict, {
      status: 'conflict',
      name: 'item-{n}{ext}',
      suggestion: 'item-{n} (3){ext}',
    })
    assert.equal((await service.list()).length, 0)
    assert.equal(await readFile(files[0], 'utf8'), 'a')
    assert.equal(await readFile(files[1], 'utf8'), 'b')
    assert.equal(
      (await service.rename(files, conflict.suggestion)).status,
      'completed',
    )
    assert.equal(await readFile(join(source, 'item-1 (3).txt'), 'utf8'), 'a')
    assert.equal(await readFile(join(source, 'item-2 (3).txt'), 'utf8'), 'b')
    await service.undo()
    assert.equal(await readFile(files[0], 'utf8'), 'a')
    assert.equal(await readFile(files[1], 'utf8'), 'b')
  })
})

test('inline rename reports a conflict if a destination appears after preflight', async () => {
  await fixture(async ({ source, service }) => {
    const file = join(source, 'original.txt')
    const target = join(source, 'target.txt')
    await writeFile(file, 'original')
    const move = service.moves.move.bind(service.moves)
    let raced = false
    service.moves.move = async (input, output) => {
      if (!raced && input === file && output === target) {
        raced = true
        await writeFile(target, 'appeared during rename')
      }

      return move(input, output)
    }

    const result = await service.rename([file], 'target.txt')
    assert.deepEqual(result, {
      status: 'conflict',
      name: 'target.txt',
      suggestion: 'target (2).txt',
    })
    assert.equal(await readFile(file, 'utf8'), 'original')
    assert.equal(await readFile(target, 'utf8'), 'appeared during rename')
  })
})

test('saved-path failures remain separate from filesystem success and can be repaired', async () => {
  await fixture(async ({ source, destination, createService }) => {
    const file = join(source, 'note.txt')
    await writeFile(file, 'note')
    let fail = true
    const changes = []
    const service = createService(async (mappings) => {
      if (fail) {
        throw new Error('settings unavailable')
      }

      changes.push(mappings)
    })
    const operation = await execute(service, {
      kind: 'move',
      paths: [file],
      destination,
    })
    assert.equal(operation.status, 'completed')
    assert.match(operation.metadataWarning, /settings unavailable/)
    assert.equal(await readFile(join(destination, 'note.txt'), 'utf8'), 'note')
    fail = false
    await service.recover(operation.id)
    assert.equal((await service.list())[0].metadataWarning, undefined)
    assert.deepEqual(changes[0], [
      { source: file, target: join(destination, 'note.txt') },
    ])
    await service.undo()
    assert.equal(await readFile(file, 'utf8'), 'note')
    assert.deepEqual(changes[1], [
      { source: join(destination, 'note.txt'), target: file },
    ])
  })
})

test('bulk rename handles mixed selections and reverses the entire action', async () => {
  await fixture(async ({ source, service }) => {
    const file = join(source, 'note.txt')
    const folder = join(source, 'folder')
    await writeFile(file, 'note')
    await mkdir(folder)
    const operation = await execute(service, {
      kind: 'rename',
      paths: [file, folder],
      name: '{name}-{n}{ext}',
    })
    assert.equal(operation.status, 'completed')
    assert.equal(await readFile(join(source, 'note-2.txt'), 'utf8'), 'note')
    assert.equal((await stat(join(source, 'folder-1'))).isDirectory(), true)
    await service.undo()
    assert.equal(await readFile(file, 'utf8'), 'note')
    assert.equal((await stat(folder)).isDirectory(), true)
    await service.redo()
    assert.equal((await service.list())[0].status, 'completed')
  })
})

test('cancellation interrupts a large file and preserves the original', async () => {
  await fixture(async ({ source, destination, service }) => {
    const file = join(source, 'large.bin')
    const handle = await open(file, 'w')
    await handle.truncate(128 * 1024 * 1024)
    await handle.close()
    const id = await service.start({ kind: 'copy', paths: [file], destination })

    for (
      let attempt = 0;
      attempt < 1000 && !service.aborts.has(id);
      attempt++
    ) {
      await delay(1)
    }

    assert.equal(service.aborts.has(id), true)
    const started = performance.now()
    await service.cancel(id)
    await service.pending
    assert.ok(performance.now() - started < 2000)
    assert.equal((await stat(file)).size, 128 * 1024 * 1024)
    await assert.rejects(access(join(destination, 'large.bin')))
    assert.equal((await service.list())[0].status, 'failed')
  })
})

test('directory links are copied as links without traversing their targets', async () => {
  await fixture(async ({ root, source, destination, service }) => {
    const outside = join(root, 'outside')
    const link = join(source, 'link')
    await mkdir(outside)
    await writeFile(join(outside, 'keep.txt'), 'keep')
    await symlink(
      outside,
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const operation = await execute(service, {
      kind: 'copy',
      paths: [link],
      destination,
    })
    assert.equal(operation.status, 'completed')
    assert.ok(await readlink(join(destination, 'link')))
    await service.undo()
    assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep')
  })
})

test('mixed copy collapses nested selections; undo and redo retain the actual bytes', async () => {
  await fixture(async ({ source, destination, service }) => {
    const folder = join(source, 'folder')
    const file = join(source, 'file.txt')
    await mkdir(folder)
    await writeFile(join(folder, 'nested.txt'), 'nested')
    await writeFile(file, 'file')

    const operation = await execute(service, {
      kind: 'copy',
      paths: [folder, join(folder, 'nested.txt'), file],
      destination,
    })
    assert.equal(operation.status, 'completed')
    assert.equal(operation.items.length, 2)
    await service.undo()
    await assert.rejects(access(join(destination, 'folder')))
    await rm(source, { recursive: true })
    await service.redo()
    assert.equal(
      await readFile(join(destination, 'folder', 'nested.txt'), 'utf8'),
      'nested',
    )
    assert.equal(await readFile(join(destination, 'file.txt'), 'utf8'), 'file')
  })
})

test('move and rename support restart, undo and redo', async () => {
  await fixture(async ({ source, destination, service, createService }) => {
    const file = join(source, 'file.txt')
    await writeFile(file, 'content')
    assert.equal(
      (await execute(service, { kind: 'move', paths: [file], destination }))
        .status,
      'completed',
    )
    const restarted = createService()
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'content')
    await restarted.redo()
    const moved = join(destination, 'file.txt')
    assert.equal(
      (
        await execute(restarted, {
          kind: 'rename',
          paths: [moved],
          name: 'renamed.txt',
        })
      ).status,
      'completed',
    )
    await restarted.undo()
    assert.equal(await readFile(moved, 'utf8'), 'content')
  })
})

test('native trash uses OS references and survives restart, undo and redo', {
  skip: process.platform === 'darwin',
}, async () => {
  await fixture(async ({ source, service, createService }) => {
    const file = join(source, 'file.txt')
    const folder = join(source, 'folder')
    await writeFile(file, 'content')
    await mkdir(folder)
    await writeFile(join(folder, 'nested.txt'), 'nested')
    const operation = await execute(service, {
      kind: 'trash',
      paths: [file, folder].map(toNamespacedPath),
    })
    assert.equal(operation.status, 'completed')
    assert.equal(operation.trashBackend, 'native')
    assert.ok(operation.items.every((item) => item.nativeTrash?.id))
    await assert.rejects(access(join(source, '.filejam-trash')))
    await assert.rejects(access(file))
    await assert.rejects(access(folder))
    await service.close()
    const restarted = createService()
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'content')
    assert.equal(await readFile(join(folder, 'nested.txt'), 'utf8'), 'nested')
    await restarted.redo()
    assert.equal((await restarted.list())[0].status, 'completed')
    await assert.rejects(access(file))
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'content')
    assert.equal(await readFile(join(folder, 'nested.txt'), 'utf8'), 'nested')
  })
})

test('native trash restore never replaces a new original-path entry', {
  skip: process.platform === 'darwin',
}, async () => {
  await fixture(async ({ source, service }) => {
    const file = join(source, 'file.txt')
    await writeFile(file, 'original')
    await execute(service, { kind: 'trash', paths: [file] })
    await writeFile(file, 'replacement')
    await service.undo()
    assert.match((await service.list())[0].error, /already exists/)
    assert.equal(await readFile(file, 'utf8'), 'replacement')
    await rm(file)
    await service.undo()
    assert.equal(await readFile(file, 'utf8'), 'original')
  })
})

test('native trash recovers a completed OS mutation after a journal commit failure', {
  skip: process.platform === 'darwin',
}, async () => {
  await fixture(async ({ source, service, createService }) => {
    const file = join(source, 'file.txt')
    await writeFile(file, 'content')
    const save = service.save.bind(service)
    let fail = true
    service.save = async (operation, item) => {
      if (
        fail &&
        operation.kind === 'trash' &&
        operation.status === 'completed'
      ) {
        fail = false
        throw new Error('simulated journal outage after native trash')
      }

      await save(operation, item)
    }

    const operation = await execute(service, { kind: 'trash', paths: [file] })
    assert.equal(operation.status, 'interrupted')
    await service.close()
    const restarted = createService()
    await restarted.recover(operation.id)
    assert.equal((await restarted.list())[0].status, 'completed')
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'content')
  })
})

test('legacy managed-trash history restores existing data and redo uses native trash', {
  skip: process.platform === 'darwin',
}, async () => {
  await fixture(async ({ source, service, createService }) => {
    const file = join(source, 'file.txt')
    const target = join(source, '.filejam-trash', 'legacy', 'file.txt')
    await writeFile(file, 'legacy content')
    await mkdir(join(source, '.filejam-trash', 'legacy'), { recursive: true })
    await rename(file, target)
    const info = await stat(target, { bigint: true })
    await service.save({
      id: 'legacy',
      kind: 'trash',
      status: 'completed',
      createdAt: 1,
      items: [
        {
          source: file,
          target,
          status: 'completed',
          fingerprint: `${info.dev}:${info.ino}`,
        },
      ],
    })
    await service.close()
    const restarted = createService()
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'legacy content')
    await restarted.redo()
    assert.equal((await restarted.list())[0].trashBackend, 'native')
    await assert.rejects(access(target))
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'legacy content')
  })
})

test('undo refuses edited output and preserves both source and destination', async () => {
  await fixture(async ({ source, destination, service }) => {
    const file = join(source, 'file.txt')
    await writeFile(file, 'original')
    await execute(service, { kind: 'copy', paths: [file], destination })
    await writeFile(join(destination, 'file.txt'), 'edited')
    await service.undo()
    assert.match((await service.list())[0].error, /changed outside/)
    assert.equal(
      await readFile(join(destination, 'file.txt'), 'utf8'),
      'edited',
    )
    assert.equal(await readFile(file, 'utf8'), 'original')
  })
})

test('replace preserves displaced content through undo and redo', async () => {
  await fixture(async ({ source, destination, service }) => {
    const file = join(source, 'file.txt')
    const target = join(destination, 'file.txt')
    await writeFile(file, 'new')
    await writeFile(target, 'old')
    assert.equal(
      (
        await execute(service, {
          kind: 'copy',
          paths: [file],
          destination,
          conflict: 'replace',
        })
      ).status,
      'completed',
    )
    assert.equal(await readFile(target, 'utf8'), 'new')
    await service.undo()
    assert.equal(await readFile(target, 'utf8'), 'old')
    await service.redo()
    assert.equal(await readFile(target, 'utf8'), 'new')
  })
})

test('conflicts stop safely, skip or keep both without changing existing data', async () => {
  await fixture(async ({ source, destination, service }) => {
    const file = join(source, 'file.txt')
    const target = join(destination, 'file.txt')
    await writeFile(file, 'new')
    await writeFile(target, 'old')
    assert.equal(
      (await execute(service, { kind: 'move', paths: [file], destination }))
        .status,
      'failed',
    )
    assert.equal(await readFile(file, 'utf8'), 'new')
    const skipped = await execute(service, {
      kind: 'copy',
      paths: [file],
      destination,
      conflict: 'skip',
    })
    assert.equal(skipped.items[0].status, 'skipped')
    const both = await execute(service, {
      kind: 'copy',
      paths: [file],
      destination,
      conflict: 'keepBoth',
    })
    assert.equal(await readFile(both.items[0].target, 'utf8'), 'new')
    assert.equal(await readFile(target, 'utf8'), 'old')
  })
})

test('new work invalidates redo; invalid destinations and nested copies are rejected', async () => {
  await fixture(async ({ source, destination, service }) => {
    const file = join(source, 'file.txt')
    await writeFile(file, 'content')
    await execute(service, { kind: 'copy', paths: [file], destination })
    await service.undo()
    await execute(service, { kind: 'rename', paths: [file], name: 'new.txt' })
    await service.redo()
    await assert.rejects(access(join(destination, 'file.txt')))
    await assert.rejects(
      service.start({ kind: 'copy', paths: [source], destination: source }),
      /itself/,
    )
    await assert.rejects(
      service.start({
        kind: 'rename',
        paths: [join(source, 'new.txt')],
        name: '..',
      }),
      /valid filename/,
    )
  })
})

test('interrupted journals are retained and never replayed automatically', async () => {
  await fixture(async ({ source, journal, service, createService }) => {
    await mkdir(journal, { recursive: true })
    const item = {
      source: join(source, 'a'),
      target: join(source, 'b'),
      status: 'running',
    }
    await service.save({
      id: 'interrupted',
      kind: 'move',
      status: 'running',
      createdAt: 1,
      items: [item],
    })
    const restarted = createService()
    assert.equal((await restarted.list())[0].status, 'interrupted')
    assert.match((await restarted.list())[0].error, /retained/)
  })
})

test('cross-volume move keeps the complete destination when source deletion partially fails', async () => {
  await fixture(async ({ source, destination, service }) => {
    const folder = join(source, 'folder')
    await mkdir(folder)
    await writeFile(join(folder, 'a.txt'), 'a')
    await writeFile(join(folder, 'b.txt'), 'b')
    const move = service.moves.move.bind(service.moves)
    service.moves.move = async (input, output) => {
      if (input === folder) {
        throw Object.assign(new Error('different volume'), { code: 'EXDEV' })
      }

      return move(input, output)
    }
    service.removeSource = async () => {
      await rm(join(folder, 'a.txt'))
      throw Object.assign(new Error('source cleanup denied'), {
        code: 'EACCES',
      })
    }

    const operation = await execute(service, {
      kind: 'move',
      paths: [folder],
      destination,
    })
    assert.equal(operation.status, 'failed')
    assert.equal(operation.items[0].published, true)
    assert.equal(
      await readFile(join(destination, 'folder', 'a.txt'), 'utf8'),
      'a',
    )
    assert.equal(
      await readFile(join(destination, 'folder', 'b.txt'), 'utf8'),
      'b',
    )
    assert.equal(await readFile(join(folder, 'b.txt'), 'utf8'), 'b')
    await assert.rejects(service.retry(operation.id), /Inspect/)
    await service.recover(operation.id)
    assert.equal((await service.list())[0].status, 'interrupted')
  })
})

test('recovery reconciles a successful rename whose journal commit failed', async () => {
  await fixture(async ({ source, destination, service, createService }) => {
    const file = join(source, 'a.txt')
    await writeFile(file, 'a')
    const save = service.save.bind(service)
    let fail = true
    service.save = async (operation, item) => {
      if (fail && operation.items[0]?.status === 'completed') {
        fail = false
        throw new Error('simulated journal outage')
      }

      await save(operation, item)
    }

    await execute(service, { kind: 'move', paths: [file], destination })
    await service.close()
    const restarted = createService()
    const operation = (await restarted.list())[0]
    assert.equal(operation.status, 'interrupted')
    await restarted.recover(operation.id)
    assert.equal((await restarted.list())[0].items[0].status, 'completed')
    await restarted.undo()
    assert.equal(await readFile(file, 'utf8'), 'a')
  })
})

test('retry executes only unfinished items in a partially successful selection', async () => {
  await fixture(async ({ source, destination, service }) => {
    const first = join(source, 'first')
    const second = join(source, 'second')
    await writeFile(first, 'first')
    await writeFile(second, 'second')
    await writeFile(join(destination, 'second'), 'conflict')
    const operation = await execute(service, {
      kind: 'move',
      paths: [first, second],
      destination,
    })
    assert.equal(operation.status, 'partial')
    await rm(join(destination, 'second'))
    await service.retry(operation.id)
    assert.equal((await service.list())[0].status, 'completed')
    assert.equal(await readFile(join(destination, 'first'), 'utf8'), 'first')
    assert.equal(await readFile(join(destination, 'second'), 'utf8'), 'second')
    await service.undo()
    assert.equal(await readFile(first, 'utf8'), 'first')
    assert.equal(await readFile(second, 'utf8'), 'second')
  })
})

test('case-only rename works on Windows and remains undoable', {
  skip: process.platform !== 'win32',
}, async () => {
  await fixture(async ({ source, service }) => {
    const file = join(source, 'note.txt')
    await writeFile(file, 'note')
    const operation = await execute(service, {
      kind: 'rename',
      paths: [file],
      name: 'NOTE.txt',
    })
    assert.equal(operation.status, 'completed')
    await service.undo()
    assert.equal((await service.list())[0].status, 'undone')
  })
})
