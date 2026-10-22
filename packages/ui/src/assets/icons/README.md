# Icons

Original SVGs copied from `C:\Users\jamil\sf-symbols-svgs`. The React
component in `../../components/Icon.tsx` preserves their paths, transforms,
24 × 24 viewBox, and `currentColor` fills.

| Icon name | Source SVG |
| --- | --- |
| `settings` | `gearshape.svg` |
| `desktop` | `desktopcomputer.svg` |
| `music` | `music.note.svg` |
| `videos` | `film.svg` |
| `folder` | `folder.svg` |
| `documents` | `text.page.svg` |
| `add` | `plus.svg` |
| `chevron-left` | `chevron.left.svg` |
| `chevron-right` | `chevron.right.svg` |
| `chevron-up` | `chevron.up.svg` |
| `checkmark` | `checkmark.svg` |
| `home` | `house.svg` |
| `clock` | `clock.svg` |
| `star` | `star.svg` |
| `download` | `arrow.down.to.line.svg` |
| `edit` | `square.and.pencil.svg` |
| `trash` | `trash.svg` |
| `image` | `photo.svg` |
| `hard-drive` | `internaldrive.svg` |
| `list` | `list.bullet.svg` |
| `columns` | `rectangle.split.3x1.svg` |
| `magnifying-glass` | `magnifyingglass.svg` |
| `close` | `xmark.svg` |
| `hide-details` | `inset.filled.righthalf.arrow.right.rectangle.svg` |

```tsx
import { Icon } from '@files/ui'

<Icon name="folder" size={20} />
<Icon name="download" aria-label="Download" />
<button aria-label="Close"><Icon name="close" size="1em" /></button>
```

Icons are decorative by default. Give a standalone icon an `aria-label` or
`aria-labelledby` when it conveys meaning. For icon-only buttons, label the
button. Standard SVG props, including `className`, `style`, and `ref`, are
forwarded. Use CSS `color` to change the icon color. `close` covers both
cancel and close actions.

## Adding an icon

1. Search `C:\Users\jamil\sf-symbols-svgs` (WSL:
   `/mnt/c/Users/jamil/sf-symbols-svgs`) first. Use
   `rg --files --hidden --no-ignore` because the source may be ignored.
   Check descriptive alternatives when a symbol name is absent; this collection
   uses `text.page.svg` for the Documents page-with-text icon.
2. Copy the original SVG into this directory. Preserve its geometry, transforms,
   viewBox, and fills when adding its JSX to `components/Icon.tsx`.
3. Add a semantic name to the `icons` map; `IconName` updates automatically.
4. Update this table and the relevant consumer, including the Navbar folder map
   when adding a special folder icon.
5. Run the TypeScript check and focused formatting checks.
