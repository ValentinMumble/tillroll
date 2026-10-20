import type { Grain } from './periods'
import type { CategoryEdit, Merges, Rules, Transaction } from './types'

/**
 * A visitor's data lives in their browser only: the statement rows they imported (or just the choice of the
 * sample data, which is rebuilt each time), the categories they picked or changed and the stores they merged.
 */
const DATA = 'tillroll.data'
const RULES = 'tillroll.rules'
const CATEGORIES = 'tillroll.categories'
const MERGES = 'tillroll.merges'
const GRAIN = 'tillroll.grain'

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
  }
}

export function saveLocalSorting(sorting: { rules?: Rules; categories?: CategoryEdit[]; merges?: Merges } | null) {
  if (sorting === null) {
    for (const key of [RULES, CATEGORIES, MERGES]) write(key, null)
    return
  }
  if (sorting.rules) write(RULES, sorting.rules)
  if (sorting.categories) write(CATEGORIES, sorting.categories)
  if (sorting.merges) write(MERGES, sorting.merges)
}

export const loadGrain = (): Grain => {
  const saved = read<string>(GRAIN)
  return saved === 'week' || saved === 'year' || saved === 'all' ? saved : 'month'
}
export const saveGrain = (grain: Grain) => write(GRAIN, grain)
