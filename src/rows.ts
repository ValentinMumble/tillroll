import {type Basis, type Categories, categoryOf, guessCategory, LEFT_OUT, UNSURE} from './categories';
import {addDays, shiftPeriod} from './periods';
import {storeKey, storeName} from './stores';
import type {CategoryKey, Labels, Merges, PaymentCategories, Rules, Transaction} from './types';

/**
 * The payments as Tillroll reads them: each transaction with its store (merges followed) and category, paired with the
 * other side of a move between one's own accounts (two banks, PayPal and the bank behind it) and with the payment a
 * refund gives back, so each euro counts once. Then the helpers that pick rows: by day, to show, to check, to sort.
 */

/** A transaction with its store and category, and what it adds to the spending. */
export interface Row extends Transaction {
  store: string;
  storeKey: string;
  /** The store's own key, before any merge. */
  ownStoreKey: string;
  ownStore: string;
  /** The key its merge is saved under: its own store's, or with its bank for a merge of that bank's payments only. */
  partKey: string;
  /** Its own store's name, with its bank for a merge of that bank's payments only. */
  partName: string;
  category: CategoryKey;
  /** The category Tillroll guesses, shown as the "Automatic" choice. */
  guessed: CategoryKey;
  /** What the category comes from: picked by hand, or how sure the guess is. */
  basis: Basis;
  /** The category counts as spending. */
  counts: boolean;
  /**
   * What the row adds to the spending: the amount turned positive, less what came back in refunds; negative for a
   * refund matched with no payment; 0 for a matched refund (its payment costs less instead), or when not spending.
   */
  spend: number;
  /** Left out of every total, money in and out too: between one's own accounts, or ignored by hand. */
  leftOut: boolean;
  /** Money back from a store, matched with a payment or not. */
  refund: boolean;
  /** For a matched refund: the payment it gives back. */
  refundOf: {id: string; date: string} | null;
  /** For a payment: how much of it came back in refunds. */
  refunded: number;
  /** Labels put on it by hand. */
  labels: string[];
  /** Its category was picked for this payment only, over its store's. */
  ownCategory: boolean;
}

/** How payments are sorted: categories picked per store, the categories themselves, stores merged. */
export interface Sorting {
  rules: Rules;
  categories: Categories;
  merges: Merges;
  labels: Labels;
  paymentCategories: PaymentCategories;
  /** The account holder's names (the bank accounts' names), for transfers to and from oneself. */
  me?: string[];
}

/** A refund is matched with a payment made at most this many days before it. */
const REFUND_DAYS = 180;
/** Money moved between one's own accounts at two banks leaves one and reaches the other this many days apart at most. */
const TRANSFER_DAYS = 3;

/** The bank a row comes from: older rows have none, they are Revolut's. */
export const bankOf = (row: Row) => row.bank ?? 'Revolut';

/**
 * A merge of one bank's payments only is saved under the store's key and the bank ("valentin dijkstra@Crédit
 * Coopératif"). One's own name is another account at each bank: Crédit Coopératif's "VIREMENT VERS VALENTIN DIJKSTRA"
 * goes to Revolut, Revolut's "To Valentin Dijkstra" to another bank.
 */
export const bankMergeKey = (storeKey: string, bank: string) => `${storeKey}@${bank}`;

/**
 * The day a card payment was made. A deferred debit card is booked at the start of the next month, with the day of
 * the payment in the text: "CB CAFE POP FACT 270826" was paid on 27 Aug 2026.
 */
function paidOn({date, description}: Transaction) {
  const fact = /\bFACT (\d{2})(\d{2})(\d{2})\b/.exec(description);
  if (!fact) return date;
  const day = `20${fact[3]}-${fact[2]}-${fact[1]}`;
  return !Number.isNaN(Date.parse(day)) && day <= date && day >= addDays(date, -62) ? day : date;
}
const cents = (amount: number) => Math.round(Math.abs(amount) * 100);

/** Oldest first, by day, then time, then id: one order for the same payments, however they were loaded. */
const chronological = (first: Row, second: Row) => {
  const firstKey = `${first.date} ${first.time ?? ''} ${first.id}`;
  const secondKey = `${second.date} ${second.time ?? ''} ${second.id}`;
  return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0;
};

/**
 * A payment with no category of its own takes the one picked for earlier payments of the same store and amount: two
 * monthly transfers to one account, the loan and the charges, sort themselves. Two picks at least, all the same, so
 * one gift among a store's purchases does not spread to every payment of that price.
 */
function followPicks(rows: Row[]) {
  const picks = new Map<string, CategoryKey[]>();
  const keyOf = (row: Row) => `${row.storeKey}|${row.currency}|${Math.sign(row.amount)}${cents(row.amount)}`;
  for (const row of rows) {
    if (!row.ownCategory) continue;
    picks.set(keyOf(row), [...(picks.get(keyOf(row)) ?? []), row.category]);
  }
  for (const row of rows) {
    const picked = picks.get(keyOf(row));
    if (row.ownCategory || !picked || picked.length < 2 || picked.some(category => category !== picked[0])) continue;
    row.category = picked[0];
    row.basis = 'picked';
  }
}

/**
 * Money between one's own accounts at two banks shows on both. The side that says so (a top-up, one's own name)
 * makes the other one, the same amount the other way at another bank a few days apart, a move between one's
 * accounts too: a card payment to Revolut from the other bank, say. A category picked by hand stays.
 */
function linkOwnTransfers(rows: Row[]) {
  if (new Set(rows.map(bankOf)).size < 2) return;
  const open = new Map<string, Row[]>();
  for (const row of rows) {
    // PayPal's payments pair with the bank's own way (see linkPayPal).
    if (row.category === 'own' || row.basis === 'picked' || row.bank === 'PayPal') continue;
    const key = `${row.currency}|${cents(row.amount)}`;
    const list = open.get(key) ?? [];
    list.push(row);
    open.set(key, list);
  }
  for (const own of rows) {
    if (own.category !== 'own') continue;
    const candidates = open.get(`${own.currency}|${cents(own.amount)}`) ?? [];
    const other = candidates.find(
      row =>
        Math.sign(row.amount) !== Math.sign(own.amount) &&
        bankOf(row) !== bankOf(own) &&
        Math.abs(Date.parse(row.date) - Date.parse(own.date)) <= TRANSFER_DAYS * 86_400_000,
    );
    if (!other) continue;
    other.category = 'own';
    other.basis = 'kind';
    candidates.splice(candidates.indexOf(other), 1);
  }
}

/** A PayPal payment and the bank payment behind it are this many days apart at most. */
const PAYPAL_DAYS = 4;

/**
 * PayPal, synced like a bank, names the shop of each payment, where the bank only says "PayPal". A bank payment to
 * PayPal of the same amount, up to 4 days apart, is the money that paid it: it moves between one's own accounts, and
 * the purchase counts once, at its shop. A payment in another currency matches on the shop's first word instead
 * ("Paypal *veloviewer" and "VeloViewer Ltd"). Money PayPal pays out to the bank is between one's accounts on both
 * sides: a withdrawal (PayPal's sync names it "Unknown", its statement "Retrait initié par l'utilisateur") pairs with
 * the bank's money in of as much first, so money received on PayPal the same day never takes its place. A card can
 * also name the shop instead of PayPal ("Alipay" for an AliExpress order paid with PayPal): a card payment of the
 * same amount, on the same day or the next, at a shop whose name starts with the same three letters, is that money
 * too. A category picked for the bank payment itself stays.
 */
function linkPayPal(rows: Row[]) {
  const paypal = rows.filter(row => row.bank === 'PayPal');
  if (!paypal.length) return;
  const open = rows.filter(row => row.bank !== 'PayPal' && /paypal/i.test(row.description) && !row.ownCategory);
  const linked = new Set<Row>();
  const firstWord = (row: Row) => row.storeKey.split(' ')[0];
  const near = (row: Row, payment: Row) =>
    Math.abs(Date.parse(row.date) - Date.parse(payment.date)) <= PAYPAL_DAYS * 86_400_000;
  const isWithdrawal = (payment: Row) =>
    payment.amount < 0 && (payment.kind === 'topup' || /^unknown$|retrait|withdraw/i.test(payment.description));
  const withdrawals = paypal.filter(isWithdrawal);
  // The bank sync names the money a card puts in for a purchase after the shop, like the purchase itself: that money
  // in pairs with the card's debit before the purchase can, or it would read as a refund of the purchase.
  const isFunding = (row: Row) =>
    row.amount > 0 &&
    paypal.some(
      other =>
        other.amount < 0 &&
        other.storeKey === row.storeKey &&
        other.currency === row.currency &&
        other.date === row.date &&
        cents(other.amount) === cents(row.amount),
    );
  const fundings = paypal.filter(isFunding);
  const others = paypal.filter(row => !isWithdrawal(row) && !isFunding(row));
  for (const payment of [...withdrawals, ...fundings, ...others]) {
    const gap = (row: Row) => Math.abs(Date.parse(row.date) - Date.parse(payment.date));
    // The closest in time of the bank's lines that fit.
    const twin = open
      .filter(row => {
        if (!near(row, payment)) return false;
        if (isWithdrawal(payment)) {
          return row.amount > 0 && row.currency === payment.currency && cents(row.amount) === cents(payment.amount);
        }
        if (row.currency === payment.currency) return cents(row.amount) === cents(payment.amount);
        return (
          row.amount < 0 && payment.amount < 0 && firstWord(row).length >= 4 && firstWord(row) === firstWord(payment)
        );
      })
      .sort((first, second) => gap(first) - gap(second))[0];
    // Money in that funds a purchase is never a refund, unless PayPal calls it one: a move between one's accounts,
    // even with a category picked for it (ticked with the purchase when sorting, say).
    const funds = isFunding(payment) && payment.kind !== 'refund';
    const keepsPick = payment.ownCategory && !funds;
    const toOwn = () => {
      payment.category = 'own';
      payment.basis = 'kind';
      payment.ownCategory = false;
    };
    // With no debit to pair (another card, the PayPal balance), it is a move all the same.
    if (!twin && funds) {
      toOwn();
      linked.add(payment);
    }
    if (!twin) continue;
    twin.category = 'own';
    twin.basis = 'kind';
    if (Math.sign(twin.amount) !== Math.sign(payment.amount) && !keepsPick) toOwn();
    open.splice(open.indexOf(twin), 1);
    linked.add(payment);
  }
  // Then the card payments naming the shop, for the PayPal purchases left.
  const start = (row: Row) => row.storeKey.replace(/[^a-z]/g, '').slice(0, 3);
  const charges = rows.filter(
    row =>
      row.bank !== 'PayPal' &&
      row.amount < 0 &&
      !row.ownCategory &&
      row.category !== 'own' &&
      !/paypal/i.test(row.description),
  );
  for (const payment of paypal) {
    if (linked.has(payment) || payment.amount >= 0 || isWithdrawal(payment) || start(payment).length < 3) continue;
    const twin = charges.find(
      row =>
        row.currency === payment.currency &&
        cents(row.amount) === cents(payment.amount) &&
        Math.abs(Date.parse(row.date) - Date.parse(payment.date)) <= 86_400_000 &&
        start(row) === start(payment),
    );
    if (!twin) continue;
    twin.category = 'own';
    twin.basis = 'kind';
    charges.splice(charges.indexOf(twin), 1);
  }
}

/**
 * Refunds: money back from a store. The bank says it is one, or a category that counts as spending was picked for
 * it; money in of exactly what a card payment at the same store cost counts too. Oldest first, each refund is
 * matched with the payment it gives back: the latest one at that store and bank in the 180 days before, with that
 * much not given back yet, the same amount first. That payment then costs what is left, in its own week and month.
 */
function matchRefunds(rows: Row[], categories: Categories) {
  const spends = (row: Row) => Boolean(categories.byKey[row.category]?.spending) && !LEFT_OUT.includes(row.category);
  const payments = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.amount >= 0 || row.pending || !spends(row)) continue;
    const key = `${bankOf(row)}|${row.currency}|${row.storeKey}`;
    const list = payments.get(key) ?? [];
    list.push(row);
    payments.set(key, list);
  }
  for (const list of payments.values()) list.sort((first, second) => (first.date < second.date ? -1 : 1));
  const credits = rows
    .filter(row => row.amount > 0 && !LEFT_OUT.includes(row.category))
    .sort((first, second) => (first.date < second.date ? -1 : 1));
  for (const credit of credits) {
    const sure = credit.kind === 'refund' || spends(credit);
    if (!sure && credit.kind !== 'income') continue;
    const since = addDays(credit.date, -REFUND_DAYS);
    const left = (row: Row) => -row.amount - row.refunded;
    const open = (payments.get(`${bankOf(credit)}|${credit.currency}|${credit.storeKey}`) ?? []).filter(
      row =>
        row.date <= credit.date &&
        row.date >= since &&
        left(row) >= credit.amount - 0.005 &&
        // Money in that the bank does not call a refund only matches a card payment: a person paying back is no store.
        (sure || row.kind === 'card'),
    );
    const exact = open.filter(row => Math.abs(left(row) - credit.amount) < 0.005).at(-1);
    const payment = exact ?? (sure ? open.at(-1) : undefined);
    if (!payment) {
      credit.refund = sure;
      continue;
    }
    payment.refunded += credit.amount;
    credit.refund = true;
    credit.refundOf = {id: payment.id, date: payment.date};
    if (!credit.ownCategory) {
      credit.category = payment.category;
      credit.basis = payment.basis === 'picked' ? 'picked' : 'kind';
    }
  }
}

export function toRows(
  transactions: Transaction[],
  {rules, categories, merges, labels, paymentCategories, me = []}: Sorting,
): Row[] {
  const rows: Row[] = transactions.map(transaction => {
    const ownStore = storeName(transaction.description);
    const ownStoreKey = storeKey(ownStore);
    const bank = transaction.bank ?? 'Revolut';
    // A merge of this bank's payments only comes before the store's own.
    const bankOnly = bankMergeKey(ownStoreKey, bank);
    const partKey = merges[bankOnly] ? bankOnly : ownStoreKey;
    let store = ownStore;
    let key = ownStoreKey;
    // A merged store takes the name of the one it is part of (a few steps at most: A into B into C). A store
    // renamed keeps its key when only the capitals change ("Edf" to "EDF"). Stores merged into each other in a loop
    // all end in the same one, the first by key.
    const path = [{key, name: ownStore}];
    for (let step = 0; step < 10 && merges[step === 0 ? partKey : key]; step += 1) {
      const name = merges[step === 0 ? partKey : key];
      const next = storeKey(name);
      if (next === key) {
        store = name;
        break;
      }
      const loop = path.findIndex(item => item.key === next);
      if (loop >= 0) {
        const end = path.slice(loop).reduce((first, item) => (item.key < first.key ? item : first));
        key = end.key;
        store = end.name;
        break;
      }
      path.push({key: next, name});
      store = name;
      key = next;
    }
    // A category picked for this payment wins over its store's.
    const own = paymentCategories[transaction.id];
    const ownCategory = Boolean(own && categories.byKey[own]);
    const {category, basis} = ownCategory
      ? {category: own, basis: 'picked' as const}
      : categoryOf(transaction, key, rules, categories, me);
    return {
      ...transaction,
      date: paidOn(transaction),
      store,
      storeKey: key,
      ownStore,
      ownStoreKey,
      partKey,
      partName: partKey === ownStoreKey ? ownStore : `${ownStore} (${bank})`,
      category,
      basis,
      guessed: guessCategory(transaction, me),
      // Set below, once own transfers and refunds are known.
      counts: false,
      spend: 0,
      leftOut: false,
      refund: false,
      refundOf: null,
      refunded: 0,
      labels: labels[transaction.id] ?? [],
      ownCategory,
    };
  });
  // The pairings below take the first match they meet: the same order every time, whatever order the payments came in.
  rows.sort(chronological);
  followPicks(rows);
  linkOwnTransfers(rows);
  linkPayPal(rows);
  matchRefunds(rows, categories);
  for (const row of rows) {
    row.leftOut = LEFT_OUT.includes(row.category);
    row.counts = !row.leftOut && categories.byKey[row.category].spending;
    row.spend = !row.counts || row.refundOf ? 0 : -row.amount - row.refunded;
  }
  return rows.sort((first, second) => (first.date < second.date ? 1 : first.date > second.date ? -1 : 0));
}

/**
 * What some payments (a store's, a category's) cost each month, from their first month to their last, months with
 * nothing included: the last `count` months of it.
 */
export function spendByMonth(rows: Row[], count = 24) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.spend !== 0) totals.set(row.date.slice(0, 7), (totals.get(row.date.slice(0, 7)) ?? 0) + row.spend);
  }
  if (totals.size === 0) return [];
  const sorted = [...totals.keys()].sort();
  let month = sorted[0];
  const last = sorted[sorted.length - 1];
  const list: {month: string; total: number}[] = [];
  while (month <= last) {
    list.push({month, total: totals.get(month) ?? 0});
    month = shiftPeriod(month, 'month', 1);
  }
  return list.slice(-count);
}

/** Rows from one day to another, both counted. Rows are sorted newest first. */
export function rowsBetween(rows: Row[], from: string, to: string) {
  return rows.filter(row => row.date >= from && row.date <= to);
}

/** The categories most payments went to (spending, Other left out), most first: a category picker offers them first. */
export function topCategories(rows: Row[], count: number): CategoryKey[] {
  const counts = new Map<CategoryKey, number>();
  for (const row of rows) {
    if (row.spend > 0 && row.category !== 'other') counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }
  return [...counts]
    .sort((first, second) => second[1] - first[1])
    .slice(0, count)
    .map(([key]) => key);
}

/** A payment whose category Tillroll guessed with little to go on (see UNSURE), money out only: one to check. */
export const isUnsure = (row: Row) => row.amount < 0 && UNSURE.includes(row.basis);

/**
 * Whether a payment list shows a payment: spending always, the rest on request. Transfers and money in (pay, a friend
 * paying back, a transfer to someone) and the moves between one's own accounts each have their own switch.
 */
export const isListed = (row: Row, {moneyIn, own}: {moneyIn: boolean; own: boolean}) =>
  row.counts || (row.category === 'own' ? own : moneyIn);

/** Money that came in (pay, a refund, a friend paying back), not from another account of one's own nor ignored. */
export const isIncoming = (row: Row) => row.amount > 0 && !row.leftOut;

/** A store whose category is a weak guess, waiting to be sorted by hand. */
export interface StoreToSort {
  key: string;
  name: string;
  currency: string;
  payments: number;
  /** Money out at that store, all time. */
  total: number;
  lastDate: string;
  /** A few of the bank's own texts, to recognise the store. */
  examples: string[];
  category: CategoryKey;
  basis: Basis;
}

/**
 * The stores with no category picked by hand whose guess is unsure (no clue, the broad retail merchant code, a
 * transfer to someone), money out only, biggest first: sorting those first changes the totals most. With
 * `everyGuess`, every store still on a guessed category, sure or not.
 */
export function storesToSort(rows: Row[], everyGuess = false): StoreToSort[] {
  const stores = new Map<string, StoreToSort & {votes: Map<CategoryKey, number>}>();
  for (const row of rows) {
    if (row.basis === 'picked' || row.amount >= 0) continue;
    const store = stores.get(row.storeKey) ?? {
      key: row.storeKey,
      name: row.store,
      currency: row.currency,
      payments: 0,
      total: 0,
      lastDate: row.date,
      examples: [] as string[],
      category: row.category,
      basis: row.basis,
      votes: new Map(),
    };
    store.payments += 1;
    store.total -= row.amount;
    if (row.date > store.lastDate) store.lastDate = row.date;
    if (store.examples.length < 3 && !store.examples.includes(row.description)) store.examples.push(row.description);
    const votes = (store.votes.get(row.category) ?? 0) + 1;
    store.votes.set(row.category, votes);
    // The store's category is the one most of its payments get, with what that guess comes from.
    if (votes > (store.votes.get(store.category) ?? 0) || store.category === row.category) {
      store.category = row.category;
      store.basis = row.basis;
    }
    stores.set(row.storeKey, store);
  }
  return [...stores.values()]
    .filter(store => everyGuess || UNSURE.includes(store.basis))
    .map(({votes: _votes, ...store}) => store)
    .sort((first, second) => second.total - first.total);
}
