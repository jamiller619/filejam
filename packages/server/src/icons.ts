export const iconCategories = {
  Work: [
    'briefcase',
    'building',
    'calendar',
    'chart-bar',
    'clipboard',
    'clock',
    'flag',
    'inbox',
    'mail',
    'notebook',
    'presentation',
    'target',
  ],
  Projects: [
    'archive',
    'box',
    'code',
    'database',
    'file-code',
    'folder',
    'folder-open',
    'git-branch',
    'layers',
    'lightbulb',
    'rocket',
    'wrench',
  ],
  Media: [
    'camera',
    'clapperboard',
    'film',
    'headphones',
    'image',
    'mic',
    'music',
    'palette',
    'play',
    'video',
    'volume-2',
    'wand',
  ],
  People: [
    'baby',
    'contact',
    'heart',
    'laugh',
    'message-circle',
    'smile',
    'star',
    'thumbs-up',
    'user',
    'users',
    'handshake',
    'gift',
  ],
  Places: [
    'compass',
    'earth',
    'house',
    'map',
    'map-pin',
    'mountain',
    'plane',
    'ship',
    'tent',
    'train-front',
    'trees',
    'car',
  ],
  Everyday: [
    'book',
    'bookmark',
    'coffee',
    'download',
    'file',
    'flame',
    'gamepad-2',
    'graduation-cap',
    'key',
    'lock',
    'shopping-bag',
    'sun',
  ],
} as const

export const iconNames = Object.values(iconCategories).flat()
export const iconColors = [
  'default',
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
] as const

export type IconColor = (typeof iconColors)[number]
export type CustomIcon =
  | { kind: 'library'; name: string; color: IconColor }
  | { kind: 'upload'; assetId: string }

export type IconTarget =
  | { kind: 'entry'; libraryId: number; relativePath: string }
  | { kind: 'collection'; id: string }

export function parseIcon(value: unknown): CustomIcon | null {
  if (value === null) {
    return null
  }

  if (typeof value !== 'object' || !value) {
    throw new Error('Invalid icon')
  }

  const icon = value as Record<string, unknown>

  if (
    icon.kind === 'library' &&
    typeof icon.name === 'string' &&
    iconNames.some((name) => `lucide:${name}` === icon.name) &&
    iconColors.some((color) => color === icon.color)
  ) {
    return { kind: 'library', name: icon.name, color: icon.color as IconColor }
  }

  if (
    icon.kind === 'upload' &&
    typeof icon.assetId === 'string' &&
    /^[a-f0-9]{64}$/.test(icon.assetId)
  ) {
    return { kind: 'upload', assetId: icon.assetId }
  }

  throw new Error('Invalid icon')
}

export function iconTargetKey(target: IconTarget) {
  return target.kind === 'collection'
    ? JSON.stringify(['collection', target.id])
    : JSON.stringify(['entry', target.libraryId, target.relativePath])
}
