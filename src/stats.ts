import {money} from './format';
import {addDays, dayLabel, daysBetween, WEEKDAYS, weekdayOf} from './periods';
import type {Row} from './report';

/** One playful fact: a big value, what it is, and a line of detail. */
export interface Fact {
  icon: string;
  value: string;
  title: string;
  detail: string;
}

export interface FunStats {
  from: string;
  to: string;
  /** Average spent on each weekday (Monday first), and in all. */
  weekdays: {average: number; total: number}[];
  /** Spent per hour of the day, when the payments have times (statements do, the bank sync does not). */
  hours: number[] | null;
  facts: Fact[];
}

const COFFEE = /caf[eé]|coffee|starbucks|espresso|kaffe|kafé|costa|columbus|kitsun/i;

function plural(count: number, word: string) {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/** Fun facts over all the payments of one currency (rows newest first). */
export function funStats(rows: Row[], currency: string): FunStats | null {
  const payments = rows.filter(row => row.counts && row.spend > 0);
  if (payments.length === 0) return null;
  const amount = (value: number) => money(value, currency);
  const from = payments[payments.length - 1].date;
  const to = payments[0].date;
  const span = daysBetween(from, to);

  const byDay = new Map<string, {total: number; count: number}>();
  for (const row of payments) {
    const day = byDay.get(row.date) ?? {total: 0, count: 0};
    day.total += row.spend;
    day.count += 1;
    byDay.set(row.date, day);
  }
  const total = payments.reduce((sum, row) => sum + row.spend, 0);

  // Weekdays: the total, and the average over every such day of the span (so a missing Monday counts as €0).
  const weekdayTotals = Array.from({length: 7}, () => 0);
  const weekdayDays = Array.from({length: 7}, () => 0);
  for (let date = from; date <= to; date = addDays(date, 1)) weekdayDays[weekdayOf(date)] += 1;
  for (const row of payments) weekdayTotals[weekdayOf(row.date)] += row.spend;
  const weekdays = weekdayTotals.map((sum, index) => ({total: sum, average: sum / Math.max(1, weekdayDays[index])}));

  // Hours: only when most payments carry a time.
  // Card payments only: a transfer's time is when the bank ran it, not when anyone spent.
  const timed = payments.filter(row => row.time && (row.kind === 'card' || row.kind === 'atm'));
  const cards = payments.filter(row => row.kind === 'card' || row.kind === 'atm').length;
  const hours = timed.length >= cards * 0.3 && timed.length > 0 ? Array.from({length: 24}, () => 0) : null;
  if (hours) for (const row of timed) hours[Number(row.time!.slice(0, 2))] += row.spend;

  const facts: Fact[] = [];

  const biggestDay = [...byDay].sort((first, second) => second[1].total - first[1].total)[0];
  facts.push({
    icon: '💥',
    value: amount(biggestDay[1].total),
    title: 'Biggest day',
    detail: `${dayLabel(biggestDay[0], true)}, ${plural(biggestDay[1].count, 'payment')}`,
  });

  const busiest = weekdays.reduce((best, day, index) => (day.average > weekdays[best].average ? index : best), 0);
  const quietest = weekdays.reduce((best, day, index) => (day.average < weekdays[best].average ? index : best), 0);
  facts.push({
    icon: '📅',
    value: WEEKDAYS[busiest],
    title: 'Your big spending day',
    detail: `${amount(weekdays[busiest].average)} on an average ${WEEKDAYS[busiest]}, against ${amount(weekdays[quietest].average)} on a ${WEEKDAYS[quietest]}`,
  });

  const weekend = weekdays[5].total + weekdays[6].total;
  facts.push({
    icon: '🛋️',
    value: `${Math.round((weekend / total) * 100)}%`,
    title: 'Spent at the weekend',
    detail: `2 days out of 7 would be 29%`,
  });

  // Streaks over the whole span: days with nothing spent, and days in a row with something.
  let quiet = {length: 0, end: from};
  let busy = {length: 0, end: from};
  let quietRun = 0;
  let busyRun = 0;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (byDay.has(date)) {
      busyRun += 1;
      quietRun = 0;
    } else {
      quietRun += 1;
      busyRun = 0;
    }
    if (quietRun > quiet.length) quiet = {length: quietRun, end: date};
    if (busyRun > busy.length) busy = {length: busyRun, end: date};
  }
  if (quiet.length > 0) {
    facts.push({
      icon: '🧘',
      value: plural(quiet.length, 'day'),
      title: 'Longest run without spending',
      detail: `${dayLabel(addDays(quiet.end, 1 - quiet.length), true)} to ${dayLabel(quiet.end, true)}`,
    });
  }
  facts.push({
    icon: '🔥',
    value: plural(busy.length, 'day'),
    title: 'Longest run spending every day',
    detail: `${dayLabel(addDays(busy.end, 1 - busy.length), true)} to ${dayLabel(busy.end, true)}`,
  });

  const visits = new Map<string, {name: string; count: number; total: number}>();
  for (const row of payments) {
    const store = visits.get(row.storeKey) ?? {name: row.store, count: 0, total: 0};
    store.count += 1;
    store.total += row.spend;
    visits.set(row.storeKey, store);
  }
  const loyal = [...visits.values()].sort((first, second) => second.count - first.count)[0];
  facts.push({
    icon: '💘',
    value: loyal.name,
    title: 'Your most loyal store',
    detail: `${plural(loyal.count, 'visit')}, about once every ${Math.max(1, Math.round(span / loyal.count))} days, ${amount(loyal.total)} in all`,
  });

  const coffees = payments.filter(row => COFFEE.test(`${row.store} ${row.description}`) && row.spend <= 10);
  if (coffees.length >= 3) {
    const spent = coffees.reduce((sum, row) => sum + row.spend, 0);
    facts.push({
      icon: '☕',
      value: plural(coffees.length, 'coffee'),
      title: 'Café visits under €10',
      detail: `${amount(spent)}, ${amount(spent / coffees.length)} a cup, about one every ${Math.max(1, Math.round(span / coffees.length))} days`,
    });
  }

  const sorted = [...payments].sort((first, second) => first.spend - second.spend);
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)].spend;
  facts.push({
    icon: '🐜',
    value: money(smallest.spend, currency, true),
    title: 'Smallest payment',
    detail: `${smallest.store}, ${dayLabel(smallest.date, true)}`,
  });
  facts.push({
    icon: '🐘',
    value: amount(largest.spend),
    title: 'Largest payment',
    detail: `${largest.store}, ${dayLabel(largest.date, true)}`,
  });
  facts.push({
    icon: '🎯',
    value: money(median, currency, true),
    title: 'Your typical payment',
    detail: `Half of your ${plural(payments.length, 'payment')} are smaller, the average is ${money(total / payments.length, currency, true)}`,
  });

  const round = payments.filter(row => Math.abs(row.spend - Math.round(row.spend)) < 0.005).length;
  facts.push({
    icon: '⭕',
    value: `${Math.round((round / payments.length) * 100)}%`,
    title: 'Round amounts',
    detail: `${plural(round, 'payment')} with no cents at all`,
  });

  const months = new Map<string, number>();
  for (const row of payments) months.set(row.date.slice(0, 7), (months.get(row.date.slice(0, 7)) ?? 0) + row.spend);
  // Only full months: the first and the last may be partly covered.
  const full = [...months].filter(([month]) => month > from.slice(0, 7) && month < to.slice(0, 7));
  if (full.length >= 2) {
    full.sort((first, second) => second[1] - first[1]);
    const label = (month: string) =>
      new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    facts.push({
      icon: '🎢',
      value: label(full[0][0]),
      title: 'Most expensive month',
      detail: `${amount(full[0][1])}, against ${amount(full[full.length - 1][1])} in ${label(full[full.length - 1][0])}, the cheapest`,
    });
  }

  // Payday: the 3 days after money in (over €500) against an ordinary day.
  const paydays = [...new Set(rows.filter(row => row.category === 'income' && row.amount >= 500).map(row => row.date))];
  if (paydays.length >= 2) {
    let after = 0;
    for (const payday of paydays) {
      for (let step = 0; step < 3; step += 1) after += byDay.get(addDays(payday, step))?.total ?? 0;
    }
    const perDay = after / (paydays.length * 3);
    const usual = total / span;
    const change = Math.round((perDay / usual - 1) * 100);
    facts.push({
      icon: '💸',
      value: `${change > 0 ? '+' : ''}${change}%`,
      title: 'Payday effect',
      detail: `${amount(perDay)} a day in the 3 days after pay comes in, against ${amount(usual)} on an average day`,
    });
  }

  if (hours) {
    const cardTotal = hours.reduce((sum, value) => sum + value, 0);
    const night =
      hours.slice(22).reduce((sum, value) => sum + value, 0) + hours.slice(0, 5).reduce((sum, value) => sum + value, 0);
    const peak = hours.indexOf(Math.max(...hours));
    facts.push({
      icon: night / cardTotal > 0.1 ? '🦉' : '🌅',
      value: `${String(peak).padStart(2, '0')}:00`,
      title: 'Your spending hour',
      detail: `${Math.round((night / cardTotal) * 100)}% of card spending happens between 22:00 and 5:00`,
    });
  }

  return {from, to, weekdays, hours, facts};
}
