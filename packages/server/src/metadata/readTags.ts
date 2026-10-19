import type { Stats } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { extname } from 'node:path'
import { ExifTool } from 'exiftool-vendored'
import { readOsTags } from './osTags.js'
import { normalizeTags } from './tags.js'

// Formats with supported keyword metadata. Skip source code and arbitrary binary files.
const embeddedExtensions = new Set(
  'jpg jpeg png webp gif tiff tif heic heif avif raw cr2 cr3 nef arw dng orf rw2 raf pef srw psd xmp pdf doc docx xls xlsx ppt pptx odt ods odp mp3 m4a mp4 m4v mov wav flac ogg opus wma wmv avi mkv mka webm'.split(
    ' ',
  ),
)

export type ImportedTags = {
  osTags?: string[]
  embeddedTags?: string[]
  tagReadError: string | null
}

/** Select keyword fields only; arbitrary EXIF properties are not user tags. */
export function embeddedTagsFromMetadata(
  metadata: Record<string, unknown>,
): string[] {
  const tags: string[] = []

  for (const [key, value] of Object.entries(metadata)) {
    const name = key.split(':').at(-1)

    if (
      !name ||
      ![
        'Keywords',
        'Subject',
        'XPKeywords',
        'LastKeywordXMP',
        'LastKeywordIPTC',
        'HierarchicalSubject',
        'Category',
      ].includes(name)
    ) {
      continue
    }

    const values = Array.isArray(value) ? value : [value]

    for (const item of values) {
      if (typeof item !== 'string') {
        continue
      }

      // XPKeywords is a semicolon-delimited Windows keyword field.
      tags.push(...(name === 'XPKeywords' ? item.split(';') : [item]))
    }
  }

  return normalizeTags(tags)
}

export function createTagReader() {
  const exiftool = new ExifTool({ maxProcs: 1, taskTimeoutMillis: 10000 })
  let osResults: Awaited<ReturnType<typeof readOsTags>> = {}
  let unavailable: string | undefined

  return {
    // Batch native property lookups so Windows does not launch PowerShell per file.
    async prepare(paths: string[], metadata?: ReadonlyMap<string, Stats>) {
      if (unavailable) {
        const error = unavailable

        osResults = Object.fromEntries(paths.map((path) => [path, { error }]))

        return
      }

      try {
        const candidates = await Promise.all(
          paths.map(async (path) =>
            (metadata?.get(path) ?? (await lstat(path))).isSymbolicLink()
              ? null
              : path,
          ),
        )

        osResults = await readOsTags(candidates.filter((path) => path !== null))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          unavailable = message
        }

        osResults = Object.fromEntries(
          paths.map((path) => [path, { error: message }]),
        )
      }
    },
    async read(
      path: string,
      kind: 'file' | 'directory' | 'symlink',
      metadata?: Stats,
    ): Promise<ImportedTags> {
      // Do not follow links to read metadata outside the indexed tree.
      if (kind === 'symlink') {
        return { osTags: [], embeddedTags: [], tagReadError: null }
      }

      if (!osResults[path]) {
        await this.prepare(
          [path],
          metadata ? new Map([[path, metadata]]) : undefined,
        )
      }

      const os = osResults[path]

      delete osResults[path]

      const result: ImportedTags = { tagReadError: null }
      const errors: string[] = []

      if (os && 'tags' in os) {
        result.osTags = os.tags
      } else if (os && 'error' in os) {
        errors.push(`OS tags: ${os.error}`)
      }

      if (
        kind === 'file' &&
        embeddedExtensions.has(extname(path).slice(1).toLowerCase())
      ) {
        try {
          const metadata = await exiftool.readRaw(path, {
            readArgs: [
              '-G1',
              '-FileType',
              '-Error',
              '-Warning',
              '-Keywords',
              '-Subject',
              '-XPKeywords',
              '-LastKeywordXMP',
              '-LastKeywordIPTC',
              '-HierarchicalSubject',
              '-Category',
            ],
          })

          if (
            (metadata as Record<string, unknown>)['File:FileType'] === 'TXT'
          ) {
            throw new Error(
              'File content does not match a supported metadata format',
            )
          }

          if (metadata.warnings?.length) {
            throw new Error(metadata.warnings.join('; '))
          }

          if (metadata.errors?.length) {
            throw new Error(metadata.errors.join('; '))
          }

          result.embeddedTags = embeddedTagsFromMetadata(
            metadata as Record<string, unknown>,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)

          errors.push(`Embedded tags: ${message}`)
        }
      }

      if (
        kind !== 'file' ||
        !embeddedExtensions.has(extname(path).slice(1).toLowerCase())
      ) {
        result.embeddedTags = []
      }

      result.tagReadError = errors.length ? errors.join('; ') : null

      return result
    },
    close: () => exiftool.end(),
  }
}
