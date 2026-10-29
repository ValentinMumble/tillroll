import type {Categories} from './categories';
import {money} from './format';
import {addDays, dayLabel} from './periods';
import type {Row} from './rows';
import type {Fact} from './stats';
import type {CategoryKey, Trip, Trips} from './types';

/** The key a label is marked as a trip under, whatever its capitals; none when it is no trip. */
export function tripKeyOf(trips: Trips, label: string) {
  const name = label.toLowerCase();
  return Object.keys(trips).find(key => key.toLowerCase() === name);
}

/** The labels marked as trips, in lower case, for matching a payment's labels. */
export const tripNames = (trips: Trips) => new Set(Object.keys(trips).map(key => key.toLowerCase()));

const hasLabel = (row: Row, label: string) => row.labels.some(item => item.toLowerCase() === label.toLowerCase());

/** The number of days from one day to another, both counted. */
export const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/** A run of days, its year once (or both years across new year): "12 Sep to 22 Sep 2025". */
export function daysLabel(from: string, to: string) {
  if (from === to) return dayLabel(from, true);
  return `${dayLabel(from, from.slice(0, 4) !== to.slice(0, 4))} to ${dayLabel(to, true)}`;
}

/**
 * A trip's first and last days: the ones set by hand, else the last run of its payments' days with no gap over two
 * weeks, so bookings made long before (a flight, a flat) are left out.
 */
export function tripDays(rows: Row[], label: string, trip: Trip = {}) {
  const days = [...new Set(rows.filter(row => hasLabel(row, label) && row.amount < 0).map(row => row.date))].sort();
  let start = days.length - 1;
  while (start > 0 && dayCount(days[start - 1], days[start]) <= 15) start -= 1;
  const from = trip.from ?? days[start] ?? trip.to ?? '';
  const to = trip.to ?? days[days.length - 1] ?? from;
  return {from, to: to < from ? from : to};
}

/**
 * The payments on a trip's days that do not have its label yet (money out, no move between one's own accounts), by
 * day: a store not paid in the two months around the trip is likely the trip's; one paid then too (the rent, the
 * usual bakery, a subscription) likely is not.
 */
export function tripCandidates(rows: Row[], label: string, from: string, to: string) {
  if (!from || !to) return [];
  const before = addDays(from, -60);
  const after = addDays(to, 60);
  const home = new Set(
    rows
      .filter(row => row.amount < 0 && row.date >= before && row.date <= after && (row.date < from || row.date > to))
      .map(row => row.storeKey),
  );
  return rows
    .filter(row => row.date >= from && row.date <= to && row.amount < 0 && !row.leftOut && !hasLabel(row, label))
    .map(row => ({row, likely: !home.has(row.storeKey)}))
    .sort((first, second) => (first.row.date < second.row.date ? -1 : first.row.date > second.row.date ? 1 : 0));
}

export interface TripSummary {
  name: string;
  from: string;
  to: string;
  days: number;
  total: number;
  payments: number;
  /** The days of the trip with a payment labelled. */
  paidDays: number;
  /**
   * Few of its days have a payment (under 40% of a trip of three days or more): likely only its bookings are labelled
   * yet, so it is left out of the comparisons a day.
   */
  sparse: boolean;
  /** What it cost by category, the biggest first. */
  categories: [CategoryKey, number][];
}

/** Every trip with payments (rows of one currency), the latest first: what it cost, over how many days, on what. */
export function tripSummaries(rows: Row[], trips: Trips): TripSummary[] {
  return Object.entries(trips)
    .map(([name, trip]) => {
      const labelled = rows.filter(row => hasLabel(row, name) && row.counts);
      const {from, to} = tripDays(rows, name, trip);
      const categories = new Map<CategoryKey, number>();
      for (const row of labelled) categories.set(row.category, (categories.get(row.category) ?? 0) + row.spend);
      const days = from ? dayCount(from, to) : 0;
      const paidDays = new Set(labelled.filter(row => row.date >= from && row.date <= to).map(row => row.date)).size;
      return {
        name,
        from,
        to,
        days,
        total: labelled.reduce((sum, row) => sum + row.spend, 0),
        payments: labelled.length,
        paidDays,
        sparse: days >= 3 && paidDays < days * 0.4,
        categories: [...categories].filter(([, value]) => value > 0).sort((first, second) => second[1] - first[1]),
      };
    })
    .filter(summary => summary.payments > 0 && summary.total > 0)
    .sort((first, second) => (first.from < second.from ? 1 : -1));
}

/**
 * The trips together and side by side: what they cost (and a day of them, over the trips labelled day by day), this
 * year's against last year's, where the money goes, the biggest and the longest, the cheapest and priciest a day.
 */
export function tripFacts(trips: TripSummary[], currency: string, categories: Categories, year: string): Fact[] {
  if (trips.length === 0) return [];
  const amount = (value: number) => money(value, currency);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const sum = (list: TripSummary[], pick: (trip: TripSummary) => number) =>
    list.reduce((total, trip) => total + pick(trip), 0);
  const total = sum(trips, trip => trip.total);
  // A day of a trip, over the trips of two days or more whose days are labelled.
  const full = trips.filter(trip => !trip.sparse && trip.days >= 2);
  const perDay = (trip: TripSummary) => trip.total / trip.days;
  const facts: Fact[] = [
    {
      icon: '🧳',
      value: amount(total),
      title: 'Spent on trips',
      detail: `${plural(trips.length, 'trip')}, ${sum(trips, trip => trip.days)} days away${
        full.length ? `, about ${amount(sum(full, trip => trip.total) / sum(full, trip => trip.days))} a day` : ''
      }`,
    },
  ];
  const ofYear = (value: string) => trips.filter(trip => trip.from.startsWith(value));
  const now = ofYear(year);
  if (now.length) {
    const before = ofYear(String(Number(year) - 1));
    facts.push({
      icon: '📅',
      value: amount(sum(now, trip => trip.total)),
      title: `Trips in ${year}`,
      detail: `${plural(now.length, 'trip')}, ${sum(now, trip => trip.days)} days away${
        before.length ? `, against ${amount(sum(before, trip => trip.total))} in ${Number(year) - 1}` : ''
      }`,
    });
  }
  const spent = new Map<CategoryKey, number>();
  for (const trip of trips) for (const [key, value] of trip.categories) spent.set(key, (spent.get(key) ?? 0) + value);
  const [first, ...rest] = [...spent].sort((one, other) => other[1] - one[1]);
  const share = ([key, value]: [CategoryKey, number]) =>
    `${categories.byKey[key]?.label ?? key} ${Math.round((value / total) * 100)}%`;
  facts.push({
    icon: categories.byKey[first[0]]?.icon ?? '🧾',
    value: share(first),
    title: 'Where the money goes',
    detail: rest.length ? `then ${rest.slice(0, 2).map(share).join(', ')}` : 'all of it',
  });
  if (trips.length < 2) return facts;
  const biggest = trips.reduce((top, trip) => (trip.total > top.total ? trip : top));
  facts.push({
    icon: '💰',
    value: biggest.name,
    title: 'Biggest trip',
    detail: `${amount(biggest.total)} over ${plural(biggest.days, 'day')}`,
  });
  const longest = trips.reduce((top, trip) => (trip.days > top.days ? trip : top));
  facts.push({
    icon: '📆',
    value: longest.name,
    title: 'Longest trip',
    detail: `${longest.days} days, ${daysLabel(longest.from, longest.to)}`,
  });
  if (full.length > 1) {
    const cheapest = full.reduce((low, trip) => (perDay(trip) < perDay(low) ? trip : low));
    const priciest = full.reduce((high, trip) => (perDay(trip) > perDay(high) ? trip : high));
    facts.push(
      {icon: '🪙', value: `${amount(perDay(cheapest))} a day`, title: 'Cheapest trip a day', detail: cheapest.name},
      {icon: '💸', value: `${amount(perDay(priciest))} a day`, title: 'Priciest trip a day', detail: priciest.name},
    );
  }
  return facts;
}
