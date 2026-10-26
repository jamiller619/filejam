import { win32 } from 'node:path'
export type DefaultFolder =
  | 'applications'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'

type GetElectronPath = (name: Exclude<DefaultFolder, 'applications'>) => string

/** Resolve sidebar shortcuts to each OS's native folders. */
export function resolveDefaultFolder(
  folder: DefaultFolder,
  getElectronPath: GetElectronPath,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (folder !== 'applications') {
    return getElectronPath(folder)
  }

  if (platform === 'darwin') {
    return '/Applications'
  }

  if (platform === 'linux') {
    return '/usr/share/applications'
  }

  if (platform === 'win32') {
    const programData = environment.ProgramData ?? environment.PROGRAMDATA

    if (!programData) {
      throw new Error('ProgramData is unavailable')
    }

    return win32.join(
      programData,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    )
  }

  throw new Error(`Unsupported application platform: ${platform}`)
}
