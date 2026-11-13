import type {CategoryEdit, SavingsStatement} from '../src/types';
import {handle, HttpError, json, readJson} from './_lib/http.js';
import {requireOwner} from './_lib/owner.js';
import {
  BUDGETS,
  CATEGORIES,
  DISTINCT,
  EARLIER_RULES,
  LABELS,
  MERGES,
  PAYBACKS,
  PAYMENT_CATEGORIES,
  redis,
  RULES,
  SAVINGS_STATEMENTS,
  SAVINGS_VALUES,
  TRIPS,
} from './_lib/store.js';

/*
 * Everything the owner sorts by hand, saved through one route: the Hobby plan takes 12 functions at most.
 */

const isCategoryKey = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{2,60}$/.test(value);
const isStoreKey = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200;

const STATEMENT_KINDS = [
  'payment',
  'entry-fee',
  'management-fee',
  'interest',
  'extra-interest',
  'social-charges',
  'distribution',
  'switch',
  'withdrawal',
];
const isDay = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isAmount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e9;
const isText = (value: unknown, length: number) => typeof value === 'string' && value.length <= length;

/** An assurance vie's statements as src/bpce.ts reads them from their PDFs. */
function isStatement(value: unknown): value is SavingsStatement {
  const statement = value as SavingsStatement;
  return (
    typeof statement === 'object' &&
    statement !== null &&
    isText(statement.contract, 120) &&
    Array.isArray(statement.movements) &&
    statement.movements.length <= 3000 &&
    statement.movements.every(
      movement =>
        STATEMENT_KINDS.includes(movement.kind) &&
        isText(movement.label, 300) &&
        isDay(movement.date) &&
        isAmount(movement.amount) &&
        Array.isArray(movement.details) &&
        movement.details.length <= 100 &&
        movement.details.every(
          detail =>
            (detail.side === 'in' || detail.side === 'out') &&
            isAmount(detail.amount) &&
            (detail.isin === undefined || detail.isin === null || isText(detail.isin, 20)) &&
            (detail.fund === undefined || isText(detail.fund, 120)) &&
            (detail.unitValue === undefined || isAmount(detail.unitValue)),
        ),
    ) &&
    Array.isArray(statement.values) &&
    statement.values.length <= 200 &&
    statement.values.every(
      item =>
        isDay(item.date) &&
        isAmount(item.value) &&
        Array.isArray(item.funds) &&
        item.funds.length <= 200 &&
        item.funds.every(
          fund =>
            isText(fund.name, 120) &&
            (fund.isin === null || isText(fund.isin, 20)) &&
            (fund.quantity === null || isAmount(fund.quantity)) &&
            isAmount(fund.amount),
        ),
    )
  );
}

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
    typeof item.spending === 'boolean' &&
    (item.hobby === undefined || typeof item.hobby === 'boolean')
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
  /**
   * { store, category }: the category of a store, picked by hand, for all its payments: the categories it had before a
   * day go. A null category drops the choice.
   */
  async rules({store: storeKey, category}) {
    if (!isStoreKey(storeKey)) throw new HttpError(400, 'Expected a store');
    if (category !== null && !isCategoryKey(category)) throw new HttpError(400, 'Expected a category');
    await redis().hdel(EARLIER_RULES, storeKey);
    if (category === null) return redis().hdel(RULES, storeKey);
    return redis().hset(RULES, {[storeKey]: category});
  },

  /**
   * { store, category, earlier }: the category of a store from one payment on, and the categories it keeps before
   * (see EarlierRules). A null category drops the choice from then on.
   */
  async 'earlier-rules'({store: storeKey, category, earlier}) {
    const valid =
      isStoreKey(storeKey) &&
      (category === null || isCategoryKey(category)) &&
      Array.isArray(earlier) &&
      earlier.length <= 50 &&
      earlier.every(
        item =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.until === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(item.until) &&
          (item.category === null || isCategoryKey(item.category)),
      );
    if (!valid) throw new HttpError(400, 'Expected a store, its category and the ones it had before');
    const store = redis();
    const list = (earlier as {until: string; category: string | null}[]).map(({until, category: before}) => ({
      until,
      category: before,
    }));
    if (list.length) await store.hset(EARLIER_RULES, {[storeKey]: list});
    else await store.hdel(EARLIER_RULES, storeKey);
    if (category === null) return store.hdel(RULES, storeKey);
    return store.hset(RULES, {[storeKey]: category});
  },

  /** { categories }: the categories changed or added by hand, all of them at once. */
  async categories({categories}) {
    if (!Array.isArray(categories) || categories.length > 100 || !categories.every(isEdit)) {
      throw new HttpError(400, 'Expected a list of categories');
    }
    return redis().set(
      CATEGORIES,
      categories.map(({key, label, icon, spending, hobby}) => ({
        key,
        label: label.trim(),
        icon: icon.trim(),
        spending,
        ...(hobby ? {hobby} : {}),
      })),
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

  /** { paybacks: { <transaction id>: <payment id> | null } }: money in linked to the payment it pays back. */
  async paybacks({paybacks}) {
    return savePerPayment(
      PAYBACKS,
      paybacks,
      item => item === null || (typeof item === 'string' && item.length > 0 && item.length <= 200),
      item => item === null,
      'Expected payments by payment',
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

  /**
   * { account, statement }: an assurance vie's statements read from their PDFs (src/bpce.ts, on import), every
   * line and every value; null takes them off.
   */
  async 'savings-statements'({account, statement}) {
    if (
      typeof account !== 'string' ||
      !/^[a-z0-9-]{2,60}$/.test(account) ||
      !(statement === null || isStatement(statement)) ||
      JSON.stringify(statement).length > 500_000
    ) {
      throw new HttpError(400, 'Expected a savings account and its statements');
    }
    if (statement === null) return redis().hdel(SAVINGS_STATEMENTS, account);
    return redis().hset(SAVINGS_STATEMENTS, {[account]: statement});
  },

  /**
   * { label, trip: {from?, to?, place?} }: marks a label as a trip, with its days when set by hand and where it went;
   * a null trip unmarks it.
   */
  async trips({label, trip}) {
    const isDay = (value: unknown) =>
      value === undefined || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
    const isPlace = (value: unknown) => {
      if (value === undefined) return true;
      const place = value as {name?: unknown; lat?: unknown; lon?: unknown} | null;
      return (
        typeof place === 'object' &&
        place !== null &&
        typeof place.name === 'string' &&
        place.name.trim().length > 0 &&
        place.name.length <= 80 &&
        typeof place.lat === 'number' &&
        Math.abs(place.lat) <= 90 &&
        typeof place.lon === 'number' &&
        Math.abs(place.lon) <= 180
      );
    };
    const days = trip as {from?: unknown; to?: unknown; place?: unknown} | null;
    const valid =
      typeof label === 'string' &&
      label.trim().length > 0 &&
      label.length <= 40 &&
      (days === null || (typeof days === 'object' && isDay(days.from) && isDay(days.to) && isPlace(days.place)));
    if (!valid) throw new HttpError(400, 'Expected a label, its trip days and its place');
    if (days === null) return redis().hdel(TRIPS, label);
    const {from, to, place} = days as {from?: string; to?: string; place?: {name: string; lat: number; lon: number}};
    return redis().hset(TRIPS, {
      [label]: {
        ...(from ? {from} : {}),
        ...(to ? {to} : {}),
        ...(place ? {place: {name: place.name.trim(), lat: place.lat, lon: place.lon}} : {}),
      },
    });
  },

  /** { category, amount }: a category's monthly budget; null takes it off. */
  async budgets({category, amount}) {
    const valid =
      typeof category === 'string' &&
      category.length > 0 &&
      category.length <= 60 &&
      (amount === null || (typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount < 1e9));
    if (!valid) throw new HttpError(400, 'Expected a category and its monthly budget');
    if (amount === null) return redis().hdel(BUDGETS, category);
    return redis().hset(BUDGETS, {[category]: amount});
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

/**
 * PUT /api/sorting?part=<rules|earlier-rules|categories|merges|payment-categories|labels|trips|distinct|savings-values|savings-statements|budgets>,
 * with
 * that part's body.
 */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request);
    const save = PARTS[new URL(request.url).searchParams.get('part') ?? ''];
    if (!save) throw new HttpError(404, 'No such part');
    await save(await readJson(request));
    return json({ok: true});
  });
}
