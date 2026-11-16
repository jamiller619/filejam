import { spawn } from 'node:child_process'

export function startSampler({
  app,
  window,
  servicePid,
  platform = process.platform,
}) {
  const peaks = { main: null, renderer: null, service: null }
  const reasons = {
    main: 'No sample',
    renderer: 'No sample',
    service: 'No sample',
  }
  let sampler
  let stopped = null
  const record = (key, bytes) => {
    if (Number.isFinite(bytes) && bytes >= 0) {
      peaks[key] = Math.max(peaks[key] ?? 0, bytes)
      reasons[key] = null
    }
  }
  const sample = () => {
    try {
      const metrics = app.getAppMetrics()
      for (const [key, pid] of [
        ['main', process.pid],
        ['renderer', window.webContents.getOSProcessId()],
      ]) {
        const item = metrics.find((metric) => metric.pid === pid)
        if (item?.memory?.workingSetSize !== undefined) {
          record(key, item.memory.workingSetSize * 1024)
        }
      }
    } catch {
      // A closing renderer can disappear between samples.
    }
  }
  sample()
  const timer = setInterval(sample, 250)
  if (
    platform === 'win32' &&
    Number.isSafeInteger(servicePid) &&
    servicePid > 0
  ) {
    sampler = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$targetId=${servicePid}; while ($true) { try { $bytes=(Get-Process -Id $targetId -ErrorAction Stop).WorkingSet64; [Console]::WriteLine($bytes) } catch { break }; Start-Sleep -Milliseconds 250 }`,
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    let pending = ''
    sampler.stdout.on('data', (chunk) => {
      pending += chunk.toString()
      const lines = pending.split(/\r?\n/)
      pending = lines.pop().slice(-128)
      for (const line of lines) {
        if (/^\d+$/.test(line)) {
          record('service', Number(line))
        }
      }
    })
    sampler.on('error', (error) => {
      reasons.service = error.message
    })
  } else {
    reasons.service =
      'Service memory sampling supports Windows with a known PID only'
  }

  return {
    stop() {
      stopped ??= (async () => {
        clearInterval(timer)
        sample()
        if (
          sampler &&
          sampler.exitCode === null &&
          sampler.signalCode === null
        ) {
          await new Promise((resolve) => {
            sampler.once('close', resolve)
            sampler.kill()
          })
        }
        return {
          sampledPeakBytes: peaks,
          unavailableReasons: reasons,
          intervalMs: 250,
        }
      })()
      return stopped
    },
  }
}
