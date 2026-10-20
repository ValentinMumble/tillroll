import { createSession } from './_lib/bank.js'
import { HttpError } from './_lib/http.js'
import { authState, redis, SESSION, SYNCED_AT } from './_lib/store.js'
import { sync } from './_lib/sync.js'

function backToPage(query: Record<string, string>) {
  return new Response(null, {
    status: 302,
    headers: { Location: `/?${new URLSearchParams(query)}`, 'Cache-Control': 'no-store' },
  })
}

/**
 * GET /api/callback?code=&state=: where the bank sends the owner back. The state proves the owner started the
 * authorization (see /api/connect). The new session's first sync runs at once, while the bank still gives the
 * whole history, then the owner lands on the page.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  try {
    const store = redis()
    const state = query.get('state')
    const started = state ? await store.getdel<{ requiredHeaders: string[] }>(authState(state)) : null
    const refused = query.get('error')
    if (refused) return backToPage({ 'bank-error': query.get('error_description') || refused })
    const code = query.get('code')
    if (!started || !code) throw new HttpError(400, 'This link has expired: start the connection again')
    const session = await createSession(code, started.requiredHeaders)
    await store.set(SESSION, session)
    await store.del(SYNCED_AT)
    const result = await sync(request)
    return backToPage({ bank: 'connected', count: String(result.booked) })
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(error)
    const message = error instanceof HttpError ? error.message : 'The connection failed, try again later'
    return backToPage({ 'bank-error': message })
  }
}
