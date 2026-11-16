import assert from 'node:assert/strict'
import test from 'node:test'
import { startSampler } from './browser-sampler.mjs'

test('sampler converts KiB, explains unsupported values, and stops idempotently', async () => {
  const sampler = startSampler({
    app: {
      getAppMetrics: () => [
        { pid: process.pid, memory: { workingSetSize: 10 } },
        { pid: 123, memory: { workingSetSize: 20 } },
      ],
    },
    window: { webContents: { getOSProcessId: () => 123 } },
    servicePid: 456,
    platform: 'unsupported',
  })
  const stop = sampler.stop()
  assert.equal(stop, sampler.stop())
  const result = await stop
  assert.deepEqual(result.sampledPeakBytes, {
    main: 10240,
    renderer: 20480,
    service: null,
  })
  assert.match(result.unavailableReasons.service, /Windows/)
})
