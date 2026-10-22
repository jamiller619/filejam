import { schema as configSchema } from '@files/server/config-schema'
import { Button, Icon, type IconName, Select } from '@files/ui'
import { css } from 'inline-css-modules'
import { type HTMLAttributes, type ReactNode, useState } from 'react'
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
  .list {
    margin: 0;
    padding: 0;
    overflow: hidden;
    border-radius: var(--suzy-radius-4);

    list-style: none;
  }
  .settingRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--suzy-space-3);
    min-height: 48px;
    padding: var(--suzy-space-3);
    background: var(--suzy-gray-3);
    margin-block-end: 2px;
  }
  .rowContent {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-3);
    min-width: 0;
  }
  .rowAction {
    display: flex;
    align-items: center;
    justify-self: end;
  }
  .dateFormatSelect {
    width: 160px;
  }
  .icon {
    color: var(--suzy-text-muted);
  }
  .details {
    min-width: 0;
  }
  .title {
    display: block;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subtitle {
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
    color: var(--suzy-danger-11);
  }

  .editIcon {
    color: var(--suzy-info-10);
  }
  .deleteIcon {
    color: var(--suzy-danger-10);
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
            <Section
              key={category.namespace}
              title={`${category.title} settings`}
              headingId={headingId}
            >
              <SettingRow title="Date format" subtitle={dateFormat}>
                <Select
                  className={styles.dateFormatSelect}
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
              </SettingRow>
            </Section>
          )
        })}
        <Section
          title="Libraries"
          headingId="libraries-heading"
          headerActions={<AddLibrary />}
        >
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
            userLibraries.map((library) => (
              <SettingRow
                key={library.id}
                icon="folder"
                title={library.name}
                subtitle={library.rootPath}
              >
                <Button variant="ghost" className={styles.editIcon}>
                  <Icon name="edit" size={20} />
                </Button>
                <Button variant="ghost" className={styles.deleteIcon}>
                  <Icon name="trash" size={20} />
                </Button>
              </SettingRow>
            ))
          )}
        </Section>
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

type SettingRowProps = {
  children?: ReactNode
  icon?: IconName
  title?: string
  subtitle?: string
}

function SettingRow({ children, icon, title, subtitle }: SettingRowProps) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.rowContent}>
        {icon && <Icon className={styles.icon} name={icon} size={20} />}
        <div className={styles.details}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle} title={subtitle}>
            {subtitle}
          </span>
        </div>
      </div>
      {children && <div className={styles.rowAction}>{children}</div>}
    </div>
  )
}

type SectionProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode
  headingId: string
  title: string
  headerActions?: ReactNode
}

function Section({
  children,
  headerActions,
  title,
  headingId,
  ...props
}: SectionProps) {
  return (
    <section {...props} className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHeading}>
        <h3 id={headingId} className={styles.heading}>
          {title}
        </h3>
        {headerActions}
      </div>
      <div className={styles.list}>{children}</div>
    </section>
  )
}
