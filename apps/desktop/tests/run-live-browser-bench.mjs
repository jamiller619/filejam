import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { createBenchmarkFixture } from './live-browser-fixtures.mjs'

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--sizes'))
const sizes = args.length
  ? args[1].split(',').map(Number)
  : [0, 1000, 10000, 100000]
assert.ok(
  sizes.length > 0 &&
    sizes.every((size) => [0, 1000, 10000, 100000].includes(size)),
)
const directory = await mkdtemp(join(tmpdir(), 'filejam-benchmark-'))
await mkdir('.poc-output', { recursive: true })
const output = resolve('.poc-output', `benchmark-${Date.now()}.json`)
let child
let deadline
try {
  for (const size of sizes) {
    console.log(`Creating ${size} entry fixture outside measurement`)
    await createBenchmarkFixture(directory, size)
  }
  const environment = {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    storage: 'Local temporary directory; device/cache state not measured',
    rust: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    profile: 'release',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
  }
  await writeFile(
    join(directory, 'environment.json'),
    JSON.stringify(environment),
  )
  const env = {
    ...process.env,
    FILEJAM_LIVE_BROWSER_POC: '1',
    FILEJAM_BENCH_DIRECTORY: directory,
    FILEJAM_BENCH_SIZES: JSON.stringify(sizes),
    FILEJAM_BENCH_OUTPUT: output,
    FILEJAM_TEST_USER_DATA: join(directory, 'user-data'),
  }
  delete env.ELECTRON_RUN_AS_NODE
  child = spawn(
    electron,
    [fileURLToPath(new URL('./live-browser-bench.mjs', import.meta.url))],
    { env, stdio: 'inherit' },
  )
  deadline = setTimeout(() => child.kill(), 30 * 60_000)
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', resolveExit)
  })
  assert.equal(code, 0, `Benchmark failed; inspect ${output}`)
  console.log(`Benchmark saved: ${output}`)
} finally {
  clearTimeout(deadline)
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill()
  }
  await rm(directory, { recursive: true, force: true })
}
