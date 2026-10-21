import { handle, HttpError, json } from './_lib/http.js'
import { isCron, requireOwner } from './_lib/owner.js'
import { connections, sync } from './_lib/sync.js'

/** GET /api/sync: the daily Vercel Cron run (see vercel.json), in the background, every bank with access. */
export function GET(request: Request) {
  return handle(async () => {
    if (!isCron(request)) throw new HttpError(403, 'Only the scheduled run can call this')
    if (!(await connections()).some((connection) => !connection.expired)) {
      return json({ skipped: 'No bank access to sync' })
    }
    return json(await sync(null))
  })
}

/** POST /api/sync: the owner's page, when it opens and on Sync. The owner is there, so the banks limit less. */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    return json(await sync(request))
  })
}
