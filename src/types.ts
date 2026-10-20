/** What a money movement is, as far as the bank or the statement tells. */
export type Kind = 'card' | 'refund' | 'transfer' | 'topup' | 'exchange' | 'atm' | 'fee' | 'income'

/** One money movement, from the bank sync, a statement file or the sample data. */
export interface Transaction {
  id: string
  /** The day of the payment, YYYY-MM-DD. */
  date: string
  /** Negative when money goes out. */
  amount: number
  currency: string
  /** The bank's text: the store for a card payment, the payee for a transfer. */
  description: string
  kind: Kind
  /** Merchant category code (ISO 18245), from the bank sync only. */
  mcc: string | null
  pending: boolean
  source: 'bank' | 'statement' | 'sample'
}

/** A built-in category's key, or "custom-..." for one added by hand. */
export type CategoryKey = string

export type BuiltInCategory =
  | 'groceries'
  | 'eating-out'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'fun'
  | 'travel'
  | 'health'
  | 'home'
  | 'cash'
  | 'other'
  | 'transfers'
  | 'income'

/** The category picked by hand for a store or payee, by store key (see src/stores.ts). */
export type Rules = Record<string, CategoryKey>

/** Stores merged into another, by store key: the name of the store they are now part of. */
export type Merges = Record<string, string>

/** A category as set by hand: a built-in one changed, or a new one. Only those are saved. */
export interface CategoryEdit {
  key: CategoryKey
  label: string
  icon: string
  /** False for money that only moves or comes in: it is not counted as spending. */
  spending: boolean
}

/** The owner's bank connection, as the page sees it. */
export interface Connection {
  bank: string
  validUntil: string
  expired: boolean
  accounts: { name: string; currency: string }[]
  syncedAt: string | null
}
