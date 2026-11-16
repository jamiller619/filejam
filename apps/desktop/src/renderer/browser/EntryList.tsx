import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import type { Entry } from '../../browser/protocol.js'

type EntryListProps = {
  entries: Entry[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  onActivate: (index: number) => void
  generation: number
}

export default function EntryList({
  entries,
  selectedIndex,
  onSelect,
  onActivate,
}: EntryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    getItemKey: (index) => entries[index]?.path ?? index,
    overscan: 8,
  })

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const currentIndex =
        selectedIndex ?? (event.key === 'ArrowDown' ? -1 : entries.length)
      const nextIndex = Math.max(
        0,
        Math.min(
          entries.length - 1,
          currentIndex + (event.key === 'ArrowDown' ? 1 : -1),
        ),
      )

      if (entries.length > 0) {
        onSelect(nextIndex)
        virtualizer.scrollToIndex(nextIndex)
      }
    } else if (event.key === 'Enter' && selectedIndex !== null) {
      event.preventDefault()
      onActivate(selectedIndex)
    }
  }

  return (
    <div
      ref={scrollRef}
      data-testid="entry-list"
      role="listbox"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        position: 'relative',
      }}
      className="browser-entry-list"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const entry = entries[row.index]
          if (!entry) {
            return null
          }

          return (
            <div
              key={entry.path}
              data-index={row.index}
              data-entry-path={entry.path}
              data-entry-kind={entry.kind}
              role="option"
              tabIndex={-1}
              aria-selected={selectedIndex === row.index}
              onClick={() => onSelect(row.index)}
              onDoubleClick={() => onActivate(row.index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onActivate(row.index)
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: 32,
                transform: `translateY(${row.start}px)`,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 120px',
                alignItems: 'center',
                padding: '0 8px',
                boxSizing: 'border-box',
                background:
                  selectedIndex === row.index
                    ? 'var(--suzy-accent-3)'
                    : undefined,
              }}
            >
              <span
                data-testid="entry-name"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.name}
              </span>
              <span>{entry.kind}</span>
            </div>
          )
        })}
      </div>
      <style>{`.browser-entry-list:focus-visible { outline: 2px solid var(--suzy-accent-9); outline-offset: -2px; }`}</style>
    </div>
  )
}
