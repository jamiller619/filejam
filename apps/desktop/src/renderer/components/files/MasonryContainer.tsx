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
import { findVerticalScrollElement } from './fileScroll.js'

const masonryGap = 8

const styles = css`
  .section {
    padding: var(--suzy-space-2) 0;
  }
  .section + .section {
    margin-block-start: var(--suzy-space-2);
  }
  .masonry {
    padding:0;
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
  const [viewport, setViewport] = useState({
    height: 0,
    isScrolling: false,
    scrollTop: 0,
  })

  useLayoutEffect(() => {
    const container = measurementRef.current

    if (!container) {
      return
    }

    const scrollElement = findVerticalScrollElement(container)
    let scrollEndTimer: ReturnType<typeof setTimeout> | undefined
    const updateMeasurements = (isScrolling = false) => {
      setWidth(container.clientWidth)

      if (!scrollElement) {
        return
      }

      const offset =
        container.getBoundingClientRect().top -
        scrollElement.getBoundingClientRect().top +
        scrollElement.scrollTop

      setViewport({
        height: scrollElement.clientHeight,
        isScrolling,
        scrollTop: scrollElement.scrollTop - offset,
      })
    }
    const handleScroll = () => {
      updateMeasurements(true)
      clearTimeout(scrollEndTimer)
      scrollEndTimer = setTimeout(() => updateMeasurements(false), 100)
    }
    const observer = new ResizeObserver(() => updateMeasurements())

    updateMeasurements()
    observer.observe(container)
    if (scrollElement) {
      observer.observe(scrollElement)
      scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    }

    return () => {
      clearTimeout(scrollEndTimer)
      observer.disconnect()
      scrollElement?.removeEventListener('scroll', handleScroll)
    }
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
    height: viewport.height,
    scrollTop: viewport.scrollTop,
    isScrolling: viewport.isScrolling,
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
    <>
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
    </>
  )
}
