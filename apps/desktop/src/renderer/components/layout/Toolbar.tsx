import { Button, ButtonGroup, Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'
import {
  Link,
  useLocation,
  useMatch,
  useNavigate,
  useSearchParams,
} from 'react-router'
import { useLibraries } from '../../hooks/useLibraries.js'
import { formatFullPath } from '../../utils/fileColumns.js'
import { folderUrl } from '../../utils/folderUrl.js'

const style = css`
  .toolbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    app-region: drag;
    gap: var(--suzy-space-4);

    button, a, input {
      app-region: no-drag;
    }

    > :first-child {
      justify-self: start;
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
      <NavButtons />
      <Breadcrumbs />
    </div>
  )
}

function NavButtons() {
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.key !== 'default' && window.history.state?.idx > 0
  const canGoForward = window.history.state?.idx < window.history.length - 1

  return (
    <ButtonGroup>
      <Button
        aria-label="Back"
        title="Back"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
      >
        <Icon name="chevron-left" size={18} />
      </Button>
      <Button
        aria-label="Forward"
        title="Forward"
        disabled={!canGoForward}
        onClick={() => navigate(1)}
      >
        <Icon name="chevron-right" size={18} />
      </Button>
    </ButtonGroup>
  )
}

function Breadcrumbs() {
  const match = useMatch('/libraries/:libraryId')
  const [searchParams] = useSearchParams()
  const { libraries } = useLibraries()

  const library = match
    ? libraries.find((item) => item.id === Number(match.params.libraryId))
    : undefined

  const segments = (searchParams.get('folder') ?? '').split('/').filter(Boolean)
  const isHome = useMatch('/') !== null
  const relativePath = segments.join('/')
  const fullPath = library ? formatFullPath(library.rootPath, relativePath) : ''

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
        {library && (
          <>
            <span aria-hidden="true">/</span>
            {segments.length ? (
              <Link
                className={style.link}
                to={folderUrl({ libraryId: library.id, relativePath: '' })}
                viewTransition
              >
                {library.name}
              </Link>
            ) : (
              <span aria-current="page">{library.name}</span>
            )}
            {segments.map((segment, index) => {
              const segmentPath = segments.slice(0, index + 1).join('/')

              return (
                <span key={segmentPath} className={style.crumb}>
                  <span aria-hidden="true">/</span>
                  {index === segments.length - 1 ? (
                    <span aria-current="page">{segment}</span>
                  ) : (
                    <Link
                      className={style.link}
                      to={folderUrl({
                        libraryId: library.id,
                        relativePath: segmentPath,
                      })}
                      viewTransition
                    >
                      {segment}
                    </Link>
                  )}
                </span>
              )
            })}
          </>
        )}
      </nav>
      {fullPath && (
        <span className={style.path} title={fullPath}>
          {fullPath}
        </span>
      )}
    </div>
  )
}
