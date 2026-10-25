import type { Config } from '@filejam/server'
import { schema as configSchema } from '@filejam/server/config-schema'
import { Button, Icon, type IconName, Select, Switch } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { type HTMLAttributes, type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import CollectionEditor from '../components/collections/CollectionEditor.js'
import DetailsPane from '../components/layout/DetailsPane.js'
import { useDetailsPane } from '../components/layout/DetailsPaneContext.js'
import AddLibrary from '../components/libraries/AddLibrary.js'
import { useApi } from '../hooks/useApi.js'
import {
  notifyCollectionsChanged,
  useCollections,
} from '../hooks/useCollections.js'
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
    margin-block-end: var(--suzy-space-2);

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
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--suzy-space-3);
    min-height: 48px;
    padding: var(--suzy-space-3);
    background: var(--suzy-gray-3);
    margin-block-end: 2px;

    &[data-selected='true'] {
      background: var(--suzy-accent-9);
      color: var(--suzy-accent-1);
    }
  }
  .rowSelect {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-3);
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;

    &:focus-visible {
      border-radius: var(--suzy-radius-2);
      outline: 2px solid var(--suzy-accent-8);
      outline-offset: 2px;
    }
  }
  .rowActions {
    display: flex;
    align-items: center;
    justify-self: end;
  }
  .dateFormatSelect {
    width: 160px;
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
    opacity: 0.5;
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
  .detailsBody {
    padding: var(--suzy-space-4);
  }
  .detailsEmpty {
    margin: 0;
    color: var(--suzy-text-muted);
  }
  .detailsType {
    margin: 0 0 var(--suzy-space-1);
    color: var(--suzy-text-muted);
    font-size: var(--suzy-font-size-1);
  }
  .detailsTitle {
    margin: 0 0 var(--suzy-space-4);
    overflow-wrap: anywhere;
    font-size: var(--suzy-font-size-4);
    font-weight: 600;
  }
  .metadata {
    display: grid;
    gap: var(--suzy-space-3);
    margin: 0;
    padding: var(--suzy-space-3);
    border-radius: var(--suzy-radius-3);
    background: var(--suzy-gray-5);

    > div {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--suzy-space-3);
      align-items: baseline;
    }

    dt {
      color: var(--suzy-text-muted);
      font-size: var(--suzy-font-size-1);
      font-weight: 600;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
      text-align: end;
    }
  }
`

type SettingsSelection =
  | { type: 'date-format' }
  | { type: 'color-coding' }
  | { type: 'library'; id: number }
  | { type: 'collection-new' }
  | { type: 'collection'; id: string }

const settingsConfigKeys = [
  'user.dateformat',
  'user.files.colorCoding',
] as const

type SettingsConfigKey = (typeof settingsConfigKeys)[number]

export default function Settings() {
  const api = useApi()
  const detailsPane = useDetailsPane()
  const { values, updateConfig, loading, loadFailed } =
    useConfig(settingsConfigKeys)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [collectionError, setCollectionError] = useState(false)
  const [selection, setSelection] = useState<SettingsSelection | null>(null)
  const {
    libraries,
    loading: librariesLoading,
    loadFailed: librariesLoadFailed,
  } = useLibraries()
  const {
    collections,
    loading: collectionsLoading,
    loadFailed: collectionsLoadFailed,
    refresh: refreshCollections,
  } = useCollections()
  const dateFormat = values?.['user.dateformat'] ?? 'relative'
  const userLibraries = libraries.filter((library) => !library.isTrash)

  useEffect(() => {
    detailsPane.setVisible(true)
  }, [detailsPane])

  async function saveConfig<Key extends SettingsConfigKey>(
    key: Key,
    value: Config[Key],
  ) {
    setSaving(true)
    setSaveFailed(false)

    try {
      await updateConfig(key, value)
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
              <SettingRow
                title="Date format"
                subtitle={
                  configSchema.properties['user.dateformat'].description
                }
                selected={selection?.type === 'date-format'}
                onSelect={() => setSelection({ type: 'date-format' })}
              >
                <Select
                  className={styles.dateFormatSelect}
                  id="date-format"
                  aria-describedby="date-format-description"
                  value={dateFormat}
                  disabled={loading || loadFailed || saving}
                  onFocus={() => setSelection({ type: 'date-format' })}
                  onChange={(event) => {
                    void saveConfig(
                      'user.dateformat',
                      event.currentTarget.value as 'relative' | 'absolute',
                    )
                  }}
                >
                  <option value="relative">Relative</option>
                  <option value="absolute">Absolute</option>
                </Select>
              </SettingRow>
              <SettingRow
                title={configSchema.properties['user.files.colorCoding'].title}
                subtitle={
                  configSchema.properties['user.files.colorCoding'].description
                }
                selected={selection?.type === 'color-coding'}
                onSelect={() => setSelection({ type: 'color-coding' })}
              >
                <Switch
                  id="color-coding"
                  aria-describedby="color-coding-description"
                  checked={
                    values?.['user.files.colorCoding'] ??
                    configSchema.properties['user.files.colorCoding'].default
                  }
                  disabled={loading || loadFailed || saving}
                  onCheckedChange={(checked) => {
                    void saveConfig('user.files.colorCoding', checked)
                  }}
                />
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
                selected={
                  selection?.type === 'library' && selection.id === library.id
                }
                onSelect={() =>
                  setSelection({ type: 'library', id: library.id })
                }
              >
                <Button
                  variant="ghost"
                  className={styles.editIcon}
                  aria-label={`Edit ${library.name}`}
                  onClick={() =>
                    setSelection({ type: 'library', id: library.id })
                  }
                >
                  <Icon name="edit" size={20} />
                </Button>
                <Button
                  variant="ghost"
                  className={styles.deleteIcon}
                  aria-label={`Delete ${library.name}`}
                  onClick={() =>
                    setSelection({ type: 'library', id: library.id })
                  }
                >
                  <Icon name="trash" size={20} />
                </Button>
              </SettingRow>
            ))
          )}
        </Section>
        <Section
          title="Collections"
          headingId="collections-heading"
          headerActions={
            <Button
              onClick={() => {
                setCollectionError(false)
                setSelection({ type: 'collection-new' })
              }}
            >
              <Icon name="add" size={16} />
              Add collection
            </Button>
          }
        >
          {collectionsLoadFailed ? (
            <p className={`${styles.emptyState} ${styles.error}`} role="alert">
              Unable to load collections.
            </p>
          ) : collectionsLoading ? (
            <p className={styles.emptyState} role="status">
              Loading collections...
            </p>
          ) : collections.length === 0 ? (
            <div className={styles.emptyState}>
              <Icon className={styles.emptyIcon} name="folder" size={24} />
              No collections added yet.
            </div>
          ) : (
            collections.map((collection) => (
              <SettingRow
                key={collection.id}
                icon="folder"
                title={collection.name}
                selected={
                  selection?.type === 'collection' &&
                  selection.id === collection.id
                }
                onSelect={() =>
                  setSelection({ type: 'collection', id: collection.id })
                }
              >
                <Button
                  variant="ghost"
                  className={styles.editIcon}
                  aria-label={`Edit ${collection.name}`}
                  onClick={() =>
                    setSelection({ type: 'collection', id: collection.id })
                  }
                >
                  <Icon name="edit" size={20} />
                </Button>
                <Button
                  variant="ghost"
                  className={styles.deleteIcon}
                  aria-label={`Delete ${collection.name}`}
                  onClick={async () => {
                    setCollectionError(false)

                    try {
                      await api.collections.delete(collection.id)
                      setSelection((current) =>
                        current?.type === 'collection' &&
                        current.id === collection.id
                          ? null
                          : current,
                      )
                      notifyCollectionsChanged()
                      refreshCollections()
                    } catch {
                      setCollectionError(true)
                    }
                  }}
                >
                  <Icon name="trash" size={20} />
                </Button>
              </SettingRow>
            ))
          )}
        </Section>
        {collectionError && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            Unable to delete the collection.
          </p>
        )}
        {loadFailed && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            Unable to load settings.
          </p>
        )}
        {saveFailed && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            Unable to save the setting.
          </p>
        )}
        {saving && (
          <p className={styles.status} role="status">
            Saving...
          </p>
        )}
      </div>
      {detailsPane.host &&
        createPortal(
          <SettingsDetails
            selection={selection}
            dateFormat={dateFormat}
            libraries={userLibraries}
            collections={collections}
            onCollectionSaved={(collection) => {
              notifyCollectionsChanged()
              refreshCollections()
              setSelection({ type: 'collection', id: collection.id })
            }}
          />,
          detailsPane.host,
        )}
    </Page>
  )
}

type SettingRowProps = {
  children?: ReactNode
  icon?: IconName
  title?: string
  subtitle?: string
  selected?: boolean
  onSelect?: () => void
}

function SettingRow({
  children,
  icon,
  title,
  subtitle,
  selected = false,
  onSelect,
}: SettingRowProps) {
  return (
    <div className={styles.row} data-selected={selected}>
      <button
        type="button"
        className={styles.rowSelect}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {icon && <Icon className={styles.icon} name={icon} size={20} />}
        <div className={styles.details}>
          <span className={styles.title}>{title}</span>
          {subtitle && (
            <span className={styles.subtitle} title={subtitle}>
              {subtitle}
            </span>
          )}
        </div>
      </button>
      {children && <div className={styles.rowActions}>{children}</div>}
    </div>
  )
}

type SettingsDetailsProps = {
  selection: SettingsSelection | null
  dateFormat: string
  libraries: ReturnType<typeof useLibraries>['libraries']
  collections: ReturnType<typeof useCollections>['collections']
  onCollectionSaved: (
    collection: ReturnType<typeof useCollections>['collections'][number],
  ) => void
}

function SettingsDetails({
  selection,
  dateFormat,
  libraries,
  collections,
  onCollectionSaved,
}: SettingsDetailsProps) {
  const library =
    selection?.type === 'library'
      ? libraries.find((item) => item.id === selection.id)
      : undefined
  const collection =
    selection?.type === 'collection'
      ? collections.find((item) => item.id === selection.id)
      : undefined

  return (
    <DetailsPane
      ariaLabel="Settings details"
      title="Details"
      bodyClassName={styles.detailsBody}
    >
      {!selection && (
        <p className={styles.detailsEmpty}>
          Select a setting, library, or collection to view its details.
        </p>
      )}
      {selection?.type === 'date-format' && (
        <SettingsDetailsContent
          type="Setting"
          title="Date format"
          metadata={[['Current value', dateFormat]]}
        />
      )}
      {library && (
        <SettingsDetailsContent
          type="Library"
          title={library.name}
          metadata={[
            ['Folder', library.rootPath],
            ['Library ID', String(library.id)],
          ]}
        />
      )}
      {collection && (
        <CollectionEditor collection={collection} onSaved={onCollectionSaved} />
      )}
      {selection?.type === 'collection-new' && (
        <CollectionEditor onSaved={onCollectionSaved} />
      )}
      {selection &&
        !library &&
        !collection &&
        selection.type !== 'collection-new' &&
        selection.type !== 'date-format' && (
          <p className={styles.detailsEmpty}>
            This item is no longer available.
          </p>
        )}
    </DetailsPane>
  )
}

function SettingsDetailsContent({
  type,
  title,
  metadata,
}: {
  type: string
  title: string
  metadata: [string, string][]
}) {
  return (
    <>
      <p className={styles.detailsType}>{type}</p>
      <h4 className={styles.detailsTitle}>{title}</h4>
      <dl className={styles.metadata}>
        {metadata.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
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
