import type {
  Balance,
  Budgets,
  CategoryEdit,
  CategoryKey,
  Connection,
  Labels,
  Merges,
  PaymentCategories,
  Rules,
  SavingsRecord,
  SavingsValues,
  Transaction,
} from './types';

export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  // Owner mode rides on the session cookie the server set (see signIn).
  const response = await fetch(path, {...init, headers, credentials: 'same-origin'});
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as {error?: string}).error;
    throw new RequestError(response.status, message ?? `The server answered ${response.status}`);
  }
  return data as T;
}

/** Checks the owner key; the server answers with a cookie that keeps this browser in owner mode for a year. */
export function signIn(key: string) {
  return request<{ok: true}>('/api/login', {method: 'POST', body: JSON.stringify({key})});
}

export function signOut() {
  return request<{ok: true}>('/api/logout', {method: 'POST', body: '{}'});
}

export interface OwnerData {
  transactions: Transaction[];
  rules: Rules;
  categories: CategoryEdit[];
  merges: Merges;
  labels: Labels;
  paymentCategories: PaymentCategories;
  /** Pairs of stores marked "not the same". */
  distinct: string[];
  savingsValues: SavingsValues;
  budgets: Budgets;
  balances: Balance[];
  connections: Connection[];
}

/** Owner only, like every call below. */
export function fetchOwnerData() {
  return request<OwnerData>('/api/data');
}

/** The address of the bank's login page, for a bank by its Enable Banking name and country. */
export async function startBankConnection(bank?: {name: string; country: string}) {
  return (await request<{url: string}>('/api/connect', {method: 'POST', body: JSON.stringify(bank ?? {})})).url;
}

/** The banks Enable Banking reads personal accounts of in a country. */
export async function fetchBanks(country: string) {
  return (await request<{banks: string[]}>(`/api/banks?country=${encodeURIComponent(country)}`)).banks;
}

export function syncBank() {
  return request<{syncedAt: string; booked: number; pending: number; errors: string[]}>('/api/sync', {
    method: 'POST',
    body: '{}',
  });
}

/** Ends the access to one bank, by its connection id. */
export function disconnectBank(bank: string) {
  return request<{ok: true}>('/api/disconnect', {method: 'POST', body: JSON.stringify({bank})});
}

export function saveRule(store: string, category: CategoryKey | null) {
  return request<{ok: true}>('/api/sorting?part=rules', {method: 'PUT', body: JSON.stringify({store, category})});
}

export function saveCategories(categories: CategoryEdit[]) {
  return request<{ok: true}>('/api/sorting?part=categories', {method: 'PUT', body: JSON.stringify({categories})});
}

/** Merges a store into another (by its name), or separates it again with null. */
export function saveMerge(store: string, into: string | null) {
  return request<{ok: true}>('/api/sorting?part=merges', {method: 'PUT', body: JSON.stringify({store, into})});
}

/** Categories picked for single payments (null gives a payment back to its store's category). */
export function savePaymentCategories(categories: Record<string, CategoryKey | null>) {
  return request<{ok: true}>('/api/sorting?part=payment-categories', {
    method: 'PUT',
    body: JSON.stringify({categories}),
  });
}

/** Pairs of stores marked "not the same" in the duplicates deck. */
/** A savings account's values typed by hand, all of them, and the name of one added by hand (null takes it off). */
export function saveSavingsValues(account: string, record: SavingsRecord | null) {
  return request<{ok: true}>('/api/sorting?part=savings-values', {
    method: 'PUT',
    body: JSON.stringify({account, ...(record ?? {values: []})}),
  });
}

/** A category's monthly budget (null takes it off). */
export function saveBudget(category: CategoryKey, amount: number | null) {
  return request<{ok: true}>('/api/sorting?part=budgets', {method: 'PUT', body: JSON.stringify({category, amount})});
}

export function saveDistinct(pairs: string[]) {
  return request<{ok: true}>('/api/sorting?part=distinct', {method: 'PUT', body: JSON.stringify({pairs})});
}

/** The labels of some payments, each one's full list (empty takes them off). */
export function saveLabels(labels: Labels) {
  return request<{ok: true}>('/api/sorting?part=labels', {method: 'PUT', body: JSON.stringify({labels})});
}

export function importStatement(transactions: Transaction[]) {
  return request<{saved: number}>('/api/import', {method: 'POST', body: JSON.stringify({transactions})});
}
