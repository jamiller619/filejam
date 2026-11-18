import type { IconTarget } from '@filejam/server/icons'
import { Button, Eyebrow, Icon } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, ReactNode } from 'react'
import { Link, useLocation, useNavigate, useResolvedPath } from 'react-router'
import { useSettings } from '~/hooks/useSettings.js'
import { useCollections } from '../../hooks/useCollections.js'
import { useFavoriteFolderDrop } from '../../hooks/useFavoriteFolderDrop.js'
import { useLocations } from '../../hooks/useLocations.js'
import { locationUrl } from '../../utils/folderUrl.js'
import { getLibraryIcon } from '../../utils/libraryIcon.js'
import { normalizePath } from '../../utils/normalizePath.js'
import { IconButton } from '../icons/ItemIcon.js'

const styles = css`
  .navbar {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--suzy-space-2);

    .eyebrow {
      margin-block-start: var(--suzy-space-3);
    }

    ol {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      gap: var(--suzy-space-1);
      list-style: none;
      margin: var(--suzy-space-6) 0 0;
      padding: 0;

      .item {
        display: flex;
        align-items: stretch;
        flex-shrink: 0;
        min-width: 0;
        border-radius: var(--suzy-radius-3);
        corner-shape: var(--suzy-corner-shape);
        transition: background var(--suzy-duration-fast) var(--suzy-ease-enter);

        &:hover,
        &:focus-within {
          background: lch(from var(--suzy-gray-12) l c h / 12%);
        }

        &:has(> a[aria-current='page']) {
          background: var(--suzy-accent-9);
          color: var(--suzy-accent-1);
        }

        > a,
        > a:hover,
        > a:focus,
        > button,
        > button:hover {
          background: transparent;
        }
      }

      .item > a,
      .item > button {
        box-sizing: border-box;
        min-height: calc(20px + 2 * var(--suzy-space-1));
        padding: var(--suzy-space-1) var(--suzy-space-2);
        gap: var(--suzy-space-2);
        font: inherit;
        line-height: 20px;
      }

      .item > a {
        flex: 1;
        min-width: 0;
        justify-content: start;
      }

      .item > a > span:last-child {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item:has(> button) > a {
        padding-inline-start: 0;
      }
    }

    .staticIcon {
      display: inline-flex;
      flex: 0 0 20px;
      align-items: center;
      justify-content: center;
      height: 20px;
    }

    .favorites {
      border-radius: var(--suzy-radius-3);
      outline: 2px solid transparent;
      &[data-dragging='true'] {
        outline-color: var(--suzy-accent-9);
        background: var(--suzy-gray-4);
      }
      ol { margin: 0; }
    }
    .dropHint { padding: var(--suzy-space-2); color: var(--suzy-gray-11); font-size: 0.85em; }
    .settings {
      margin-block-start: auto;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--suzy-space-2);
      padding-block: var(--suzy-space-2);

      button {
        padding: var(--suzy-space-4) 0;
        flex-direction: column;
      }
    }
  }
`

export default function Navbar(props: HTMLAttributes<HTMLDivElement>) {
  const { data: locations, loadFailed } = useLocations()
  const { collections } = useCollections()
  const { values } = useSettings(['user.favoriteFolders'])
  const favorites = values?.['user.favoriteFolders'] ?? []
  const homePath = locations ? normalizePath(locations.home) : undefined
  const homeLocation = locations?.places.find(
    (place) => normalizePath(place.path) === homePath,
  )
  const favoritePaths = new Set(favorites.map(normalizePath))
  const places =
    locations?.places.filter(
      (place) => !favoritePaths.has(normalizePath(place.path)),
    ) ?? []
  const drives =
    locations?.drives.filter(
      (drive) => !favoritePaths.has(normalizePath(drive.path)),
    ) ?? []
  const navigate = useNavigate()
  const { dropError, dropTargetProps } = useFavoriteFolderDrop()

  return (
    <nav
      {...props}
      aria-label="Main navigation"
      className={clsx(styles.navbar, props.className)}
    >
      <ol>
        <NavItem href="/" name="Home" icon={<Icon name="home" size={20} />} />
        <li className={styles.favorites} {...dropTargetProps}>
          <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
          {favorites.length === 0 && (
            <div className={styles.dropHint}>Drop folders here</div>
          )}
          <ol aria-label="Favorite folders">
            {favorites.map((path) => {
              const isHome = normalizePath(path) === homePath
              const folderName =
                path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

              return (
                <NavItem
                  key={path}
                  href={locationUrl(path)}
                  name={
                    isHome ? (homeLocation?.name ?? folderName) : folderName
                  }
                  title={path}
                  icon={<Icon name={isHome ? 'user' : 'folder'} size={20} />}
                />
              )
            })}
          </ol>
          {dropError && <p role="alert">{dropError}</p>}
        </li>
        {places.length > 0 && (
          <li>
            <Eyebrow className={styles.eyebrow}>Locations</Eyebrow>
          </li>
        )}
        {places.map((place) => (
          <NavItem
            key={place.path}
            href={locationUrl(place.path)}
            name={place.name}
            title={place.path}
            icon={
              <Icon
                name={
                  normalizePath(place.path) === homePath
                    ? 'user'
                    : getLibraryIcon(place.name)
                }
                size={20}
              />
            }
          />
        ))}
        {loadFailed && <li role="status">Unable to load locations.</li>}
        {drives.length > 0 && (
          <li>
            <Eyebrow className={styles.eyebrow}>Drives</Eyebrow>
          </li>
        )}
        {drives.map((drive) => (
          <NavItem
            key={drive.path}
            href={locationUrl(drive.path)}
            name={drive.name}
            title={drive.path}
            icon={<Icon name="hardDrive" size={20} />}
          />
        ))}
        <li>
          <Eyebrow className={styles.eyebrow}>Collections</Eyebrow>
        </li>
        {collections.map((collection) => (
          <NavItem
            key={collection.id}
            href={`/collections/${collection.id}`}
            name={collection.name}
            iconTarget={{ kind: 'collection', id: collection.id }}
          />
        ))}
        <li className={styles.actions}>
          <Button
            block
            size="sm"
            onClick={() => {
              void window.filejam.filesystem.chooseFolder().then((path) => {
                if (path) {
                  void navigate(locationUrl(path))
                }
              })
            }}
          >
            <Icon size={22} name="folder" />
            <span>Open folder</span>
          </Button>
          <Button block size="sm">
            <Icon size={22} name="list" />
            <span>Add collection</span>
          </Button>
        </li>
        <NavItem
          className={styles.settings}
          href="/settings"
          name="Settings"
          icon={<Icon name="settings" size={20} />}
        />
      </ol>
    </nav>
  )
}

type NavItemProps = HTMLAttributes<HTMLLIElement> & {
  name: string
  href: string
  icon?: ReactNode
  iconTarget?: IconTarget
}

function NavItem({
  name,
  href,
  icon,
  iconTarget,
  title = name,
  className,
  ...props
}: NavItemProps) {
  const location = useLocation()
  const destination = useResolvedPath(href)
  const current =
    location.pathname === destination.pathname &&
    (destination.pathname !== '/location' ||
      new URLSearchParams(location.search).get('path') ===
        new URLSearchParams(destination.search).get('path'))

  return (
    <li className={clsx(styles.item, className)} {...props}>
      {iconTarget && (
        <IconButton target={iconTarget} name={name} fallback={icon} size={20} />
      )}
      <Button
        as={Link}
        variant="link"
        to={href}
        title={title}
        viewTransition
        aria-current={current ? 'page' : undefined}
      >
        {!iconTarget && (
          <span className={styles.staticIcon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{name}</span>
      </Button>
    </li>
  )
}
