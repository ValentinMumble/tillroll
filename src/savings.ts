import {shiftPeriod} from './periods';
import type {Row} from './report';
import type {SavingsValue, SavingsValues} from './types';

/**
 * The savings accounts found from the bank text of the money moved to and from them, as the current accounts see
 * it: an assurance vie paid by direct debit, a livret (LDDS, LEP) paid by transfer and paid back into the current
 * account ("VIREMENT VERS COMPTE DE DEPOT" at Crédit Coopératif), Revolut's savings (Vault, Flexible Cash Funds,
 * Instant Access Savings). A pocket's round-ups are left out: they come and go.
 */
export const FOUND_ACCOUNTS: {key: string; name: string; pattern: RegExp}[] = [
  {key: 'assurance-vie', name: 'Assurance vie', pattern: /bpce vie|assurance.?vie/i},
  {key: 'livret', name: 'Livret', pattern: /\bldds?\b|\blivret\b|\blep\b|compte de depot/i},
  {
    key: 'revolut-savings',
    name: 'Revolut savings',
    pattern: /savings vault|flexible (cash funds|account)|instant access savings/i,
  },
];

/** An account added by hand (a livret at another bank) has a key of its own. */
export const isAddedAccount = (key: string) => key.startsWith('added-');

/** A new key for an account added by hand, from its name. */
export function addedAccountKey(name: string, taken: string[]) {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'account';
  let key = `added-${slug}`;
  for (let number = 2; taken.includes(key); number += 1) key = `added-${slug}-${number}`;
  return key;
}

export interface SavingsAccount {
  key: string;
  name: string;
  /** The bank text of the money moved to and from it; an added account matches its own name. */
  pattern: RegExp;
  added: boolean;
  /** Paid in and taken out each month, from the first move to this month; none for an account no payment shows. */
  months: {month: string; paidIn: number; takenOut: number}[];
  paidIn: number;
  takenOut: number;
  first: string | null;
}

/** A livret is called what the bank's text calls it: LDDS, LEP, or Livret when it says neither. */
function livretName(moves: Row[]) {
  if (moves.some(row => /\bldds?\b/i.test(row.description))) return 'LDDS';
  if (moves.some(row => /\blep\b/i.test(row.description))) return 'LEP';
  return 'Livret';
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every savings account: the ones found from the payments (of one currency) and the ones added by hand. A found
 * account with no money moved is left out, an added one always shows.
 */
export function savingsAccounts(rows: Row[], thisMonth: string, stored: SavingsValues): SavingsAccount[] {
  const added = Object.entries(stored)
    .filter(([key, record]) => isAddedAccount(key) && record.name)
    .map(([key, record]) => ({
      key,
      name: record.name ?? key,
      pattern: new RegExp(`\\b${escaped(record.name ?? key)}\\b`, 'i'),
    }));
  return [...FOUND_ACCOUNTS, ...added]
    .map(({key, name, pattern}): SavingsAccount | null => {
      const moves = rows.filter(row => pattern.test(row.description) && !row.pending);
      const isAdded = isAddedAccount(key);
      if (moves.length === 0 && !isAdded) return null;
      const byMonth = new Map<string, {paidIn: number; takenOut: number}>();
      for (const row of moves) {
        const month = byMonth.get(row.date.slice(0, 7)) ?? {paidIn: 0, takenOut: 0};
        // Money leaving the current account goes in; money coming back was taken out.
        if (row.amount < 0) month.paidIn -= row.amount;
        else month.takenOut += row.amount;
        byMonth.set(row.date.slice(0, 7), month);
      }
      const first: string | null = moves.map(row => row.date).sort()[0] ?? null;
      const months: SavingsAccount['months'] = [];
      if (first) {
        for (let month = first.slice(0, 7); month <= thisMonth; month = shiftPeriod(month, 'month', 1)) {
          months.push({month, ...(byMonth.get(month) ?? {paidIn: 0, takenOut: 0})});
        }
      }
      return {
        key,
        name: key === 'livret' ? livretName(moves) : name,
        pattern,
        added: isAdded,
        months,
        paidIn: months.reduce((sum, month) => sum + month.paidIn, 0),
        takenOut: months.reduce((sum, month) => sum + month.takenOut, 0),
        first,
      };
    })
    .filter((account): account is SavingsAccount => account !== null);
}

/**
 * How much an account grew between two values typed by hand: the change in value, less what was paid in (and plus
 * what was taken out) in between. It needs no history before the first value.
 */
export function growthBetween(account: SavingsAccount, from: SavingsValue, to: SavingsValue, rows: Row[]) {
  const moved = rows
    .filter(row => account.pattern.test(row.description) && !row.pending && row.date > from.date && row.date <= to.date)
    .reduce((sum, row) => sum - row.amount, 0);
  return to.value - from.value - moved;
}
