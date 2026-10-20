import { handle, HttpError, json } from './_lib/http.js'
import { isCron, requireOwner } from './_lib/owner.js'
import { connection, sync } from './_lib/sync.js'

/** GET /api/sync: the daily Vercel Cron run (see vercel.json), in the background. */
export function GET(request: Request) {
  return handle(async () => {
    if (!isCron(request)) throw new HttpError(403, 'Only the scheduled run can call this')
    const current = await connection()
    if (!current || current.expired) return json({ skipped: 'No bank access to sync' })
    return json(await sync(null))
  })
}

/** POST /api/sync: the owner's page, when it opens and on Sync. The owner is there, so the bank limits less. */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    return json(await sync(request))
  })
}
