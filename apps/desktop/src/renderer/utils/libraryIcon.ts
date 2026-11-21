import type { IconName } from '@filejam/ui'
import type { Locations } from '../../browser/locations.js'
import { normalizePath } from './normalizePath.js'

const folderIcons: Readonly<Partial<Record<string, IconName>>> = {
  applications: 'grid',
  desktop: 'desktop',
  music: 'music',
  videos: 'video',
  pictures: 'image',
  downloads: 'download',
  documents: 'document',
}

export function getLocationIcon(
  locations: Locations | null,
  path: string | undefined,
): IconName | undefined {
  if (!locations || !path) {
    return undefined
  }

  const normalizedPath = normalizePath(path)

  if (normalizePath(locations.home) === normalizedPath) {
    return 'user'
  }

  if (
    locations.drives.some(
      (drive) => normalizePath(drive.path) === normalizedPath,
    )
  ) {
    return 'hardDrive'
  }

  const place = locations.places.find(
    (location) => normalizePath(location.path) === normalizedPath,
  )

  return place ? folderIcons[place.name.toLowerCase()] : undefined
}
