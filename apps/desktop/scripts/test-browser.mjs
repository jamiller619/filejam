import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from '../../../docs/browser-poc/automation.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
process.env.FILEJAM_FS_SERVICE = resolve(
  root,
  'packages/fs-service/target/release',
  process.platform === 'win32'
    ? 'filejam-fs-service.exe'
    : 'filejam-fs-service',
)
const tests = (await readdir(resolve(root, 'apps/desktop/tests')))
  .filter((name) => /^browser-.*\.test\.mjs$/.test(name))
  .sort()
  .map((name) => `apps/desktop/tests/${name}`)
const commands = [
  [
    'cargo',
    'fmt',
    '--manifest-path',
    'packages/fs-service/Cargo.toml',
    '--',
    '--check',
  ],
  ['cargo', 'test', '--manifest-path', 'packages/fs-service/Cargo.toml'],
  [
    'cargo',
    'build',
    '--release',
    '--manifest-path',
    'packages/fs-service/Cargo.toml',
  ],
  ['pnpm', 'build'],
  [
    'node',
    '--test',
    ...tests,
    'docs/browser-poc/checks/service-contract.test.mjs',
    'docs/browser-poc/checks/state-contract.test.mjs',
  ],
  ['node', 'apps/desktop/tests/run-browser-smoke.mjs'],
  ['node', 'apps/desktop/tests/run-browser-smoke.mjs', '--shutdown'],
]

for (const [index, [program, ...args]] of commands.entries()) {
  console.log(`Proof check: ${program} ${args.join(' ')}`)
  const result = await runCommand(program, args, {
    cwd: root,
    log: resolve(root, `.poc-output/proof-check-${index + 1}.log`),
    timeout: 180000,
  })
  assert.equal(result.code, 0, result.tail)
}

console.log('All proof checks passed.')
