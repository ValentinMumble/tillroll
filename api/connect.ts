import { randomUUID } from 'node:crypto'
import { startAuthorization } from './_lib/bank.js'
import { handle, json } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { authState, redis } from './_lib/store.js'

/**
 * POST /api/connect: starts the bank authorization. The page sends the owner to the returned address; the bank
 * sends them back to /api/callback (or ENABLE_BANKING_REDIRECT_URL, which must lead there).
 */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const state = randomUUID()
    const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL || `${new URL(request.url).origin}/api/callback`
    const { url, requiredHeaders } = await startAuthorization(redirectUrl, state)
    await redis().set(authState(state), { requiredHeaders }, { ex: 900 })
    return json({ url })
  })
}
