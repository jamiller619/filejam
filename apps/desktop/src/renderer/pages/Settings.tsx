import { Button, Icon, type IconName } from '@filejam/ui'
import { css } from 'inline-css-modules'
import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  formatSettingValue,
  getSettingDefinition,
  getSettingGroups,
  type SettingValue,
  settingDefinitions,
} from '../../settings/definitions.js'
import type {
  Settings as DesktopSettings,
  SettingsKey,
} from '../../settings/settings.js'
import CollectionEditor from '../components/collections/CollectionEditor.js'
import DetailsPane from '../components/layout/DetailsPane.js'
import { useDetailsPane } from '../components/layout/DetailsPaneContext.js'
import AddLibrary from '../components/libraries/AddLibrary.js'
import SettingControl from '../components/settings/SettingControl.js'
import {
  notifyCollectionsChanged,
  useCollections,
} from '../hooks/useCollections.js'
import { useSettings } from '../hooks/useSettings.js'
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
  | { type: 'setting'; key: SettingsKey }
  | { type: 'library'; id: number }
  | { type: 'collection-new' }
  | { type: 'collection'; id: string }

const settingsGroups = getSettingGroups()
const settingsKeys = settingDefinitions.map((setting) => setting.key)

export default function Settings() {
  const detailsPane = useDetailsPane()
  const { values, updateSettings, loading, loadFailed } =
    useSettings(settingsKeys)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [collectionError, setCollectionError] = useState(false)
  const [selection, setSelection] = useState<SettingsSelection | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const {
    collections,
    loading: collectionsLoading,
    loadFailed: collectionsLoadFailed,
    refresh: refreshCollections,
  } = useCollections()
  const userLibraries = libraries.filter((library) => !library.isTrash)

  useLayoutEffect(() => {
    void detailsPane.setVisible(true)
  }, [detailsPane])

  useEffect(() => {
    if (!selection) {
      return
    }

    function clearSelection() {
      setSelection(null)
    }

    function handleOutsideInteraction(event: PointerEvent | FocusEvent) {
      const target = event.target

      // The details pane contains editors for the selected row.
      if (target instanceof Node && detailsPane.host?.contains(target)) {
        return
      }

      if (
        target instanceof Element &&
        contentRef.current?.contains(target) &&
        target.closest('[data-settings-row]')
      ) {
        return
      }

      clearSelection()
    }

    document.addEventListener('pointerdown', handleOutsideInteraction, true)
    document.addEventListener('focusin', handleOutsideInteraction)
    window.addEventListener('blur', clearSelection)

    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsideInteraction,
        true,
      )
      document.removeEventListener('focusin', handleOutsideInteraction)
      window.removeEventListener('blur', clearSelection)
    }
  }, [detailsPane.host, selection])

  async function saveSettings(key: SettingsKey, value: SettingValue) {
    setSaving(true)
    setSaveFailed(false)

    try {
      // Dynamic controls use schema validation in the main process as their boundary.
      await updateSettings(key, value as DesktopSettings[SettingsKey])
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title="Settings">
      <div ref={contentRef} className={styles.content}>
        {settingsGroups.map((category) => (
          <Section
            key={category.namespace}
            title={`${category.title} settings`}
            headingId={`${category.namespace}-settings-heading`}
          >
            {category.settings.map((setting) => (
              <SettingRow
                key={setting.key}
                title={setting.title}
                subtitle={setting.description}
                selected={
                  selection?.type === 'setting' && selection.key === setting.key
                }
                onSelect={() =>
                  setSelection({ type: 'setting', key: setting.key })
                }
              >
                <SettingControl
                  setting={setting}
                  value={values?.[setting.key]}
                  disabled={loading || loadFailed || saving}
                  onFocus={() =>
                    setSelection({ type: 'setting', key: setting.key })
                  }
                  onChange={(value) => {
                    void saveSettings(setting.key, value)
                  }}
                />
              </SettingRow>
            ))}
          </Section>
        ))}
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
                <Icon name="forward" size={12} />
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
              <Icon name="plus" size={16} />
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
                <Icon name="forward" size={12} />
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
            values={values}
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
    <div className={styles.row} data-settings-row data-selected={selected}>
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
  values: Partial<DesktopSettings> | undefined
  libraries: ReturnType<typeof useLibraries>['libraries']
  collections: ReturnType<typeof useCollections>['collections']
  onCollectionSaved: (
    collection: ReturnType<typeof useCollections>['collections'][number],
  ) => void
}

function SettingsDetails({
  selection,
  values,
  libraries,
  collections,
  onCollectionSaved,
}: SettingsDetailsProps) {
  const setting =
    selection?.type === 'setting'
      ? getSettingDefinition(selection.key)
      : undefined
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
          Select a setting or collection to view its details.
        </p>
      )}
      {setting && (
        <SettingsDetailsContent
          type="Setting"
          title={setting.title}
          metadata={[
            ['Description', setting.description],
            [
              'Current value',
              formatSettingValue(setting, values?.[setting.key]),
            ],
            [
              'Default value',
              formatSettingValue(setting, setting.defaultValue),
            ],
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
        !collection &&
        selection.type !== 'collection-new' &&
        !setting && (
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
