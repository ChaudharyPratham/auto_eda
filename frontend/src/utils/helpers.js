/**
 * Shared utility helpers used across the frontend.
 */

/** Format a large number with K / M suffixes. */
export function formatNumber(num) {
  if (num === null || num === undefined) return 'N/A'
  const n = Number(num)
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Return a Tailwind text-color class based on missing-value percentage.
 * Green = 0 %, Yellow = < 5 %, Orange = < 20 %, Red = ≥ 20 %
 */
export function missingColor(pct) {
  if (pct === 0) return 'text-green-600'
  if (pct < 5) return 'text-yellow-500'
  if (pct < 20) return 'text-orange-500'
  return 'text-red-500'
}

/** Truncate a string to `max` characters, appending '…'. */
export function truncate(str, max = 24) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

/** Convert bytes to a human-readable string. */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
