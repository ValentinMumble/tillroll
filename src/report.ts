import { CATEGORY, categoryOf, guessCategory } from './categories'
import { money } from './format'
import {
  addDays,
  dayLabel,
  daysBetween,
  type Grain,
  periodEnd,
  periodOf,
  periodStart,
  shiftPeriod,
  WEEKDAYS,
  weekdayOf,
} from './periods'
import { storeKey, storeName } from './stores'
import type { CategoryKey, Rules, Transaction } from './types'

/** A transaction with its store and category, and what it adds to the spending. */
export interface Row extends Transaction {
  store: string
  storeKey: string
  category: CategoryKey
  /** The category Tillroll guesses, shown as the "Automatic" choice. */
  guessed: CategoryKey
  /** What the row adds to the spending: the amount turned positive, negative for a refund, 0 when not spending. */
  spend: number
}

export function toRows(transactions: Transaction[], rules: Rules): Row[] {
  return transactions
    .map((transaction) => {
      const store = storeName(transaction.description)
      const key = storeKey(store)
      const category = categoryOf(transaction, key, rules)
      const spend = CATEGORY[category].spending ? -transaction.amount : 0
      return { ...transaction, store, storeKey: key, category, guessed: guessCategory(transaction), spend }
    })
    .sort((first, second) => (first.date < second.date ? 1 : first.date > second.date ? -1 : 0))
}

export interface StoreTotal {
  key: string
  name: string
  total: number
  visits: number
  category: CategoryKey
}

export interface Totals {
  total: number
  /** Payments counted as spending (refunds left out). */
  payments: number
  categories: Map<CategoryKey, number>
  stores: Map<string, StoreTotal>
  /** Money moved out without being spent (transfers, savings). */
  movedOut: number
  moneyIn: number
}

function totalsOf(rows: Row[]): Totals {
  const totals: Totals = { total: 0, payments: 0, categories: new Map(), stores: new Map(), movedOut: 0, moneyIn: 0 }
  for (const row of rows) {
    if (!CATEGORY[row.category].spending) {
      if (row.amount < 0) totals.movedOut -= row.amount
      else totals.moneyIn += row.amount
      continue
    }
    totals.total += row.spend
    if (row.spend > 0) totals.payments += 1
    totals.categories.set(row.category, (totals.categories.get(row.category) ?? 0) + row.spend)
    const store = totals.stores.get(row.storeKey) ?? {
      key: row.storeKey,
      name: row.store,
      total: 0,
      visits: 0,
      category: row.category,
    }
    store.total += row.spend
    if (row.spend > 0) store.visits += 1
    totals.stores.set(row.storeKey, store)
  }
  return totals
}

/** Rows from one day to another, both counted. Rows are sorted newest first. */
export function rowsBetween(rows: Row[], from: string, to: string) {
  return rows.filter((row) => row.date >= from && row.date <= to)
}

export interface Insight {
  icon: string
  text: string
}

export interface Subscription {
  name: string
  monthly: number
}

export interface Report {
  from: string
  to: string
  /** The period holds today: it is compared with the previous one at the same point. */
  ongoing: boolean
  current: Totals
  /** What the period is compared with: the previous one cut at the same point, or the usual period. */
  baseline: { total: number; categories: Map<CategoryKey, number>; label: string } | null
  series: { period: string; total: number; payments: number }[]
  usual: number | null
  insights: Insight[]
  subscriptions: Subscription[]
}

const GRAIN_WORD: Record<Grain, string> = { week: 'week', month: 'month' }

function percent(part: number, whole: number) {
  return Math.round((part / whole) * 100)
}

/** Stores charged about the same amount in at least 3 of the 4 months up to `month`, at most twice a month. */
function findSubscriptions(rows: Row[], month: string): Subscription[] {
  const months = [0, 1, 2, 3].map((step) => shiftPeriod(month, 'month', -step))
  const charges = new Map<string, { name: string; byMonth: Map<string, number[]> }>()
  for (const row of rowsBetween(rows, periodStart(months[3], 'month'), periodEnd(month, 'month'))) {
    if (row.spend <= 0) continue
    const entry = charges.get(row.storeKey) ?? { name: row.store, byMonth: new Map() }
    const list = entry.byMonth.get(row.date.slice(0, 7)) ?? []
    list.push(row.spend)
    entry.byMonth.set(row.date.slice(0, 7), list)
    charges.set(row.storeKey, entry)
  }
  const found: Subscription[] = []
  for (const { name, byMonth } of charges.values()) {
    const lists = [...byMonth.values()]
    if (lists.length < 3 || lists.some((list) => list.length > 2)) continue
    const amounts = lists.flat().sort((first, second) => first - second)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (amounts.every((amount) => Math.abs(amount - median) <= median * 0.15)) found.push({ name, monthly: median })
  }
  return found.sort((first, second) => second.monthly - first.monthly)
}

export function buildReport(rows: Row[], period: string, grain: Grain, now: string): Report {
  const from = periodStart(period, grain)
  const to = periodEnd(period, grain)
  const firstDay = rows.at(-1)?.date ?? from
  const lastDay = rows[0]?.date ?? to
  const ongoing = now >= from && now <= to
  const current = totalsOf(rowsBetween(rows, from, to))
  const word = GRAIN_WORD[grain]

  // The usual period: the mean of up to six periods before this one, from the first period with data.
  const firstPeriod = periodOf(firstDay, grain)
  const earlier = [1, 2, 3, 4, 5, 6]
    .map((step) => shiftPeriod(period, grain, -step))
    .filter((item) => item >= firstPeriod)
    .map((item) => totalsOf(rowsBetween(rows, periodStart(item, grain), periodEnd(item, grain))))
  const usualCategories = new Map<CategoryKey, number>()
  for (const totals of earlier) {
    for (const [key, value] of totals.categories) {
      usualCategories.set(key, (usualCategories.get(key) ?? 0) + value / earlier.length)
    }
  }
  const usual = earlier.length ? earlier.reduce((sum, totals) => sum + totals.total, 0) / earlier.length : null

  let baseline: Report['baseline'] = null
  if (ongoing) {
    const previous = shiftPeriod(period, grain, -1)
    if (previous >= firstPeriod) {
      const previousFrom = periodStart(previous, grain)
      // The same number of days into the previous period (a 31st falls back to the 30th, or the 28th).
      const cut = addDays(previousFrom, daysBetween(from, now) - 1)
      const previousTo = periodEnd(previous, grain)
      const totals = totalsOf(rowsBetween(rows, previousFrom, cut < previousTo ? cut : previousTo))
      baseline = { total: totals.total, categories: totals.categories, label: `this point last ${word}` }
    }
  } else if (usual !== null) {
    baseline = { total: usual, categories: usualCategories, label: `your usual ${word}` }
  }

  // The chart: 12 months or 16 weeks, ending with the latest period unless the chosen one is older.
  const count = grain === 'month' ? 12 : 16
  let last = periodOf(lastDay, grain)
  if (period > last) last = period
  else if (shiftPeriod(last, grain, -(count - 1)) > period) last = shiftPeriod(period, grain, count - 1)
  const series: Report['series'] = []
  for (let step = count - 1; step >= 0; step -= 1) {
    const item = shiftPeriod(last, grain, -step)
    if (periodEnd(item, grain) < firstDay) continue
    const totals = totalsOf(rowsBetween(rows, periodStart(item, grain), periodEnd(item, grain)))
    series.push({ period: item, total: totals.total, payments: totals.payments })
  }

  const subscriptions = grain === 'month' ? findSubscriptions(rows, period) : []
  const currency = rows[0]?.currency ?? 'EUR'
  const amount = (value: number) => money(value, currency)
  const insights: Insight[] = []

  if (baseline && baseline.total > 0) {
    const difference = current.total - baseline.total
    const share = percent(Math.abs(difference), baseline.total)
    if (ongoing) {
      insights.push({
        icon: difference > 0 ? '🔺' : '🔻',
        text: `${amount(current.total)} so far, ${amount(Math.abs(difference))} ${difference > 0 ? 'more' : 'less'} than at ${baseline.label}.`,
      })
    } else if (share < 5) {
      insights.push({ icon: '〰️', text: `${amount(current.total)} spent, about ${baseline.label}.` })
    } else {
      insights.push({
        icon: difference > 0 ? '🔺' : '🔻',
        text: `${amount(current.total)} spent, ${share}% ${difference > 0 ? 'more' : 'less'} than ${baseline.label} (${amount(baseline.total)}).`,
      })
    }
    const moves = [...new Set([...current.categories.keys(), ...baseline.categories.keys()])]
      .map((key) => ({ key, change: (current.categories.get(key) ?? 0) - (baseline.categories.get(key) ?? 0) }))
      .filter((move) => Math.abs(move.change) >= Math.max(15, baseline.total * 0.03))
      .sort((first, second) => second.change - first.change)
    const up = moves[0]
    const down = moves.at(-1)
    const against = ongoing ? `compared with ${baseline.label}` : `on ${baseline.label}`
    if (up && up.change > 0) {
      const category = CATEGORY[up.key]
      insights.push({ icon: category.icon, text: `${category.label} is up ${amount(up.change)} ${against}.` })
    }
    if (down && down.change < 0) {
      const category = CATEGORY[down.key]
      insights.push({ icon: category.icon, text: `${category.label} is down ${amount(-down.change)} ${against}.` })
    }
  }

  // Store insights leave out transfers (rent paid to a landlord is spending, but not a store).
  const payments = rowsBetween(rows, from, to).filter((row) => row.kind !== 'transfer')
  const stores = [...totalsOf(payments).stores.values()].sort((first, second) => second.total - first.total)
  const top = stores[0]
  if (top && top.total > 0) {
    const visits = top.visits === 1 ? '1 payment' : `${top.visits} payments`
    insights.push({ icon: '🏪', text: `${top.name} is your top store this ${word}: ${visits}, ${amount(top.total)}.` })
  }

  const before = new Set(rows.filter((row) => row.date < from).map((row) => row.storeKey))
  if (before.size) {
    const fresh = stores.filter((store) => !before.has(store.key) && store.total > 0)
    if (fresh.length === 1) {
      insights.push({ icon: '✨', text: `One new store this ${word}: ${fresh[0].name} (${amount(fresh[0].total)}).` })
    } else if (fresh.length > 1) {
      insights.push({
        icon: '✨',
        text: `${fresh.length} new stores this ${word}, the biggest is ${fresh[0].name} (${amount(fresh[0].total)}).`,
      })
    }
  }

  const spending = payments.filter((row) => row.spend > 0)
  const biggest = spending.reduce<Row | null>((best, row) => (!best || row.spend > best.spend ? row : best), null)
  if (biggest && spending.length > 1) {
    insights.push({
      icon: '🧾',
      text: `Biggest payment: ${biggest.store}, ${amount(biggest.spend)} on ${dayLabel(biggest.date)}.`,
    })
  }

  if (grain === 'month' && spending.length >= 12 && current.total > 0) {
    const byWeekday = Array.from({ length: 7 }, () => 0)
    for (const row of spending) byWeekday[weekdayOf(row.date)] += row.spend
    const busiest = byWeekday.indexOf(Math.max(...byWeekday))
    const share = percent(byWeekday[busiest], current.total)
    if (share >= 22) {
      insights.push({ icon: '📅', text: `${WEEKDAYS[busiest]} is your big day: ${share}% of this month's spending.` })
    }
  }

  if (subscriptions.length >= 2) {
    const sum = subscriptions.reduce((total, item) => total + item.monthly, 0)
    const names = subscriptions.slice(0, 4).map((item) => item.name)
    const more = subscriptions.length > 4 ? ` and ${subscriptions.length - 4} more` : ''
    insights.push({
      icon: '🔁',
      text: `${subscriptions.length} regular payments add up to ${amount(sum)} a month: ${names.join(', ')}${more}.`,
    })
  }

  return { from, to, ongoing, current, baseline, series, usual, insights, subscriptions }
}
