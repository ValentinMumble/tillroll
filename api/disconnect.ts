import { closeSession } from './_lib/bank.js'
import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { PENDING, redis, SESSION, SESSIONS, SYNCED_AT } from './_lib/store.js'
import { bankKey, pendingByBank, sessions } from './_lib/sync.js'

/** POST /api/disconnect { bank }: ends the access to one bank (its "<bank>|<country>" id). Its payments stay. */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { bank } = await readJson(request)
    const list = await sessions()
    const session = list.find((item) => bankKey(item.bank) === bank) ?? (list.length === 1 ? list[0] : undefined)
    if (!session) throw new HttpError(404, 'No such bank connection')
    try {
      await closeSession(session.id)
    } catch {
      // Already closed or expired at the bank: forgetting it here is enough.
    }
    const store = redis()
    const pending = await pendingByBank()
    delete pending[bankKey(session.bank)]
    // The session an older version kept goes too, or it would come back on the next read.
    const legacy = await store.get<{ bank: { name: string; country: string } }>(SESSION)
    const legacyToo = legacy && bankKey(legacy.bank) === bankKey(session.bank)
    await Promise.all([
      store.hdel(SESSIONS, bankKey(session.bank)),
      store.set(PENDING, pending),
      legacyToo ? store.del(SESSION, SYNCED_AT) : Promise.resolve(0),
    ])
    return json({ ok: true })
  })
}
