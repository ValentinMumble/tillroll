import type {Categories} from './categories';
import {money} from './format';
import {periodLabel, WEEKDAYS, weekdayLabel, weekdayOf} from './periods';
import type {Row} from './rows';
import type {Fact} from './stats';
import {trainStats} from './trains';
import {tripSummaries} from './trips';
import type {Trips} from './types';

interface YearInput {
  year: string;
  /** Every payment of one currency, all time. */
  rows: Row[];
  /** What the year's money in was (pay, money from others) and what it put in savings, less what it took back. */
  moneyIn: number;
  toSavings: number;
  trips: Trips;
  currency: string;
  categories: Categories;
}

/** A year with less coming in than half of what it spent has its pay outside the data: no money facts for it. */
const PAY_KNOWN = 0.5;

/**
 * A year in a few numbers: what it cost against the year before, what was kept and saved (when the pay is in the
 * data), the biggest and cheapest months, the top category and places, the new places, the trips, the train tickets
 * and the biggest day. Only the facts the year has something for.
 */
export function yearFacts({year, rows, moneyIn, toSavings, trips, currency, categories}: YearInput): Fact[] {
  const amount = (value: number) => money(value, currency);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const ofYear = (value: string) => rows.filter(row => row.date.startsWith(value) && row.spend !== 0);
  const spending = ofYear(year);
  const spent = spending.reduce((sum, row) => sum + row.spend, 0);
  if (spent < 1) return [];
  const before = ofYear(String(Number(year) - 1));
  const spentBefore = before.reduce((sum, row) => sum + row.spend, 0);
  const days = new Set(spending.map(row => row.date));
  const facts: Fact[] = [
    {
      icon: '🧾',
      value: amount(spent),
      title: `Spent in ${year}`,
      detail: `${plural(spending.filter(row => row.spend > 0).length, 'payment')}${
        spentBefore >= 1
          ? `, ${Math.round(Math.abs(spent / spentBefore - 1) * 100)}% ${spent >= spentBefore ? 'more' : 'less'} than ${
              Number(year) - 1
            } (${amount(spentBefore)})`
          : ''
      }`,
    },
  ];
  if (moneyIn >= spent * PAY_KNOWN) {
    const kept = moneyIn - spent;
    facts.push({
      icon: kept >= 0 ? '🐷' : '🕳️',
      value: amount(Math.abs(kept)),
      title: kept >= 0 ? 'Kept' : 'Spent beyond money in',
      detail: `of ${amount(moneyIn)} that came in${kept > 0 ? `, ${Math.round((kept / moneyIn) * 100)}%` : ''}${
        Math.abs(toSavings) >= 1
          ? `; ${amount(Math.abs(toSavings))} ${toSavings >= 0 ? 'to savings' : 'taken from savings'}`
          : ''
      }`,
    });
  }
  // Months by what they cost.
  const months = new Map<string, number>();
  for (const row of spending) months.set(row.date.slice(0, 7), (months.get(row.date.slice(0, 7)) ?? 0) + row.spend);
  const byMonth = [...months].sort((first, second) => second[1] - first[1]);
  if (byMonth.length >= 2) {
    const [top] = byMonth;
    const low = byMonth[byMonth.length - 1];
    facts.push({
      icon: '📅',
      value: periodLabel(top[0], 'month').split(' ')[0],
      title: 'Biggest month',
      detail: `${amount(top[1])}; the cheapest, ${periodLabel(low[0], 'month').split(' ')[0]}, ${amount(low[1])}`,
    });
  }
  const byCategory = new Map<string, number>();
  for (const row of spending) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.spend);
  const [category] = [...byCategory].sort((first, second) => second[1] - first[1]);
  if (category) {
    facts.push({
      icon: categories.byKey[category[0]]?.icon ?? '🧾',
      value: categories.byKey[category[0]]?.label ?? category[0],
      title: 'Top category',
      detail: `${amount(category[1])}, ${Math.round((category[1] / spent) * 100)}% of the spending`,
    });
  }
  // Places by money, then by visits.
  const stores = new Map<string, {name: string; total: number; visits: number}>();
  for (const row of spending) {
    const store = stores.get(row.storeKey) ?? {name: row.store, total: 0, visits: 0};
    store.total += row.spend;
    if (row.spend > 0) store.visits += 1;
    stores.set(row.storeKey, store);
  }
  const [richest] = [...stores.values()].sort((first, second) => second.total - first.total);
  const [regular] = [...stores.values()].sort((first, second) => second.visits - first.visits);
  if (richest) {
    facts.push({
      icon: '🏪',
      value: richest.name,
      title: 'Where the most went',
      detail: `${amount(richest.total)} over ${plural(richest.visits, 'payment')}`,
    });
  }
  if (regular && regular.visits >= 3 && regular !== richest) {
    facts.push({
      icon: '🔁',
      value: regular.name,
      title: 'Your regular',
      detail: `${plural(regular.visits, 'payment')}, ${amount(regular.total)}`,
    });
  }
  // Places paid for the first time that year.
  const seen = new Set(rows.filter(row => row.date < `${year}-01-01` && row.spend > 0).map(row => row.storeKey));
  const fresh = [...stores].filter(([key, store]) => !seen.has(key) && store.visits > 0);
  if (fresh.length && seen.size) {
    const favourites = [...fresh].sort((first, second) => second[1].visits - first[1].visits).slice(0, 2);
    facts.push({
      icon: '✨',
      value: String(fresh.length),
      title: 'New places',
      detail: `paid for the first time, like ${favourites.map(([, store]) => store.name).join(' and ')}`,
    });
  }
  const yearTrips = tripSummaries(rows, trips).filter(trip => trip.from.startsWith(year));
  if (yearTrips.length) {
    facts.push({
      icon: '🧳',
      value: amount(yearTrips.reduce((sum, trip) => sum + trip.total, 0)),
      title: plural(yearTrips.length, 'trip'),
      detail: `${yearTrips.reduce((sum, trip) => sum + trip.days, 0)} days away: ${yearTrips
        .map(trip => trip.name)
        .join(', ')}`,
    });
  }
  const trainYear = trainStats(rows, currency)?.years.find(item => item.year === year);
  if (trainYear && trainYear.count > 0) {
    facts.push({
      icon: '🚆',
      value: amount(trainYear.total),
      title: 'On trains',
      detail: plural(trainYear.count, 'ticket'),
    });
  }
  // The biggest day, and the weekday that costs the most on average.
  const byDay = new Map<string, {total: number; top: Row}>();
  for (const row of spending) {
    const day = byDay.get(row.date) ?? {total: 0, top: row};
    day.total += row.spend;
    if (row.spend > day.top.spend) day.top = row;
    byDay.set(row.date, day);
  }
  const [bigDay] = [...byDay].sort((first, second) => second[1].total - first[1].total);
  if (bigDay) {
    facts.push({
      icon: '💥',
      value: weekdayLabel(bigDay[0]),
      title: 'Biggest day',
      detail: `${amount(bigDay[1].total)}, most of it at ${bigDay[1].top.store}`,
    });
  }
  const weekdays = WEEKDAYS.map(() => ({total: 0, days: 0}));
  for (const [date, day] of byDay) weekdays[weekdayOf(date)].total += day.total;
  for (const date of days) weekdays[weekdayOf(date)].days += 1;
  const [dearest] = weekdays
    .map((day, index) => ({index, average: day.days ? day.total / day.days : 0}))
    .sort((first, second) => second.average - first.average);
  if (dearest && dearest.average > 0) {
    facts.push({
      icon: '🗓️',
      value: WEEKDAYS[dearest.index],
      title: 'Dearest weekday',
      detail: `${amount(dearest.average)} on an average ${WEEKDAYS[dearest.index]} with a payment`,
    });
  }
  return facts;
}
