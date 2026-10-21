import type {CategoryEdit} from '../src/types';
import {handle, HttpError, json, readJson} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';
import {CATEGORIES, DISTINCT, LABELS, MERGES, PAYMENT_CATEGORIES, redis, RULES, SAVINGS_VALUES} from './_lib/store.js';

/*
 * Everything the owner sorts by hand, saved through one route: the Hobby plan takes 12 functions at most.
 */

const isCategoryKey = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value);
const isStoreKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

function isEdit(value: unknown): value is CategoryEdit {
  const item = value as CategoryEdit;
  return (
    typeof item === 'object' &&
    item !== null &&
    isCategoryKey(item.key) &&
    typeof item.label === 'string' &&
    item.label.trim().length > 0 &&
    item.label.length <= 40 &&
    typeof item.icon === 'string' &&
    item.icon.length > 0 &&
    item.icon.length <= 16 &&
    typeof item.spending === 'boolean'
  );
}

function isLabelList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every(label => typeof label === 'string' && label.trim().length > 0 && label.length <= 40)
  );
}

/** A hash of values by payment, changed for some payments: `dropped` tells the values that take it off. */
async function savePerPayment(
  key: string,
  value: unknown,
  valid: (item: unknown) => boolean,
  dropped: (item: unknown) => boolean,
  error: string,
) {
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : null;
  if (!entries || entries.length > 2000 || !entries.every(([id, item]) => id.length <= 200 && valid(item))) {
    throw new HttpError(400, error);
  }
  const store = redis();
  const kept = entries.filter(([, item]) => !dropped(item));
  const gone = entries.filter(([, item]) => dropped(item)).map(([id]) => id);
  if (kept.length) await store.hset(key, Object.fromEntries(kept));
  if (gone.length) await store.hdel(key, ...gone);
}

const PARTS: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  /** { store, category }: the category of a store, picked by hand. A null category drops the choice. */
  async rules({store: storeKey, category}) {
    if (!isStoreKey(storeKey)) throw new HttpError(400, 'Expected a store');
    if (category === null) return redis().hdel(RULES, storeKey);
    if (!isCategoryKey(category)) throw new HttpError(400, 'Expected a category');
    return redis().hset(RULES, {[storeKey]: category});
  },

  /** { categories }: the categories changed or added by hand, all of them at once. */
  async categories({categories}) {
    if (!Array.isArray(categories) || categories.length > 100 || !categories.every(isEdit)) {
      throw new HttpError(400, 'Expected a list of categories');
    }
    return redis().set(
      CATEGORIES,
      categories.map(({key, label, icon, spending}) => ({key, label: label.trim(), icon: icon.trim(), spending})),
    );
  },

  /** { store, into }: merges a store (its key) into another (its name). A null `into` separates it. */
  async merges({store: storeKey, into}) {
    if (!isStoreKey(storeKey)) throw new HttpError(400, 'Expected a store');
    if (into === null) return redis().hdel(MERGES, storeKey);
    if (typeof into !== 'string' || !into.trim() || into.length > 200) {
      throw new HttpError(400, 'Expected the store to merge into');
    }
    return redis().hset(MERGES, {[storeKey]: into.trim()});
  },

  /** { categories: { <transaction id>: <category> | null } }: categories picked for single payments. */
  async 'payment-categories'({categories}) {
    return savePerPayment(
      PAYMENT_CATEGORIES,
      categories,
      item => item === null || isCategoryKey(item),
      item => item === null,
      'Expected categories by payment',
    );
  },

  /** { labels: { <transaction id>: [labels] } }: each payment's full list of labels; an empty one takes them off. */
  async labels({labels}) {
    return savePerPayment(
      LABELS,
      labels,
      isLabelList,
      item => (item as string[]).length === 0,
      'Expected labels by payment',
    );
  },

  /**
   * { account, name?, values: [{date, value}] }: a savings account's values typed by hand, all of them, and the name of
   * one added by hand. No values and no name takes it off.
   */
  async 'savings-values'({account, name, values}) {
    const valid =
      typeof account === 'string' &&
      /^[a-z0-9-]{2,60}$/.test(account) &&
      (name === undefined || (typeof name === 'string' && name.trim().length > 0 && name.length <= 60)) &&
      Array.isArray(values) &&
      values.length <= 500 &&
      values.every(
        item =>
          typeof item === 'object' &&
          item !== null &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
          Number.isFinite(item.value) &&
          Math.abs(item.value) < 1e9,
      );
    if (!valid) throw new HttpError(400, 'Expected a savings account and its values');
    const list = (values as {date: string; value: number}[]).map(({date, value}) => ({date, value}));
    if (list.length === 0 && name === undefined) return redis().hdel(SAVINGS_VALUES, account);
    return redis().hset(SAVINGS_VALUES, {
      [account]: name === undefined ? {values: list} : {name: name.trim(), values: list},
    });
  },

  /** { pairs }: pairs of stores marked "not the same", so the duplicates deck never shows them again. */
  async distinct({pairs}) {
    if (
      !Array.isArray(pairs) ||
      pairs.length === 0 ||
      pairs.length > 500 ||
      !pairs.every(pair => typeof pair === 'string' && pair.includes('|') && pair.length <= 400)
    ) {
      throw new HttpError(400, 'Expected pairs of stores');
    }
    const [first, ...rest] = pairs as string[];
    return redis().sadd(DISTINCT, first, ...rest);
  },
};

/** PUT /api/sorting?part=<rules|categories|merges|payment-categories|labels|distinct|savings-values>, with that part's body. */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request);
    const save = PARTS[new URL(request.url).searchParams.get('part') ?? ''];
    if (!save) throw new HttpError(404, 'No such part');
    await save(await readJson(request));
    return json({ok: true});
  });
}
