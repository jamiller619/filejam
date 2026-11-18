import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)

/** Query labels in one hidden process, outside the interactive filesystem path. */
export async function getWindowsVolumeLabels(): Promise<Map<string, string>> {
  const script = `
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $volumes = @([IO.DriveInfo]::GetDrives() | ForEach-Object {
      try {
        if ($_.IsReady) {
          [PSCustomObject]@{ path = $_.Name; label = $_.VolumeLabel }
        }
      } catch { }
    })
    ConvertTo-Json -InputObject $volumes -Compress
  `

  try {
    const { stdout } = await executeFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      {
        windowsHide: true,
        timeout: 2000,
        maxBuffer: 64 * 1024,
        encoding: 'utf8',
      },
    )
    const volumes: unknown = JSON.parse(stdout.trim())
    const labels = new Map<string, string>()

    if (Array.isArray(volumes)) {
      for (const volume of volumes) {
        if (
          volume &&
          typeof volume.path === 'string' &&
          /^[a-z]:\\$/i.test(volume.path) &&
          typeof volume.label === 'string'
        ) {
          labels.set(volume.path.toUpperCase(), volume.label.trim())
        }
      }
    }

    return labels
  } catch {
    // Unavailable metadata must not prevent browsing by drive letter.
    return new Map()
  }
}
