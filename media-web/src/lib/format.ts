/** Display helpers. Kept pure so they can be reasoned about in isolation. */

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return COMPACT.format(value)
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '-'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const mins = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${mins}m ${rest.toString().padStart(2, '0')}s`
}

/** Clock format for player scrubbers - 1:04:09 or 4:09. */
export function timecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? m.toString().padStart(2, '0') : m.toString()
  return `${h > 0 ? `${h}:` : ''}${mm}:${s.toString().padStart(2, '0')}`
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '-'
  const delta = Date.now() - then
  const mins = Math.round(delta / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function clockTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '--:--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString(undefined, { hour12: false })
}
