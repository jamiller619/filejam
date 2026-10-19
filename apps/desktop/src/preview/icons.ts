import { readFile } from 'node:fs/promises'

const libraryIcons: Record<string, string> = {
  desktop: 'desktopcomputer',
  music: 'music.note',
  videos: 'film',
  pictures: 'photo',
  downloads: 'arrow.down.to.line',
  documents: 'text.page',
}

const assets = new Map<string, Promise<string>>()

function asset(name: string) {
  let result = assets.get(name)

  if (!result) {
    result = readFile(new URL(`./assets/${name}.svg`, import.meta.url), 'utf8')
    assets.set(name, result)
  }

  return result
}

export async function previewIcon({
  directory,
  variant,
  libraryName,
  color,
}: {
  directory: boolean
  variant: 'list' | 'grid'
  libraryName: string | undefined
  color: string
}) {
  if (directory && variant === 'grid') {
    let svg = (await asset('folder-art')).replace(
      'var(--folder-color, var(--suzy-accent-9))',
      color,
    )

    const overlay =
      libraryName && Object.hasOwn(libraryIcons, libraryName.toLowerCase())
        ? libraryIcons[libraryName.toLowerCase()]
        : undefined

    if (overlay) {
      const icon = (await asset(overlay)).replace(
        /<svg\b[^>]*>/,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" x="77" y="98" width="102" height="102" style="color:var(--suzy-accent-6)">',
      )

      // SVG images cannot inherit page custom properties. Mirror the theme's
      // accent-6 values; the image media query follows its embedding color scheme.
      const palette = `<style>:root { --suzy-accent-6: #a9daed; }
        @media (prefers-color-scheme: dark) { :root { --suzy-accent-6: #1b537b; } }
      </style>`

      svg = svg.replace('</svg>', `${palette}${icon}</svg>`)
    }

    return svg
  }

  const icon = await asset(directory ? 'folder' : 'text.page')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="color:${color}">${icon.replace('<svg ', '<svg x="12" y="12" ')}</svg>`
}
