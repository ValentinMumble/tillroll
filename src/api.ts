import type {
  CategoryEdit,
  CategoryKey,
  Connection,
  Labels,
  Merges,
  PaymentCategories,
  Rules,
  Transaction,
} from './types'

export class RequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  // Owner mode rides on the session cookie the server set (see signIn).
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as { error?: string }).error
    throw new RequestError(response.status, message ?? `The server answered ${response.status}`)
  }
  return data as T
}

/** Checks the owner key; the server answers with a cookie that keeps this browser in owner mode for a year. */
export function signIn(key: string) {
  return request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ key }) })
}

export function signOut() {
  return request<{ ok: true }>('/api/logout', { method: 'POST', body: '{}' })
}

export interface OwnerData {
  transactions: Transaction[]
  rules: Rules
  categories: CategoryEdit[]
  merges: Merges
  labels: Labels
  paymentCategories: PaymentCategories
  /** Pairs of stores marked "not the same". */
  distinct: string[]
  connection: Connection | null
}

/** Owner only, like every call below. */
export function fetchOwnerData() {
  return request<OwnerData>('/api/data')
}

/** The address of the bank's login page. */
export async function startBankConnection() {
  return (await request<{ url: string }>('/api/connect', { method: 'POST', body: '{}' })).url
}

export function syncBank() {
  return request<{ syncedAt: string; booked: number; pending: number }>('/api/sync', { method: 'POST', body: '{}' })
}

export function disconnectBank() {
  return request<{ ok: true }>('/api/disconnect', { method: 'POST', body: '{}' })
}

export function saveRule(store: string, category: CategoryKey | null) {
  return request<{ ok: true }>('/api/rules', { method: 'PUT', body: JSON.stringify({ store, category }) })
}

export function saveCategories(categories: CategoryEdit[]) {
  return request<{ ok: true }>('/api/categories', { method: 'PUT', body: JSON.stringify({ categories }) })
}

/** Merges a store into another (by its name), or separates it again with null. */
export function saveMerge(store: string, into: string | null) {
  return request<{ ok: true }>('/api/merges', { method: 'PUT', body: JSON.stringify({ store, into }) })
}

/** Categories picked for single payments (null gives a payment back to its store's category). */
export function savePaymentCategories(categories: Record<string, CategoryKey | null>) {
  return request<{ ok: true }>('/api/payment-categories', { method: 'PUT', body: JSON.stringify({ categories }) })
}

/** Pairs of stores marked "not the same" in the duplicates deck. */
export function saveDistinct(pairs: string[]) {
  return request<{ ok: true }>('/api/distinct', { method: 'PUT', body: JSON.stringify({ pairs }) })
}

/** The labels of some payments, each one's full list (empty takes them off). */
export function saveLabels(labels: Labels) {
  return request<{ ok: true }>('/api/labels', { method: 'PUT', body: JSON.stringify({ labels }) })
}

export function importStatement(transactions: Transaction[]) {
  return request<{ saved: number }>('/api/import', { method: 'POST', body: JSON.stringify({ transactions }) })
}
