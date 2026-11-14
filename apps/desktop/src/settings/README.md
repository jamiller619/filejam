# Schema-driven settings

Add a property to `settings.schema.json` with a `type`, `title`, `description`,
and valid `default`. It is automatically registered in storage and displayed on
the Settings page. Build and dev commands regenerate `schema.ts`; do not edit
that file manually. `pnpm --filter @filejam/desktop build:settings` regenerates
types independently. New settings do not need an entry in `required`.

Controls are inferred from the schema:

- `boolean`: switch
- `enum` of strings, numbers, or booleans: dropdown preserving value types
- `string`: text input
- `integer` or `number`: numeric input

Text and number inputs save on blur or Enter; Escape discards the draft.
Numeric bounds, steps, and text constraints are passed to the input. The main
process validates every persisted value against the JSON schema, including
constraints on arrays and objects.

Optional property metadata:

```json
"user.files.example": {
  "type": "string",
  "title": "Example setting",
  "description": "How files are displayed.",
  "enum": ["compact", "comfortable"],
  "default": "compact",
  "x-ui": {
    "category": "user",
    "optionLabels": {
      "compact": "Compact",
      "comfortable": "Comfortable"
    }
  }
}
```

Categories default to the first segment of the key. Root `x-ui.categories`
supplies category titles and ordering; undeclared categories are also shown.
Properties follow schema order. Use `"x-ui": { "hidden": true }` for internal
state or values managed by dedicated UI. Objects and arrays require this flag
until a suitable generic editor is added.

For other surfaces, use `getSettingDefinition(key)` from `definitions.ts`,
`useSettings([key])` for values and persistence, and `SettingControl` for the
editor. Its `setting`, `value`, `onChange`, `disabled`, and `onFocus` props are
independent of the Settings page. `getSettingGroups()` and
`formatSettingValue()` support grouped lists and readable details. UI imports
should use `definitions.ts` and type-only imports from `settings.ts`; the latter
contains main-process validation.
