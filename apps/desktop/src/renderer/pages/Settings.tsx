import { Select } from '@files/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import { useConfig } from '../hooks/useConfig.js'
import Page from './Page.js'

const styles = css`
  .content {
    max-width: 640px;
  }
  .heading {
    margin-block: 0 var(--suzy-space-4);
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
  const dateFormat = values?.['user.dateformat'] ?? 'relative'

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
      <section className={styles.content} aria-labelledby="settings-heading">
        <h2 id="settings-heading" className={styles.heading}>
          Settings
        </h2>
        <div className={styles.setting}>
          <div>
            <label className={styles.label} htmlFor="date-format">
              Date format
            </label>
            <p className={styles.description} id="date-format-description">
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
      </section>
    </Page>
  )
}
