import {
  type CustomIcon,
  type IconTarget,
  iconTargetKey,
} from '@filejam/server/icons'
import { Icon, Menu, MenuItem } from '@filejam/ui'
import { Icon as LibraryIcon } from '@iconify/react'
import { css } from 'inline-css-modules'
import { type ReactNode, useState } from 'react'
import { useAppearance } from './AppearanceProvider.js'
import { libraryIcons } from './library.js'

const styles = css`
  .icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
  }

  .icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .icon[data-color='gray'] {
    color: var(--suzy-gray-11);
  }

  .icon[data-color='red'] {
    color: light-dark(#ce2c31, #ff6369);
  }

  .icon[data-color='orange'] {
    color: light-dark(#cc4e00, #ffa057);
  }

  .icon[data-color='yellow'] {
    color: light-dark(#946800, #f5d90a);
  }

  .icon[data-color='green'] {
    color: light-dark(#18794e, #4cc38a);
  }

  .icon[data-color='blue'] {
    color: light-dark(#006adc, #70b8ff);
  }

  .icon[data-color='purple'] {
    color: light-dark(#8145b5, #be93e4);
  }

  .icon[data-color='pink'] {
    color: light-dark(#cd1d8d, #f65cb6);
  }

  .button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px;
    border: 0;
    border-radius: var(--suzy-radius-2);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .button:hover {
    background: var(--suzy-gray-5);
  }

  .button:focus-visible {
    outline: 2px solid var(--suzy-accent-9);
    outline-offset: 2px;
  }
`

export function CustomIconImage({
  icon,
  size = 20,
  fallback = <Icon name="folder" size={size} />,
  onError,
}: {
  icon: CustomIcon | null
  size?: number
  fallback?: ReactNode
  onError?: () => void
}) {
  const [failedAsset, setFailedAsset] = useState('')
  const data = icon?.kind === 'library' ? libraryIcons[icon.name] : undefined
  const upload =
    icon?.kind === 'upload' && icon.assetId !== failedAsset
      ? icon.assetId
      : null

  return (
    <span
      className={styles.icon}
      style={{ width: size, height: size }}
      data-color={icon?.kind === 'library' ? icon.color : undefined}
      aria-hidden="true"
    >
      {data ? (
        <LibraryIcon icon={data} width={size} height={size} />
      ) : upload ? (
        <img
          src={`filejam-icon://asset/${upload}`}
          alt=""
          onError={() => {
            setFailedAsset(upload)
            onError?.()
          }}
        />
      ) : (
        fallback
      )}
    </span>
  )
}

export default function ItemIcon({
  target,
  size,
  fallback,
}: {
  target: IconTarget
  size: number
  fallback?: ReactNode
}) {
  const { icons } = useAppearance()
  const icon = icons.get(iconTargetKey(target)) ?? null

  if (!icon && fallback === null) {
    return null
  }

  return <CustomIconImage icon={icon} size={size} fallback={fallback} />
}

export function IconButton({
  target,
  name,
  label = false,
  fallback,
  size = 20,
}: {
  target: IconTarget
  name: string
  label?: boolean
  fallback?: ReactNode
  size?: number
}) {
  const { edit } = useAppearance()

  return (
    <button
      type="button"
      className={styles.button}
      title={`Change icon for ${name}`}
      aria-label={`Change icon for ${name}`}
      onClick={() => edit(target, name)}
    >
      <ItemIcon target={target} fallback={fallback} size={size} />
      {label && <span>Change icon</span>}
    </button>
  )
}

export function IconMenu({
  target,
  name,
}: {
  target: IconTarget
  name: string
}) {
  const { edit } = useAppearance()

  return (
    <Menu
      label={`Options for ${name}`}
      trigger={<span aria-hidden="true">...</span>}
    >
      <MenuItem onClick={() => edit(target, name)}>Change icon...</MenuItem>
    </Menu>
  )
}
