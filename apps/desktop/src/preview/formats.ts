const imageTypes: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

export function previewMimeType(name: string): string | undefined {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return Object.hasOwn(imageTypes, extension)
    ? imageTypes[extension]
    : undefined
}
