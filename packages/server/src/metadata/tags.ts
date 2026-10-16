/** Preserve spelling and order while merging exact duplicate tags. */
export function normalizeTags(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function mergeTags(entry: {
  appTags: string[]
  osTags: string[]
  embeddedTags: string[]
}): string[] {
  return normalizeTags([
    ...entry.appTags,
    ...entry.osTags,
    ...entry.embeddedTags,
  ])
}
