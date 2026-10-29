import {Redis} from '@upstash/redis';
import type {Transaction} from '../../src/types';
import {HttpError} from './http.js';

/** The bank sessions (see Session in bank.ts), by "<bank>|<country>". */
export const SESSIONS = 'tillroll:sessions';
/** The one bank session kept before several banks were possible: moved into SESSIONS on first read. */
export const SESSION = 'tillroll:session';
/** Booked transactions, by id. */
export const TRANSACTIONS = 'tillroll:transactions';
/**
 * Pending transactions from the last sync of each bank ({ "<bank>|<country>": [...] }): they have no lasting id, so
 * each sync replaces its bank's. (An older version kept one list under tillroll:pending, left for it to read.)
 */
export const PENDING = 'tillroll:pending-by-bank';
/** Categories picked by hand, by store key. */
export const RULES = 'tillroll:rules';
/** Categories changed or added by hand (a list of CategoryEdit). */
export const CATEGORIES = 'tillroll:categories';
/** Pairs of stores marked "not the same" in the duplicates deck ("<key>|<key>", keys sorted). */
export const DISTINCT = 'tillroll:distinct';
/** The values typed for each savings account, by account key: a list of {date, value}. */
export const SAVINGS_VALUES = 'tillroll:savings-values';
/** A monthly budget per category, by category key. */
export const BUDGETS = 'tillroll:budgets';
/** Each bank account's balance at its last sync, by "<bank>|<country>|<account hash>". */
export const BALANCES = 'tillroll:balances';
/** Categories picked for one payment only, by transaction id. */
export const PAYMENT_CATEGORIES = 'tillroll:payment-categories';
/** Labels put on payments by hand, by transaction id. */
export const LABELS = 'tillroll:labels';
/** The labels marked as trips, by label: {from?, to?}, the days set by hand. */
export const TRIPS = 'tillroll:trips';
/** Money in linked by hand to the payment it pays back, by transaction id: the payment's id. */
export const PAYBACKS = 'tillroll:paybacks';
/** Stores merged into another, by store key: the name of the store they are part of. */
export const MERGES = 'tillroll:merges';
/** When the last sync ran, before each session kept its own (see Session.syncedAt). */
export const SYNCED_AT = 'tillroll:synced-at';
/** A bank authorization in progress, by its random state: proves the callback answers a request of the owner. */
export const authState = (state: string) => `tillroll:auth:${state}`;

let client: Redis | null = null;

/** The Upstash Redis client, from the variables Vercel adds when the store is connected. */
export function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, 'The data store is not connected yet');
  client ??= new Redis({url, token});
  return client;
}

/** Writes transactions by id, in chunks: Upstash caps the size of one request. */
export async function saveTransactions(transactions: Transaction[]) {
  const store = redis();
  for (let start = 0; start < transactions.length; start += 500) {
    const chunk = transactions.slice(start, start + 500);
    await store.hset(TRANSACTIONS, Object.fromEntries(chunk.map(transaction => [transaction.id, transaction])));
  }
}
