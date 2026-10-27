import type {Grain} from './periods';
import type {
  Budgets,
  CategoryEdit,
  Labels,
  Merges,
  PaymentCategories,
  Rules,
  SavingsValues,
  Transaction,
} from './types';

/**
 * A visitor's data lives in their browser only: the statement rows they imported (or just the choice of the
 * sample data, which is rebuilt each time), the categories they picked or changed and the stores they merged.
 */
const DATA = 'tillroll.data';
const RULES = 'tillroll.rules';
const CATEGORIES = 'tillroll.categories';
const MERGES = 'tillroll.merges';
const LABELS = 'tillroll.labels';
const PAYMENT_CATEGORIES = 'tillroll.payment-categories';
const DISTINCT = 'tillroll.distinct';
const SAVINGS_VALUES = 'tillroll.savings-values';
const BUDGETS = 'tillroll.budgets';
const GRAIN = 'tillroll.grain';
const PAYMENT_SORT = 'tillroll.payment-sort';
const PAYMENTS_EVERYTHING = 'tillroll.payments-everything';
const PAYMENTS_OWN = 'tillroll.payments-own';
const CATEGORY_VIEW = 'tillroll.category-view';

export type LocalData = {source: 'sample'} | {source: 'statement'; transactions: Transaction[]};

function read<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

/** False when the browser refuses (private mode, full storage): the data then lasts until the page closes. */
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadLocalData = () => read<LocalData>(DATA);
export const saveLocalData = (data: LocalData | null) => write(DATA, data);

/** How the visitor sorts their payments: categories picked per store, categories changed, stores merged. */
export function loadLocalSorting() {
  return {
    rules: read<Rules>(RULES) ?? {},
    categories: read<CategoryEdit[]>(CATEGORIES) ?? [],
    merges: read<Merges>(MERGES) ?? {},
    labels: read<Labels>(LABELS) ?? {},
    paymentCategories: read<PaymentCategories>(PAYMENT_CATEGORIES) ?? {},
    distinct: read<string[]>(DISTINCT) ?? [],
    savingsValues: read<SavingsValues>(SAVINGS_VALUES) ?? {},
    budgets: read<Budgets>(BUDGETS) ?? {},
  };
}

export function saveLocalSorting(
  sorting: {
    rules?: Rules;
    categories?: CategoryEdit[];
    merges?: Merges;
    labels?: Labels;
    paymentCategories?: PaymentCategories;
    distinct?: string[];
    savingsValues?: SavingsValues;
    budgets?: Budgets;
  } | null,
) {
  if (sorting === null) {
    for (const key of [RULES, CATEGORIES, MERGES, LABELS, PAYMENT_CATEGORIES, DISTINCT, SAVINGS_VALUES, BUDGETS])
      write(key, null);
    return;
  }
  if (sorting.savingsValues) write(SAVINGS_VALUES, sorting.savingsValues);
  if (sorting.budgets) write(BUDGETS, sorting.budgets);
  if (sorting.distinct) write(DISTINCT, sorting.distinct);
  if (sorting.paymentCategories) write(PAYMENT_CATEGORIES, sorting.paymentCategories);
  if (sorting.labels) write(LABELS, sorting.labels);
  if (sorting.rules) write(RULES, sorting.rules);
  if (sorting.categories) write(CATEGORIES, sorting.categories);
  if (sorting.merges) write(MERGES, sorting.merges);
}

export const loadGrain = (): Grain => {
  const saved = read<string>(GRAIN);
  return saved === 'week' || saved === 'year' || saved === 'all' ? saved : 'month';
};
export const saveGrain = (grain: Grain) => write(GRAIN, grain);

/** How the payment list is sorted, remembered in each browser. */
export interface PaymentSort {
  key: 'date' | 'amount' | 'store';
  descending: boolean;
}

export function loadPaymentSort(): PaymentSort {
  const saved = read<PaymentSort>(PAYMENT_SORT);
  return saved && ['date', 'amount', 'store'].includes(saved.key) ? saved : {key: 'date', descending: true};
}

export const savePaymentSort = (sort: PaymentSort) => write(PAYMENT_SORT, sort);

/** Whether the payment lists also show transfers and money in, remembered in each browser. */
export const loadPaymentsEverything = () => read<boolean>(PAYMENTS_EVERYTHING) === true;
export const savePaymentsEverything = (everything: boolean) => write(PAYMENTS_EVERYTHING, everything);

/** Whether the payment lists also show the moves between one's own accounts, remembered in each browser. */
export const loadPaymentsOwn = () => read<boolean>(PAYMENTS_OWN) === true;
export const savePaymentsOwn = (own: boolean) => write(PAYMENTS_OWN, own);

/** How the Categories view shows them: a list, or a small chart each. Remembered in each browser. */
export type CategoryView = 'list' | 'trends';
export const loadCategoryView = (): CategoryView =>
  read<CategoryView>(CATEGORY_VIEW) === 'trends' ? 'trends' : 'list';
export const saveCategoryView = (view: CategoryView) => write(CATEGORY_VIEW, view);
