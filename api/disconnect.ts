import { closeSession, type Session } from './_lib/bank.js'
import { handle, json } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { PENDING, redis, SESSION, SYNCED_AT } from './_lib/store.js'

/** POST /api/disconnect: ends the bank access. The transactions synced so far stay. */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const store = redis()
    const session = await store.get<Session>(SESSION)
    if (session) {
      try {
        await closeSession(session.id)
      } catch {
        // Already closed or expired at the bank: forgetting it here is enough.
      }
    }
    await store.del(SESSION, SYNCED_AT, PENDING)
    return json({ ok: true })
  })
}
