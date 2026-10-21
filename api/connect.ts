import { randomUUID } from 'node:crypto'
import { startAuthorization } from './_lib/bank.js'
import { handle, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { authState, redis } from './_lib/store.js'

/**
 * POST /api/connect { name?, country? }: starts the authorization of a bank, by its Enable Banking name and country
 * (BANK_NAME and BANK_COUNTRY by default). The page sends the owner to the returned address; the bank sends them
 * back to /api/callback (or ENABLE_BANKING_REDIRECT_URL, which must lead there).
 */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { name, country } = await readJson(request)
    const state = randomUUID()
    const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL || `${new URL(request.url).origin}/api/callback`
    const { url, requiredHeaders } = await startAuthorization(redirectUrl, state, {
      name: typeof name === 'string' ? name : undefined,
      country: typeof country === 'string' && /^[A-Za-z]{2}$/.test(country) ? country : undefined,
    })
    await redis().set(authState(state), { requiredHeaders }, { ex: 900 })
    return json({ url })
  })
}
