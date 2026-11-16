import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function benchmarkEntry(index) {
  return `${index % 10 === 0 ? 'dir' : 'file'}-${String(index).padStart(6, '0')}`
}

export async function createBenchmarkFixture(directory, size) {
  const root = join(directory, String(size))
  await mkdir(root, { recursive: true })
  for (let start = 0; start < size; start += 32) {
    await Promise.all(
      Array.from({ length: Math.min(32, size - start) }, (_, offset) => {
        const index = start + offset
        const path = join(root, benchmarkEntry(index))
        return index % 10 === 0 ? mkdir(path) : writeFile(path, '')
      }),
    )
  }
  return root
}

export function expectedBenchmarkNames(size, options) {
  const groups = [[], []]
  for (let index = 0; index < size; index += 1) {
    const name = benchmarkEntry(index)
    if (name.includes(options.nameContains)) {
      groups[index % 10 === 0 ? 0 : 1].push(name)
    }
  }
  if (options.sortDirection === 'desc') {
    for (const group of groups) {
      group.reverse()
    }
  }
  return groups.flat()
}

export function statistics(values) {
  if (!values.length) {
    return { count: 0, median: null, p95: null }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    median:
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  }
}

export async function createBrowserFixture(directory) {
  const root = join(directory, 'fixture')

  await mkdir(root, { recursive: true })
  await mkdir(join(root, 'Alpha'))
  await mkdir(join(root, 'zeta'))

  for (const file of [
    '.hidden',
    'Beta.txt',
    'file10.txt',
    'file2.txt',
    'résumé.txt',
    'space name.txt',
  ]) {
    await writeFile(join(root, file), '')
  }

  await writeFile(join(root, 'Alpha', 'inside.txt'), '')
  await createLargeBrowserFixture(directory)

  return root
}

export async function createLargeBrowserFixture(directory) {
  const root = join(directory, 'large-fixture')

  await mkdir(root, { recursive: true })

  const createEntry = async (index) => {
    const name = `entry-${String(index).padStart(5, '0')}.txt`
    await writeFile(join(root, name), '')
  }

  for (let start = 0; start < 10000; start += 32) {
    const end = Math.min(start + 32, 10000)
    await Promise.all(
      Array.from({ length: end - start }, (_, offset) =>
        createEntry(start + offset),
      ),
    )
  }

  return root
}
