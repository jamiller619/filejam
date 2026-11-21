import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'

const root = process.env.FILEJAM_TEST_USER_DATA
assert.ok(root)
app.setPath('userData', root)
const deadline = setTimeout(() => app.exit(1), 80000)

async function until(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await predicate()) {
      return
    }

    await delay(50)
  }

  throw new Error(`File operations smoke timed out: ${label}`)
}

async function run() {
  try {
    await import('../dist/index.js')
    await app.whenReady()
    await until(() => BrowserWindow.getAllWindows().length > 0, 'window')
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setBackgroundThrottling(false)
    const evaluate = (script: string) =>
      window.webContents.executeJavaScript(`(async () => (${script}))()`)
    await until(
      () => evaluate('typeof window.filejam?.operations?.start === "function"'),
      'operation bridge',
    )
    const source = join(root, 'source')
    const destination = join(root, 'destination')
    const navigate = async (path: string) => {
      await evaluate(
        `location.hash = ${JSON.stringify(`#/location?${new URLSearchParams({ path })}`)}`,
      )
      await until(
        () =>
          evaluate(
            `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(path)}`,
          ),
        'listing',
      )
    }
    const key = (key: string, ctrlKey = false) =>
      evaluate(
        `document.querySelector('[aria-label="File browser"]').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: ${ctrlKey}, bubbles: true }))`,
      )
    const settled = async (kind: string) =>
      until(
        () =>
          evaluate(
            `window.filejam.operations.list().then(history => history[0]?.kind === ${JSON.stringify(kind)} && history[0]?.status === 'completed')`,
          ),
        kind,
      )
    const undo = async () => {
      const id = await evaluate(
        'window.filejam.operations.list().then(history => history[0]?.id)',
      )
      await until(
        () =>
          evaluate(
            `document.querySelector('[aria-label="File operations"]').dataset.operationId === ${JSON.stringify(id)} && document.querySelector('[aria-label="File operations"]').dataset.operationStatus === 'completed' && !document.querySelector('[aria-label="File operations"] button').disabled`,
          ),
        'undo enabled',
      )
      await evaluate(
        `document.querySelector('[aria-label="File operations"] button').click()`,
      )
      await until(
        () =>
          evaluate(
            `window.filejam.operations.list().then(history => history[0]?.status === 'undone')`,
          ),
        'undo completion',
      )
    }

    const inlineSelector = 'input[aria-label="Rename note.txt"]'
    const setRenameName = (value: string, selector = inlineSelector) =>
      evaluate(
        `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      )
    const beginRename = async () => {
      await evaluate(
        `document.querySelector('button[aria-label="Show details for note.txt"]').click()`,
      )
      await key('F2')
      await until(
        () =>
          evaluate(
            `document.activeElement?.getAttribute('aria-label') === 'Rename note.txt'`,
          ),
        'focused inline rename',
      )
      assert.equal(
        await evaluate('Boolean(document.querySelector("dialog[open]"))'),
        false,
      )
    }
    const enter = () => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    }
    const waitOriginal = () =>
      until(
        () =>
          evaluate(
            `!!document.querySelector('button[aria-label="Show details for note.txt"]')`,
          ),
        'refreshed source',
      )
    const openNoteMenu = () =>
      evaluate(
        `(() => { const button = document.querySelector('button[aria-label="Show details for note.txt"]'); const bounds = button.getBoundingClientRect(); button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: bounds.left + 4, clientY: bounds.top + 4 })); })()`,
      )

    for (const action of ['Copy', 'Cut']) {
      await navigate(source)
      await key('a', true)
      await until(
        () =>
          evaluate(
            `document.querySelectorAll('[data-file-id][data-selected="true"]').length === 2`,
          ),
        'clipboard selection',
      )
      await openNoteMenu()
      const menuItem = `Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === ${JSON.stringify(action)})`

      await until(() => evaluate(`Boolean(${menuItem})`), `${action} menu item`)
      await evaluate(`${menuItem}.click()`)
      await until(
        () =>
          evaluate(
            `document.querySelectorAll('[data-clipboard="${action.toLowerCase()}"]').length === 2`,
          ),
        `${action} indicators`,
      )
      await evaluate(
        `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`,
      )
      await until(
        () => evaluate(`!document.querySelector('[data-clipboard]')`),
        `${action} indicators cleared`,
      )
      assert.equal(
        await evaluate(
          `document.querySelectorAll('[data-file-id][data-selected="true"]').length`,
        ),
        2,
      )

      await navigate(destination)
      await key('v', true)
      assert.equal(
        await evaluate('Boolean(document.querySelector("dialog[open]"))'),
        false,
      )
    }

    await navigate(source)
    await beginRename()
    assert.ok(
      await evaluate(
        `(() => { const input = document.querySelector(${JSON.stringify(inlineSelector)}); const name = document.querySelector('[data-file-name="note.txt"]'); return Math.abs(input.getBoundingClientRect().top - name.getBoundingClientRect().top) < 5; })()`,
      ),
    )
    await setRenameName('cancelled.txt')
    await evaluate(
      `document.querySelector(${JSON.stringify(inlineSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await until(
      () =>
        evaluate(`!document.querySelector(${JSON.stringify(inlineSelector)})`),
      'cancel inline rename',
    )
    assert.equal(await readFile(join(source, 'note.txt'), 'utf8'), 'note')
    await assert.rejects(access(join(source, 'cancelled.txt')))

    await beginRename()
    await setRenameName('renamed.txt')
    enter()
    await settled('rename')
    assert.equal(await readFile(join(source, 'renamed.txt'), 'utf8'), 'note')
    await undo()
    await waitOriginal()

    await beginRename()
    await setRenameName('folder')
    enter()
    await until(
      () =>
        evaluate(
          `Boolean(document.querySelector('dialog[aria-label="Name already exists"][open]'))`,
        ),
      'rename conflict dialog',
    )
    assert.equal(
      await evaluate('document.querySelector("dialog input").value'),
      'folder (2)',
    )
    assert.equal(await readFile(join(source, 'note.txt'), 'utf8'), 'note')
    assert.equal(
      await readFile(join(source, 'folder', 'nested.txt'), 'utf8'),
      'nested',
    )
    await evaluate('document.querySelector("dialog form").requestSubmit()')
    await settled('rename')
    assert.equal(await readFile(join(source, 'folder (2)'), 'utf8'), 'note')
    await undo()
    await waitOriginal()

    for (const mode of ['Grid', 'Masonry', 'List']) {
      await evaluate(
        `document.querySelector('button[aria-label="${mode} view"]').click()`,
      )
      await until(
        () =>
          evaluate(
            `document.querySelector('button[aria-label="${mode} view"]')?.getAttribute('aria-pressed') === 'true'`,
          ),
        `${mode} mode`,
      )
      await beginRename()
      await evaluate(
        `document.querySelector(${JSON.stringify(inlineSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
      )
      await until(
        () =>
          evaluate(
            `!document.querySelector(${JSON.stringify(inlineSelector)})`,
          ),
        `cancel ${mode} rename`,
      )
    }

    await openNoteMenu()
    await until(
      () =>
        evaluate(
          `[...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent.trim() === 'Rename')`,
        ),
      'context rename action',
    )
    await evaluate(
      `[...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === 'Rename').click()`,
    )
    await until(
      () =>
        evaluate(
          `document.activeElement?.getAttribute('aria-label') === 'Rename note.txt'`,
        ),
      'context inline rename focus',
    )
    assert.equal(
      await evaluate('Boolean(document.querySelector("dialog[open]"))'),
      false,
    )
    await evaluate(
      `document.querySelector(${JSON.stringify(inlineSelector)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    )
    await until(
      () =>
        evaluate(`!document.querySelector(${JSON.stringify(inlineSelector)})`),
      'cancel context rename',
    )

    await evaluate(
      `(() => { const button = document.querySelector('button[aria-label="Show details for note.txt"]'); button.focus(); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })); })()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-file-id][data-selected="true"]').length === 2`,
        ),
      'mixed selection',
    )
    await key('F2')
    await until(
      () =>
        evaluate(
          `document.activeElement?.getAttribute('aria-label') === 'Rename 2 items'`,
        ),
      'bulk inline rename',
    )
    assert.equal(
      await evaluate('Boolean(document.querySelector("dialog[open]"))'),
      false,
    )
    await setRenameName(
      'renamed-{n}{ext}',
      'input[aria-label="Rename 2 items"]',
    )
    enter()
    await settled('rename')
    assert.equal(await readFile(join(source, 'renamed-2.txt'), 'utf8'), 'note')
    assert.equal(
      await readFile(join(source, 'renamed-1', 'nested.txt'), 'utf8'),
      'nested',
    )
    await undo()
    await waitOriginal()
    await evaluate(
      `(() => { const button = document.querySelector('button[aria-label="Show details for note.txt"]'); button.focus(); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })); })()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-file-id][data-selected="true"]').length === 2`,
        ),
      'restored mixed selection',
    )
    await key('c', true)
    await navigate(destination)
    await key('v', true)
    await until(
      () => evaluate('Boolean(document.querySelector("dialog[open]"))'),
      'paste dialog',
    )
    await evaluate(`document.querySelector('dialog form').requestSubmit()`)
    await settled('copy')
    assert.equal(await readFile(join(destination, 'note.txt'), 'utf8'), 'note')
    assert.equal(
      await readFile(join(destination, 'folder', 'nested.txt'), 'utf8'),
      'nested',
    )
    if (process.platform !== 'darwin') {
      await until(
        () =>
          evaluate(
            `!!document.querySelector('button[aria-label="Show details for note.txt"]')`,
          ),
        'destination refreshed',
      )
      await evaluate(
        `(() => { const button = document.querySelector('button[aria-label="Show details for note.txt"]'); button.focus(); button.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })); })()`,
      )
      await until(
        () =>
          evaluate(
            `document.querySelectorAll('[data-file-id][data-selected="true"]').length === 2`,
          ),
        'trash selection',
      )
      await key('Delete')
      await settled('trash')
      assert.equal(
        await evaluate('Boolean(document.querySelector("dialog[open]"))'),
        false,
      )
      await assert.rejects(access(join(destination, 'note.txt')))
      const toastUndo =
        'Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "Undo")'
      await until(() => evaluate(`Boolean(${toastUndo})`), 'trash toast')
      await evaluate(`${toastUndo}.click()`)
      await until(
        () =>
          evaluate(
            'window.filejam.operations.list().then(history => history[0]?.status === "undone")',
          ),
        'trash restored from toast',
      )
      assert.equal(
        await readFile(join(destination, 'note.txt'), 'utf8'),
        'note',
      )
      assert.equal(
        await readFile(join(destination, 'folder', 'nested.txt'), 'utf8'),
        'nested',
      )
    }

    console.log(
      'File operations UI smoke passed: rename, undo, mixed copy/paste, trash and restore',
    )
    clearTimeout(deadline)
    app.quit()
  } catch (error) {
    console.error(error)
    const window = BrowserWindow.getAllWindows()[0]
    console.error(
      await window?.webContents
        .executeJavaScript('window.filejam.operations.list()')
        .catch(() => 'operation history unavailable'),
    )
    console.error(
      await window?.webContents
        .executeJavaScript('document.body.innerText')
        .catch(() => 'renderer unavailable'),
    )
    clearTimeout(deadline)
    app.exit(1)
  }
}

void run()
