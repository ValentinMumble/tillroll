import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { LABELS, redis } from './_lib/store.js'

function isLabelList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every((label) => typeof label === 'string' && label.trim().length > 0 && label.length <= 40)
  )
}

/**
 * PUT /api/labels { labels: { <transaction id>: [labels] } }: the labels of some payments, all of each one's at once.
 * An empty list takes them all off.
 */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { labels } = await readJson(request)
    const entries = labels && typeof labels === 'object' && !Array.isArray(labels) ? Object.entries(labels) : null
    if (!entries || entries.length > 2000 || !entries.every(([id, list]) => id.length <= 200 && isLabelList(list))) {
      throw new HttpError(400, 'Expected labels by payment')
    }
    const store = redis()
    const kept = entries.filter(([, list]) => (list as string[]).length > 0)
    const dropped = entries.filter(([, list]) => (list as string[]).length === 0).map(([id]) => id)
    if (kept.length) await store.hset(LABELS, Object.fromEntries(kept))
    if (dropped.length) await store.hdel(LABELS, ...dropped)
    return json({ ok: true })
  })
}
