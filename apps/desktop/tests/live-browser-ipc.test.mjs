import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { registerLiveBrowserIpc } from '../dist/live-browser/ipc.js'

const desktopDirectory = fileURLToPath(new URL('../', import.meta.url))

function setup() {
  const handlers = new Map()
  const removed = []
  const main = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => {
      removed.push(channel)
      handlers.delete(channel)
    },
  }
  const frame = {}
  const sent = []
  const window = {
    isDestroyed: () => false,
    webContents: {
      mainFrame: frame,
      send: (...args) => sent.push(args),
    },
  }
  const calls = { lists: [], next: [], cancel: [] }
  const client = {
    list: (...args) => {
      calls.lists.push(args)
      return `r-${calls.lists.length}`
    },
    next: (id) => calls.next.push(id),
    cancel: (id) => calls.cancel.push(id),
  }
  const pickerOptions = []
  const folderDialog = {
    showOpenDialog: async (...args) => {
      pickerOptions.push(args)
      return { canceled: true, filePaths: [] }
    },
  }
  const dispose = registerLiveBrowserIpc(window, client, main, folderDialog)
  const invoke = (
    channel,
    sender = window.webContents,
    senderFrame = frame,
    ...args
  ) => handlers.get(channel)({ sender, senderFrame }, ...args)

  return {
    handlers,
    removed,
    window,
    frame,
    sent,
    calls,
    pickerOptions,
    invoke,
    dispose,
  }
}

test('rejects other windows and subframes before validating or calling handlers', async () => {
  const state = setup()
  await assert.rejects(
    state.invoke('live-browser:start', {}, state.frame, null),
    /Unauthorized IPC/,
  )
  await assert.rejects(
    state.invoke('live-browser:start', state.window.webContents, {}, null),
    /Unauthorized IPC/,
  )
  assert.equal(state.calls.lists.length, 0)
})

test('validates options and strictly increasing positive generations', async () => {
  const state = setup()
  const valid = {
    generation: 1,
    path: 'C:\\work',
    options: { nameContains: '', kind: 'all', sortDirection: 'asc' },
  }
  await assert.rejects(
    state.invoke('live-browser:start', undefined, undefined, {
      ...valid,
      options: { ...valid.options, kind: 'bogus' },
    }),
    /Invalid start input/,
  )
  await assert.rejects(
    state.invoke('live-browser:start', undefined, undefined, {
      ...valid,
      generation: 0,
    }),
    /Invalid start generation/,
  )
  assert.deepEqual(
    await state.invoke('live-browser:start', undefined, undefined, valid),
    { id: 'r-1' },
  )
  await assert.rejects(
    state.invoke('live-browser:start', undefined, undefined, valid),
    /Invalid start generation/,
  )
  assert.equal(state.calls.lists.length, 1)
})

test('forwards generation, retires canceled ids, and removes all invoke handlers', async () => {
  const state = setup()
  const input = {
    generation: 4,
    path: 'C:\\work',
    options: { nameContains: '', kind: 'all', sortDirection: 'desc' },
  }
  const { id } = await state.invoke(
    'live-browser:start',
    undefined,
    undefined,
    input,
  )
  const callback = state.calls.lists[0][2]
  callback({
    v: 1,
    type: 'listing',
    id,
    path: input.path,
    parentPath: null,
    total: 0,
    metrics: { enumerationMs: 0, filterSortMs: 0 },
  })
  assert.equal(state.sent[0][0], 'live-browser:event')
  assert.equal(state.sent[0][1].generation, 4)
  await state.invoke('live-browser:cancel', undefined, undefined, id)
  await state.invoke('live-browser:next', undefined, undefined, id)
  assert.deepEqual(state.calls.cancel, [id])
  assert.deepEqual(state.calls.next, [])
  await state.invoke('live-browser:choose-folder')
  assert.equal(state.pickerOptions[0][0], state.window)
  assert.deepEqual(state.pickerOptions[0][1], { properties: ['openDirectory'] })
  assert.equal(await state.invoke('live-browser:choose-folder'), null)
  state.dispose()
  state.dispose()
  assert.deepEqual(
    state.removed.sort(),
    [
      'live-browser:choose-folder',
      'live-browser:start',
      'live-browser:next',
      'live-browser:cancel',
    ].sort(),
  )
  assert.equal(state.handlers.size, 0)
})

test('compiled sandbox preload exposes fixed bridge methods and isolated listeners', async () => {
  const electron = {
    contextBridge: { exposeInMainWorld: (...args) => exposed.push(args) },
    ipcRenderer: new EventEmitter(),
  }
  const exposed = []
  const require = createRequire(import.meta.url)
  const originalCache = require.cache
  const electronPath = require.resolve('electron')
  require.cache[electronPath] = { exports: electron }

  try {
    const preloadPath = join(desktopDirectory, 'dist/live-browser/preload.cjs')
    delete require.cache[preloadPath]
    require(preloadPath)

    assert.equal(exposed.length, 1)
    assert.equal(exposed[0][0], 'liveBrowser')
    const bridge = exposed[0][1]
    assert.deepEqual(Object.keys(bridge).sort(), [
      'cancel',
      'chooseFolder',
      'mode',
      'next',
      'onEvent',
      'start',
    ])
    assert.equal(bridge.mode, 'live-browser-poc')
    for (const method of ['chooseFolder', 'start', 'next', 'cancel']) {
      assert.equal(typeof bridge[method], 'function')
    }

    const invokeChannels = []
    electron.ipcRenderer.invoke = async (channel) => {
      invokeChannels.push(channel)
    }
    await bridge.chooseFolder()
    await bridge.start({})
    await bridge.next('id')
    await bridge.cancel('id')
    assert.deepEqual(invokeChannels, [
      'live-browser:choose-folder',
      'live-browser:start',
      'live-browser:next',
      'live-browser:cancel',
    ])

    const source = await readFile(preloadPath, 'utf8')
    assert.match(source, /require\(['"]electron['"]\)/)
    assert.doesNotMatch(source, /require\(['"]\.[^'"]*['"]\)/)

    const firstEvents = []
    const secondEvents = []
    const unsubscribe = bridge.onEvent((event) => firstEvents.push(event))
    bridge.onEvent((event) => secondEvents.push(event))
    const payload = { v: 1, type: 'done', id: 'id', total: 0, generation: 1 }
    electron.ipcRenderer.emit('live-browser:event', {}, payload)
    unsubscribe()
    electron.ipcRenderer.emit('live-browser:event', {}, payload)
    assert.deepEqual(firstEvents, [payload])
    assert.deepEqual(secondEvents, [payload, payload])
  } finally {
    delete require.cache[require.resolve('electron')]
    Object.assign(require.cache, originalCache)
  }
})
