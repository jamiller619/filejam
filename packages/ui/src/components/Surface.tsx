import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ElementType } from 'react'
import type { PolymorphicProps } from '../polymorphic.js'
import type { Size } from './@types.js'

export type SurfaceOwnProps = {
  className?: string | undefined
  radius?: Size
}

export type SurfaceProps<T extends ElementType = 'div'> = PolymorphicProps<
  T,
  SurfaceOwnProps
>

export const styles = css`
  .surface {
    background: oklch(from var(--suzy-gray-12) l c h / 10%);
    backdrop-filter: blur(14px);
    border-radius: var(--suzy-radius-3);
    corner-shape: var(--suzy-corner-shape);
    transition: background var(--suzy-duration-fast) var(--suzy-ease-enter);

    &:hover:not([disabled]),
    &:focus:not([disabled]) {
      background: lch(from var(--suzy-gray-12) l c h / 12%);
    }

    &:focus-visible {
      outline: 2px solid currentColor; outline-offset: -2px;
    }
  }

  .radius-sm {
    border-radius: var(--suzy-radius-2);
  }

  .radius-md {
    border-radius: var(--suzy-radius-3);
  }

  .radius-lg {
    border-radius: var(--suzy-radius-4);
  }
`

export default function Surface<T extends ElementType = 'div'>({
  as,
  className,
  variant = 'default',
  radius = 'md',
  ...props
}: SurfaceProps<T>) {
  const Component: ElementType = as ?? 'div'

  return (
    <Component
      {...props}
      className={clsx(
        styles.surface,
        className,
        variant && styles[`variant-${variant}`],
        radius && styles[`radius-${radius}`],
      )}
    />
  )
}
