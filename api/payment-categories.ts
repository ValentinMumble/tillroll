import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { PAYMENT_CATEGORIES, redis } from './_lib/store.js'

/**
 * PUT /api/payment-categories { categories: { <transaction id>: <category> | null } }: categories picked for single
 * payments, over their store's. null gives the payment back to its store's category.
 */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { categories } = await readJson(request)
    const entries =
      categories && typeof categories === 'object' && !Array.isArray(categories) ? Object.entries(categories) : null
    const valid = (value: unknown) => value === null || (typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value))
    if (!entries || entries.length > 2000 || !entries.every(([id, value]) => id.length <= 200 && valid(value))) {
      throw new HttpError(400, 'Expected categories by payment')
    }
    const store = redis()
    const kept = entries.filter(([, value]) => value !== null)
    const dropped = entries.filter(([, value]) => value === null).map(([id]) => id)
    if (kept.length) await store.hset(PAYMENT_CATEGORIES, Object.fromEntries(kept))
    if (dropped.length) await store.hdel(PAYMENT_CATEGORIES, ...dropped)
    return json({ ok: true })
  })
}
