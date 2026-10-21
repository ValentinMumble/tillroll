import type { CategoryEdit, Labels, Merges, PaymentCategories, Rules, Transaction } from '../src/types'
import { handle, json } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import {
  CATEGORIES,
  DISTINCT,
  LABELS,
  MERGES,
  PAYMENT_CATEGORIES,
  PENDING,
  redis,
  RULES,
  TRANSACTIONS,
} from './_lib/store.js'
import { connection } from './_lib/sync.js'

/**
 * GET /api/data: the owner's transactions (bank sync and imported statements), how they are sorted (categories per
 * store, categories changed, stores merged) and the bank connection.
 */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const store = redis()
    const [booked, pending, rules, categories, merges, labels, paymentCategories, distinct, current] =
      await Promise.all([
        store.hvals(TRANSACTIONS) as Promise<Transaction[]>,
        store.get<Transaction[]>(PENDING),
        store.hgetall<Rules>(RULES),
        store.get<CategoryEdit[]>(CATEGORIES),
        store.hgetall<Merges>(MERGES),
        store.hgetall<Labels>(LABELS),
        store.hgetall<PaymentCategories>(PAYMENT_CATEGORIES),
        store.smembers(DISTINCT),
        connection(),
      ])
    return json({
      transactions: [...booked, ...(pending ?? [])],
      rules: rules ?? {},
      categories: categories ?? [],
      merges: merges ?? {},
      labels: labels ?? {},
      paymentCategories: paymentCategories ?? {},
      distinct: distinct ?? [],
      connection: current,
    })
  })
}
