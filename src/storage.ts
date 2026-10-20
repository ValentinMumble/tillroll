import type { Rules, Transaction } from './types'

/**
 * A visitor's data lives in their browser only: the statement rows they imported (or just the choice of the
 * sample data, which is rebuilt each time) and the categories they picked by hand.
 */
const DATA = 'tillroll.data'
const RULES = 'tillroll.rules'
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
export const loadLocalRules = () => read<Rules>(RULES) ?? {}
export const saveLocalRules = (rules: Rules) => write(RULES, rules)
export const loadGrain = () => (read<string>(GRAIN) === 'week' ? 'week' : 'month')
export const saveGrain = (grain: 'week' | 'month') => write(GRAIN, grain)
