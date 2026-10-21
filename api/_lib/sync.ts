import type {Connection, Transaction} from '../../src/types';
import {BankError, fetchTransactions, psuHeaders, toTransaction, type Session} from './bank.js';
import {HttpError} from './http.js';
import {PENDING, redis, saveTransactions, SESSION, SESSIONS, SYNCED_AT} from './store.js';

/** Error codes that mean the owner has to authorize the access again. */
const NEEDS_CONSENT = ['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION', 'ACCESS_DENIED', 'UNAUTHORIZED_ACCESS'];

/** A bank's id among the sessions: "<bank>|<country>". */
export const bankKey = (bank: {name: string; country: string}) => `${bank.name}|${bank.country}`;

function isExpired(session: Session) {
  return Boolean(session.expired) || session.validUntil < new Date().toISOString();
}

function dayBefore(date: string, days: number) {
  return new Date(Date.parse(date) - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every bank session. The single session an older version kept is copied into the list the first time, and left in
 * place, so a site still running the older version keeps working until it is updated (disconnecting removes it).
 */
export async function sessions(): Promise<Session[]> {
  const store = redis();
  const [list, legacy, legacySyncedAt] = await Promise.all([
    store.hgetall<Record<string, Session>>(SESSIONS),
    store.get<Session>(SESSION),
    store.get<string>(SYNCED_AT),
  ]);
  const all = Object.values(list ?? {});
  if (legacy && !all.some(session => bankKey(session.bank) === bankKey(legacy.bank))) {
    const copied = {...legacy, syncedAt: legacy.syncedAt ?? legacySyncedAt ?? null};
    await store.hset(SESSIONS, {[bankKey(legacy.bank)]: copied});
    all.push(copied);
  }
  return all;
}

export async function saveSession(session: Session) {
  await redis().hset(SESSIONS, {[bankKey(session.bank)]: session});
}

/** The pending payments of each bank, from their last sync. */
export async function pendingByBank(): Promise<Record<string, Transaction[]>> {
  return (await redis().get<Record<string, Transaction[]>>(PENDING)) ?? {};
}

/** The bank connections as the page shows them. */
export async function connections(): Promise<Connection[]> {
  return (await sessions()).map(session => ({
    id: bankKey(session.bank),
    bank: session.bank.name,
    validUntil: session.validUntil,
    expired: isExpired(session),
    accounts: session.accounts.map(({name, currency}) => ({name, currency})),
    syncedAt: session.syncedAt ?? null,
  }));
}

/**
 * Fetches the transactions of every account of one session. The first sync after a connection fetches as far back
 * as the bank allows (many banks give the full history only in the first hour). Later ones start ten days before
 * the last sync, since a payment can be booked days after it happens.
 */
async function syncSession(session: Session, request: Request | null) {
  const since = session.syncedAt ? dayBefore(session.syncedAt, 10) : null;
  const headers = request ? psuHeaders(request, session.requiredHeaders) : {};
  const booked: Transaction[] = [];
  const pending: Transaction[] = [];
  try {
    for (const account of session.accounts) {
      for (const item of await fetchTransactions(account.uid, since, headers)) {
        const transaction = toTransaction(item, account.hash, session.bank.name);
        if (transaction) (transaction.pending ? pending : booked).push(transaction);
      }
    }
  } catch (error) {
    if (error instanceof BankError && NEEDS_CONSENT.includes(error.code)) {
      await saveSession({...session, expired: true});
      throw new HttpError(409, `The access to ${session.bank.name} has expired: connect it again`);
    }
    if (error instanceof BankError && error.code === 'ASPSP_RATE_LIMIT_EXCEEDED') {
      throw new HttpError(429, `${session.bank.name} allows only a few syncs a day: try again in a few hours`);
    }
    throw error;
  }
  await saveTransactions(booked);
  await saveSession({...session, syncedAt: new Date().toISOString()});
  return {booked: booked.length, pending};
}

/**
 * Syncs every bank that still has access, or only one (`only`, a bank key). One bank failing does not stop the
 * others: its error comes back with the counts. `request` is the owner's request when the owner started the sync,
 * null for the scheduled run.
 */
export async function sync(request: Request | null, only?: string) {
  const list = (await sessions()).filter(session => !only || bankKey(session.bank) === only);
  if (list.length === 0) throw new HttpError(409, 'No bank is connected yet');
  const live = list.filter(session => !isExpired(session));
  if (live.length === 0) throw new HttpError(409, 'The access to the bank has expired: connect it again');
  const pending = await pendingByBank();
  const errors: string[] = [];
  let booked = 0;
  let synced = 0;
  for (const session of live) {
    try {
      const result = await syncSession(session, request);
      pending[bankKey(session.bank)] = result.pending;
      booked += result.booked;
      synced += 1;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      errors.push(error.message);
    }
  }
  await redis().set(PENDING, pending);
  if (synced === 0)
    throw new HttpError(errors.some(error => error.includes('few syncs')) ? 429 : 409, errors.join(' '));
  const total = Object.values(pending).reduce((sum, items) => sum + items.length, 0);
  return {syncedAt: new Date().toISOString(), booked, pending: total, errors};
}
