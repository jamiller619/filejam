import { Button, ButtonGroup, Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'
import {
  Link,
  useLocation,
  useMatch,
  useNavigate,
  useSearchParams,
} from 'react-router'
import { useVolumes } from '../../hooks/useVolumes.js'
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

    .navigationControls {
      display: flex;
      align-items: center;
      gap: var(--suzy-space-2);
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
  const folderMatch = useMatch('/browse/:volumeId')
  const [searchParams] = useSearchParams()
  const canGoBack = location.key !== 'default' && window.history.state?.idx > 0
  const canGoForward = window.history.state?.idx < window.history.length - 1
  const pathSegments = (searchParams.get('path') ?? '')
    .split('/')
    .filter(Boolean)
  const canGoUp = folderMatch !== null && pathSegments.length > 0

  function goUp() {
    if (!folderMatch || !canGoUp) {
      return
    }

    navigate(
      folderUrl({
        volumeId: Number(folderMatch.params.volumeId),
        relativePath: pathSegments.slice(0, -1).join('/'),
      }),
    )
  }

  return (
    <div className={style.navigationControls}>
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
      <Button
        aria-label="Up one folder"
        title="Up one folder"
        disabled={!canGoUp}
        onClick={goUp}
      >
        <Icon name="back" />
      </Button>
      <Button
        aria-label="Forward"
        title="Forward"
        disabled={!canGoForward}
        onClick={() => navigate(1)}
      >
        <Icon name="forward" />
      </Button>
    </ButtonGroup>
  )
}

function Breadcrumbs() {
  const match = useMatch('/browse/:volumeId')
  const [searchParams] = useSearchParams()
  const { volumes } = useVolumes()

  const volume = match
    ? volumes.find((item) => item.id === Number(match.params.volumeId))
    : undefined

  const segments = (searchParams.get('path') ?? '').split('/').filter(Boolean)
  const isHome = useMatch('/') !== null
  const relativePath = segments.join('/')
  const fullPath = volume ? formatFullPath(volume.rootPath, relativePath) : ''

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
        {volume && (
          <>
            <span aria-hidden="true">/</span>
            {segments.length ? (
              <Link
                className={style.link}
                to={folderUrl({ volumeId: volume.id, relativePath: '' })}
                viewTransition
              >
                {volume.name}
              </Link>
            ) : (
              <span aria-current="page">{volume.name}</span>
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
                        volumeId: volume.id,
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
