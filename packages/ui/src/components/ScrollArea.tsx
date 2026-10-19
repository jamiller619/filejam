import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import { css } from 'inline-css-modules'

const styles = css`
  .scrollArea {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    --scrollbar-size: 10px;
  }

  .viewport {
    width: 100%;
    height: 100%;
    border-radius: inherit;
  }

  .content {
    min-width: 100%;
  }

  .scrollBar {
    display: flex;
    width: var(--scrollbar-size);
    padding: 2px;
    touch-action: none;
    user-select: none;
    border-radius: var(--suzy-radius-full);
    background-color: var(--suzy-gray-1);
    opacity: 0;
    transition: opacity var(--suzy-duration-normal)
      var(--suzy-ease-standard);

    &[data-hovering],
    &[data-scrolling] {
      opacity: 1;
    }
  }

  .thumb {
    position: relative;
    flex: 1;
    border-radius: var(--suzy-radius-full);
    background-color: var(--suzy-gray-a9);

    &::before {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      min-width: 44px;
      height: 100%;
      min-height: 44px;
      content: "";
      transform: translate(-50%, -50%);
    }
  }
`

export default function ScrollArea({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <BaseScrollArea.Root className={styles.scrollArea}>
      <BaseScrollArea.Viewport className={styles.viewport}>
        <BaseScrollArea.Content className={styles.content}>
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar className={styles.scrollBar}>
        <BaseScrollArea.Thumb className={styles.thumb} />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  )
}
