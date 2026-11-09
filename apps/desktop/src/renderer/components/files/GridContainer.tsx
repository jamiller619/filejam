import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from 'inline-css-modules'
import {
  Children,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { findVerticalScrollElement } from './fileScroll.js'

const gridGap = 8

const styles = css`
  .grid {
    position: relative;
    padding: var(--suzy-space-2) 0;
    margin: 0;
    list-style: none;
  }
  .row {
    position: absolute;
    inset-inline: 0;
    top: 0;
    display: grid;
    grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
    gap: var(--suzy-space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .row > ul {
    display: contents;
  }
`

type GridContainerProps = {
  children: ReactNode
  'aria-label': string
  cardSize?: number
}

export default function GridContainer({
  children,
  'aria-label': label,
  cardSize = 150,
}: GridContainerProps) {
  const containerRef = useRef<HTMLUListElement>(null)
  const [width, setWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)
  const items = useMemo(() => Children.toArray(children), [children])
  const columnCount = Math.max(
    1,
    Math.floor((width + gridGap) / (cardSize + gridGap)),
  )
  const rows = useMemo(() => {
    const nextRows: ReactNode[][] = []
    let nextRow: ReactNode[] = []

    for (const item of items) {
      const isHeading =
        isValidElement<{ 'data-group-heading'?: string }>(item) &&
        item.props['data-group-heading'] === 'true'

      if (isHeading) {
        if (nextRow.length > 0) {
          nextRows.push(nextRow)
          nextRow = []
        }

        nextRows.push([item])
        continue
      }

      nextRow.push(item)

      if (nextRow.length === columnCount) {
        nextRows.push(nextRow)
        nextRow = []
      }
    }

    if (nextRow.length > 0) {
      nextRows.push(nextRow)
    }

    return nextRows
  }, [columnCount, items])
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => findVerticalScrollElement(containerRef.current),
    estimateSize: () => cardSize + 48 + gridGap,
    overscan: 3,
    scrollMargin,
  })

  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const updateMeasurements = () => {
      const scrollElement = findVerticalScrollElement(container)

      setWidth(container.clientWidth)

      if (scrollElement) {
        setScrollMargin(
          container.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop,
        )
      }
    }
    const observer = new ResizeObserver(updateMeasurements)

    updateMeasurements()
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return (
    <ul
      ref={containerRef}
      className={styles.grid}
      style={{ height: rowVirtualizer.getTotalSize() }}
      aria-label={label}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => (
        <li
          key={virtualRow.key}
          ref={rowVirtualizer.measureElement}
          className={styles.row}
          data-index={virtualRow.index}
          role="presentation"
          style={
            {
              '--grid-columns': columnCount,
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            } as CSSProperties
          }
        >
          <ul role="presentation">{rows[virtualRow.index]}</ul>
        </li>
      ))}
    </ul>
  )
}
