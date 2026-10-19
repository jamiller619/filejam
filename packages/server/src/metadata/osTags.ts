import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeTags } from './tags.js'

const exec = promisify(execFile)

// File paths are data passed through the environment, never shell source.
const windowsScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$shell = New-Object -ComObject Shell.Application
$result = @{}
foreach ($path in (ConvertFrom-Json $env:FILES_TAG_PATHS)) {
  try {
    $folder = $shell.Namespace([System.IO.Path]::GetDirectoryName($path))
    $item = $folder.ParseName([System.IO.Path]::GetFileName($path))
    if ($null -eq $item) { throw 'Unable to read file properties' }
    $result[$path] = @{ tags = @($item.ExtendedProperty('System.Keywords') | Where-Object { $_ -is [string] }) }
  } catch { $result[$path] = @{ error = $_.Exception.Message } }
}
ConvertTo-Json -InputObject $result -Depth 4 -Compress
`

const linuxScript = `
import errno, json, os
result = {}
for path in json.loads(os.environ['FILES_TAG_PATHS']):
    try:
        tags = os.getxattr(path, 'user.xdg.tags', follow_symlinks=False).decode('utf-8').split(',')
        result[path] = {'tags': tags}
    except OSError as error:
        if error.errno in (errno.ENODATA, errno.ENOTSUP):
            result[path] = {'tags': []}
        else:
            result[path] = {'error': str(error)}
    except Exception as error:
        result[path] = {'error': str(error)}
print(json.dumps(result))
`

type OsTagResult = { tags: string[] } | { error: string }

export async function readOsTags(
  paths: string[],
): Promise<Record<string, OsTagResult>> {
  if (process.platform === 'darwin') {
    const result: Record<string, OsTagResult> = {}

    for (const path of paths) {
      try {
        const { stdout } = await exec(
          '/usr/bin/xattr',
          ['-px', 'com.apple.metadata:_kMDItemUserTags', path],
          { timeout: 5000, maxBuffer: 1024 * 1024 },
        )

        const plist = Buffer.from(stdout.replace(/\s/g, ''), 'hex')

        const json = await new Promise<string>((resolve, reject) => {
          const child = execFile(
            '/usr/bin/plutil',
            ['-convert', 'json', '-o', '-', '-'],
            { timeout: 5000 },
            (error, output) => (error ? reject(error) : resolve(output)),
          )

          child.stdin?.on('error', reject)
          child.stdin?.end(plist)
        })

        const tags: unknown = JSON.parse(json)

        if (
          !Array.isArray(tags) ||
          !tags.every((tag) => typeof tag === 'string')
        ) {
          throw new Error('Invalid Finder tags')
        }

        result[path] = {
          tags: normalizeTags(
            tags.map((tag: string) => tag.replace(/\n[0-7]$/, '')),
          ),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        result[path] = /No such xattr/.test(message)
          ? { tags: [] }
          : { error: message }
      }
    }

    return result
  }

  if (process.platform !== 'win32' && process.platform !== 'linux') {
    return Object.fromEntries(
      paths.map((path) => [
        path,
        { error: 'OS tags are unsupported on this platform' },
      ]),
    )
  }

  const command = process.platform === 'win32' ? 'powershell.exe' : 'python3'

  const args =
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(windowsScript, 'utf16le').toString('base64'),
        ]
      : ['-c', linuxScript]

  const { stdout } = await exec(command, args, {
    env: { ...process.env, FILES_TAG_PATHS: JSON.stringify(paths) },
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })

  const result: Record<string, OsTagResult> = JSON.parse(
    stdout.replace(/^\uFEFF/, ''),
  )

  for (const path of paths) {
    const value = result[path]

    if (
      !value ||
      !('tags' in value) ||
      !Array.isArray(value.tags) ||
      !value.tags.every((tag) => typeof tag === 'string')
    ) {
      result[path] = {
        error:
          value && 'error' in value
            ? String(value.error)
            : 'Invalid OS tag response',
      }
    } else {
      result[path] = { tags: normalizeTags(value.tags) }
    }
  }

  return result
}
