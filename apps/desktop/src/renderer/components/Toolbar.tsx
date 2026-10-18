import { Button, ButtonGroup, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import {
  Link,
  useLocation,
  useMatch,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useLibraries } from '../hooks/useLibraries.js'
import { folderUrl } from '../utils/folderUrl.js'

const style = css`
  .toolbar {
    display: grid;
    grid-template-columns: 1fr minmax(0, auto) 1fr;
    align-items: center;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    app-region: drag;
    gap: var(--suzy-space-3);

    button, a {
      app-region: no-drag;
    }

    > :first-child {
      justify-self: start;
    }

    .start {
      display: flex;
      align-items: center;
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
        width: 28px;
        height: 28px;
        padding: 0;
      }

      button:disabled {
        opacity: 0.4;
      }

      gap: var(--suzy-space-2);
      min-width: 0;
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
  const navigate = useNavigate()
  const location = useLocation()
  const canGoBack = location.key !== 'default' && window.history.state?.idx > 0
  const canGoForward = window.history.state?.idx < window.history.length - 1
  const match = useMatch('/libraries/:libraryId')
  const [searchParams] = useSearchParams()
  const { libraries } = useLibraries()
  const library = match
    ? libraries.find((item) => item.id === Number(match.params.libraryId))
    : undefined
  const segments = (searchParams.get('folder') ?? '').split('/').filter(Boolean)
  const isHome = useMatch('/') !== null

  return (
    <div className={style.toolbar}>
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
      <nav className={style.start} aria-label="Folder breadcrumbs">
        <Button
          render={<Link to="/" />}
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
            <Link
              className={style.link}
              to={folderUrl({ libraryId: library.id, relativePath: '' })}
              aria-current={segments.length ? undefined : 'page'}
            >
              {library.name}
            </Link>
            {segments.map((segment, index) => {
              const relativePath = segments.slice(0, index + 1).join('/')
              return (
                <span key={relativePath} className={style.crumb}>
                  <span aria-hidden="true">/</span>
                  <Link
                    className={style.link}
                    to={folderUrl({ libraryId: library.id, relativePath })}
                    aria-current={
                      index === segments.length - 1 ? 'page' : undefined
                    }
                  >
                    {segment}
                  </Link>
                </span>
              )
            })}
          </>
        )}
      </nav>
    </div>
  )
}
