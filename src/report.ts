import type {Categories} from './categories';
import {money} from './format';
import {
  addDays,
  dayLabel,
  daysBetween,
  type Grain,
  periodEnd,
  periodOf,
  periodStart,
  shiftPeriod,
  WEEKDAYS,
  weekdayOf,
} from './periods';
import {type Row, rowsBetween} from './rows';
import {paymentCount} from './text';
import type {CategoryKey} from './types';

/**
 * The report of a period: its totals against the usual period or the previous one, its chart, insights, regular
 * payments, what was fixed in advance and its day-by-day pace, all from the rows (see rows.ts).
 */

export interface StoreTotal {
  key: string;
  name: string;
  total: number;
  visits: number;
  category: CategoryKey;
  /** Its first payment ever is in these totals' period: new there (see Row.firstVisit). */
  isNew: boolean;
}

export interface Totals {
  total: number;
  /** Payments counted as spending (refunds left out). */
  payments: number;
  categories: Map<CategoryKey, number>;
  stores: Map<string, StoreTotal>;
  /** Money moved out without being spent: to a category that is not spending. */
  movedOut: number;
  moneyIn: number;
  /** What went out and came in for each category that is not spending, the left-out ones too. */
  others: Map<CategoryKey, {out: number; in: number}>;
}

function totalsOf(rows: Row[]): Totals {
  const totals: Totals = {
    total: 0,
    payments: 0,
    categories: new Map(),
    stores: new Map(),
    movedOut: 0,
    moneyIn: 0,
    others: new Map(),
  };
  for (const row of rows) {
    if (!row.counts) {
      const other = totals.others.get(row.category) ?? {out: 0, in: 0};
      if (row.amount < 0) other.out -= row.amount;
      else other.in += row.amount;
      totals.others.set(row.category, other);
    }
    if (row.leftOut) continue;
    if (!row.counts) {
      if (row.amount < 0) totals.movedOut -= row.amount;
      else totals.moneyIn += row.amount;
      continue;
    }
    // A matched refund, or a payment given back in full: nothing to add.
    if (row.spend === 0) continue;
    totals.total += row.spend;
    if (row.spend > 0) totals.payments += 1;
    totals.categories.set(row.category, (totals.categories.get(row.category) ?? 0) + row.spend);
    const store = totals.stores.get(row.storeKey) ?? {
      key: row.storeKey,
      name: row.store,
      total: 0,
      visits: 0,
      category: row.category,
      isNew: false,
    };
    store.total += row.spend;
    if (row.spend > 0) store.visits += 1;
    if (row.firstVisit) store.isNew = true;
    totals.stores.set(row.storeKey, store);
  }
  return totals;
}

/** Money in that is not a refund or a move between one's own accounts. */
const isMoneyIn = (row: Row) => !row.leftOut && !row.counts && row.amount > 0;

/** Who pays a salary: money in, in Money in, of 300 or more, from the same payer in at least three months. */
function payersOf(rows: Row[]) {
  const paidMonths = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!isMoneyIn(row) || row.category !== 'income' || row.amount < 300) continue;
    paidMonths.set(row.storeKey, (paidMonths.get(row.storeKey) ?? new Set<string>()).add(row.date.slice(0, 7)));
  }
  return new Set([...paidMonths].filter(([, months]) => months.size >= 3).map(([key]) => key));
}

/**
 * The rows with pay dated for the month it is for: pay that comes at the end of a month (from the 20th) is the next
 * month's, so it counts on that month's first day. Pay is money in from a payer (see payersOf). Only money in moves
 * this way; the payment list keeps the real day.
 */
function withPayDated(rows: Row[], payers: Set<string>) {
  return rows.map(row =>
    isMoneyIn(row) && payers.has(row.storeKey) && Number(row.date.slice(8, 10)) >= 20
      ? {...row, date: `${shiftPeriod(row.date.slice(0, 7), 'month', 1)}-01`}
      : row,
  );
}

const moneyInBetween = (rows: Row[], from: string, to: string) =>
  rows.filter(row => isMoneyIn(row) && row.date >= from && row.date <= to).reduce((sum, row) => sum + row.amount, 0);

/**
 * Each value with its neighbours' (the one before and the one after, when they have one), averaged: a line that bends
 * with the ups and downs without following every spike. Null values stay null and are no one's neighbour.
 */
export function rollingAverage(values: (number | null)[]) {
  return values.map((value, index) => {
    if (value === null) return null;
    const near = [values[index - 1], value, values[index + 1]].filter(
      (item): item is number => item !== null && item !== undefined,
    );
    return near.reduce((sum, item) => sum + item, 0) / near.length;
  });
}

/**
 * The straight line closest to values in a row (null ones are left out: a period still going, or only partly in the
 * data), at the first place and the last, and how much it rises or falls from one to the next. None with fewer than
 * three values.
 */
export function trendOf(values: (number | null)[]) {
  const points = values.flatMap((y, x) => (y === null ? [] : [{x, y}]));
  if (points.length < 3) return null;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const spread = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const step = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / spread;
  const at = (x: number) => meanY + step * (x - meanX);
  return {step, mean: meanY, first: at(0), last: at(values.length - 1)};
}

export interface Insight {
  icon: string;
  text: string;
}

export interface Subscription {
  /** The store and the category: a store can hold two (a loan and its charges). */
  key: string;
  storeKey: string;
  store: string;
  /** The store's name, with the category when the store has two. */
  name: string;
  category: CategoryKey;
  /** What it usually costs a month: the middle of its charges. */
  monthly: number;
  /** Its latest charge. */
  last: {date: string; amount: number};
  /** When the next charge should come: a month after the latest one. */
  next: string;
  /** The latest charge less the one before it: the price going up (more than 0) or down. */
  change: number;
  /** Its first charge ever is in the last four months: a new one. */
  isNew: boolean;
}

export interface Report {
  /** The period shown: "all" for all time. */
  period: string;
  from: string;
  to: string;
  /** The period holds today: it is compared with the previous one at the same point. */
  ongoing: boolean;
  current: Totals;
  /** What the period is compared with: the previous one cut at the same point, or the usual period. */
  baseline: {total: number; categories: Map<CategoryKey, number>; label: string} | null;
  /** The chart's periods, with what each category cost in them (for the trend lines). */
  series: {
    period: string;
    total: number;
    /** Money in that is not a refund or a transfer between one's own accounts (pay, money from others). */
    moneyIn: number;
    /** The pay in it (see payersOf), dated for the month it is for. */
    pay: number;
    payments: number;
    categories: Map<CategoryKey, number>;
    stores: Map<string, StoreTotal>;
    /** Still going (holds today), or only partly covered by the data (the first one): not a full period yet. */
    partial: 'ongoing' | 'first' | null;
    /** Its spending decided in advance (see fixedBetween); the rest is flexible. */
    fixed: number;
    /** The same period a year before (weeks and months only), when the data covers it. */
    lastYear: number | null;
    /** For the period still going: where it should end, if the days left go like a usual period's. */
    projected: number | null;
  }[];
  /** The chart's periods: years for all time, else the chosen grain. */
  chartGrain: Grain;
  usual: number | null;
  insights: Insight[];
  subscriptions: Subscription[];
  /** The period's spending decided in advance (see fixedBetween); none for a week. */
  fixed: number | null;
  /** The period day by day (see paceOf); none for all time. */
  pace: Pace | null;
}

/** What was spent by each day of the period, against what the usual period had spent by the same day. */
export interface Pace {
  /** The period's days. */
  days: number;
  /** Spent by the end of each day so far: up to today while the period is going, every day after it. */
  spent: number[];
  /** The usual period (the mean of the earlier full ones) by the end of each day, all of them; none without any. */
  usual: number[] | null;
}

/** How the insights name the period. */
const WORDING: Record<Grain, {word: string; scope: string; spending: string}> = {
  week: {word: 'week', scope: 'this week', spending: "this week's spending"},
  month: {word: 'month', scope: 'this month', spending: "this month's spending"},
  year: {word: 'year', scope: 'this year', spending: "this year's spending"},
  all: {word: 'period', scope: 'overall', spending: 'all your spending'},
};

/** Columns in the chart. */
const CHART_LENGTH: Record<Grain, number> = {week: 16, month: 12, year: 10, all: 10};

function percent(part: number, whole: number) {
  return Math.round((part / whole) * 100);
}

/** A regular payment's price changed for real: by 50 cents and 3% at least (a bill that moves by a few cents did not). */
export const priceChanged = (item: Subscription) => Math.abs(item.change) >= Math.max(0.5, item.monthly * 0.03);

/** The same day a month later, or the month's last day when it is shorter (31 Jan, then 28 Feb). */
function monthLater(date: string) {
  const month = shiftPeriod(date.slice(0, 7), 'month', 1);
  const lastDay = periodEnd(month, 'month');
  const day = `${month}-${date.slice(8, 10)}`;
  return day > lastDay ? lastDay : day;
}

const middleOf = (amounts: number[]) => [...amounts].sort((first, second) => first - second)[amounts.length >> 1];

/** How far apart days of the month are, the 30th and the 2nd being close too. */
function daySpread(days: number[]) {
  const spread = (list: number[]) => Math.max(...list) - Math.min(...list);
  return Math.min(spread(days), spread(days.map(day => (day + 15) % 31)));
}

/**
 * Regular payments: charges at one store, in one category, of about the same amount (within 15% of their middle)
 * around the same day of the month, in at least 3 of the 4 months up to `month`. Each month counts the charge closest
 * to the middle, so an extra one does not spoil it; a store charged more than twice in a month is a shop.
 */
export function findSubscriptions(rows: Row[], month: string, categories: Categories): Subscription[] {
  const months = [0, 1, 2, 3].map(step => shiftPeriod(month, 'month', -step));
  const start = periodStart(months[3], 'month');
  type Charge = {date: string; amount: number};
  const groups = new Map<string, {storeKey: string; name: string; category: CategoryKey; charges: Charge[]}>();
  for (const row of rowsBetween(rows, start, periodEnd(month, 'month'))) {
    if (row.spend <= 0) continue;
    const key = `${row.storeKey}|${row.category}`;
    const group = groups.get(key) ?? {storeKey: row.storeKey, name: row.store, category: row.category, charges: []};
    group.charges.push({date: row.date, amount: row.spend});
    groups.set(key, group);
  }
  // A store charged before the four months is not a new one.
  const older = new Set(rows.filter(row => row.spend > 0 && row.date < start).map(row => row.storeKey));
  const found: Subscription[] = [];
  for (const [key, {storeKey, name, category, charges}] of groups) {
    const byMonth = new Map<string, Charge[]>();
    for (const charge of charges) {
      byMonth.set(charge.date.slice(0, 7), [...(byMonth.get(charge.date.slice(0, 7)) ?? []), charge]);
    }
    if (byMonth.size < 3 || [...byMonth.values()].some(list => list.length > 2)) continue;
    const middle = middleOf(charges.map(charge => charge.amount));
    const distance = (charge: Charge) => Math.abs(charge.amount - middle);
    const matching = [...byMonth.values()]
      .map(list => list.reduce((best, charge) => (distance(charge) < distance(best) ? charge : best)))
      .filter(charge => distance(charge) <= middle * 0.15)
      .sort((first, second) => (first.date < second.date ? -1 : 1));
    if (matching.length < 3 || daySpread(matching.map(charge => Number(charge.date.slice(8, 10)))) > 7) continue;
    const last = matching[matching.length - 1];
    const before = matching[matching.length - 2];
    found.push({
      key,
      storeKey,
      store: name,
      name,
      category,
      monthly: middleOf(matching.map(charge => charge.amount)),
      last,
      next: monthLater(last.date),
      change: Math.round((last.amount - before.amount) * 100) / 100,
      isNew: !older.has(storeKey),
    });
  }
  // A store with two regular payments (a loan and its charges) names each by its category.
  for (const item of found) {
    if (found.filter(other => other.storeKey === item.storeKey).length > 1) {
      item.name = `${item.name} · ${categories.byKey[item.category]?.label ?? item.category}`;
    }
  }
  return found.sort((first, second) => second.monthly - first.monthly);
}

/**
 * A pace's three amounts: spent so far, the usual period by the same day (while the period is going, else none) and
 * the usual whole period (none without earlier periods).
 */
function paceAmounts(pace: Pace, ongoing: boolean) {
  const spent = pace.spent.at(-1) ?? 0;
  const whole = pace.usual?.at(-1) ?? null;
  const byNow = ongoing && pace.usual && pace.spent.length > 0 ? pace.usual[pace.spent.length - 1] : null;
  return {spent, byNow, whole};
}

/**
 * Time against money: how much of the period has gone and how much of a usual period was spent, as shares and as
 * lines to show ("Month · 26 of 31 days · 84%", "Spent · €3,074 of €2,758 · 111%"). No usual period: no money share.
 */
export function timeAndMoney(pace: Pace, ongoing: boolean, grain: Grain, currency: string) {
  const {spent, whole} = paceAmounts(pace, ongoing);
  const gone = ongoing ? pace.spent.length : pace.days;
  const timeShare = gone / pace.days;
  const moneyShare = whole ? spent / whole : 0;
  const {word} = WORDING[grain];
  const percent = (share: number) => `${Math.round(share * 100)}%`;
  return {
    spent,
    whole,
    left: pace.days - gone,
    timeShare,
    moneyShare,
    word,
    time: {
      label: word.charAt(0).toUpperCase() + word.slice(1),
      value: `${gone} of ${pace.days} days · ${percent(timeShare)}`,
    },
    money: {
      label: 'Spent',
      value: `${money(spent, currency)} of ${money(whole ?? 0, currency)} · ${percent(moneyShare)}`,
    },
  };
}

/** What the period spent by the end of each of its days, counted like its total. */
function runningTotals(rows: Row[], from: string, days: number) {
  const daily = Array.from({length: days}, () => 0);
  for (const row of rowsBetween(rows, from, addDays(from, days - 1))) {
    if (!row.counts || row.leftOut || row.spend === 0) continue;
    const index = daysBetween(from, row.date) - 1;
    if (index >= 0 && index < days) daily[index] += row.spend;
  }
  let sum = 0;
  return daily.map(value => (sum += value));
}

function paceOf(rows: Row[], grain: Grain, from: string, to: string, now: string, earlier: string[]): Pace {
  const days = daysBetween(from, to);
  const shown = now >= from && now <= to ? daysBetween(from, now) : now < from ? 0 : days;
  const spent = runningTotals(rows, from, days).slice(0, shown);
  // Each earlier period by the same day: a shorter one (February under a 31-day month) keeps its total to the end.
  const earlierTotals = earlier.map(item => {
    const start = periodStart(item, grain);
    const totals = runningTotals(rows, start, daysBetween(start, periodEnd(item, grain)));
    return Array.from({length: days}, (_value, index) => totals[Math.min(index, totals.length - 1)]);
  });
  const usual = earlierTotals.length
    ? Array.from(
        {length: days},
        (_value, index) => earlierTotals.reduce((sum, totals) => sum + totals[index], 0) / earlierTotals.length,
      )
    : null;
  return {days, spent, usual};
}

/**
 * Spending decided in advance: Bills and subscriptions, and the regular payments (rent, a loan, a gym) as found in
 * each month, so a payment counts as fixed once it has come back for three months. The rest is flexible.
 */
function fixedBetween(rows: Row[], from: string, to: string, regularOf: (month: string) => Set<string>) {
  let total = 0;
  for (let month = periodOf(from, 'month'); periodStart(month, 'month') <= to; month = shiftPeriod(month, 'month', 1)) {
    const start = periodStart(month, 'month') < from ? from : periodStart(month, 'month');
    const end = periodEnd(month, 'month') > to ? to : periodEnd(month, 'month');
    const regular = regularOf(month);
    for (const row of rowsBetween(rows, start, end)) {
      // The same payments as the period's total.
      if (!row.counts || row.leftOut || row.spend === 0) continue;
      if (row.category === 'bills' || regular.has(`${row.storeKey}|${row.category}`)) total += row.spend;
    }
  }
  return total;
}

/** `chartSpan` makes the chart that many times longer than usual (24 or 36 months instead of 12). */
export function buildReport(
  rows: Row[],
  period: string,
  grain: Grain,
  now: string,
  categories: Categories,
  chartSpan = 1,
): Report {
  const firstDay = rows.at(-1)?.date ?? now;
  const lastDay = rows[0]?.date ?? now;
  // Each month's regular payments, found once for the period and the chart's columns.
  const regularByMonth = new Map<string, Set<string>>();
  const regularOf = (month: string) => {
    const found =
      regularByMonth.get(month) ?? new Set(findSubscriptions(rows, month, categories).map(item => item.key));
    regularByMonth.set(month, found);
    return found;
  };
  // All time runs from the first payment to the last one.
  const from = grain === 'all' ? firstDay : periodStart(period, grain);
  const to = grain === 'all' ? lastDay : periodEnd(period, grain);
  const ongoing = grain !== 'all' && now >= from && now <= to;
  const current = totalsOf(rowsBetween(rows, from, to));
  // Money in counts pay in the month it is for.
  const payers = payersOf(rows);
  const payDated = withPayDated(rows, payers);
  current.moneyIn = moneyInBetween(payDated, from, to);
  const {word, scope, spending: spendingWords} = WORDING[grain];
  // A period the data only partly covers (the first one) would make a poor comparison.
  const fullyCovered = (item: string) => periodStart(item, grain) >= firstDay;

  // The usual period: the mean of up to six full periods before this one.
  const earlierPeriods =
    grain === 'all' ? [] : [1, 2, 3, 4, 5, 6].map(step => shiftPeriod(period, grain, -step)).filter(fullyCovered);
  const earlier = earlierPeriods.map(item =>
    totalsOf(rowsBetween(rows, periodStart(item, grain), periodEnd(item, grain))),
  );
  const usualCategories = new Map<CategoryKey, number>();
  for (const totals of earlier) {
    for (const [key, value] of totals.categories) {
      usualCategories.set(key, (usualCategories.get(key) ?? 0) + value / earlier.length);
    }
  }
  const usual = earlier.length ? earlier.reduce((sum, totals) => sum + totals.total, 0) / earlier.length : null;

  let baseline: Report['baseline'] = null;
  if (ongoing) {
    const previous = shiftPeriod(period, grain, -1);
    if (fullyCovered(previous)) {
      const previousFrom = periodStart(previous, grain);
      // The same number of days into the previous period (a 31st falls back to the 30th, or the 28th).
      const cut = addDays(previousFrom, daysBetween(from, now) - 1);
      const previousTo = periodEnd(previous, grain);
      const totals = totalsOf(rowsBetween(rows, previousFrom, cut < previousTo ? cut : previousTo));
      baseline = {total: totals.total, categories: totals.categories, label: `this point last ${word}`};
    }
  } else if (usual !== null) {
    baseline = {total: usual, categories: usualCategories, label: `your usual ${word}`};
  }

  // The chart ends with the latest period unless the chosen one is older. All time shows the years.
  const chartGrain: Grain = grain === 'all' ? 'year' : grain;
  const count = CHART_LENGTH[grain] * chartSpan;
  const anchor = grain === 'all' ? periodOf(lastDay, chartGrain) : period;
  let last = periodOf(lastDay, chartGrain);
  if (anchor > last) last = anchor;
  else if (shiftPeriod(last, chartGrain, -(count - 1)) > anchor) last = shiftPeriod(anchor, chartGrain, count - 1);
  const series: Report['series'] = [];
  for (let step = count - 1; step >= 0; step -= 1) {
    const item = shiftPeriod(last, chartGrain, -step);
    if (periodEnd(item, chartGrain) < firstDay) continue;
    const itemStart = periodStart(item, chartGrain);
    const itemEnd = periodEnd(item, chartGrain);
    const totals = totalsOf(rowsBetween(rows, itemStart, itemEnd));
    const partial = now >= itemStart && now <= itemEnd ? 'ongoing' : itemStart < firstDay ? 'first' : null;
    const yearBefore =
      chartGrain === 'month'
        ? shiftPeriod(item, 'month', -12)
        : chartGrain === 'week'
          ? shiftPeriod(item, 'week', -52)
          : null;
    let projected: number | null = null;
    if (partial === 'ongoing') {
      // The days left go like the usual period's (the mean of up to six full ones before) from the same day on.
      const before = [1, 2, 3, 4, 5, 6]
        .map(step => shiftPeriod(item, chartGrain, -step))
        .filter(other => periodStart(other, chartGrain) >= firstDay);
      const {byNow, whole} = paceAmounts(paceOf(rows, chartGrain, itemStart, itemEnd, now, before), true);
      if (byNow !== null && whole !== null) projected = totals.total + Math.max(0, whole - byNow);
    }
    series.push({
      period: item,
      total: totals.total,
      moneyIn: moneyInBetween(payDated, itemStart, itemEnd),
      pay: payDated
        .filter(row => isMoneyIn(row) && payers.has(row.storeKey) && row.date >= itemStart && row.date <= itemEnd)
        .reduce((sum, row) => sum + row.amount, 0),
      payments: totals.payments,
      categories: totals.categories,
      stores: totals.stores,
      partial,
      fixed: fixedBetween(rows, itemStart, itemEnd, regularOf),
      lastYear:
        yearBefore && periodStart(yearBefore, chartGrain) >= firstDay
          ? totalsOf(rowsBetween(rows, periodStart(yearBefore, chartGrain), periodEnd(yearBefore, chartGrain))).total
          : null,
      projected,
    });
  }

  // Regular payments, as of the last month of the period that has data.
  const subscriptions =
    grain === 'week' ? [] : findSubscriptions(rows, periodOf(to < lastDay ? to : lastDay, 'month'), categories);
  const currency = rows[0]?.currency ?? 'EUR';
  const amount = (value: number) => money(value, currency);
  const insights: Insight[] = [];

  if (baseline && baseline.total > 0) {
    const moves = [...new Set([...current.categories.keys(), ...baseline.categories.keys()])]
      .map(key => ({key, change: (current.categories.get(key) ?? 0) - (baseline.categories.get(key) ?? 0)}))
      .filter(move => Math.abs(move.change) >= Math.max(15, baseline.total * 0.03))
      .sort((first, second) => second.change - first.change);
    const up = moves[0];
    const down = moves.at(-1);
    const against = ongoing ? `compared with ${baseline.label}` : `on ${baseline.label}`;
    if (up && up.change > 0) {
      const category = categories.byKey[up.key];
      insights.push({icon: category.icon, text: `${category.label} is up ${amount(up.change)} ${against}.`});
    }
    if (down && down.change < 0) {
      const category = categories.byKey[down.key];
      insights.push({icon: category.icon, text: `${category.label} is down ${amount(-down.change)} ${against}.`});
    }
  }

  // Store insights leave out transfers (rent paid to a landlord is spending, but not a store).
  const payments = rowsBetween(rows, from, to).filter(row => row.kind !== 'transfer');
  const stores = [...totalsOf(payments).stores.values()].sort((first, second) => second.total - first.total);
  const top = stores[0];
  if (top && top.total > 0) {
    const visits = paymentCount(top.visits);
    insights.push({icon: '🏪', text: `${top.name} is your top store ${scope}: ${visits}, ${amount(top.total)}.`});
  }

  const before = new Set(rows.filter(row => row.date < from).map(row => row.storeKey));
  if (before.size) {
    const fresh = stores.filter(store => !before.has(store.key) && store.total > 0);
    if (fresh.length === 1) {
      insights.push({icon: '✨', text: `One new store ${scope}: ${fresh[0].name} (${amount(fresh[0].total)}).`});
    } else if (fresh.length > 1) {
      insights.push({
        icon: '✨',
        text: `${fresh.length} new stores ${scope}, the biggest is ${fresh[0].name} (${amount(fresh[0].total)}).`,
      });
    }
  }

  const spending = payments.filter(row => row.spend > 0);
  const biggest = spending.reduce<Row | null>((best, row) => (!best || row.spend > best.spend ? row : best), null);
  if (biggest && spending.length > 1) {
    insights.push({
      icon: '🧾',
      text: `Biggest payment: ${biggest.store}, ${amount(biggest.spend)} on ${dayLabel(biggest.date, grain === 'all')}.`,
    });
  }

  if (grain !== 'week' && spending.length >= 12 && current.total > 0) {
    const byWeekday = Array.from({length: 7}, () => 0);
    for (const row of spending) byWeekday[weekdayOf(row.date)] += row.spend;
    const busiest = byWeekday.indexOf(Math.max(...byWeekday));
    const share = percent(byWeekday[busiest], current.total);
    if (share >= 22) {
      insights.push({icon: '📅', text: `${WEEKDAYS[busiest]} is your big day: ${share}% of ${spendingWords}.`});
    }
  }

  // Regular payments have a card of their own; a price that went up is news.
  for (const item of subscriptions.filter(subscription => subscription.change > 0 && priceChanged(subscription))) {
    insights.push({icon: '🔁', text: `${item.name} went up by ${money(item.change, currency, true)} last time.`});
  }

  const fixed = grain === 'week' ? null : fixedBetween(rows, from, to, regularOf);
  const pace = grain === 'all' ? null : paceOf(rows, grain, from, to, now, earlierPeriods);
  return {
    period,
    from,
    to,
    ongoing,
    current,
    baseline,
    series,
    chartGrain,
    usual,
    insights,
    subscriptions,
    fixed,
    pace,
  };
}
