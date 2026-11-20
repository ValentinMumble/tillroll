import type {
  Balance,
  Budgets,
  CategoryEdit,
  CategoryKey,
  Connection,
  EarlierRules,
  Labels,
  Merges,
  Paybacks,
  PaymentCategories,
  Rules,
  SavingsRecord,
  SavingsStatement,
  SavingsStatements,
  SavingsValues,
  Transaction,
  Trip,
  Trips,
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
  // Offline (the app opens with no network, see public/sw.js): a plain message rather than the browser's own.
  const response = await fetch(path, {...init, headers, credentials: 'same-origin'}).catch(() => {
    throw new RequestError(0, 'No connection to Tillroll');
  });
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (data as {error?: string} | undefined)?.error;
    throw new RequestError(response.status, message ?? `The server answered ${response.status}`);
  }
  // A page instead of data (a café's or a hotel's Wi-Fi login): an error, never empty data shown or kept on this device.
  if (data === undefined) throw new RequestError(response.status, 'No answer from Tillroll: check the connection');
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
  earlierRules: EarlierRules;
  categories: CategoryEdit[];
  merges: Merges;
  labels: Labels;
  trips: Trips;
  paymentCategories: PaymentCategories;
  paybacks: Paybacks;
  /** Pairs of stores marked "not the same". */
  distinct: string[];
  savingsValues: SavingsValues;
  savingsStatements?: SavingsStatements;
  budgets: Budgets;
  balances: Balance[];
  connections: Connection[];
  /** A fingerprint of the data (see api/_lib/data.ts): a sync answers "unchanged" when the page has this one. */
  version?: string;
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

/** What a sync answers: its counts when it ran, and the owner's data after it either way. */
export interface SyncResult {
  synced: boolean;
  syncedAt?: string;
  booked?: number;
  pending?: number;
  errors?: string[];
  /** Why the sync failed, when the page asked for one only if due (the data still comes). */
  error?: string;
  /** The data, unless it is still the version the page sent: then `unchanged`. */
  data?: OwnerData;
  unchanged?: boolean;
}

/**
 * Syncs the banks, or with `due` only those last synced more than 6 hours ago, and answers with the data, or only
 * that it is unchanged when it is still `version`.
 */
export function syncBank(due = false, version?: string) {
  return request<SyncResult>('/api/sync', {method: 'POST', body: JSON.stringify({due, version})});
}

/** Ends the access to one bank, by its connection id. */
export function disconnectBank(bank: string) {
  return request<{ok: true}>('/api/disconnect', {method: 'POST', body: JSON.stringify({bank})});
}

export function saveRule(store: string, category: CategoryKey | null) {
  return request<{ok: true}>('/api/sorting?part=rules', {method: 'PUT', body: JSON.stringify({store, category})});
}

/** A store's category from one payment on, and the categories it keeps before (see EarlierRules). */
export function saveRuleFrom(store: string, category: CategoryKey | null, earlier: EarlierRules[string]) {
  return request<{ok: true}>('/api/sorting?part=earlier-rules', {
    method: 'PUT',
    body: JSON.stringify({store, category, earlier}),
  });
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

/** Money in linked to the payment it pays back (null takes the link off). */
export function savePaybacks(paybacks: Record<string, string | null>) {
  return request<{ok: true}>('/api/sorting?part=paybacks', {method: 'PUT', body: JSON.stringify({paybacks})});
}

/** Pairs of stores marked "not the same" in the duplicates deck. */
/** A savings account's values typed by hand, all of them, and the name of one added by hand (null takes it off). */
export function saveSavingsValues(account: string, record: SavingsRecord | null) {
  return request<{ok: true}>('/api/sorting?part=savings-values', {
    method: 'PUT',
    body: JSON.stringify({account, ...(record ?? {values: []})}),
  });
}

/** An assurance vie's statements read from their PDFs, all of them (null takes them off). */
export function saveSavingsStatement(account: string, statement: SavingsStatement | null) {
  return request<{ok: true}>('/api/sorting?part=savings-statements', {
    method: 'PUT',
    body: JSON.stringify({account, statement}),
  });
}

/** A category's monthly budget (null takes it off). */
export function saveBudget(category: CategoryKey, amount: number | null) {
  return request<{ok: true}>('/api/sorting?part=budgets', {method: 'PUT', body: JSON.stringify({category, amount})});
}

export function saveDistinct(pairs: string[]) {
  return request<{ok: true}>('/api/sorting?part=distinct', {method: 'PUT', body: JSON.stringify({pairs})});
}

/** Marks a label as a trip, with its days when set by hand (null unmarks it). */
export function saveTrip(label: string, trip: Trip | null) {
  return request<{ok: true}>('/api/sorting?part=trips', {method: 'PUT', body: JSON.stringify({label, trip})});
}

/** The labels of some payments, each one's full list (empty takes them off). */
export function saveLabels(labels: Labels) {
  return request<{ok: true}>('/api/sorting?part=labels', {method: 'PUT', body: JSON.stringify({labels})});
}

export function importStatement(transactions: Transaction[]) {
  return request<{saved: number}>('/api/import', {method: 'POST', body: JSON.stringify({transactions})});
}
