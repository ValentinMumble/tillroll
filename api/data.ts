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
} from '../src/types';
import {handle, json} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';
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
} from './_lib/store.js';
import {connections, pendingByBank} from './_lib/sync.js';

/**
 * GET /api/data: the owner's transactions (bank sync and imported statements), how they are sorted (categories per
 * store, categories changed, stores merged, money in linked to what it pays back, labels and the trips among them),
 * the savings values typed by hand and the statements read from PDFs, the
 * budgets, and the bank connections with their accounts' balances.
 */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request);
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
    return json({
      transactions: [...booked, ...Object.values(pending).flat()],
      rules: rules ?? {},
      earlierRules: earlierRules ?? {},
      categories: categories ?? [],
      merges: merges ?? {},
      labels: labels ?? {},
      trips: trips ?? {},
      paymentCategories: paymentCategories ?? {},
      paybacks: paybacks ?? {},
      distinct: distinct ?? [],
      savingsValues: savingsValues ?? {},
      savingsStatements: savingsStatements ?? {},
      budgets: budgets ?? {},
      // The balances of the banks still connected.
      balances: Object.values(balances ?? {}).filter(balance => current.some(item => item.bank === balance.bank)),
      connections: current,
    });
  });
}
