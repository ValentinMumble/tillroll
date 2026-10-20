/**
 * Days are "YYYY-MM-DD" strings and periods are "YYYY-MM" (a month) or the Monday "YYYY-MM-DD" (a week). The math
 * runs in UTC on those strings, so a time zone never moves a payment to another day.
 */
export type Grain = 'week' | 'month'

const DAY = 86_400_000

const pad = (value: number) => String(value).padStart(2, '0')
const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`)
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10)

export function addDays(date: string, days: number) {
  return dateOf(timeOf(date) + days * DAY)
}

/** Days from one date to another, both counted. */
export function daysBetween(from: string, to: string) {
  return Math.round((timeOf(to) - timeOf(from)) / DAY) + 1
}

/** Today in the browser's time zone. */
export function today() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayOf(date: string) {
  return (new Date(timeOf(date)).getUTCDay() + 6) % 7
}

export function periodOf(date: string, grain: Grain) {
  return grain === 'month' ? date.slice(0, 7) : addDays(date, -weekdayOf(date))
}

export function shiftPeriod(period: string, grain: Grain, steps: number) {
  if (grain === 'week') return addDays(period, steps * 7)
  const [year, month] = period.split('-').map(Number)
  const index = year * 12 + month - 1 + steps
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function periodStart(period: string, grain: Grain) {
  return grain === 'month' ? `${period}-01` : period
}

/** The last day of the period. */
export function periodEnd(period: string, grain: Grain) {
  return addDays(periodStart(shiftPeriod(period, grain, 1), grain), -1)
}

/** "October 2026" or "Week of 12 Oct"; short: "Oct" (with the year in January) or "12 Oct". */
export function periodLabel(period: string, grain: Grain, short = false) {
  const date = new Date(timeOf(periodStart(period, grain)))
  if (grain === 'month') {
    if (!short) return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    const month = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
    return date.getUTCMonth() === 0 ? `${month} ${String(date.getUTCFullYear()).slice(2)}` : month
  }
  const day = dayLabel(period)
  return short ? day : `Week of ${day}`
}

/** "12 Oct". */
export function dayLabel(date: string) {
  return new Date(timeOf(date)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
