import type {
  Balance,
  Budgets,
  CategoryEdit,
  EarlierRules,
  Labels,
  Merges,
  Paybacks,
  PaymentCategories,
  Rules,
  SavingsStatements,
  SavingsValues,
  Transaction,
  Trips,
} from '../../src/types';
import {
  BALANCES,
  BUDGETS,
  CATEGORIES,
  DISTINCT,
  EARLIER_RULES,
  LABELS,
  MERGES,
  PAYBACKS,
  PAYMENT_CATEGORIES,
  redis,
  RULES,
  SAVINGS_STATEMENTS,
  SAVINGS_VALUES,
  TRANSACTIONS,
  TRIPS,
} from './store.js';
import {createHash} from 'node:crypto';
import {connections, pendingByBank} from './sync.js';

/**
 * The owner's data, for GET /api/data and the answer to a sync: the transactions (bank sync and imported
 * statements), how they are sorted (categories per store, categories changed, stores merged, money in linked to what
 * it pays back, labels and the trips among them), the savings values typed by hand and the statements read from PDFs,
 * the budgets, and the bank connections with their accounts' balances. Its `version` is a fingerprint of all that:
 * the page sends the one it has, and a sync answers "unchanged" instead of the same few megabytes again.
 */
export async function ownerData() {
  const data = await readOwnerData();
  return {...data, version: createHash('sha1').update(JSON.stringify(data)).digest('base64url')};
}

const byText = (first: string, second: string) => (first < second ? -1 : first > second ? 1 : 0);

/** A hash's fields in key order. */
function inKeyOrder<Hash extends object>(hash: Hash | null) {
  return Object.fromEntries(Object.entries(hash ?? {}).sort(([first], [second]) => byText(first, second))) as Hash;
}

async function readOwnerData() {
  const store = redis();
  const [
    booked,
    pending,
    rules,
    earlierRules,
    categories,
    merges,
    labels,
    trips,
    paymentCategories,
    paybacks,
    distinct,
    savingsValues,
    savingsStatements,
    budgets,
    balances,
    current,
  ] = await Promise.all([
    store.hvals(TRANSACTIONS) as Promise<Transaction[]>,
    pendingByBank(),
    store.hgetall<Rules>(RULES),
    store.hgetall<EarlierRules>(EARLIER_RULES),
    store.get<CategoryEdit[]>(CATEGORIES),
    store.hgetall<Merges>(MERGES),
    store.hgetall<Labels>(LABELS),
    store.hgetall<Trips>(TRIPS),
    store.hgetall<PaymentCategories>(PAYMENT_CATEGORIES),
    store.hgetall<Paybacks>(PAYBACKS),
    store.smembers(DISTINCT),
    store.hgetall<SavingsValues>(SAVINGS_VALUES),
    store.hgetall<SavingsStatements>(SAVINGS_STATEMENTS),
    store.hgetall<Budgets>(BUDGETS),
    store.hgetall<Record<string, Balance>>(BALANCES),
    connections(),
  ]);
  // In a fixed order: Redis hands a hash's fields and a set's members in any order, and the same data must read the
  // same, for its version.
  return {
    transactions: [...booked.sort((first, second) => byText(first.id, second.id)), ...Object.values(pending).flat()],
    rules: inKeyOrder(rules),
    earlierRules: inKeyOrder(earlierRules),
    categories: categories ?? [],
    merges: inKeyOrder(merges),
    labels: inKeyOrder(labels),
    trips: inKeyOrder(trips),
    paymentCategories: inKeyOrder(paymentCategories),
    paybacks: inKeyOrder(paybacks),
    distinct: (distinct ?? []).sort(byText),
    savingsValues: inKeyOrder(savingsValues),
    savingsStatements: inKeyOrder(savingsStatements),
    budgets: inKeyOrder(budgets),
    // The balances of the banks still connected.
    balances: Object.values(inKeyOrder(balances)).filter(balance => current.some(item => item.bank === balance.bank)),
    connections: current.sort((first, second) => byText(first.id, second.id)),
  };
}
