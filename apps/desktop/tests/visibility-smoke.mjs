import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function verifyVisibility({ evaluate, until, userData }) {
  const path = join(userData, 'visibility')
  const windows = process.platform === 'win32'
  const list = (options = {}) =>
    evaluate(
      `window.filejam.filesystem.list(${JSON.stringify({ path, search: '', recursive: false, pane: 'secondary', ...options })})`,
    )
  const names = (listing) => listing.entries.map((entry) => entry.name).sort()
  const hidden = [
    '.hidden-folder',
    '.secret',
    ...(windows ? ['hidden.txt'] : []),
  ]
  const system = windows ? ['system.txt'] : []

  for (const showHidden of [false, true]) {
    for (const showSystem of [false, true]) {
      assert.deepEqual(
        names(await list({ showHidden, showSystem })),
        [
          'visible.txt',
          ...(showHidden ? hidden : []),
          ...(showSystem ? system : []),
        ].sort(),
      )
    }
  }
  assert.deepEqual(names(await list({ recursive: true })), ['visible.txt'])
  assert.deepEqual(names(await list({ path: join(path, '.hidden-folder') })), [
    'nested.txt',
  ])
  assert.ok(
    names(await list({ recursive: true, showHidden: true })).includes(
      'nested.txt',
    ),
  )

  const second = process.env.FILEJAM_SMOKE_SECOND === '1'
  for (const key of ['user.files.showHidden', 'user.files.showSystem']) {
    assert.equal(
      await evaluate(`window.filejam.settings.get(${JSON.stringify(key)})`),
      second,
    )
  }
  await evaluate(`location.hash = '#/settings'`)
  await until(
    () =>
      evaluate(
        `Boolean(document.querySelector('[role="switch"][aria-label="Show protected system items"]'))`,
      ),
    'schema-driven visibility controls',
  )
  for (const label of ['Show hidden files', 'Show protected system items']) {
    await evaluate(
      `document.querySelector('[role="switch"][aria-label="${label}"]').click()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelector('[role="switch"][aria-label="${label}"]').getAttribute('aria-checked') === '${!second}'`,
        ),
      label,
    )
  }
  await evaluate(
    `location.hash = ${JSON.stringify(`#/location?${new URLSearchParams({ path })}`)}`,
  )
  await until(
    () =>
      evaluate(
        `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(path)}`,
      ),
    'visibility settings applied to view',
  )
  const count = second ? 1 : 1 + hidden.length + system.length
  assert.equal(
    await evaluate(`document.querySelectorAll('tr[data-file-id]').length`),
    count,
  )
  console.log(
    'Visibility settings: native attributes, independent toggles, recursion, direct navigation, schema UI, and persistence passed',
  )
}
