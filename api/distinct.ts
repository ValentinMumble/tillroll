import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { DISTINCT, redis } from './_lib/store.js'

/** PUT /api/distinct { pairs }: pairs of stores marked "not the same", so the duplicates deck never shows them again. */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { pairs } = await readJson(request)
    if (
      !Array.isArray(pairs) ||
      pairs.length === 0 ||
      pairs.length > 500 ||
      !pairs.every((pair) => typeof pair === 'string' && pair.includes('|') && pair.length <= 400)
    ) {
      throw new HttpError(400, 'Expected pairs of stores')
    }
    const [first, ...rest] = pairs as string[]
    await redis().sadd(DISTINCT, first, ...rest)
    return json({ ok: true })
  })
}
