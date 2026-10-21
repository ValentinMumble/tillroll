import { bankNames } from './_lib/bank.js'
import { handle, HttpError, json } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'

/** GET /api/banks?country=FR: the banks Enable Banking reads personal accounts of in a country, for the bank picker. */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const country = new URL(request.url).searchParams.get('country') ?? 'FR'
    if (!/^[A-Za-z]{2}$/.test(country)) throw new HttpError(400, 'Expected a two-letter country')
    return json({ banks: await bankNames(country) })
  })
}
