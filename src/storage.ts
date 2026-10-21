import type { Grain } from './periods'
import type { CategoryEdit, Labels, Merges, PaymentCategories, Rules, Transaction } from './types'

/**
 * A visitor's data lives in their browser only: the statement rows they imported (or just the choice of the
 * sample data, which is rebuilt each time), the categories they picked or changed and the stores they merged.
 */
const DATA = 'tillroll.data'
const RULES = 'tillroll.rules'
const CATEGORIES = 'tillroll.categories'
const MERGES = 'tillroll.merges'
const LABELS = 'tillroll.labels'
const PAYMENT_CATEGORIES = 'tillroll.payment-categories'
const DISTINCT = 'tillroll.distinct'
const GRAIN = 'tillroll.grain'
const PAYMENT_SORT = 'tillroll.payment-sort'

export type LocalData = { source: 'sample' } | { source: 'statement'; transactions: Transaction[] }

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

/** False when the browser refuses (private mode, full storage): the data then lasts until the page closes. */
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const loadLocalData = () => read<LocalData>(DATA)
export const saveLocalData = (data: LocalData | null) => write(DATA, data)

/** How the visitor sorts their payments: categories picked per store, categories changed, stores merged. */
export function loadLocalSorting() {
  return {
    rules: read<Rules>(RULES) ?? {},
    categories: read<CategoryEdit[]>(CATEGORIES) ?? [],
    merges: read<Merges>(MERGES) ?? {},
    labels: read<Labels>(LABELS) ?? {},
    paymentCategories: read<PaymentCategories>(PAYMENT_CATEGORIES) ?? {},
    distinct: read<string[]>(DISTINCT) ?? [],
  }
}

export function saveLocalSorting(
  sorting: {
    rules?: Rules
    categories?: CategoryEdit[]
    merges?: Merges
    labels?: Labels
    paymentCategories?: PaymentCategories
    distinct?: string[]
  } | null,
) {
  if (sorting === null) {
    for (const key of [RULES, CATEGORIES, MERGES, LABELS, PAYMENT_CATEGORIES, DISTINCT]) write(key, null)
    return
  }
  if (sorting.distinct) write(DISTINCT, sorting.distinct)
  if (sorting.paymentCategories) write(PAYMENT_CATEGORIES, sorting.paymentCategories)
  if (sorting.labels) write(LABELS, sorting.labels)
  if (sorting.rules) write(RULES, sorting.rules)
  if (sorting.categories) write(CATEGORIES, sorting.categories)
  if (sorting.merges) write(MERGES, sorting.merges)
}

export const loadGrain = (): Grain => {
  const saved = read<string>(GRAIN)
  return saved === 'week' || saved === 'year' || saved === 'all' ? saved : 'month'
}
export const saveGrain = (grain: Grain) => write(GRAIN, grain)

/** How the payment list is sorted, remembered in each browser. */
export interface PaymentSort {
  key: 'date' | 'amount' | 'store'
  descending: boolean
}

export function loadPaymentSort(): PaymentSort {
  const saved = read<PaymentSort>(PAYMENT_SORT)
  return saved && ['date', 'amount', 'store'].includes(saved.key) ? saved : { key: 'date', descending: true }
}

export const savePaymentSort = (sort: PaymentSort) => write(PAYMENT_SORT, sort)
