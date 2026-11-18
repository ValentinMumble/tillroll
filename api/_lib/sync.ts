import type {Balance, Connection, Transaction} from '../../src/types';
import {BankError, fetchBalance, fetchTransactions, psuHeaders, toTransaction, type Session} from './bank.js';
import {HttpError} from './http.js';
import {matchBooked, replaced} from './pending.js';
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
  TRANSACTIONS,
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

/**
 * A pending payment may get a new id once the bank books it (or when its text changes); Revolut keeps the id, so
 * there is nothing to move (see replaced). The labels and the category
 * picked for it, and its payback links (as the money in or as the payment paid back), move to the payment that took
 * its place (see matchBooked): the same amount, or the same store for a hold or a tip. Labels join the ones the booked
 * payment has already.
 */
async function carryOver(before: Transaction[], pending: Transaction[], booked: Transaction[]) {
  const {gone, candidates} = replaced(before, pending, booked);
  if (gone.length === 0) return;
  const store = redis();
  const ids = gone.map(item => item.id);
  const [labels, categories, paybacks] = await Promise.all([
    store.hmget<Record<string, string[] | null>>(LABELS, ...ids),
    store.hmget<Record<string, string | null>>(PAYMENT_CATEGORIES, ...ids),
    store.hgetall<Record<string, string>>(PAYBACKS),
  ]);
  const paidBack = new Set(Object.values(paybacks ?? {}));
  // Only the ones with something to carry: a label, a category picked, a payback link.
  const carried = gone.filter(
    old => labels?.[old.id]?.length || categories?.[old.id] || paybacks?.[old.id] || paidBack.has(old.id),
  );
  if (carried.length === 0) return;
  const matches = matchBooked(carried, candidates);
  const nextIds = [...matches.values()].map(item => item.id);
  const kept = nextIds.length ? await store.hmget<Record<string, string[] | null>>(LABELS, ...nextIds) : null;
  const movedLabels: Record<string, string[]> = {};
  const movedCategories: Record<string, string> = {};
  const dropped: string[] = [];
  const moved = new Map<string, string>();
  for (const [oldId, next] of matches) {
    const label = labels?.[oldId];
    const category = categories?.[oldId];
    if (label?.length) movedLabels[next.id] = [...new Set([...(kept?.[next.id] ?? []), ...label])];
    if (category) movedCategories[next.id] = category;
    moved.set(oldId, next.id);
    dropped.push(oldId);
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
 * Each payment with when the sync first saw it (see Transaction.seenAt): kept from the payment stored or the pending
 * one of the last sync, now for a new one. Payments stored before this was kept stay without.
 */
async function withSeenAt(items: Transaction[], before: Transaction[]) {
  const now = new Date().toISOString();
  const known = new Map(before.map(item => [item.id, item]));
  for (let start = 0; start < items.length; start += 500) {
    const ids = items.slice(start, start + 500).map(item => item.id);
    const stored = await redis().hmget<Record<string, Transaction | null>>(TRANSACTIONS, ...ids);
    for (const [id, item] of Object.entries(stored ?? {})) if (item) known.set(id, item);
  }
  return items.map(item => {
    const old = known.get(item.id);
    if (!old) return {...item, seenAt: now};
    return old.seenAt ? {...item, seenAt: old.seenAt} : item;
  });
}

/**
 * Fetches the transactions of every account of one session. The first sync after a connection fetches as far back
 * as the bank allows (many banks give the full history only in the first hour). Later ones start ten days before
 * the last sync, since a payment can be booked days after it happens. `before` is the bank's pending payments of the
 * last sync.
 */
async function syncSession(session: Session, request: Request | null, before: Transaction[]) {
  const since = session.syncedAt ? dayBefore(session.syncedAt, 10) : null;
  const headers = request ? psuHeaders(request, session.requiredHeaders) : {};
  const fetched: Transaction[] = [];
  try {
    for (const account of session.accounts) {
      for (const item of await fetchTransactions(account.uid, since, headers)) {
        const transaction = toTransaction(item, account.hash, session.bank.name);
        if (transaction) fetched.push(transaction);
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
  const seen = await withSeenAt(fetched, before);
  const booked = seen.filter(item => !item.pending);
  const pending = seen.filter(item => item.pending);
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
      const result = await syncSession(session, request, pending[bankKey(session.bank)] ?? []);
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
