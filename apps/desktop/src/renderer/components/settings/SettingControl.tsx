import { Input, NativeSelect, Switch } from '@filejam/ui'
import { useEffect, useId, useState } from 'react'
import type {
  SettingDefinition,
  SettingValue,
} from '../../../settings/definitions.js'

type SettingControlProps = {
  setting: SettingDefinition
  value: unknown
  disabled?: boolean
  onFocus?: () => void
  onChange: (value: SettingValue) => void
}

/** A schema-driven editor that can be placed in a settings row or a toolbar. */
export default function SettingControl({
  setting,
  value,
  disabled = false,
  onFocus,
  onChange,
}: SettingControlProps) {
  const id = useId()
  const current = value ?? setting.defaultValue
  const [draft, setDraft] = useState(String(current))
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(String(current))
    setError('')
  }, [current])

  const common = {
    id,
    'aria-label': setting.title,
    title: setting.description,
    disabled,
    onFocus,
  }

  if (setting.control === 'switch') {
    return (
      <Switch
        {...common}
        checked={current === true}
        onCheckedChange={onChange}
      />
    )
  }

  if (setting.control === 'select') {
    return (
      <NativeSelect
        {...common}
        value={String(
          setting.options.findIndex((option) => option.value === current),
        )}
        onChange={(event) => {
          const option = setting.options[Number(event.currentTarget.value)]

          if (option) {
            onChange(option.value)
          }
        }}
      >
        {setting.options.map((option, index) => (
          <option key={String(option.value)} value={index}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    )
  }

  return (
    <div>
      <Input
        {...common}
        type={setting.control === 'number' ? 'number' : 'text'}
        value={draft}
        min={setting.minimum}
        max={setting.maximum}
        step={setting.step ?? 'any'}
        minLength={setting.minLength}
        maxLength={setting.maxLength}
        pattern={setting.pattern}
        required={setting.control === 'number' || (setting.minLength ?? 0) > 0}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setDraft(event.currentTarget.value)
          setError('')
        }}
        onBlur={(event) => {
          const input = event.currentTarget

          if (!input.validity.valid) {
            setError(input.validationMessage)
            return
          }

          const next =
            setting.control === 'number' ? input.valueAsNumber : input.value

          if (next !== current) {
            onChange(next)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.currentTarget.value = String(current)
            setDraft(String(current))
            setError('')
            event.currentTarget.blur()
          }
        }}
      />
      {error && (
        <p id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
