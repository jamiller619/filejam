import {
  type CustomIcon,
  type IconColor,
  iconCategories,
  iconColors,
  parseIcon,
} from '@filejam/server/icons'
import { Button, Dialog, Select } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useId, useState } from 'react'
import { CustomIconImage } from './ItemIcon.js'

const styles = css`
  .tabs, .actions, .colors {
    display: flex;
    gap: 8px;
    margin-block: 12px;
    align-items: center;
  }

  .actions {
    justify-content: space-between;
    margin-bottom: 0;
  }

  .search {
    width: 100%;
    box-sizing: border-box;
    padding: 9px;
    border: 1px solid var(--suzy-gray-7);
    border-radius: var(--suzy-radius-2);
    background: var(--suzy-gray-1);
    margin-bottom: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    /* gap: 7px; */
    max-height: 240px;
    overflow: auto;
    /* padding: 3px; */
    margin-top: 12px;
  }

  .grid button {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    /* padding: 3px; */
  }

  .colors {
    flex-wrap: wrap;
    padding: 0;
    border: 0;
  }

  .colors button {
    padding: 5px;
  }

  .upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 20px 0;
  }

  .error {
    color: var(--suzy-danger-11);
    margin-top: 12px;
  }

`

function recentIcons(): CustomIcon[] {
  try {
    const stored = JSON.parse(
      localStorage.getItem('filejam:recent-icons') ?? '[]',
    )

    return Array.isArray(stored)
      ? stored.slice(0, 12).flatMap((value) => {
          try {
            const icon = parseIcon(value)

            return icon?.kind === 'library' ? [icon] : []
          } catch {
            return []
          }
        })
      : []
  } catch {
    return []
  }
}

export default function IconPicker({
  name,
  current,
  onSave,
  onClose,
}: {
  name: string
  current: CustomIcon | null
  onSave: (icon: CustomIcon | null) => Promise<void>
  onClose: () => void
}) {
  const titleId = useId()
  const [tab, setTab] = useState<'icons' | 'upload'>('icons')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [color, setColor] = useState<IconColor>(
    current?.kind === 'library' ? current.color : 'default',
  )
  const [selected, setSelected] = useState<CustomIcon | null>(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent] = useState(recentIcons)

  async function save(icon: CustomIcon | null) {
    setBusy(true)
    setError('')

    try {
      await onSave(icon)

      if (icon?.kind === 'library') {
        try {
          localStorage.setItem(
            'filejam:recent-icons',
            JSON.stringify(
              [
                icon,
                ...recent.filter(
                  (item) => item.kind !== 'library' || item.name !== icon.name,
                ),
              ].slice(0, 12),
            ),
          )
        } catch {
          // Saving an icon must not depend on optional recent-history storage.
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save icon.')
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    setBusy(true)
    setError('')

    try {
      const icon = await window.filejam.appearance.import()

      if (icon) {
        setSelected(icon)
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to import image.',
      )
    } finally {
      setBusy(false)
    }
  }

  const choices =
    category === 'Recent'
      ? recent.flatMap((icon) =>
          icon.kind === 'library' ? [icon.name.slice(7)] : [],
        )
      : Object.entries(iconCategories).flatMap(([group, names]) =>
          category === 'All' || category === group ? [...names] : [],
        )
  const filtered = choices.filter((name) =>
    name.replaceAll('-', ' ').includes(search.toLowerCase().trim()),
  )

  return (
    <Dialog
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) {
          onClose()
        }
      }}
    >
      <h2 id={titleId}>Change icon</h2>
      <p>{name}</p>
      <div className={styles.tabs}>
        <button
          type="button"
          aria-pressed={tab === 'icons'}
          onClick={() => setTab('icons')}
        >
          Icons
        </button>
        <button
          type="button"
          aria-pressed={tab === 'upload'}
          onClick={() => setTab('upload')}
        >
          Upload
        </button>
      </div>
      {tab === 'icons' ? (
        <>
          <input
            className={styles.search}
            type="search"
            placeholder="Search icons…"
            aria-label="Search icons"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            label="Icon category"
            value={category}
            displayValue={category}
            onValueChange={(value) => value !== null && setCategory(value)}
          >
            {['All', 'Recent', ...Object.keys(iconCategories)].map((name) => (
              <Select.MenuItem key={name} value={name}>
                {name}
              </Select.MenuItem>
            ))}
          </Select>
          <fieldset className={styles.colors} aria-label="Icon color">
            {iconColors.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} color`}
                title={value}
                aria-pressed={color === value}
                onClick={() => {
                  setColor(value)

                  setSelected((current) =>
                    current?.kind === 'library'
                      ? { ...current, color: value }
                      : current,
                  )
                }}
              >
                <CustomIconImage
                  icon={{
                    kind: 'library',
                    name: 'lucide:circle',
                    color: value,
                  }}
                  fallback={<span>●</span>}
                  size={18}
                />
              </button>
            ))}
          </fieldset>
          <div className={styles.grid} role="toolbar" aria-label="Icon library">
            {filtered.map((name) => (
              <Button
                key={name}
                variant="ghost"
                title={name.replaceAll('-', ' ')}
                aria-label={name.replaceAll('-', ' ')}
                aria-pressed={
                  selected?.kind === 'library' &&
                  selected.name === `lucide:${name}`
                }
                onClick={() =>
                  setSelected({
                    kind: 'library',
                    name: `lucide:${name}`,
                    color,
                  })
                }
              >
                <CustomIconImage
                  icon={{ kind: 'library', name: `lucide:${name}`, color }}
                  size={24}
                />
              </Button>
            ))}
          </div>
          {filtered.length === 0 && <p role="status">No icons found.</p>}
        </>
      ) : (
        <div className={styles.upload}>
          <CustomIconImage icon={selected} size={72} />
          <button type="button" disabled={busy} onClick={() => void upload()}>
            Choose image…
          </button>
          <p>PNG, JPEG, or WebP · Up to 2 MB</p>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void save(null)}>
          Reset to default
        </Button>
        <Button disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || !selected}
          onClick={() => void save(selected)}
        >
          {busy ? 'Saving...' : 'Apply'}
        </Button>
      </div>
    </Dialog>
  )
}
