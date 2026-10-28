import type {
  Balance,
  Budgets,
  CategoryEdit,
  Labels,
  Merges,
  Paybacks,
  PaymentCategories,
  Rules,
  SavingsValues,
  Transaction,
} from '../src/types';
import {handle, json} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';
import {
  BALANCES,
  BUDGETS,
  CATEGORIES,
  DISTINCT,
  LABELS,
  MERGES,
  PAYBACKS,
  PAYMENT_CATEGORIES,
  redis,
  RULES,
  SAVINGS_VALUES,
  TRANSACTIONS,
} from './_lib/store.js';
import {connections, pendingByBank} from './_lib/sync.js';

/**
 * GET /api/data: the owner's transactions (bank sync and imported statements), how they are sorted (categories per
 * store, categories changed, stores merged, money in linked to what it pays back), the savings values typed by hand,
 * the budgets, and the bank connections with their accounts' balances.
 */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request);
    const store = redis();
    const [
      booked,
      pending,
      rules,
      categories,
      merges,
      labels,
      paymentCategories,
      paybacks,
      distinct,
      savingsValues,
      budgets,
      balances,
      current,
    ] = await Promise.all([
      store.hvals(TRANSACTIONS) as Promise<Transaction[]>,
      pendingByBank(),
      store.hgetall<Rules>(RULES),
      store.get<CategoryEdit[]>(CATEGORIES),
      store.hgetall<Merges>(MERGES),
      store.hgetall<Labels>(LABELS),
      store.hgetall<PaymentCategories>(PAYMENT_CATEGORIES),
      store.hgetall<Paybacks>(PAYBACKS),
      store.smembers(DISTINCT),
      store.hgetall<SavingsValues>(SAVINGS_VALUES),
      store.hgetall<Budgets>(BUDGETS),
      store.hgetall<Record<string, Balance>>(BALANCES),
      connections(),
    ]);
    return json({
      transactions: [...booked, ...Object.values(pending).flat()],
      rules: rules ?? {},
      categories: categories ?? [],
      merges: merges ?? {},
      labels: labels ?? {},
      paymentCategories: paymentCategories ?? {},
      paybacks: paybacks ?? {},
      distinct: distinct ?? [],
      savingsValues: savingsValues ?? {},
      budgets: budgets ?? {},
      // The balances of the banks still connected.
      balances: Object.values(balances ?? {}).filter(balance => current.some(item => item.bank === balance.bank)),
      connections: current,
    });
  });
}
