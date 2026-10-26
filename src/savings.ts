import {shiftPeriod} from './periods';
import type {Row} from './report';
import type {Balance, SavingsValue, SavingsValues} from './types';

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
  /** The money moved to and from it, newest first. */
  moves: Row[];
  added: boolean;
  /** The bank the money moved from (the most moves); none for an account no payment shows. */
  bank: string | null;
  /** Paid in and taken out each month, from the first move to this month; none for an account no payment shows. */
  months: {month: string; paidIn: number; takenOut: number}[];
  paidIn: number;
  takenOut: number;
  first: string | null;
}

function mostCommon(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
}

/** A livret is called what the bank's text calls it: LDDS, LEP, or Livret when it says neither. */
function livretName(moves: Row[]) {
  if (moves.some(row => /\bldds?\b/i.test(row.description))) return 'LDDS';
  if (moves.some(row => /\blep\b/i.test(row.description))) return 'LEP';
  return 'Livret';
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Interest paid to a savings account ("Net interest paid to …") is growth, not money moved to it. */
const INTEREST = /\binterest\b|\bint[ée]r[êe]ts?\b/i;

/**
 * A bank names a transfer between two accounts of one holder after the holder, as it writes their name ("VIR SEPA M
 * DUPONT JEAN"), not after the livret: Crédit Coopératif's bank sync does for every move, its statements for the
 * standing orders set up lately. At the livret's own bank, such a transfer is a move to or from the livret. A name
 * of one word (an account named after its currency) says nothing.
 */
function namesHolder(row: Row, holders: string[]) {
  const text = row.description.toLowerCase();
  return holders.some(holder => holder.trim().includes(' ') && text.includes(holder.trim().toLowerCase()));
}

/**
 * Every savings account: the ones found from the payments (of one currency) and the ones added by hand. A found
 * account with no money moved is left out, an added one always shows. `holders` are the account holders each bank
 * names, as the bank connections give them.
 */
export function savingsAccounts(
  rows: Row[],
  thisMonth: string,
  stored: SavingsValues,
  holders: Record<string, string[]> = {},
): SavingsAccount[] {
  const added = Object.entries(stored)
    .filter(([key, record]) => isAddedAccount(key) && record.name)
    .map(([key, record]) => ({
      key,
      name: record.name ?? key,
      pattern: new RegExp(`\\b${escaped(record.name ?? key)}\\b`, 'i'),
    }));
  return [...FOUND_ACCOUNTS, ...added]
    .map(({key, name, pattern}): SavingsAccount | null => {
      const named = rows.filter(
        row => pattern.test(row.description) && !row.pending && !INTEREST.test(row.description),
      );
      const bank = mostCommon(named.map(row => row.bank ?? 'Revolut'));
      const bankHolders = key === 'livret' && bank ? (holders[bank] ?? []) : [];
      const moves = bankHolders.length
        ? rows.filter(
            row =>
              !row.pending &&
              !INTEREST.test(row.description) &&
              (pattern.test(row.description) || ((row.bank ?? 'Revolut') === bank && namesHolder(row, bankHolders))),
          )
        : named;
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
        moves,
        added: isAdded,
        bank,
        months,
        paidIn: months.reduce((sum, month) => sum + month.paidIn, 0),
        takenOut: months.reduce((sum, month) => sum + month.takenOut, 0),
        first,
      };
    })
    .filter((account): account is SavingsAccount => account !== null);
}

/**
 * Its value now, estimated: the latest value typed, plus what was paid in since and less what was taken out. A move
 * on the day of the value is in the value already. Growth since then is not: the next value typed brings it in.
 */
export function estimateNow(account: SavingsAccount, latest: SavingsValue) {
  const moved = account.moves.filter(row => row.date > latest.date).reduce((sum, row) => sum - row.amount, 0);
  return {value: latest.value + moved, moved, isEstimate: Math.abs(moved) >= 0.005};
}

/**
 * Its value on a day, estimated: the value typed nearest before it plus the money moved since or, before the first
 * value typed, that one less the money moved in between. Null with no value typed.
 */
export function valueOn(account: SavingsAccount, values: SavingsValue[], date: string) {
  const sorted = [...values].sort((first, second) => (first.date < second.date ? -1 : 1));
  if (sorted.length === 0) return null;
  const moved = (from: string, to: string) =>
    account.moves.filter(row => row.date > from && row.date <= to).reduce((sum, row) => sum - row.amount, 0);
  const before = sorted.filter(item => item.date <= date).at(-1);
  return before ? before.value + moved(before.date, date) : sorted[0].value - moved(date, sorted[0].date);
}

/**
 * A bank's balance on a day (its accounts in one currency together: a payment does not say which account it is
 * from): the balance at the last sync, less what was booked after that day.
 */
/**
 * Each bank's balance in one currency, its accounts together, at the oldest of their days. PayPal is left out: it pays
 * from the bank accounts and holds nothing itself, and its payments repeat theirs.
 */
export function bankBalances(balances: Balance[], currency: string) {
  const banks = new Map<string, Balance>();
  for (const balance of balances) {
    if (balance.currency !== currency || balance.bank === 'PayPal') continue;
    const other = banks.get(balance.bank);
    banks.set(
      balance.bank,
      other
        ? {...other, amount: other.amount + balance.amount, date: other.date < balance.date ? other.date : balance.date}
        : balance,
    );
  }
  return banks;
}

export function balanceOn(balance: Balance, rows: Row[], date: string) {
  if (date >= balance.date) return balance.amount;
  return rows
    .filter(
      row =>
        (row.bank ?? 'Revolut') === balance.bank &&
        row.currency === balance.currency &&
        !row.pending &&
        row.date > date &&
        row.date <= balance.date,
    )
    .reduce((sum, row) => sum - row.amount, balance.amount);
}

/**
 * How much an account grew between two values typed by hand: the change in value, less what was paid in (and plus
 * what was taken out) in between. It needs no history before the first value.
 */
export function growthBetween(account: SavingsAccount, from: SavingsValue, to: SavingsValue) {
  const moved = account.moves
    .filter(row => row.date > from.date && row.date <= to.date)
    .reduce((sum, row) => sum - row.amount, 0);
  return to.value - from.value - moved;
}
