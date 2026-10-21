import { schema as configSchema } from '@files/server/config-schema'
import { Icon, Select } from '@files/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import AddLibrary from '../components/AddLibrary.js'
import { useConfig } from '../hooks/useConfig.js'
import { useLibraries } from '../hooks/useLibraries.js'
import Page from './Page.js'

const styles = css`
  /* Hallmark · component: settings section · genre: modern-minimal · theme: existing Suzy system
   * pre-emit critique: P4 H4 E4 S5 R5 V4 · contrast: pass (40–41)
   */
  .content {
    max-width: 640px;
    margin: 0 auto;

    h3 {
      font-weight: 500;
    }
  }
  .section + .section {
    margin-block-start: var(--suzy-space-6);
  }
  .heading {
    margin-block: 0 var(--suzy-space-4);
  }
  .sectionHeading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-4);
    margin-block-end: var(--suzy-space-4);

    h3 {
      margin: 0;
    }
  }
  .setting {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--suzy-space-4);
    padding: var(--suzy-space-3);
    border-radius: var(--suzy-radius-4);
    background: var(--suzy-gray-3);
  }
  .libraryList {
    margin: 0;
    padding: 0;
    overflow: hidden;
    /* border: 1px solid var(--suzy-border); */
    border-radius: var(--suzy-radius-4);
    background: var(--suzy-gray-3);
    list-style: none;
  }
  .libraryRow {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--suzy-space-3);
    min-height: 48px;
    padding: var(--suzy-space-3);

    & + & {
      border-block-start: 2px solid var(--suzy-gray-2);
    }
  }
  .libraryIcon {
    color: var(--suzy-text-muted);
  }
  .libraryDetails {
    min-width: 0;
  }
  .libraryName {
    display: block;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .libraryPath {
    display: block;
    margin-block-start: var(--suzy-space-1);
    overflow: hidden;
    color: var(--suzy-text-muted);
    font-size: var(--suzy-font-size-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .emptyState {
    margin: 0;
    padding: var(--suzy-space-4);
    border: 1px solid var(--suzy-border);
    border-radius: var(--suzy-radius-4);
    color: var(--suzy-text-muted);
    text-align: center;
  }
  .emptyIcon {
    display: block;
    margin: 0 auto var(--suzy-space-2);
  }
  .label {
    display: block;
    font-weight: 600;
  }
  .description {
    margin: var(--suzy-space-1) 0 0;
    color: var(--suzy-text-muted);
    font-size: var(--suzy-font-size-1);
  }
  .status {
    margin-block: var(--suzy-space-2) 0;
    color: var(--suzy-text-muted);
    font-size: var(--suzy-font-size-1);
  }
  .error {
    color: var(--suzy-red-11);
  }
`

export default function Settings() {
  const { values, updateConfig, loading, loadFailed } = useConfig([
    'user.dateformat',
  ])
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const {
    libraries,
    loading: librariesLoading,
    loadFailed: librariesLoadFailed,
  } = useLibraries()
  const dateFormat = values?.['user.dateformat'] ?? 'relative'
  const userLibraries = libraries.filter((library) => !library.isTrash)

  async function changeDateFormat(value: 'relative' | 'absolute') {
    setSaving(true)
    setSaveFailed(false)

    try {
      await updateConfig('user.dateformat', value)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Settings">
      <div className={styles.content}>
        {configSchema['x-ui'].categories.map((category) => {
          if (category.namespace !== 'user') {
            return null
          }

          const headingId = `${category.namespace}-settings-heading`

          return (
            <section
              key={category.namespace}
              className={styles.section}
              aria-labelledby={headingId}
            >
              <h3 id={headingId} className={styles.heading}>
                {category.title} Settings
              </h3>
              <div className={styles.setting}>
                <div>
                  <label className={styles.label} htmlFor="date-format">
                    Date format
                  </label>
                  <p
                    className={styles.description}
                    id="date-format-description"
                  >
                    Show dates relative to now or as absolute dates and times.
                  </p>
                </div>
                <Select
                  id="date-format"
                  aria-describedby="date-format-description"
                  value={dateFormat}
                  disabled={loading || loadFailed || saving}
                  onChange={(event) => {
                    void changeDateFormat(
                      event.currentTarget.value as 'relative' | 'absolute',
                    )
                  }}
                >
                  <option value="relative">Relative</option>
                  <option value="absolute">Absolute</option>
                </Select>
              </div>
            </section>
          )
        })}
        <section className={styles.section} aria-labelledby="libraries-heading">
          <div className={styles.sectionHeading}>
            <h3 id="libraries-heading">Libraries</h3>
            <AddLibrary />
          </div>
          {librariesLoadFailed ? (
            <p className={`${styles.emptyState} ${styles.error}`} role="alert">
              Unable to load libraries.
            </p>
          ) : librariesLoading ? (
            <p className={styles.emptyState} role="status">
              Loading libraries...
            </p>
          ) : userLibraries.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon className={styles.emptyIcon} name="folder" size={24} />
              No libraries added yet. Add a folder to start indexing it.
            </div>
          ) : (
            <ul className={styles.libraryList}>
              {userLibraries.map((library) => (
                <li key={library.id} className={styles.libraryRow}>
                  <Icon
                    className={styles.libraryIcon}
                    name="folder"
                    size={20}
                  />
                  <div className={styles.libraryDetails}>
                    <span className={styles.libraryName}>{library.name}</span>
                    <span
                      className={styles.libraryPath}
                      title={library.rootPath}
                    >
                      {library.rootPath}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {loadFailed && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            Unable to load settings.
          </p>
        )}
        {saveFailed && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            Unable to save the date format.
          </p>
        )}
        {saving && (
          <p className={styles.status} role="status">
            Saving…
          </p>
        )}
      </div>
    </Page>
  )
}
