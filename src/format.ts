const formats = new Map<string, Intl.NumberFormat>()

/** "€1,234" (whole units from 100 up) or "€12.50". */
export function money(value: number, currency: string, cents = Math.abs(value) < 100) {
  const key = `${currency}|${cents}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
    formats.set(key, format)
  }
  return format.format(value)
}

/** "€1.2K" for axis ticks. */
export function compactMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** "just now", "3 h ago", "2 days ago". */
export function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}
