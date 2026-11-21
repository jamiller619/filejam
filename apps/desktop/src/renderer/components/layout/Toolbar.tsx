import { Button, Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { Link, useMatch, useSearchParams } from 'react-router'
import { useLocations } from '../../hooks/useLocations.js'
import { locationBreadcrumbs, locationUrl } from '../../utils/folderUrl.js'

const style = css`
  .toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    app-region: drag;

    button, a, input {
      app-region: no-drag;
    }

    .breadcrumbs {
      display: flex;
      align-items: center;
      justify-self: start;
      width: fit-content;
      max-width: 100%;
      overflow-x: auto;
      white-space: nowrap;
      scrollbar-width: none;

      > * {
        flex-shrink: 0;
      }

      button, a:has(svg) {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        padding: 0;
      }

      button:disabled {
        opacity: 0.4;
      }

      gap: var(--suzy-space-2);
      min-width: 0;
    }

    .location {
      display: grid;
      justify-self: start;
      width: fit-content;
      max-width: 100%;
      min-width: 0;
    }

    .path {
      width: 100%;
      font-size: var(--suzy-font-size-1);
      color: lch(from var(--suzy-gray-11) l c h / 75%);
      padding-inline-start: var(--suzy-space-1);
    }

    .crumb {
      display: inline-flex;
      align-items: center;
      gap: var(--suzy-space-2);
      min-width: 0;
    }

    .link {
      color: inherit;

      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
  }
`

export default function Toolbar() {
  return (
    <div className={style.toolbar}>
      <Breadcrumbs />
    </div>
  )
}

function Breadcrumbs() {
  const match = useMatch('/location')
  const [searchParams] = useSearchParams()
  const { data: locations } = useLocations()
  const isHome = useMatch('/') !== null
  let fullPath = ''
  if (match) {
    fullPath = searchParams.get('path') ?? ''
  } else if (isHome) {
    fullPath = locations?.home ?? ''
  }

  const crumbs = locationBreadcrumbs(fullPath)

  return (
    <div className={style.location}>
      <nav className={style.breadcrumbs} aria-label="Folder breadcrumbs">
        <Button
          render={<Link to="/" viewTransition />}
          nativeButton={false}
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          variant="ghost"
          disabled={isHome}
        >
          <Icon name="home" size={18} />
        </Button>
        {crumbs.map((crumb, index) => (
          <span key={crumb.path} className={style.crumb}>
            <span aria-hidden="true">/</span>
            {index === crumbs.length - 1 ? (
              <span aria-current="page">{crumb.name}</span>
            ) : (
              <Link
                className={style.link}
                to={locationUrl(crumb.path)}
                viewTransition
              >
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
      {fullPath && (
        <span className={style.path} title={fullPath}>
          {fullPath}
        </span>
      )}
    </div>
  )
}
