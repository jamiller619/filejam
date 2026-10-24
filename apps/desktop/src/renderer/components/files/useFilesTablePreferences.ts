import { useCallback, useEffect, useState } from 'react'
import {
  readTablePreferences,
  writeTablePreferences,
} from '../../utils/tablePreferences.js'

export function useFilesTablePreferences(preferencesKey: string) {
  const [preferenceState, setPreferenceState] = useState(() => ({
    key: preferencesKey,
    value: readTablePreferences(preferencesKey),
  }))

  if (preferenceState.key !== preferencesKey) {
    setPreferenceState({
      key: preferencesKey,
      value: readTablePreferences(preferencesKey),
    })
  }

  const preferences =
    preferenceState.key === preferencesKey
      ? preferenceState.value
      : readTablePreferences(preferencesKey)

  useEffect(() => {
    writeTablePreferences(preferencesKey, preferences)
  }, [preferencesKey, preferences])

  const setPreferences: React.Dispatch<
    React.SetStateAction<typeof preferences>
  > = useCallback(
    (update) => {
      setPreferenceState((current) => {
        const currentValue =
          current.key === preferencesKey ? current.value : preferences
        const value =
          typeof update === 'function' ? update(currentValue) : update

        return { key: preferencesKey, value }
      })
    },
    [preferences, preferencesKey],
  )

  return { ...preferences, setPreferences }
}
