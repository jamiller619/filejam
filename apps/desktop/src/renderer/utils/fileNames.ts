export function fileNameForDisplay(name: string, showExtension: boolean) {
  if (showExtension) {
    return name
  }

  const extensionSeparator = name.lastIndexOf('.')

  if (extensionSeparator <= 0) {
    return name
  }

  return name.slice(0, extensionSeparator)
}
