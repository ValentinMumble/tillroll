import type {Grain} from './periods';
import type {
  Budgets,
  CategoryEdit,
  CategoryKey,
  Labels,
  Merges,
  Paybacks,
  PaymentCategories,
  Rules,
  SavingsValues,
  Transaction,
  Trips,
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
const TRIPS = 'tillroll.trips';
const PAYMENT_CATEGORIES = 'tillroll.payment-categories';
const PAYBACKS = 'tillroll.paybacks';
const DISTINCT = 'tillroll.distinct';
const SAVINGS_VALUES = 'tillroll.savings-values';
const BUDGETS = 'tillroll.budgets';
const GRAIN = 'tillroll.grain';
const CHART_SPAN = 'tillroll.chart-span';
const PAYMENT_SORT = 'tillroll.payment-sort';
const LABEL_SORT = 'tillroll.label-sort';
const TRIP_SORT = 'tillroll.trip-sort';
const SHEET_SCOPE = 'tillroll.sheet-scope';
const RECENT_PICKS = 'tillroll.recent-picks';
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
    trips: read<Trips>(TRIPS) ?? {},
    paymentCategories: read<PaymentCategories>(PAYMENT_CATEGORIES) ?? {},
    paybacks: read<Paybacks>(PAYBACKS) ?? {},
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
    trips?: Trips;
    paymentCategories?: PaymentCategories;
    paybacks?: Paybacks;
    distinct?: string[];
    savingsValues?: SavingsValues;
    budgets?: Budgets;
  } | null,
) {
  if (sorting === null) {
    for (const key of [
      RULES,
      CATEGORIES,
      MERGES,
      LABELS,
      TRIPS,
      PAYMENT_CATEGORIES,
      PAYBACKS,
      DISTINCT,
      SAVINGS_VALUES,
      BUDGETS,
    ])
      write(key, null);
    return;
  }
  if (sorting.savingsValues) write(SAVINGS_VALUES, sorting.savingsValues);
  if (sorting.budgets) write(BUDGETS, sorting.budgets);
  if (sorting.distinct) write(DISTINCT, sorting.distinct);
  if (sorting.paymentCategories) write(PAYMENT_CATEGORIES, sorting.paymentCategories);
  if (sorting.paybacks) write(PAYBACKS, sorting.paybacks);
  if (sorting.labels) write(LABELS, sorting.labels);
  if (sorting.trips) write(TRIPS, sorting.trips);
  if (sorting.rules) write(RULES, sorting.rules);
  if (sorting.categories) write(CATEGORIES, sorting.categories);
  if (sorting.merges) write(MERGES, sorting.merges);
}

/** How far back the period chart goes, as a number of its usual lengths (1, 2 or 3), remembered in each browser. */
export const loadChartSpan = () => {
  const saved = read<number>(CHART_SPAN);
  return saved === 2 || saved === 3 ? saved : 1;
};
export const saveChartSpan = (span: number) => write(CHART_SPAN, span);

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

/** How the Labels card is sorted: the latest used, the biggest, A to Z or the most used, remembered in each browser. */
export type LabelSort = 'latest' | 'biggest' | 'name' | 'used';

export function loadLabelSort(): LabelSort {
  const saved = read<LabelSort>(LABEL_SORT);
  return saved && ['latest', 'biggest', 'name', 'used'].includes(saved) ? saved : 'latest';
}

export const saveLabelSort = (sort: LabelSort) => write(LABEL_SORT, sort);

/** How the trips are sorted (Trips): the latest, the biggest or the priciest a day, remembered in each browser. */
export type TripSort = 'latest' | 'biggest' | 'day';

export function loadTripSort(): TripSort {
  const saved = read<TripSort>(TRIP_SORT);
  return saved && ['latest', 'biggest', 'day'].includes(saved) ? saved : 'latest';
}

export const saveTripSort = (sort: TripSort) => write(TRIP_SORT, sort);

/** Where the category sheet's choice applies ("store" or "payment"), as last picked, remembered in each browser. */
export const loadSheetScope = () => read<string>(SHEET_SCOPE);
export const saveSheetScope = (scope: string) => write(SHEET_SCOPE, scope);

/** The categories picked last in the category sheet, the latest first (ten at most), remembered in each browser. */
export const loadRecentPicks = () => read<CategoryKey[]>(RECENT_PICKS) ?? [];
export const saveRecentPick = (category: CategoryKey) =>
  write(RECENT_PICKS, [category, ...loadRecentPicks().filter(key => key !== category)].slice(0, 10));

/** Whether the payment lists also show money in, remembered in each browser. */
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
