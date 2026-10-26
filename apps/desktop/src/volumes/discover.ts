import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { VolumeInput } from '@filejam/server'

export async function discoverVolumes(): Promise<VolumeInput[]> {
  if (process.platform === 'win32') {
    return discoverWindowsVolumes()
  }

  if (process.platform === 'darwin') {
    return discoverMacVolumes()
  }

  return discoverLinuxVolumes()
}

async function discoverWindowsVolumes(): Promise<VolumeInput[]> {
  const script = `
    $drives = @(Get-CimInstance Win32_LogicalDisk |
      Where-Object { $_.DriveType -in 2, 3, 4 } |
      Select-Object DeviceID, VolumeName, DriveType)
    ConvertTo-Json -InputObject @($drives) -Compress
  `
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
  const output = await run('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-EncodedCommand',
    encodedScript,
  ])
  const parsed: unknown = JSON.parse(output || '[]')
  const drives = Array.isArray(parsed) ? parsed : [parsed]
  const systemDrive = process.env.SystemDrive?.toLowerCase()

  return drives.flatMap((drive) => {
    if (!isWindowsDrive(drive)) {
      return []
    }

    const rootPath = `${drive.DeviceID}\\`
    const kind =
      drive.DriveType === 2
        ? 'removable'
        : drive.DriveType === 4
          ? 'network'
          : drive.DeviceID.toLowerCase() === systemDrive
            ? 'system'
            : 'internal'

    return [
      {
        name: drive.VolumeName?.trim() || drive.DeviceID,
        rootPath,
        kind,
      } satisfies VolumeInput,
    ]
  })
}

async function discoverMacVolumes(): Promise<VolumeInput[]> {
  const volumes: VolumeInput[] = [
    { name: 'Macintosh HD', rootPath: '/', kind: 'system' },
  ]

  for (const name of await safeReadDirectory('/Volumes')) {
    const rootPath = await canonicalDirectory(join('/Volumes', name))

    if (rootPath && rootPath !== '/') {
      volumes.push({ name, rootPath, kind: 'external' })
    }
  }

  return volumes
}

async function discoverLinuxVolumes(): Promise<VolumeInput[]> {
  const volumes = new Map<string, VolumeInput>([
    ['/', { name: 'Computer', rootPath: '/', kind: 'system' }],
  ])

  try {
    const mountInfo = await readFile('/proc/self/mountinfo', 'utf8')

    for (const line of mountInfo.split('\n')) {
      const separator = line.indexOf(' - ')

      if (separator < 0) {
        continue
      }

      const before = line.slice(0, separator).split(' ')
      const after = line.slice(separator + 3).split(' ')
      const mountPath = decodeMountPath(before[4] ?? '')
      const filesystem = after[0] ?? ''

      if (!isVisibleLinuxMount(mountPath)) {
        continue
      }

      const rootPath = await canonicalDirectory(mountPath)

      if (!rootPath || volumes.has(rootPath)) {
        continue
      }

      const kind = ['nfs', 'nfs4', 'cifs', 'smb3', 'sshfs'].includes(filesystem)
        ? 'network'
        : 'external'

      volumes.set(rootPath, {
        name: basename(rootPath) || rootPath,
        rootPath,
        kind,
      })
    }
  } catch {
    // The system volume remains available when mount metadata cannot be read.
  }

  return [...volumes.values()]
}

function isVisibleLinuxMount(path: string) {
  return (
    path.startsWith('/media/') ||
    path.startsWith('/mnt/') ||
    path.startsWith('/run/media/')
  )
}

function decodeMountPath(path: string) {
  return path.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

async function safeReadDirectory(path: string) {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

async function canonicalDirectory(path: string) {
  try {
    if (!(await stat(path)).isDirectory()) {
      return null
    }

    return await realpath(path)
  } catch {
    return null
  }
}

function run(file: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      file,
      args,
      { windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.trim())
        }
      },
    )
  })
}

function isWindowsDrive(
  value: unknown,
): value is { DeviceID: string; VolumeName?: string; DriveType: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'DeviceID' in value &&
    typeof value.DeviceID === 'string' &&
    'DriveType' in value &&
    typeof value.DriveType === 'number'
  )
}
