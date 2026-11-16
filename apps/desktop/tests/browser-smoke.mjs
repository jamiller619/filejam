import assert from 'node:assert/strict'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import cases from '../../../docs/browser-poc/fixtures/view-cases.json' with {
  type: 'json',
}

const userData = process.env.FILEJAM_TEST_USER_DATA
assert.ok(userData, 'Browser smoke user data must be isolated')
app.setPath('userData', userData)
const require = createRequire(import.meta.url)
const childProcess = require('node:child_process')
const originalSpawn = childProcess.spawn
let serviceChild = null
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args)
  if (String(args[0]).includes('filejam-fs-service')) {
    serviceChild = child
  }
  return child
}
syncBuiltinESMExports()
let pickerCalls = 0
dialog.showOpenDialog = async () => {
  pickerCalls += 1
  return { canceled: true, filePaths: [] }
}

const registrations = []
const originalHandle = ipcMain.handle.bind(ipcMain)
let startGate = null
let nextGate = null
let nextEnteredResolve = null
ipcMain.handle = (channel, listener) => {
  registrations.push(channel)
  if (channel === 'browser:start') {
    return originalHandle(channel, async (...args) => {
      const gate = startGate
      startGate = null
      await gate
      return listener(...args)
    })
  }

  if (channel === 'browser:next') {
    return originalHandle(channel, async (...args) => {
      const gate = nextGate
      if (gate) {
        nextGate = null
        nextEnteredResolve?.()
        await gate
      }
      return listener(...args)
    })
  }

  return originalHandle(channel, listener)
}

const timeout = setTimeout(() => {
  console.error('Browser smoke test timed out')
  app.exit(1)
}, 55000)

async function waitFor(predicate, description) {
  const deadline = Date.now() + 10000

  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }

    await delay(50)
  }

  assert.fail(`Timed out waiting for ${description}`)
}

async function run() {
  try {
    await import('../dist/index.js')
    await app.whenReady()

    await waitFor(
      () => BrowserWindow.getAllWindows().length === 1,
      'proof window',
    )

    const window = BrowserWindow.getAllWindows()[0]
    assert.ok(window)
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) {
        console.error(`Renderer console: ${message}`)
      }
    })
    assert.equal(window.webContents.getLastWebPreferences().sandbox, true)
    assert.equal(
      window.webContents.getLastWebPreferences().contextIsolation,
      true,
    )

    await waitFor(() => !window.webContents.isLoading(), 'proof renderer load')
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          'Boolean(document.querySelector("[data-testid=browser]"))',
        ),
      'browser root',
    )

    assert.equal(
      await window.webContents.executeJavaScript('typeof require'),
      'undefined',
    )
    assert.equal(
      await window.webContents.executeJavaScript(
        'Boolean(window.browser) && Boolean(window.browser.mode === "browser-poc")',
      ),
      true,
    )
    assert.equal(
      await window.webContents.executeJavaScript(
        'Boolean(window.filejam) || Boolean(window.scanner)',
      ),
      false,
    )
    assert.deepEqual(
      registrations.filter((channel) =>
        /^(scanner:|filejam:|settings:)/.test(channel),
      ),
      [],
      'legacy and scanner IPC handlers must not be registered',
    )

    assert.deepEqual(registrations, [
      'browser:choose-folder',
      'browser:start',
      'browser:next',
      'browser:cancel',
    ])

    const evaluate = async (script) => {
      try {
        return await window.webContents.executeJavaScript(script)
      } catch (error) {
        throw new Error(`Renderer evaluation failed:\n${script}`, {
          cause: error,
        })
      }
    }
    const settleRenderer = () =>
      evaluate(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      )
    const setInput = async (testId, value) =>
      evaluate(`(() => {
        const input = document.querySelector('[data-testid="${testId}"]')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
    const click = async (testId) =>
      evaluate(`document.querySelector('[data-testid="${testId}"]').click()`)
    const waitComplete = () =>
      waitFor(
        () =>
          evaluate(
            'document.querySelector("[data-testid=browser]")?.dataset.phase === "complete"',
          ),
        'listing completion',
      )
    const snapshot = () =>
      evaluate(`({
      generation: Number(document.querySelector('[data-testid="browser"]').dataset.generation),
      phase: document.querySelector('[data-testid="browser"]').dataset.phase,
      names: [...document.querySelectorAll('[data-testid="entry-name"]')].map((node) => node.textContent),
      status: document.querySelector('[data-testid="status"]').textContent,
    })`)
    const submitApply = () =>
      evaluate(
        `document.querySelector('[data-testid="apply"]').form.requestSubmit()`,
      )
    const generation = async () =>
      evaluate(
        'Number(document.querySelector("[data-testid=browser]").dataset.generation)',
      )
    const chooseOption = async (testId, value) => {
      const label = testId === 'kind-filter' ? 'Kind' : 'Sort direction'
      const optionLabel =
        { asc: 'ascending', desc: 'descending' }[value] ?? value
      const trigger = `document.querySelector('button[aria-label=${JSON.stringify(label)}]')`

      await evaluate(`${trigger}.click()`)
      const option = `(() => {
        const menu = document.getElementById(${trigger}.getAttribute('aria-controls'))
        return [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
          .find((node) => node.textContent.trim().toLowerCase() === ${JSON.stringify(optionLabel)})
      })()`
      await waitFor(
        () => evaluate(`Boolean(${option})`),
        `${label} option ${optionLabel}`,
      )
      await evaluate(`${option}.click()`)
      await waitFor(
        () =>
          evaluate(
            `${trigger}.textContent.trim() === ${JSON.stringify(value)} && ${trigger}.getAttribute('aria-expanded') !== 'true'`,
          ),
        `${label} selection ${value}`,
      )
    }

    const fixture = join(dirname(userData), 'fixture')
    await setInput('path-input', fixture)
    await click('go')
    await waitComplete()
    const listing = await evaluate(`({
      count: Number(document.querySelector('[data-testid="browser"]').dataset.total),
      names: [...document.querySelectorAll('[data-testid="entry-name"]')].map((node) => node.textContent),
    })`)
    assert.equal(listing.count, 8, 'fixture listing count')
    assert.deepEqual(
      listing.names,
      [
        'Alpha',
        'zeta',
        '.hidden',
        'Beta.txt',
        'file10.txt',
        'file2.txt',
        'résumé.txt',
        'space name.txt',
      ],
      'fixture listing order',
    )

    if (process.env.FILEJAM_SMOKE_SHUTDOWN === '1') {
      let release
      const entered = new Promise((resolve) => {
        nextEnteredResolve = resolve
      })
      nextGate = new Promise((resolve) => {
        release = resolve
      })
      await setInput('path-input', join(dirname(fixture), 'large-fixture'))
      await click('go')
      await entered
      const ownedChild = serviceChild
      assert.ok(ownedChild?.pid)
      app.on('before-quit', (event) => event.preventDefault())
      window.close()
      release()
      await waitFor(
        () => ownedChild.exitCode !== null || ownedChild.signalCode !== null,
        'service exit on active window close',
      )
      assert.equal(window.isDestroyed(), true)
      console.log('Active window-close smoke passed; owned service exited.')
      clearTimeout(timeout)
      app.exit(0)
      return
    }

    const waitGenerationChange = async (previous, description) => {
      await waitFor(
        async () => (await generation()) !== previous,
        `${description} generation change`,
      )
    }
    const alpha = `([...document.querySelectorAll('[data-entry-path]')].find((row) => row.querySelector('[data-testid="entry-name"]').textContent === 'Alpha'))`
    let beforeAction = await generation()
    let releaseStart
    startGate = new Promise((resolve) => {
      releaseStart = resolve
    })
    try {
      await evaluate(
        `${alpha}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      )
      await waitGenerationChange(beforeAction, 'double-click directory')
      await waitFor(
        async () => (await snapshot()).phase === 'loading',
        'held directory navigation',
      )
      assert.deepEqual(
        (await snapshot()).names,
        [],
        'old rows clear while navigating',
      )
      assert.equal(
        await evaluate('document.querySelector("[data-testid=go]").disabled'),
        false,
        'Go remains enabled while loading',
      )
    } finally {
      releaseStart()
      startGate = null
    }
    await waitComplete()
    assert.deepEqual((await snapshot()).names, ['inside.txt'])

    beforeAction = await generation()
    await click('up')
    await waitGenerationChange(beforeAction, 'Up navigation')
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      listing.names,
      'Up returns to fixture root',
    )

    beforeAction = await generation()
    await setInput('name-filter', '')
    await chooseOption('kind-filter', 'directory')
    await submitApply()
    await waitGenerationChange(beforeAction, 'directory keyboard setup Apply')
    await waitComplete()
    await evaluate(
      `${alpha}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
    )
    await evaluate(
      `document.querySelector('[data-testid="entry-list"]').focus()`,
    )
    beforeAction = await generation()
    await evaluate(
      `document.querySelector('[data-testid="entry-list"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`,
    )
    await waitFor(
      async () => (await snapshot()).phase === 'complete',
      'directory Enter remains complete',
    )
    await waitGenerationChange(beforeAction, 'Enter directory navigation')
    await waitComplete()
    assert.equal(
      await generation(),
      beforeAction + 1,
      'Enter on directory navigates',
    )

    beforeAction = await generation()
    await click('up')
    await waitGenerationChange(beforeAction, 'return from keyboard navigation')
    await waitComplete()

    await setInput('name-filter', '')
    await chooseOption('kind-filter', 'all')
    await submitApply()
    await waitComplete()
    const fileRow = `([...document.querySelectorAll('[data-entry-path]')].find((row) => row.querySelector('[data-testid="entry-name"]').textContent === 'Beta.txt'))`
    await evaluate(`${fileRow}.click()`)
    await waitFor(
      () => evaluate(`${fileRow}?.getAttribute('aria-selected') === 'true'`),
      'file selection',
    )
    await evaluate(
      `document.querySelector('[data-testid="entry-list"]').focus()`,
    )
    beforeAction = await generation()
    await evaluate(
      `document.querySelector('[data-testid="entry-list"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`,
    )
    await settleRenderer()
    assert.equal(
      await generation(),
      beforeAction,
      'Enter on file does not navigate',
    )

    await setInput('name-filter', 'new')
    await chooseOption('kind-filter', 'file')
    await chooseOption('sort-direction', 'desc')
    beforeAction = await generation()
    await submitApply()
    await waitGenerationChange(beforeAction, 'apply Refresh filter')
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      [],
      'applied filter initially has no matches',
    )
    beforeAction = await generation()
    const externalFile = join(fixture, 'new.txt')
    await writeFile(externalFile, 'external refresh fixture')
    assert.equal(
      await generation(),
      beforeAction,
      'external creation does not navigate automatically',
    )
    await click('refresh')
    await waitGenerationChange(beforeAction, 'Refresh after external create')
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      ['new.txt'],
      'Refresh finds external file',
    )
    assert.equal((await snapshot()).generation, beforeAction + 1)

    await rm(externalFile)
    beforeAction = await generation()
    await click('refresh')
    await waitGenerationChange(beforeAction, 'Refresh after external delete')
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      [],
      'Refresh removes deleted file',
    )
    assert.equal(
      await evaluate(
        `document.querySelector('[data-testid="name-filter"]').value === 'new' && document.querySelector('button[aria-label="Kind"]').textContent.trim() === 'file' && document.querySelector('button[aria-label="Sort direction"]').textContent.trim() === 'desc'`,
      ),
      true,
      'Refresh retains applied filter and sort controls',
    )

    beforeAction = await generation()
    const previousPickerCalls = pickerCalls
    await click('choose-folder')
    await waitFor(
      () => pickerCalls === previousPickerCalls + 1,
      'picker cancellation',
    )
    await settleRenderer()
    assert.equal(
      await generation(),
      beforeAction,
      'canceled picker preserves generation',
    )

    for (const testCase of cases.cases) {
      const beforeDraft = await snapshot()
      await setInput('name-filter', testCase.options.nameContains)
      await chooseOption('kind-filter', testCase.options.kind)
      await chooseOption('sort-direction', testCase.options.sortDirection)
      assert.equal(
        (await snapshot()).generation,
        beforeDraft.generation,
        `${testCase.label}: draft edits preserve generation`,
      )
      await submitApply()
      await waitComplete()
      const actual = await snapshot()
      assert.equal(
        actual.generation,
        beforeDraft.generation + 1,
        `${testCase.label}: Apply increments generation`,
      )
      assert.deepEqual(
        actual.names,
        testCase.expected,
        `${testCase.label}: exact DOM names`,
      )
      if (testCase.label === 'no-match') {
        assert.equal(
          actual.status,
          'No matching entries',
          'empty complete listing message',
        )
      }
    }

    await setInput('name-filter', '')
    await chooseOption('kind-filter', 'all')
    await chooseOption('sort-direction', 'asc')
    await submitApply()
    await waitComplete()
    await chooseOption('sort-direction', 'desc')
    await submitApply()
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      cases.cases.find((item) => item.label === 'desc-all').expected,
      'directories-first descending sort',
    )

    await chooseOption('sort-direction', 'asc')
    await submitApply()
    await waitComplete()

    const beforeInvalid = await snapshot()
    await setInput('path-input', join(dirname(fixture), 'missing-folder'))
    await click('go')
    await waitFor(
      async () => (await snapshot()).phase === 'error',
      'invalid path error',
    )
    assert.equal((await snapshot()).generation, beforeInvalid.generation + 1)
    await setInput('path-input', fixture)
    await click('go')
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      cases.cases[0].expected,
      'valid Go recovers after path error',
    )

    await setInput('path-input', join(dirname(fixture), 'large-fixture'))
    await click('go')
    await waitComplete()
    const largeListing = await evaluate(`({
      count: Number(document.querySelector('[data-testid="browser"]').dataset.total),
      renderedRows: document.querySelectorAll('[data-entry-path]').length,
    })`)
    assert.equal(largeListing.count, 10000, 'large fixture listing count')
    assert.ok(
      largeListing.renderedRows < 200,
      `virtualized DOM must render fewer than 200 rows; got ${largeListing.renderedRows}`,
    )

    const entryList = `document.querySelector('[data-testid="entry-list"]')`
    await evaluate(`${entryList}.scrollTop = ${entryList}.scrollHeight`)
    await settleRenderer()
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('[data-testid="entry-name"]')].some((node) => node.textContent === 'entry-09999.txt')`,
      ),
      true,
      'last large fixture entry appears after scrolling to the end',
    )

    await evaluate(`${entryList}.scrollTop = 0`)
    await evaluate(`${entryList}.focus()`)
    await evaluate(
      `${entryList}.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))`,
    )
    await waitFor(
      () =>
        evaluate(
          `[...document.querySelectorAll('[data-entry-path]')].some((row) => row.getAttribute('aria-selected') === 'true' && row.querySelector('[data-testid="entry-name"]').textContent === 'entry-09999.txt')`,
        ),
      'keyboard selection scrolls to the last offscreen entry',
    )

    beforeAction = await generation()
    await click('refresh')
    await waitGenerationChange(beforeAction, 'large fixture new generation')
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('[data-entry-path]')].some((row) => row.getAttribute('aria-selected') === 'true')`,
      ),
      false,
      'new generation clears keyboard selection',
    )

    await waitFor(
      async () => (await snapshot()).phase === 'receiving',
      'large listing delivery before distinct navigation',
    )
    const largeGeneration = await generation()
    await setInput('path-input', fixture)
    await click('go')
    await waitGenerationChange(
      largeGeneration,
      'large A to distinct B navigation',
    )
    assert.deepEqual(
      (await snapshot()).names,
      [],
      'B clears all A rows as soon as its generation begins',
    )
    await waitComplete()
    assert.deepEqual(
      (await snapshot()).names,
      listing.names,
      'B location contains only its distinct fixture rows',
    )

    let releaseNext
    const nextEntered = new Promise((resolve) => {
      nextEnteredResolve = resolve
    })
    await setInput('name-filter', '')
    await chooseOption('kind-filter', 'all')
    await submitApply()
    await waitComplete()
    nextGate = new Promise((resolve) => {
      releaseNext = resolve
    })
    await setInput('path-input', join(dirname(fixture), 'large-fixture'))
    await click('go')
    await waitFor(
      async () => (await snapshot()).phase === 'receiving',
      'active large listing delivery before service failure',
    )
    await nextEntered
    assert.ok(serviceChild?.pid, 'main harness captured the service child pid')
    const failedChild = serviceChild
    failedChild.kill()
    await waitFor(
      async () => (await snapshot()).status.includes('SERVICE_UNAVAILABLE'),
      'visible service unavailable status after child termination',
    )
    releaseNext()
    await waitFor(
      () => failedChild.exitCode !== null || failedChild.signalCode !== null,
      'terminated service child exit',
    )
    assert.ok(
      failedChild.exitCode !== null || failedChild.signalCode !== null,
      'service child exited after failure',
    )

    const proofEntry = await readFile(
      new URL('../src/index.ts', import.meta.url),
      'utf8',
    )
    const proofBootstrap = await readFile(
      new URL('../src/browser/bootstrap.ts', import.meta.url),
      'utf8',
    )
    assert.match(proofEntry, /FILEJAM_BROWSER_POC/)
    assert.match(proofEntry, /import\('\.\/browser\/bootstrap\.js'\)/)
    assert.doesNotMatch(proofBootstrap, /@filejam\/server|\.\.\/normal|scanner/)

    const inspectArtifacts = async (directory) => {
      const entries = await readdir(directory, { withFileTypes: true })
      const found = []
      for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (/scanner/i.test(entry.name)) {
            found.push(path)
          } else if (
            !/^(Cache|Code Cache|GPUCache|GPUPersistentCache|DawnCache|GrShaderCache|ShaderCache)$/.test(
              entry.name,
            )
          ) {
            found.push(...(await inspectArtifacts(path)))
          }
        } else if (
          (/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$/i.test(entry.name) &&
            entry.name !== 'declarative_performance_observer.db') ||
          /scanner.*cache|cache.*scanner/i.test(entry.name)
        ) {
          found.push(path)
        }
      }
      return found
    }
    assert.deepEqual(
      await inspectArtifacts(userData),
      [],
      'no application DB or scanner cache artifacts',
    )

    console.log(
      'Browser Electron smoke passed: fixture browsing, sandbox, proof imports, IPC, and isolated artifacts verified',
    )
    clearTimeout(timeout)
    app.quit()
  } catch (error) {
    console.error(error)
    clearTimeout(timeout)
    app.exit(1)
  }
}

void run()
