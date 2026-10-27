import type {Row} from './rows';
import type {CategoryKey} from './types';
import {plain} from './text';

/** A store as the duplicates deck shows it. */
export interface StoreInfo {
  key: string;
  name: string;
  currency: string;
  payments: number;
  total: number;
  lastDate: string;
  examples: string[];
  category: CategoryKey;
  /** The category was picked by hand for the store, not guessed. */
  picked: boolean;
}

/** Two stores that may be the same place, with the words their names share. */
export interface Pair {
  first: StoreInfo;
  second: StoreInfo;
  shared: string[];
}

/** Words that say nothing about which place it is: legal forms, towns, kinds of shop, payment apps. */
const COMMON = new Set(
  (
    'the and les des une sarl sas sasu eurl ltd gmbh inc cie compagnie ste societe paris lyon nantes rennes brest ' +
    'lorient vannes france fra com www http https restaurant resto cafe bar pub brasserie bistro store shop boutique ' +
    'market marche supermarche hyper super pharmacie boulangerie patisserie station service services sumup paypal ' +
    'payment pay card carte from avec chez saint sainte rue place avenue centre center city ville gare aeroport ' +
    'online europe international group groupe holding ' +
    // French bank wording: a direct debit, a transfer, a card payment's date, a cheque, a withdrawal.
    'prlv vir sepa inst virement vers fact cheque retrait dab depot'
  ).split(' '),
);

/** A store's telling words: lowercase, no accents, three letters or more, not a number, not a common word. */
function wordsOf(name: string) {
  return [
    ...new Set(
      plain(name)
        .split(/[^a-z0-9]+/)
        .filter(word => word.length >= 3 && !/^\d+$/.test(word) && !COMMON.has(word)),
    ),
  ];
}

/** The key a pair is remembered by once it is marked "not the same". */
export function pairKey(first: string, second: string) {
  return [first, second].sort().join('|');
}

/** Every store with its payments, totals and bank texts, from the rows (merges already applied). */
function storeInfos(rows: Row[]) {
  const stores = new Map<string, StoreInfo>();
  for (const row of rows) {
    const store = stores.get(row.storeKey) ?? {
      key: row.storeKey,
      name: row.store,
      currency: row.currency,
      payments: 0,
      total: 0,
      lastDate: row.date,
      examples: [],
      category: row.category,
      picked: row.basis === 'picked' && !row.ownCategory,
    };
    store.payments += 1;
    if (row.amount < 0) store.total -= row.amount;
    if (row.date > store.lastDate) store.lastDate = row.date;
    if (store.examples.length < 3 && !store.examples.includes(row.description)) store.examples.push(row.description);
    stores.set(row.storeKey, store);
  }
  return stores;
}

/**
 * Stores that may be the same place: their names share a telling word ("Ar Roue Morvan" and "Tavarn Ar Roue" share
 * "roue"), and that word is rare (in 6 stores at most). Pairs marked "not the same" stay out. Most payments first.
 */
export function findDuplicates(rows: Row[], dismissed: Set<string>): Pair[] {
  const stores = storeInfos(rows);
  const words = new Map<string, string[]>();
  const byWord = new Map<string, string[]>();
  for (const store of stores.values()) {
    const list = wordsOf(store.name);
    words.set(store.key, list);
    for (const word of list) byWord.set(word, [...(byWord.get(word) ?? []), store.key]);
  }
  const pairs = new Map<string, Pair>();
  for (const [word, keys] of byWord) {
    if (keys.length < 2 || keys.length > 6) continue;
    for (let index = 0; index < keys.length; index += 1) {
      for (let other = index + 1; other < keys.length; other += 1) {
        const key = pairKey(keys[index], keys[other]);
        if (dismissed.has(key)) continue;
        const pair = pairs.get(key) ?? {
          first: stores.get(keys[index])!,
          second: stores.get(keys[other])!,
          shared: [],
        };
        pair.shared.push(word);
        pairs.set(key, pair);
      }
    }
  }
  return [...pairs.values()]
    .filter(pair => {
      // At least half of the shorter name's telling words are shared.
      const fewest = Math.min(words.get(pair.first.key)!.length, words.get(pair.second.key)!.length);
      return pair.shared.length / Math.max(1, fewest) >= 0.5;
    })
    .map(pair =>
      pair.second.payments > pair.first.payments ? {...pair, first: pair.second, second: pair.first} : pair,
    )
    .sort(
      (first, second) =>
        second.first.payments + second.second.payments - (first.first.payments + first.second.payments),
    );
}
