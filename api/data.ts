import type { Rules, Transaction } from '../src/types'
import { handle, json } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { PENDING, redis, RULES, TRANSACTIONS } from './_lib/store.js'
import { connection } from './_lib/sync.js'

/** GET /api/data: the owner's transactions (bank sync and imported statements), categories and bank connection. */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const store = redis()
    const [booked, pending, rules, current] = await Promise.all([
      store.hvals(TRANSACTIONS) as Promise<Transaction[]>,
      store.get<Transaction[]>(PENDING),
      store.hgetall<Rules>(RULES),
      connection(),
    ])
    return json({ transactions: [...booked, ...(pending ?? [])], rules: rules ?? {}, connection: current })
  })
}
