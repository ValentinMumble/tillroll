/** What a money movement is, as far as the bank or the statement tells. */
export type Kind = 'card' | 'refund' | 'transfer' | 'topup' | 'exchange' | 'atm' | 'fee' | 'income';

/** One money movement, from the bank sync, a statement file or the sample data. */
export interface Transaction {
  id: string;
  /** The day of the payment, YYYY-MM-DD. */
  date: string;
  /** The time of the payment, HH:MM, when the source gives it: statements do, the bank sync only gives the day. */
  time?: string;
  /** Negative when money goes out. */
  amount: number;
  currency: string;
  /** The bank's text: the store for a card payment, the payee for a transfer. */
  description: string;
  kind: Kind;
  /** Merchant category code (ISO 18245), from the bank sync only. */
  mcc: string | null;
  pending: boolean;
  source: 'bank' | 'statement' | 'sample';
  /** The bank a payment comes from (Revolut, Crédit Coopératif...); older rows have none: Revolut. */
  bank?: string;
  /** The bank's own category, from most general to most precise ("Logement - maison > Internet et telephonie"). */
  bankCategory?: string;
  /** The day the bank books it, when later than the payment (a deferred debit card): statements meet the sync there. */
  bookedOn?: string;
}

/** A built-in category's key, or "custom-..." for one added by hand. */
export type CategoryKey = string;

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
  | 'own'
  | 'income'
  | 'ignored';

/** The category picked by hand for a store or payee, by store key (see src/stores.ts). */
export type Rules = Record<string, CategoryKey>;

/** A category picked for one payment only (an Amazon gift among household shopping), by transaction id. */
export type PaymentCategories = Record<string, CategoryKey>;

/** Labels put on payments by hand (a trip, a gift, a shared bill), by transaction id. */
export type Labels = Record<string, string[]>;

/** A savings account's value on a day, typed by hand (an assurance vie's statement, a livret's balance). */
export interface SavingsValue {
  date: string;
  value: number;
}

/** A savings account's values typed by hand, and the name of an account added by hand (one no payment shows). */
export interface SavingsRecord {
  name?: string;
  values: SavingsValue[];
}

/** By account key (see src/savings.ts): the found accounts' values, and the accounts added by hand. */
export type SavingsValues = Record<string, SavingsRecord>;

/** Stores merged into another, by store key: the name of the store they are now part of. */
export type Merges = Record<string, string>;

/** A category as set by hand: a built-in one changed, or a new one. Only those are saved. */
export interface CategoryEdit {
  key: CategoryKey;
  label: string;
  icon: string;
  /** False for money that only moves or comes in: it is not counted as spending. */
  spending: boolean;
}

/** One of the owner's bank connections, as the page sees it. */
export interface Connection {
  /** "<bank>|<country>", as the server keeps it. */
  id: string;
  bank: string;
  validUntil: string;
  expired: boolean;
  accounts: {name: string; currency: string}[];
  syncedAt: string | null;
}
