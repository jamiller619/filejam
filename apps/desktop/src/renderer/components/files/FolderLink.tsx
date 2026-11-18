import type { ComponentPropsWithRef } from 'react'
import { Link, useNavigate } from 'react-router'

/** Pointer clicks select folders; keyboard activation still follows the link. */
export default function FolderLink({
  onClick,
  onDoubleClick,
  ...props
}: ComponentPropsWithRef<typeof Link>) {
  const navigate = useNavigate()

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event)

        if (event.detail > 0) {
          event.preventDefault()
        }
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event)

        if (
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        void navigate(props.to, { viewTransition: !!props.viewTransition })
      }}
    />
  )
}
