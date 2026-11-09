import { writeFile } from 'node:fs/promises'
import { iconNames } from '@filejam/server/icons'
import { icons } from '@iconify-json/lucide'

const selected = Object.fromEntries(
  iconNames.map((name) => {
    const icon = icons.icons[name]

    if (!icon) {
      throw new Error(`Missing bundled icon: ${name}`)
    }

    return [
      `lucide:${name}`,
      { width: icons.width ?? 24, height: icons.height ?? 24, ...icon },
    ]
  }),
)

await writeFile(
  new URL('../src/renderer/components/icons/library.json', import.meta.url),
  `${JSON.stringify(selected, null, 2)}\n`,
)
