import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { MERGES, redis } from './_lib/store.js'

/** PUT /api/merges { store, into }: merges a store (its key) into another (its name). A null `into` separates it. */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { store: storeKey, into } = await readJson(request)
    if (typeof storeKey !== 'string' || !storeKey || storeKey.length > 200) throw new HttpError(400, 'Expected a store')
    const store = redis()
    if (into === null) await store.hdel(MERGES, storeKey)
    else if (typeof into === 'string' && into.trim() && into.length <= 200) {
      await store.hset(MERGES, { [storeKey]: into.trim() })
    } else throw new HttpError(400, 'Expected the store to merge into')
    return json({ ok: true })
  })
}
