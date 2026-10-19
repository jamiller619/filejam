import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Existing physical trash roots that can be indexed by the regular scanner. */
export async function getOsTrashRoots(): Promise<string[]> {
  if (process.platform === 'win32') {
    try {
      const roots = await getWindowsTrashRoots()

      return (await Promise.all(roots.map(canonicalDirectory))).filter(
        (root): root is string => root !== null,
      )
    } catch (error) {
      console.warn('Unable to locate Windows Recycle Bin folders', error)

      return []
    }
  }

  const root =
    process.platform === 'darwin'
      ? join(homedir(), '.Trash')
      : join(
          process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
          'Trash',
          'files',
        )

  const canonicalRoot = await canonicalDirectory(root)

  return canonicalRoot ? [canonicalRoot] : []
}

async function getWindowsTrashRoots(): Promise<string[]> {
  const script = `
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $roots = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2 OR DriveType=3" |
      ForEach-Object { Join-Path (Join-Path $_.DeviceID '$Recycle.Bin') $sid } |
      Where-Object { Test-Path -LiteralPath $_ -PathType Container })
    ConvertTo-Json -InputObject @($roots) -Compress
  `

  const encodedScript = Buffer.from(script, 'utf16le').toString('base64')

  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        encodedScript,
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout)
        }
      },
    )
  })

  const trimmedOutput = output.trim()

  if (!trimmedOutput) {
    return []
  }

  const parsed: unknown = JSON.parse(trimmedOutput)
  const roots = Array.isArray(parsed) ? parsed : [parsed]

  return roots.filter((root): root is string => typeof root === 'string')
}

async function canonicalDirectory(path: string): Promise<string | null> {
  try {
    if (!(await stat(path)).isDirectory()) {
      return null
    }

    return await realpath(path)
  } catch {
    return null
  }
}
