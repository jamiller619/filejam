import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'
import { LiveBrowserClient } from '../dist/live-browser/client.js'
import { expectedBenchmarkNames, statistics } from './live-browser-fixtures.mjs'
import { startSampler } from './live-browser-sampler.mjs'

const directory = process.env.FILEJAM_BENCH_DIRECTORY
app.setPath('userData', process.env.FILEJAM_TEST_USER_DATA)
let client
const originalList = LiveBrowserClient.prototype.list
LiveBrowserClient.prototype.list = function (...args) {
  client = this
  return originalList.apply(this, args)
}
const report = {
  environment: null,
  cases: [],
  excludedSamples: [],
  limitations: [
    'First run is not a cold-cache measurement.',
    'Frame opportunity is not actual pixel presentation.',
    'Memory is a 250ms sampled peak; short runs may lack a service sample.',
    'No approved latency threshold; local Windows name sorting only.',
    'Benchmark harness disables Electron background throttling so switching focus cannot turn batch pulls into one-second background timers. Production window defaults are unchanged.',
  ],
}
let sampler
let lastObserved = null
async function waitFor(predicate, label) {
  const deadline = Date.now() + 120000
  console.log(`Waiting: ${label}`)
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) {
      return value
    }
    await delay(10)
  }
  throw new Error(`Timed out: ${label}`)
}

async function run() {
  try {
    report.environment = JSON.parse(
      await readFile(join(directory, 'environment.json'), 'utf8'),
    )
    await import('../dist/index.js')
    await app.whenReady()
    await waitFor(() => BrowserWindow.getAllWindows()[0], 'window')
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setBackgroundThrottling(false)
    window.show()
    await waitFor(() => !window.webContents.isLoading(), 'renderer navigation')
    const evaluate = (script) => window.webContents.executeJavaScript(script)
    await waitFor(
      () =>
        evaluate(
          'Boolean(document.querySelector("[data-testid=live-browser]"))',
        ),
      'renderer',
    )
    const input = (id, value) =>
      evaluate(
        `(() => { const node=document.querySelector('[data-testid="${id}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)}); node.dispatchEvent(new Event('input',{bubbles:true})); })()`,
      )
    const choose = async (value) => {
      const trigger = `document.querySelector('button[aria-label="Sort direction"]')`
      await evaluate(`${trigger}.click()`)
      const item = `([...document.querySelectorAll('[role=menuitem]')].find(node=>node.textContent.trim()===${JSON.stringify(value === 'asc' ? 'Ascending' : 'Descending')}))`
      await waitFor(() => evaluate(`Boolean(${item})`), 'sort menu')
      await evaluate(`${item}.click()`)
      await waitFor(
        () =>
          evaluate(
            `${trigger}.textContent.trim()===${JSON.stringify(value)} && ${trigger}.getAttribute('aria-expanded')!=='true'`,
          ),
        'sort selection',
      )
    }
    const snapshot = () =>
      evaluate(
        `({generation:Number(document.querySelector('[data-testid=live-browser]').dataset.generation),phase:document.querySelector('[data-testid=live-browser]').dataset.phase,total:Number(document.querySelector('[data-testid=live-browser]').dataset.total),names:[...document.querySelectorAll('[data-testid=entry-name]')].map(node=>node.textContent),timings:JSON.parse(document.querySelector('[data-testid=timings]').textContent||'null')})`,
      )
    for (const size of JSON.parse(process.env.FILEJAM_BENCH_SIZES)) {
      for (const options of [
        { kind: 'all', nameContains: '', sortDirection: 'asc' },
        { kind: 'all', nameContains: '', sortDirection: 'desc' },
        { kind: 'all', nameContains: '000', sortDirection: 'asc' },
      ]) {
        await input('path-input', join(directory, String(size)))
        await evaluate(`document.querySelector('[data-testid=go]').click()`)
        await waitFor(
          async () => (await snapshot()).phase === 'complete',
          'setup navigation',
        )
        await input('name-filter', options.nameContains)
        await choose(options.sortDirection)
        const expected = expectedBenchmarkNames(size, options)
        const samples = []
        const entry = {
          size,
          options,
          firstRun: null,
          warmSamples: [],
          summary: {},
        }
        report.cases.push(entry)
        for (let repetition = 0; repetition < 11; repetition += 1) {
          const previous = await snapshot()
          sampler = startSampler({ app, window, servicePid: client.pid })
          await evaluate(
            `document.querySelector('[data-testid=apply]').form.requestSubmit()`,
          )
          const actual = await waitFor(async () => {
            const state = await snapshot()
            lastObserved = {
              state,
              main: client.lastMeasurement,
              previousGeneration: previous.generation,
            }
            if (state.phase === 'error') {
              throw new Error('Benchmark listing failed')
            }
            return state.generation > previous.generation &&
              state.phase === 'complete' &&
              state.timings?.generation === state.generation &&
              state.timings.completeMs !== null &&
              (!expected.length ||
                state.timings.firstFrameOpportunityMs !== null)
              ? state
              : null
          }, 'measured completion')
          const memory = await sampler.stop()
          sampler = null
          assert.equal(actual.total, expected.length)
          assert.deepEqual(actual.names, expected.slice(0, actual.names.length))
          if (expected.length) {
            assert.ok(actual.names.length > 0)
            await evaluate(
              `(() => {const list=document.querySelector('[data-testid=entry-list]');list.scrollTop=list.scrollHeight})()`,
            )
            await waitFor(
              () =>
                evaluate(
                  `[...document.querySelectorAll('[data-testid=entry-name]')].some(node=>node.textContent===${JSON.stringify(expected.at(-1))})`,
                ),
              'last boundary',
            )
          }
          const main = client.lastMeasurement
          assert.ok(main?.doneMs !== null)
          const sample = { renderer: actual.timings, main, memory }
          samples.push(sample)
          if (repetition === 0) {
            entry.firstRun = sample
          } else {
            entry.warmSamples.push(sample)
          }
          console.log(
            `Benchmark ${size} ${options.sortDirection}/${options.nameContains || 'all'} ${repetition}/10: ${actual.timings.completeMs.toFixed(1)}ms`,
          )
        }
        for (const key of [
          'firstRowsMs',
          'completeMs',
          'firstFrameOpportunityMs',
          'maxFrameGapMs',
        ]) {
          entry.summary[key] = statistics(
            entry.warmSamples
              .map((sample) => sample.renderer[key])
              .filter((value) => value !== null),
          )
        }
        await writeFile(
          process.env.FILEJAM_BENCH_OUTPUT,
          JSON.stringify(report, null, 2),
        )
      }
    }
    await writeFile(
      process.env.FILEJAM_BENCH_OUTPUT,
      JSON.stringify(report, null, 2),
    )
    app.quit()
  } catch (error) {
    await sampler?.stop()
    report.failure = String(error.stack ?? error)
    report.failureState = lastObserved
    await writeFile(
      process.env.FILEJAM_BENCH_OUTPUT,
      JSON.stringify(report, null, 2),
    )
    console.error(error)
    app.exit(1)
  }
}

void run()
