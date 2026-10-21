import { type Basis, type Categories, categoryOf, guessCategory, LEFT_OUT, UNSURE } from './categories'
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
import type { CategoryKey, Labels, Merges, PaymentCategories, Rules, Transaction } from './types'

/** A transaction with its store and category, and what it adds to the spending. */
export interface Row extends Transaction {
  store: string
  storeKey: string
  /** The store's own key, before any merge. */
  ownStoreKey: string
  ownStore: string
  category: CategoryKey
  /** The category Tillroll guesses, shown as the "Automatic" choice. */
  guessed: CategoryKey
  /** What the category comes from: picked by hand, or how sure the guess is. */
  basis: Basis
  /** The category counts as spending. */
  counts: boolean
  /**
   * What the row adds to the spending: the amount turned positive, less what came back in refunds; negative for a
   * refund matched with no payment; 0 for a matched refund (its payment costs less instead), or when not spending.
   */
  spend: number
  /** Left out of every total, money in and out too: between one's own accounts, or ignored by hand. */
  leftOut: boolean
  /** Money back from a store, matched with a payment or not. */
  refund: boolean
  /** For a matched refund: the payment it gives back. */
  refundOf: { id: string; date: string } | null
  /** For a payment: how much of it came back in refunds. */
  refunded: number
  /** Labels put on it by hand. */
  labels: string[]
  /** Its category was picked for this payment only, over its store's. */
  ownCategory: boolean
}

/** How payments are sorted: categories picked per store, the categories themselves, stores merged. */
export interface Sorting {
  rules: Rules
  categories: Categories
  merges: Merges
  labels: Labels
  paymentCategories: PaymentCategories
  /** The account holder's names (the bank accounts' names), for transfers to and from oneself. */
  me?: string[]
}

/** A refund is matched with a payment made at most this many days before it. */
const REFUND_DAYS = 180
/** Money moved between one's own accounts at two banks leaves one and reaches the other this many days apart at most. */
const TRANSFER_DAYS = 3

const bankOf = (row: Row) => row.bank ?? 'Revolut'
const cents = (amount: number) => Math.round(Math.abs(amount) * 100)

/**
 * Money between one's own accounts at two banks shows on both. The side that says so (a top-up, one's own name)
 * makes the other one, the same amount the other way at another bank a few days apart, a move between one's
 * accounts too: a card payment to Revolut from the other bank, say. A category picked by hand stays.
 */
function linkOwnTransfers(rows: Row[]) {
  if (new Set(rows.map(bankOf)).size < 2) return
  const open = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.category === 'own' || row.basis === 'picked') continue
    const key = `${row.currency}|${cents(row.amount)}`
    const list = open.get(key) ?? []
    list.push(row)
    open.set(key, list)
  }
  for (const own of rows) {
    if (own.category !== 'own') continue
    const candidates = open.get(`${own.currency}|${cents(own.amount)}`) ?? []
    const other = candidates.find(
      (row) =>
        Math.sign(row.amount) !== Math.sign(own.amount) &&
        bankOf(row) !== bankOf(own) &&
        Math.abs(Date.parse(row.date) - Date.parse(own.date)) <= TRANSFER_DAYS * 86_400_000,
    )
    if (!other) continue
    other.category = 'own'
    other.basis = 'kind'
    candidates.splice(candidates.indexOf(other), 1)
  }
}

/**
 * Refunds: money back from a store. The bank says it is one, or a category that counts as spending was picked for
 * it; money in of exactly what a card payment at the same store cost counts too. Oldest first, each refund is
 * matched with the payment it gives back: the latest one at that store in the 180 days before, with that much not
 * given back yet, the same amount first. That payment then costs what is left, in its own week and month.
 */
function matchRefunds(rows: Row[], categories: Categories) {
  const spends = (row: Row) => Boolean(categories.byKey[row.category]?.spending) && !LEFT_OUT.includes(row.category)
  const payments = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.amount >= 0 || row.pending || !spends(row)) continue
    const key = `${row.currency}|${row.storeKey}`
    const list = payments.get(key) ?? []
    list.push(row)
    payments.set(key, list)
  }
  for (const list of payments.values()) list.sort((first, second) => (first.date < second.date ? -1 : 1))
  const credits = rows
    .filter((row) => row.amount > 0 && !LEFT_OUT.includes(row.category))
    .sort((first, second) => (first.date < second.date ? -1 : 1))
  for (const credit of credits) {
    const sure = credit.kind === 'refund' || spends(credit)
    if (!sure && credit.kind !== 'income') continue
    const since = addDays(credit.date, -REFUND_DAYS)
    const left = (row: Row) => -row.amount - row.refunded
    const open = (payments.get(`${credit.currency}|${credit.storeKey}`) ?? []).filter(
      (row) =>
        row.date <= credit.date &&
        row.date >= since &&
        left(row) >= credit.amount - 0.005 &&
        // Money in that the bank does not call a refund only matches a card payment: a person paying back is no store.
        (sure || row.kind === 'card'),
    )
    const exact = open.filter((row) => Math.abs(left(row) - credit.amount) < 0.005).at(-1)
    const payment = exact ?? (sure ? open.at(-1) : undefined)
    if (!payment) {
      credit.refund = sure
      continue
    }
    payment.refunded += credit.amount
    credit.refund = true
    credit.refundOf = { id: payment.id, date: payment.date }
    if (!credit.ownCategory) {
      credit.category = payment.category
      credit.basis = payment.basis === 'picked' ? 'picked' : 'kind'
    }
  }
}

export function toRows(
  transactions: Transaction[],
  { rules, categories, merges, labels, paymentCategories, me = [] }: Sorting,
): Row[] {
  const rows: Row[] = transactions.map((transaction) => {
    const ownStore = storeName(transaction.description)
    const ownStoreKey = storeKey(ownStore)
    let store = ownStore
    let key = ownStoreKey
    // A merged store takes the name of the one it is part of (a few steps at most: A into B into C). A store
    // renamed keeps its key when only the capitals change ("Edf" to "EDF").
    for (let step = 0; step < 5 && merges[key]; step += 1) {
      store = merges[key]
      const next = storeKey(store)
      if (next === key) break
      key = next
    }
    // A category picked for this payment wins over its store's.
    const own = paymentCategories[transaction.id]
    const ownCategory = Boolean(own && categories.byKey[own])
    const { category, basis } = ownCategory
      ? { category: own, basis: 'picked' as const }
      : categoryOf(transaction, key, rules, categories, me)
    return {
      ...transaction,
      store,
      storeKey: key,
      ownStore,
      ownStoreKey,
      category,
      basis,
      guessed: guessCategory(transaction, me),
      // Set below, once own transfers and refunds are known.
      counts: false,
      spend: 0,
      leftOut: false,
      refund: false,
      refundOf: null,
      refunded: 0,
      labels: labels[transaction.id] ?? [],
      ownCategory,
    }
  })
  linkOwnTransfers(rows)
  matchRefunds(rows, categories)
  for (const row of rows) {
    row.leftOut = LEFT_OUT.includes(row.category)
    row.counts = !row.leftOut && categories.byKey[row.category].spending
    row.spend = !row.counts || row.refundOf ? 0 : -row.amount - row.refunded
  }
  return rows.sort((first, second) => (first.date < second.date ? 1 : first.date > second.date ? -1 : 0))
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
    if (row.leftOut) continue
    if (!row.counts) {
      if (row.amount < 0) totals.movedOut -= row.amount
      else totals.moneyIn += row.amount
      continue
    }
    // A matched refund, or a payment given back in full: nothing to add.
    if (row.spend === 0) continue
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
  /** The period shown: "all" for all time. */
  period: string
  from: string
  to: string
  /** The period holds today: it is compared with the previous one at the same point. */
  ongoing: boolean
  current: Totals
  /** What the period is compared with: the previous one cut at the same point, or the usual period. */
  baseline: { total: number; categories: Map<CategoryKey, number>; label: string } | null
  /** The chart's periods, with what each category cost in them (for the trend lines). */
  series: {
    period: string
    total: number
    payments: number
    categories: Map<CategoryKey, number>
    stores: Map<string, StoreTotal>
    /** Still going (holds today), or only partly covered by the data (the first one): not a full period yet. */
    partial: 'ongoing' | 'first' | null
  }[]
  /** The chart's periods: years for all time, else the chosen grain. */
  chartGrain: Grain
  usual: number | null
  insights: Insight[]
  subscriptions: Subscription[]
}

/** How the insights name the period. */
const WORDING: Record<Grain, { word: string; scope: string; spending: string }> = {
  week: { word: 'week', scope: 'this week', spending: "this week's spending" },
  month: { word: 'month', scope: 'this month', spending: "this month's spending" },
  year: { word: 'year', scope: 'this year', spending: "this year's spending" },
  all: { word: 'period', scope: 'overall', spending: 'all your spending' },
}

/** Columns in the chart. */
const CHART_LENGTH: Record<Grain, number> = { week: 16, month: 12, year: 10, all: 10 }

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

export function buildReport(rows: Row[], period: string, grain: Grain, now: string, categories: Categories): Report {
  const firstDay = rows.at(-1)?.date ?? now
  const lastDay = rows[0]?.date ?? now
  // All time runs from the first payment to the last one.
  const from = grain === 'all' ? firstDay : periodStart(period, grain)
  const to = grain === 'all' ? lastDay : periodEnd(period, grain)
  const ongoing = grain !== 'all' && now >= from && now <= to
  const current = totalsOf(rowsBetween(rows, from, to))
  const { word, scope, spending: spendingWords } = WORDING[grain]
  // A period the data only partly covers (the first one) would make a poor comparison.
  const fullyCovered = (item: string) => periodStart(item, grain) >= firstDay

  // The usual period: the mean of up to six full periods before this one.
  const earlier =
    grain === 'all'
      ? []
      : [1, 2, 3, 4, 5, 6]
          .map((step) => shiftPeriod(period, grain, -step))
          .filter(fullyCovered)
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
    if (fullyCovered(previous)) {
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

  // The chart ends with the latest period unless the chosen one is older. All time shows the years.
  const chartGrain: Grain = grain === 'all' ? 'year' : grain
  const count = CHART_LENGTH[grain]
  const anchor = grain === 'all' ? periodOf(lastDay, chartGrain) : period
  let last = periodOf(lastDay, chartGrain)
  if (anchor > last) last = anchor
  else if (shiftPeriod(last, chartGrain, -(count - 1)) > anchor) last = shiftPeriod(anchor, chartGrain, count - 1)
  const series: Report['series'] = []
  for (let step = count - 1; step >= 0; step -= 1) {
    const item = shiftPeriod(last, chartGrain, -step)
    if (periodEnd(item, chartGrain) < firstDay) continue
    const itemStart = periodStart(item, chartGrain)
    const itemEnd = periodEnd(item, chartGrain)
    const totals = totalsOf(rowsBetween(rows, itemStart, itemEnd))
    series.push({
      period: item,
      total: totals.total,
      payments: totals.payments,
      categories: totals.categories,
      stores: totals.stores,
      partial: now >= itemStart && now <= itemEnd ? 'ongoing' : itemStart < firstDay ? 'first' : null,
    })
  }

  // Regular payments, as of the last month of the period that has data.
  const subscriptions = grain === 'week' ? [] : findSubscriptions(rows, periodOf(to < lastDay ? to : lastDay, 'month'))
  const currency = rows[0]?.currency ?? 'EUR'
  const amount = (value: number) => money(value, currency)
  const insights: Insight[] = []

  if (baseline && baseline.total > 0) {
    const moves = [...new Set([...current.categories.keys(), ...baseline.categories.keys()])]
      .map((key) => ({ key, change: (current.categories.get(key) ?? 0) - (baseline.categories.get(key) ?? 0) }))
      .filter((move) => Math.abs(move.change) >= Math.max(15, baseline.total * 0.03))
      .sort((first, second) => second.change - first.change)
    const up = moves[0]
    const down = moves.at(-1)
    const against = ongoing ? `compared with ${baseline.label}` : `on ${baseline.label}`
    if (up && up.change > 0) {
      const category = categories.byKey[up.key]
      insights.push({ icon: category.icon, text: `${category.label} is up ${amount(up.change)} ${against}.` })
    }
    if (down && down.change < 0) {
      const category = categories.byKey[down.key]
      insights.push({ icon: category.icon, text: `${category.label} is down ${amount(-down.change)} ${against}.` })
    }
  }

  // Store insights leave out transfers (rent paid to a landlord is spending, but not a store).
  const payments = rowsBetween(rows, from, to).filter((row) => row.kind !== 'transfer')
  const stores = [...totalsOf(payments).stores.values()].sort((first, second) => second.total - first.total)
  const top = stores[0]
  if (top && top.total > 0) {
    const visits = top.visits === 1 ? '1 payment' : `${top.visits} payments`
    insights.push({ icon: '🏪', text: `${top.name} is your top store ${scope}: ${visits}, ${amount(top.total)}.` })
  }

  const before = new Set(rows.filter((row) => row.date < from).map((row) => row.storeKey))
  if (before.size) {
    const fresh = stores.filter((store) => !before.has(store.key) && store.total > 0)
    if (fresh.length === 1) {
      insights.push({ icon: '✨', text: `One new store ${scope}: ${fresh[0].name} (${amount(fresh[0].total)}).` })
    } else if (fresh.length > 1) {
      insights.push({
        icon: '✨',
        text: `${fresh.length} new stores ${scope}, the biggest is ${fresh[0].name} (${amount(fresh[0].total)}).`,
      })
    }
  }

  const spending = payments.filter((row) => row.spend > 0)
  const biggest = spending.reduce<Row | null>((best, row) => (!best || row.spend > best.spend ? row : best), null)
  if (biggest && spending.length > 1) {
    insights.push({
      icon: '🧾',
      text: `Biggest payment: ${biggest.store}, ${amount(biggest.spend)} on ${dayLabel(biggest.date, grain === 'all')}.`,
    })
  }

  if (grain !== 'week' && spending.length >= 12 && current.total > 0) {
    const byWeekday = Array.from({ length: 7 }, () => 0)
    for (const row of spending) byWeekday[weekdayOf(row.date)] += row.spend
    const busiest = byWeekday.indexOf(Math.max(...byWeekday))
    const share = percent(byWeekday[busiest], current.total)
    if (share >= 22) {
      insights.push({ icon: '📅', text: `${WEEKDAYS[busiest]} is your big day: ${share}% of ${spendingWords}.` })
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

  return { period, from, to, ongoing, current, baseline, series, chartGrain, usual, insights, subscriptions }
}

/** A store whose category is a weak guess, waiting to be sorted by hand. */
export interface StoreToSort {
  key: string
  name: string
  currency: string
  payments: number
  /** Money out at that store, all time. */
  total: number
  lastDate: string
  /** A few of the bank's own texts, to recognise the store. */
  examples: string[]
  category: CategoryKey
  basis: Basis
}

/**
 * The stores with no category picked by hand whose guess is unsure (no clue, the broad retail merchant code, a
 * transfer to someone), money out only, biggest first: sorting those first changes the totals most. With
 * `everyGuess`, every store still on a guessed category, sure or not.
 */
export function storesToSort(rows: Row[], everyGuess = false): StoreToSort[] {
  const stores = new Map<string, StoreToSort & { votes: Map<CategoryKey, number> }>()
  for (const row of rows) {
    if (row.basis === 'picked' || row.amount >= 0) continue
    const store = stores.get(row.storeKey) ?? {
      key: row.storeKey,
      name: row.store,
      currency: row.currency,
      payments: 0,
      total: 0,
      lastDate: row.date,
      examples: [] as string[],
      category: row.category,
      basis: row.basis,
      votes: new Map(),
    }
    store.payments += 1
    store.total -= row.amount
    if (row.date > store.lastDate) store.lastDate = row.date
    if (store.examples.length < 3 && !store.examples.includes(row.description)) store.examples.push(row.description)
    const votes = (store.votes.get(row.category) ?? 0) + 1
    store.votes.set(row.category, votes)
    // The store's category is the one most of its payments get, with what that guess comes from.
    if (votes > (store.votes.get(store.category) ?? 0) || store.category === row.category) {
      store.category = row.category
      store.basis = row.basis
    }
    stores.set(row.storeKey, store)
  }
  return [...stores.values()]
    .filter((store) => everyGuess || UNSURE.includes(store.basis))
    .map(({ votes: _votes, ...store }) => store)
    .sort((first, second) => second.total - first.total)
}
