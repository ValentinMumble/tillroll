import {createContext} from 'react';
import type {Transaction} from './types';

/** The payments the last fetch brought in, by id: their rows slide in at the top of the lists, then settle. */
export const FreshPayments = createContext<Set<string>>(new Set());

/** A store's name as the bank writes it, for comparing: lower case, letters and digits only. */
const storeText = (description: string) => description.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The payments `after` has that `before` did not. A booked payment taking the place of a pending one of the same store
 * (it gets a new id once booked) is no news: it was on the page already.
 */
export function freshPayments(before: Transaction[], after: Transaction[]) {
  const known = new Set(before.map(item => item.id));
  const now = new Set(after.map(item => item.id));
  // Pending payments gone since: each one excuses a single new payment of its store.
  const replaced = new Map<string, number>();
  for (const item of before) {
    if (!item.pending || now.has(item.id)) continue;
    replaced.set(storeText(item.description), (replaced.get(storeText(item.description)) ?? 0) + 1);
  }
  const fresh = new Set<string>();
  for (const item of after) {
    if (known.has(item.id)) continue;
    const store = storeText(item.description);
    const left = replaced.get(store) ?? 0;
    if (left > 0) replaced.set(store, left - 1);
    else fresh.add(item.id);
  }
  return fresh;
}
