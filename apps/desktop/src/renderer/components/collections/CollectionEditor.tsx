import type {
  CollectionDefinition,
  CollectionField,
  CollectionOperator,
  CollectionRule,
} from '@filejam/server'
import { Button, Input, Select } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi.js'
import { IconButton } from '../icons/ItemIcon.js'

const styles = css`
  .form {
    display: grid;
    gap: var(--suzy-space-4);

    label,
    fieldset {
      display: grid;
      gap: var(--suzy-space-1);
    }

    fieldset {
      margin: 0;
      padding: var(--suzy-space-3);
      border: 1px solid var(--suzy-border);
      border-radius: var(--suzy-radius-3);
    }
  }
  .rule {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--suzy-space-2);
    padding-block: var(--suzy-space-2);

    input,
    button {
      grid-column: 1 / -1;
    }
  }
  .actions {
    display: flex;
    gap: var(--suzy-space-2);
  }
  .error {
    margin: 0;
    color: var(--suzy-danger-11);
  }
`

const defaultField = {
  value: 'name',
  label: 'Name',
  type: 'text',
} as const satisfies {
  value: CollectionField
  label: string
  type: FieldType
}

const fields: { value: CollectionField; label: string; type: FieldType }[] = [
  defaultField,
  { value: 'relativePath', label: 'Path', type: 'text' },
  { value: 'libraryId', label: 'Library ID', type: 'number' },
  { value: 'kind', label: 'Kind', type: 'text' },
  { value: 'mimeType', label: 'MIME type', type: 'text' },
  { value: 'size', label: 'Size', type: 'number' },
  { value: 'createdAt', label: 'Created', type: 'date' },
  { value: 'modifiedAt', label: 'Modified', type: 'date' },
  { value: 'indexedAt', label: 'Indexed', type: 'date' },
  { value: 'lastOpenedAt', label: 'Last opened', type: 'date' },
  { value: 'favoritedAt', label: 'Favorited', type: 'date' },
]

const operatorLabels: Record<CollectionOperator, string> = {
  equals: 'Equals',
  notEquals: 'Does not equal',
  contains: 'Contains',
  startsWith: 'Starts with',
  greaterThan: 'After / greater than',
  lessThan: 'Before / less than',
  isSet: 'Is set',
  isNotSet: 'Is not set',
}

const textOperators: CollectionOperator[] = [
  'contains',
  'startsWith',
  'equals',
  'notEquals',
  'isSet',
  'isNotSet',
]

const numberOperators: CollectionOperator[] = [
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'isSet',
  'isNotSet',
]

type FieldType = 'text' | 'number' | 'date'

type Collection = Awaited<
  ReturnType<Window['filejam']['collections']['list']>
>[number]

export default function CollectionEditor({
  collection,
  onSaved,
}: {
  collection?: Collection
  onSaved: (collection: Collection) => void
}) {
  const api = useApi()
  const [name, setName] = useState('')
  const [definition, setDefinition] = useState<CollectionDefinition>(() =>
    initialDefinition(),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(collection?.name ?? '')
    setDefinition(collection?.definition ?? initialDefinition())
    setError('')
  }, [collection])

  const updateRule = (index: number, rule: CollectionRule) => {
    setDefinition((current) => ({
      ...current,
      rules: current.rules.map((item, itemIndex) =>
        itemIndex === index ? rule : item,
      ),
    }))
  }

  const submitLabel = collection ? 'Save changes' : 'Create'

  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError('')

        try {
          const input = { name, definition }
          const saved = collection
            ? await api.collections.update(collection.id, input)
            : await api.collections.create(input)

          onSaved(saved)
        } catch {
          setError('Unable to save collection. Check each rule and try again.')
        } finally {
          setSaving(false)
        }
      }}
    >
      {collection && (
        <IconButton
          target={{ kind: 'collection', id: collection.id }}
          name={collection.name}
          label
        />
      )}
      <label htmlFor="collection-name">
        Name
        <Input
          id="collection-name"
          aria-label="Collection name"
          value={name}
          maxLength={100}
          required
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <Select
        label="Match"
        value={definition.match}
        displayValue={definition.match === 'all' ? 'All rules' : 'Any rule'}
        onValueChange={(match) => {
          if (match !== 'all' && match !== 'any') {
            return
          }

          setDefinition((current) => ({
            ...current,
            match,
          }))
        }}
      >
        <Select.MenuItem value="all">All rules</Select.MenuItem>
        <Select.MenuItem value="any">Any rule</Select.MenuItem>
      </Select>
      <fieldset>
        <legend>Rules</legend>
        {definition.rules.map((rule, index) => (
          <RuleEditor
            key={ruleKey(rule, index)}
            rule={rule}
            onChange={(value) => updateRule(index, value)}
            onRemove={() =>
              setDefinition((current) => ({
                ...current,
                rules: current.rules.filter(
                  (_item, itemIndex) => itemIndex !== index,
                ),
              }))
            }
          />
        ))}
        <Button
          type="button"
          onClick={() =>
            setDefinition((current) => ({
              ...current,
              rules: [
                ...current.rules,
                { field: 'name', operator: 'contains', value: '' },
              ],
            }))
          }
        >
          Add rule
        </Button>
      </fieldset>
      <fieldset>
        <legend>Order</legend>
        <Select
          label="Sort by"
          value={definition.sort[0]?.field ?? 'name'}
          displayValue={
            fields.find(
              (field) => field.value === (definition.sort[0]?.field ?? 'name'),
            )?.label ?? 'Name'
          }
          onValueChange={(value) => {
            if (!fields.some((field) => field.value === value)) {
              return
            }

            setDefinition((current) => ({
              ...current,
              sort: [
                {
                  field: value as CollectionField,
                  direction: current.sort[0]?.direction ?? 'asc',
                },
              ],
            }))
          }}
        >
          {fields.map((field) => (
            <Select.MenuItem key={field.value} value={field.value}>
              {field.label}
            </Select.MenuItem>
          ))}
        </Select>
        <Select
          label="Direction"
          value={definition.sort[0]?.direction ?? 'asc'}
          displayValue={
            definition.sort[0]?.direction === 'desc'
              ? 'Descending'
              : 'Ascending'
          }
          onValueChange={(direction) => {
            if (direction !== 'asc' && direction !== 'desc') {
              return
            }

            setDefinition((current) => ({
              ...current,
              sort: [
                {
                  field: current.sort[0]?.field ?? 'name',
                  direction,
                },
              ],
            }))
          }}
        >
          <Select.MenuItem value="asc">Ascending</Select.MenuItem>
          <Select.MenuItem value="desc">Descending</Select.MenuItem>
        </Select>
      </fieldset>
      <label htmlFor="collection-result-limit">
        Result limit (optional)
        <Input
          id="collection-result-limit"
          aria-label="Result limit"
          type="number"
          min={1}
          max={10_000}
          value={definition.limit ?? ''}
          onChange={(event) =>
            setDefinition((current) => ({
              ...current,
              limit: event.currentTarget.value
                ? Number(event.currentTarget.value)
                : null,
            }))
          }
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button color="primary" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: CollectionRule
  onChange: (rule: CollectionRule) => void
  onRemove: () => void
}) {
  const field = fields.find((item) => item.value === rule.field) ?? defaultField
  const operators = (
    field.type === 'text' ? textOperators : numberOperators
  ).filter(
    (operator) =>
      !['isSet', 'isNotSet'].includes(operator) ||
      [
        'mimeType',
        'size',
        'modifiedAt',
        'lastOpenedAt',
        'favoritedAt',
      ].includes(field.value),
  )
  const needsValue = !['isSet', 'isNotSet'].includes(rule.operator)

  return (
    <div className={styles.rule}>
      <Select
        label="Rule field"
        value={rule.field}
        displayValue={field.label}
        onValueChange={(value) => {
          const nextField = fields.find((item) => item.value === value)

          if (!nextField) {
            return
          }

          const operator =
            nextField.type === 'text' ? 'contains' : 'greaterThan'

          onChange({
            field: nextField.value,
            operator,
            value: nextField.type === 'text' ? '' : 0,
          })
        }}
      >
        {fields.map((item) => (
          <Select.MenuItem key={item.value} value={item.value}>
            {item.label}
          </Select.MenuItem>
        ))}
      </Select>
      <Select
        label="Rule operator"
        value={rule.operator}
        displayValue={operatorLabels[rule.operator]}
        onValueChange={(value) => {
          if (!operators.some((operator) => operator === value)) {
            return
          }

          const operator = value as CollectionOperator

          onChange({
            field: rule.field,
            operator,
            ...(!['isSet', 'isNotSet'].includes(operator)
              ? { value: rule.value ?? (field.type === 'text' ? '' : 0) }
              : {}),
          })
        }}
      >
        {operators.map((operator) => (
          <Select.MenuItem key={operator} value={operator}>
            {operatorLabels[operator]}
          </Select.MenuItem>
        ))}
      </Select>
      {needsValue && (
        <Input
          aria-label="Rule value"
          type={field.type === 'date' ? 'datetime-local' : field.type}
          value={formatRuleValue(rule.value, field.type)}
          onChange={(event) =>
            onChange({
              ...rule,
              value: parseRuleValue(event.currentTarget.value, field.type),
            })
          }
        />
      )}
      <Button type="button" variant="ghost" onClick={onRemove}>
        Remove rule
      </Button>
    </div>
  )
}

function initialDefinition(): CollectionDefinition {
  return {
    version: 1,
    match: 'all',
    rules: [],
    sort: [{ field: 'name', direction: 'asc' }],
    limit: null,
  }
}

function ruleKey(rule: CollectionRule, occurrence: number) {
  return `${rule.field}:${rule.operator}:${String(rule.value)}:${occurrence}`
}

function formatRuleValue(value: string | number | undefined, type: FieldType) {
  if (type !== 'date' || typeof value !== 'number' || value === 0) {
    return value ?? ''
  }

  return new Date(value).toISOString().slice(0, 16)
}

function parseRuleValue(value: string, type: FieldType) {
  if (type === 'text') {
    return value
  }

  if (type === 'date') {
    return value ? new Date(value).getTime() : 0
  }

  return value ? Number(value) : 0
}
