import type {
  IconifyIconHTMLElement,
  IconifyIconProperties,
} from 'iconify-icon'
import type * as React from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'iconify-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<IconifyIconHTMLElement>,
        IconifyIconHTMLElement
      > &
        IconifyIconProperties
    }
  }
}
