import { createHash, timingSafeEqual } from 'node:crypto'
import { bearerToken, HttpError } from './http.js'

function sameSecret(given: string | null, expected: string | undefined) {
  if (!expected || !given) return false
  // Hashing first gives both sides the same length, which timingSafeEqual needs.
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(expected))
}

/** True when the request carries the site owner's key (OWNER_KEY), sent by the page as a bearer token. */
export function isOwner(request: Request) {
  return sameSecret(bearerToken(request), process.env.OWNER_KEY)
}

/** True when Vercel Cron calls: it sends CRON_SECRET as a bearer token. */
export function isCron(request: Request) {
  return sameSecret(bearerToken(request), process.env.CRON_SECRET)
}

export function requireOwner(request: Request) {
  if (!isOwner(request)) throw new HttpError(403, 'Only the site owner can do this')
}
