import type {
  ErrorCode,
  ServiceEvent,
  StartInput,
  ViewOptions,
} from './protocol.js'

const errorCodes = new Set<ErrorCode>([
  'INVALID_REQUEST',
  'NOT_FOUND',
  'NOT_DIRECTORY',
  'PERMISSION_DENIED',
  'UNSUPPORTED_PATH',
  'IO_ERROR',
  'LIMIT_EXCEEDED',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  )
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isInteger(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maximum
  )
}

function hasUnicodeScalars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false
      }
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false
    }
  }

  return true
}

function validText(
  value: unknown,
  maximumBytes?: number,
  allowEmpty = false,
): value is string {
  if (!isString(value) || !hasUnicodeScalars(value) || value.includes('\0')) {
    return false
  }

  return (
    (allowEmpty || value.length > 0) &&
    (maximumBytes === undefined ||
      new TextEncoder().encode(value).length <= maximumBytes)
  )
}

function validPathSyntax(value: string): boolean {
  const extendedDrive = /^\\\\\?\\[A-Za-z]:[\\/]/.test(value)
  const extendedUnc = /^\\\\\?\\UNC\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/i.test(
    value,
  )
  const drive = /^[A-Za-z]:[\\/]/.test(value)
  const unc = /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value)
  const posix = value.startsWith('/') && !value.startsWith('//')

  if (
    value.startsWith('\\\\.\\') ||
    (value.startsWith('\\\\?\\') && !(extendedDrive || extendedUnc))
  ) {
    return false
  }

  if (!(extendedDrive || extendedUnc || drive || unc || posix)) {
    return false
  }

  return !value.split(/[\\/]+/).includes('..')
}

function validOptions(value: unknown): value is ViewOptions {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['nameContains', 'kind', 'sortDirection'])
  ) {
    return false
  }

  return (
    validText(value.nameContains, undefined, true) &&
    [...value.nameContains].length <= 1024 &&
    (value.kind === 'all' ||
      value.kind === 'file' ||
      value.kind === 'directory') &&
    (value.sortDirection === 'asc' || value.sortDirection === 'desc')
  )
}

export function validateRequestId(value: unknown): string {
  if (!isString(value) || !/^[A-Za-z0-9-]{1,64}$/.test(value)) {
    throw new TypeError('Invalid request id')
  }

  return value
}

function validEntry(value: unknown): boolean {
  if (!isRecord(value) || !hasKeys(value, ['path', 'name', 'kind'])) {
    return false
  }

  return (
    validText(value.path, 32768) &&
    validText(value.name) &&
    (value.kind === 'file' ||
      value.kind === 'directory' ||
      value.kind === 'symlink' ||
      value.kind === 'other')
  )
}

export function parseServiceEvent(value: unknown): ServiceEvent {
  if (!isRecord(value) || value.v !== 1 || !isString(value.type)) {
    throw new TypeError('Invalid service event envelope')
  }

  if (value.type === 'ready' && hasKeys(value, ['v', 'type'])) {
    return value as ServiceEvent
  }

  if (
    value.type === 'listing' &&
    hasKeys(value, [
      'v',
      'type',
      'id',
      'path',
      'parentPath',
      'total',
      'metrics',
    ])
  ) {
    const metrics = value.metrics
    if (
      isRecord(metrics) &&
      hasKeys(metrics, ['enumerationMs', 'filterSortMs']) &&
      typeof metrics.enumerationMs === 'number' &&
      Number.isFinite(metrics.enumerationMs) &&
      metrics.enumerationMs >= 0 &&
      typeof metrics.filterSortMs === 'number' &&
      Number.isFinite(metrics.filterSortMs) &&
      metrics.filterSortMs >= 0 &&
      validText(value.path, 32768) &&
      (value.parentPath === null || validText(value.parentPath, 32768)) &&
      isInteger(value.total, 250000)
    ) {
      validateRequestId(value.id)
      return value as ServiceEvent
    }
  }

  if (
    value.type === 'batch' &&
    hasKeys(value, ['v', 'type', 'id', 'offset', 'entries']) &&
    isInteger(value.offset, 250000) &&
    Array.isArray(value.entries) &&
    value.entries.length <= 256 &&
    value.entries.every(validEntry) &&
    new TextEncoder().encode(JSON.stringify(value)).length <= 524288
  ) {
    validateRequestId(value.id)
    return value as ServiceEvent
  }

  if (
    value.type === 'done' &&
    hasKeys(value, ['v', 'type', 'id', 'total']) &&
    isInteger(value.total, 250000)
  ) {
    validateRequestId(value.id)
    return value as ServiceEvent
  }

  if (value.type === 'cancelled' && hasKeys(value, ['v', 'type', 'id'])) {
    validateRequestId(value.id)
    return value as ServiceEvent
  }

  if (
    value.type === 'error' &&
    hasKeys(value, ['v', 'type', 'id', 'code', 'message']) &&
    typeof value.code === 'string' &&
    errorCodes.has(value.code as ErrorCode) &&
    validText(value.message, 4096)
  ) {
    validateRequestId(value.id)
    return value as ServiceEvent
  }

  throw new TypeError('Invalid service event')
}

export function validateStartInput(value: unknown): StartInput {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['generation', 'path', 'options']) ||
    !isInteger(value.generation, Number.MAX_SAFE_INTEGER) ||
    !validText(value.path, 32768) ||
    !validPathSyntax(value.path) ||
    !validOptions(value.options)
  ) {
    throw new TypeError('Invalid start input')
  }

  return value as unknown as StartInput
}
