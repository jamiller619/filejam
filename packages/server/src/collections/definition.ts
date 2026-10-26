export const collectionFields = [
  'name',
  'relativePath',
  'volumeId',
  'kind',
  'mimeType',
  'size',
  'createdAt',
  'modifiedAt',
  'indexedAt',
  'lastOpenedAt',
  'favoritedAt',
] as const

export type CollectionField = (typeof collectionFields)[number]

export const collectionOperators = [
  'equals',
  'notEquals',
  'contains',
  'startsWith',
  'greaterThan',
  'lessThan',
  'isSet',
  'isNotSet',
] as const

export type CollectionOperator = (typeof collectionOperators)[number]

export type CollectionRule = {
  field: CollectionField
  operator: CollectionOperator
  value?: string | number
}

export type CollectionSort = {
  field: CollectionField
  direction: 'asc' | 'desc'
}

export type CollectionDefinition = {
  version: 1
  match: 'all' | 'any'
  rules: CollectionRule[]
  sort: CollectionSort[]
  limit: number | null
}

const textFields = new Set<CollectionField>([
  'name',
  'relativePath',
  'kind',
  'mimeType',
])

const nullableFields = new Set<CollectionField>([
  'mimeType',
  'size',
  'modifiedAt',
  'lastOpenedAt',
  'favoritedAt',
])

const operatorsByKind = {
  text: new Set<CollectionOperator>([
    'equals',
    'notEquals',
    'contains',
    'startsWith',
    'isSet',
    'isNotSet',
  ]),
  number: new Set<CollectionOperator>([
    'equals',
    'notEquals',
    'greaterThan',
    'lessThan',
    'isSet',
    'isNotSet',
  ]),
}

export const defaultCollectionDefinition: CollectionDefinition = {
  version: 1,
  match: 'all',
  rules: [],
  sort: [{ field: 'name', direction: 'asc' }],
  limit: null,
}

export function parseCollectionDefinition(
  input: unknown,
): CollectionDefinition {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid collection definition')
  }

  const candidate = input as Record<string, unknown>

  if (
    candidate.version !== 1 ||
    !['all', 'any'].includes(String(candidate.match)) ||
    !Array.isArray(candidate.rules) ||
    !Array.isArray(candidate.sort) ||
    candidate.sort.length === 0 ||
    candidate.sort.length > 3 ||
    (candidate.limit !== null &&
      (!Number.isSafeInteger(candidate.limit) ||
        Number(candidate.limit) < 1 ||
        Number(candidate.limit) > 10_000))
  ) {
    throw new Error('Invalid collection definition')
  }

  const rules = candidate.rules.map(parseRule)
  const sort = candidate.sort.map(parseSort)

  return {
    version: 1,
    match: candidate.match as 'all' | 'any',
    rules,
    sort,
    limit: candidate.limit as number | null,
  }
}

function parseRule(input: unknown): CollectionRule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid collection rule')
  }

  const candidate = input as Record<string, unknown>
  const field = candidate.field as CollectionField
  const operator = candidate.operator as CollectionOperator

  if (
    !collectionFields.includes(field) ||
    !collectionOperators.includes(operator)
  ) {
    throw new Error('Invalid collection rule')
  }

  const fieldKind = textFields.has(field) ? 'text' : 'number'

  if (!operatorsByKind[fieldKind].has(operator)) {
    throw new Error('Invalid collection rule')
  }

  if (['isSet', 'isNotSet'].includes(operator) && !nullableFields.has(field)) {
    throw new Error('Invalid collection rule')
  }

  if (!['isSet', 'isNotSet'].includes(operator)) {
    const expectedType = fieldKind === 'text' ? 'string' : 'number'

    if (
      typeof candidate.value !== expectedType ||
      (expectedType === 'string' && !String(candidate.value).trim()) ||
      (expectedType === 'number' && !Number.isFinite(candidate.value))
    ) {
      throw new Error('Invalid collection rule')
    }
  }

  return {
    field,
    operator,
    ...(!['isSet', 'isNotSet'].includes(operator)
      ? { value: candidate.value as string | number }
      : {}),
  }
}

function parseSort(input: unknown): CollectionSort {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid collection sort')
  }

  const candidate = input as Record<string, unknown>
  const field = candidate.field as CollectionField

  if (
    !collectionFields.includes(field) ||
    !['asc', 'desc'].includes(String(candidate.direction))
  ) {
    throw new Error('Invalid collection sort')
  }

  return {
    field,
    direction: candidate.direction as 'asc' | 'desc',
  }
}
