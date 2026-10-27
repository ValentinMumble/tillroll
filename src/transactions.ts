import type {Transaction} from './types';

/**
 * The owner's statement rows of a bank stop where that bank's synced history starts, per currency, so nothing counts
 * twice. The sync dates a row on the day the bank books it, so a statement's card payment compares by its debit day.
 * Rows with no bank (older ones) are Revolut's.
 */
export function withoutOverlap(transactions: Transaction[]) {
  const keyOf = (item: Transaction) => `${item.bank ?? 'Revolut'}|${item.currency}`;
  const bankStart = new Map<string, string>();
  for (const item of transactions) {
    if (item.source !== 'bank') continue;
    const start = bankStart.get(keyOf(item));
    if (!start || item.date < start) bankStart.set(keyOf(item), item.date);
  }
  return transactions.filter(item => {
    const start = bankStart.get(keyOf(item));
    return item.source !== 'statement' || !start || (item.bookedOn ?? item.date) < start;
  });
}

/** A deferred card's monthly debit, as an account's statement gives it ("Carte ...7497 (débit différé)"). */
const isCardTotal = (item: Transaction) => item.source === 'statement' && / \(débit différé\)$/.test(item.description);

/**
 * A deferred card's monthly debit leaves once the card's own statement lists the payments it paid: the card lines
 * debited in that month add up to it (to the cent). Two cards debited the same month leave together when both cards'
 * lines are in; with one card's lines only, the other card's debit stays.
 */
export function withoutCoveredTotals(transactions: Transaction[]) {
  const debitMonth = (item: Transaction) => {
    if (item.bookedOn) return item.bookedOn.slice(0, 7);
    // A total imported before the debit day was kept sits on the last day of the month before it.
    const next = new Date(`${item.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 7);
  };
  const cardLines = new Map<string, number>();
  for (const item of transactions) {
    if (item.source !== 'statement' || !item.bookedOn || isCardTotal(item)) continue;
    const key = `${item.bank}|${item.currency}|${debitMonth(item)}`;
    cardLines.set(key, (cardLines.get(key) ?? 0) + item.amount);
  }
  const totals = new Map<string, Transaction[]>();
  for (const item of transactions) {
    if (!isCardTotal(item)) continue;
    const key = `${item.bank}|${item.currency}|${debitMonth(item)}`;
    totals.set(key, [...(totals.get(key) ?? []), item]);
  }
  const covered = new Set<string>();
  for (const [key, list] of totals) {
    const lines = cardLines.get(key);
    if (lines === undefined) continue;
    const all = list.reduce((sum, item) => sum + item.amount, 0);
    const paid = Math.abs(lines - all) < 0.01 ? list : list.filter(item => Math.abs(lines - item.amount) < 0.01);
    for (const item of paid) covered.add(item.id);
  }
  return transactions.filter(item => !covered.has(item.id));
}
