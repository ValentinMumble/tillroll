import type { Connection, Transaction } from '../../src/types'
import { BankError, fetchTransactions, psuHeaders, toTransaction, type Session } from './bank.js'
import { HttpError } from './http.js'
import { PENDING, redis, saveTransactions, SESSION, SYNCED_AT } from './store.js'

/** Error codes that mean the owner has to authorize the access again. */
const NEEDS_CONSENT = ['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION', 'ACCESS_DENIED', 'UNAUTHORIZED_ACCESS']

function isExpired(session: Session) {
  return Boolean(session.expired) || session.validUntil < new Date().toISOString()
}

function dayBefore(date: string, days: number) {
  return new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10)
}

/** The bank connection as the page shows it, or null before the first connection. */
export async function connection(): Promise<Connection | null> {
  const store = redis()
  const [session, syncedAt] = await Promise.all([store.get<Session>(SESSION), store.get<string>(SYNCED_AT)])
  if (!session) return null
  return {
    bank: session.bank.name,
    validUntil: session.validUntil,
    expired: isExpired(session),
    accounts: session.accounts.map(({ name, currency }) => ({ name, currency })),
    syncedAt,
  }
}

/**
 * Fetches the transactions of every account of the session. The first sync after a connection fetches as far back
 * as the bank allows (many banks give the full history only in the first hour). Later ones start ten days before
 * the last sync, since a payment can be booked days after it happens. `request` is the owner's request when the
 * owner started the sync, null for the scheduled run.
 */
export async function sync(request: Request | null) {
  const store = redis()
  const [session, syncedAt] = await Promise.all([store.get<Session>(SESSION), store.get<string>(SYNCED_AT)])
  if (!session) throw new HttpError(409, 'No bank is connected yet')
  if (isExpired(session)) throw new HttpError(409, 'The access to the bank has expired: connect it again')
  const since = syncedAt ? dayBefore(syncedAt, 10) : null
  const headers = request ? psuHeaders(request, session.requiredHeaders) : {}
  const booked: Transaction[] = []
  const pending: Transaction[] = []
  try {
    for (const account of session.accounts) {
      for (const item of await fetchTransactions(account.uid, since, headers)) {
        const transaction = toTransaction(item, account.hash)
        if (transaction) (transaction.pending ? pending : booked).push(transaction)
      }
    }
  } catch (error) {
    if (error instanceof BankError && NEEDS_CONSENT.includes(error.code)) {
      await store.set(SESSION, { ...session, expired: true })
      throw new HttpError(409, 'The access to the bank has expired: connect it again')
    }
    if (error instanceof BankError && error.code === 'ASPSP_RATE_LIMIT_EXCEEDED') {
      throw new HttpError(429, 'The bank allows only a few syncs a day: try again in a few hours')
    }
    throw error
  }
  await saveTransactions(booked)
  const now = new Date().toISOString()
  await Promise.all([store.set(PENDING, pending), store.set(SYNCED_AT, now)])
  return { syncedAt: now, booked: booked.length, pending: pending.length }
}
