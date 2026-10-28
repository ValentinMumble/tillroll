import type {Balance, Connection, Transaction} from '../../src/types';
import {BankError, fetchBalance, fetchTransactions, psuHeaders, toTransaction, type Session} from './bank.js';
import {HttpError} from './http.js';
import {
  BALANCES,
  LABELS,
  PAYBACKS,
  PAYMENT_CATEGORIES,
  PENDING,
  redis,
  saveTransactions,
  SESSION,
  SESSIONS,
  SYNCED_AT,
} from './store.js';

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

/** A pending payment and the payment the bank books for it are this many days apart at most. */
const BOOKING_DAYS = 10;

/**
 * A pending payment gets a new id once the bank books it (or when its text changes). The labels and the category
 * picked for it, and its payback links (as the money in or as the payment paid back), move to the payment that took
 * its place: same account, amount and currency, a few days apart at most.
 */
async function carryOver(before: Transaction[], pending: Transaction[], booked: Transaction[]) {
  const pendingIds = new Set(pending.map(item => item.id));
  const gone = before.filter(item => !pendingIds.has(item.id));
  if (gone.length === 0) return;
  const store = redis();
  const ids = gone.map(item => item.id);
  const [labels, categories, paybacks] = await Promise.all([
    store.hmget<Record<string, string[] | null>>(LABELS, ...ids),
    store.hmget<Record<string, string | null>>(PAYMENT_CATEGORIES, ...ids),
    store.hgetall<Record<string, string>>(PAYBACKS),
  ]);
  const paidBack = new Set(Object.values(paybacks ?? {}));
  const beforeIds = new Set(before.map(item => item.id));
  const candidates = [...booked, ...pending.filter(item => !beforeIds.has(item.id))];
  const account = (id: string) => id.split(':').slice(0, 2).join(':');
  const days = (first: string, second: string) => Math.abs(Date.parse(first) - Date.parse(second)) / 86_400_000;
  const movedLabels: Record<string, string[]> = {};
  const movedCategories: Record<string, string> = {};
  const dropped: string[] = [];
  const moved = new Map<string, string>();
  for (const old of gone) {
    const label = labels?.[old.id];
    const category = categories?.[old.id];
    const linked = Boolean(paybacks?.[old.id]) || paidBack.has(old.id);
    if (!label?.length && !category && !linked) continue;
    const next = candidates
      .filter(
        item =>
          account(item.id) === account(old.id) &&
          item.amount === old.amount &&
          item.currency === old.currency &&
          days(item.date, old.date) <= BOOKING_DAYS,
      )
      .sort((first, second) => days(first.date, old.date) - days(second.date, old.date))[0];
    if (!next) continue;
    candidates.splice(candidates.indexOf(next), 1);
    if (label?.length) movedLabels[next.id] = label;
    if (category) movedCategories[next.id] = category;
    moved.set(old.id, next.id);
    dropped.push(old.id);
  }
  // Each payback link with its money in and its payment under their new ids.
  const movedPaybacks: Record<string, string> = {};
  const unlinked: string[] = [];
  for (const [id, paymentId] of Object.entries(paybacks ?? {})) {
    if (!moved.has(id) && !moved.has(paymentId)) continue;
    movedPaybacks[moved.get(id) ?? id] = moved.get(paymentId) ?? paymentId;
    if (moved.has(id)) unlinked.push(id);
  }
  if (Object.keys(movedPaybacks).length) await store.hset(PAYBACKS, movedPaybacks);
  if (unlinked.length) await store.hdel(PAYBACKS, ...unlinked);
  if (Object.keys(movedLabels).length) await store.hset(LABELS, movedLabels);
  if (Object.keys(movedCategories).length) await store.hset(PAYMENT_CATEGORIES, movedCategories);
  if (dropped.length) {
    await store.hdel(LABELS, ...dropped);
    await store.hdel(PAYMENT_CATEGORIES, ...dropped);
  }
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
  // The balances come last and never fail a sync: a bank may give none, or allow too few calls a day.
  const balances: Record<string, Balance> = {};
  for (const account of session.accounts) {
    try {
      const balance = await fetchBalance(account.uid, headers);
      if (balance)
        balances[`${bankKey(session.bank)}|${account.hash}`] = {
          bank: session.bank.name,
          name: account.name,
          ...balance,
        };
    } catch {
      // Logged by the bank call: the last balance kept stays.
    }
  }
  if (Object.keys(balances).length > 0) await redis().hset(BALANCES, balances);
  return {booked, pending};
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
      await carryOver(pending[bankKey(session.bank)] ?? [], result.pending, result.booked);
      pending[bankKey(session.bank)] = result.pending;
      booked += result.booked.length;
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
