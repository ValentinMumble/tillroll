import { Redis } from '@upstash/redis'
import type { Transaction } from '../../src/types'
import { HttpError } from './http.js'

/** The bank session (see Session in bank.ts). */
export const SESSION = 'tillroll:session'
/** Booked transactions, by id. */
export const TRANSACTIONS = 'tillroll:transactions'
/** Pending transactions from the last sync: they have no lasting id, so each sync replaces them all. */
export const PENDING = 'tillroll:pending'
/** Categories picked by hand, by store key. */
export const RULES = 'tillroll:rules'
/** When the last sync ran (ISO date-time). */
export const SYNCED_AT = 'tillroll:synced-at'
/** A bank authorization in progress, by its random state: proves the callback answers a request of the owner. */
export const authState = (state: string) => `tillroll:auth:${state}`

let client: Redis | null = null

/** The Upstash Redis client, from the variables Vercel adds when the store is connected. */
export function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new HttpError(503, 'The data store is not connected yet')
  client ??= new Redis({ url, token })
  return client
}

/** Writes transactions by id, in chunks: Upstash caps the size of one request. */
export async function saveTransactions(transactions: Transaction[]) {
  const store = redis()
  for (let start = 0; start < transactions.length; start += 500) {
    const chunk = transactions.slice(start, start + 500)
    await store.hset(TRANSACTIONS, Object.fromEntries(chunk.map((transaction) => [transaction.id, transaction])))
  }
}
