import { Surface } from '@filejam/ui'
import { css } from 'inline-css-modules'
import {
  type Positioner,
  type RenderComponentProps,
  useMasonry,
  useResizeObserver as useMasonryResizeObserver,
  usePositioner,
} from 'masonic'
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const masonryGap = 8

const styles = css`
  .surface {
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .section + .section {
    margin-block-start: var(--suzy-space-2);
  }
  .masonry {
    padding: 0;
    margin: 0;
    list-style: none;
  }
`

export type MasonryItem = {
  key: string | number
  content: ReactNode
}

export type MasonrySection = {
  key: string
  heading?: ReactNode
  items: MasonryItem[]
}

type MasonryContainerProps = {
  sections: MasonrySection[]
  'aria-label': string
  cardSize?: number
}

function ItemContent({ data }: RenderComponentProps<MasonryItem>) {
  return data.content
}

function MasonryList({
  items,
  label,
  cardSize,
}: {
  items: MasonryItem[]
  label: string
  cardSize: number
}) {
  // Masonic replaces its list after the first client render, so measure a
  // stable parent that keeps its observer across that replacement.
  const measurementRef = useRef<HTMLDivElement | null>(null)
  const masonryRef = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const container = measurementRef.current

    if (!container) {
      return
    }

    const updateWidth = () => setWidth(container.clientWidth)
    const observer = new ResizeObserver(updateWidth)

    updateWidth()
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  const masonryPositioner = usePositioner({
    width,
    columnWidth: cardSize,
    columnGutter: masonryGap,
    rowGutter: masonryGap,
  })
  const positioner = useMemo<Positioner>(
    () => ({
      ...masonryPositioner,
      range: (low, high, renderItem) => {
        const itemsInSourceOrder: Parameters<typeof renderItem>[] = []

        masonryPositioner.range(low, high, (...item) => {
          itemsInSourceOrder.push(item)
        })
        itemsInSourceOrder.sort(
          ([leftIndex], [rightIndex]) => leftIndex - rightIndex,
        )

        for (const item of itemsInSourceOrder) {
          renderItem(...item)
        }
      },
    }),
    [masonryPositioner],
  )
  const resizeObserver = useMasonryResizeObserver(positioner)

  const masonry = useMasonry({
    positioner,
    resizeObserver,
    items,
    as: 'ul',
    className: styles.masonry ?? '',
    role: 'list',
    tabIndex: -1,
    containerRef: masonryRef,
    itemAs: 'li',
    itemStyle: { listStyle: 'none' },
    itemKey: (item) => item.key,
    height: Number.MAX_SAFE_INTEGER,
    scrollTop: 0,
    overscanBy: 1,
    render: ItemContent,
    style: { visibility: width === 0 ? 'hidden' : undefined },
  })

  useLayoutEffect(() => {
    masonryRef.current?.setAttribute('aria-label', label)
  })

  return <div ref={measurementRef}>{masonry}</div>
}

export default function MasonryContainer({
  sections,
  'aria-label': label,
  cardSize = 150,
}: MasonryContainerProps) {
  return (
    <Surface className={styles.surface}>
      {sections.map((section) => (
        <div className={styles.section} key={section.key}>
          {section.heading}
          {section.items.length > 0 && (
            <MasonryList
              items={section.items}
              label={label}
              cardSize={cardSize}
            />
          )}
        </div>
      ))}
    </Surface>
  )
}
