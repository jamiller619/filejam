import type {
  IconifyIconHTMLElement,
  IconifyIconProperties,
} from 'iconify-icon'
import 'iconify-icon'
import { def, type IconLibrary } from './iconLibraries.js'

export type IconName = keyof IconLibrary

export type IconProps = React.DetailedHTMLProps<
  React.HTMLAttributes<IconifyIconHTMLElement>,
  IconifyIconHTMLElement
> &
  Omit<IconifyIconProperties, 'icon'> & {
    name: IconName | `${string}:${string}`
    size?: number | string
  }

const loadedIconLibrary = def
const loadedIconLibraryPrefix = loadedIconLibrary.name

/** Icons inherit text color and are decorative unless given an accessible label. */
export default function Icon({
  name,
  size = 24,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: IconProps) {
  const hasLabel = Boolean(ariaLabel || ariaLabelledBy)
  const icon = name.includes(':')
    ? name
    : `${loadedIconLibraryPrefix}:${loadedIconLibrary[name as keyof IconLibrary]}`

  return (
    <iconify-icon
      inline
      {...props}
      icon={icon}
      role={hasLabel ? 'img' : undefined}
      aria-hidden={hasLabel ? undefined : true}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      style={{ fontSize: `${size}px`, height: `${size}px` }}
    />
  )
}
