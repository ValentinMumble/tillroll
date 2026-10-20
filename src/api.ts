import { ownerKey } from './owner'
import type { CategoryEdit, CategoryKey, Connection, Merges, Rules, Transaction } from './types'

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
  const key = ownerKey()
  if (key) headers.set('Authorization', `Bearer ${key}`)
  const response = await fetch(path, { ...init, headers })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as { error?: string }).error
    throw new RequestError(response.status, message ?? `The server answered ${response.status}`)
  }
  return data as T
}

export interface OwnerData {
  transactions: Transaction[]
  rules: Rules
  categories: CategoryEdit[]
  merges: Merges
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

export function importStatement(transactions: Transaction[]) {
  return request<{ saved: number }>('/api/import', { method: 'POST', body: JSON.stringify({ transactions }) })
}
