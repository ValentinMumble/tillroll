import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { redis, RULES } from './_lib/store.js'

/** PUT /api/rules { store, category }: the category of a store, picked by hand. A null category drops the choice. */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { store: storeKey, category } = await readJson(request)
    if (typeof storeKey !== 'string' || !storeKey || storeKey.length > 200) throw new HttpError(400, 'Expected a store')
    const store = redis()
    if (category === null) await store.hdel(RULES, storeKey)
    else if (typeof category === 'string' && /^[a-z0-9-]{2,60}$/.test(category)) {
      await store.hset(RULES, { [storeKey]: category })
    } else throw new HttpError(400, 'Expected a category')
    return json({ ok: true })
  })
}
