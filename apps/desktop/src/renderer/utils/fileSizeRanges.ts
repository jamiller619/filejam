export const fileSizeThresholds = [
  1_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000,
  100_000_000_000,
]

export function fileSizeRangeIndex(size: number): number {
  const index = fileSizeThresholds.findIndex((threshold) => size < threshold)

  return index === -1 ? fileSizeThresholds.length : index
}
