import type {Categories} from './categories';
import {money} from './format';
import {addDays, dayLabel, daysBetween, WEEKDAYS, weekdayOf} from './periods';
import {findSubscriptions} from './report';
import type {Row} from './rows';

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
  /** An average month by month of the year (January first), from full months; none before a whole year. */
  seasons: number[] | null;
  facts: Fact[];
}

const COFFEE = /caf[eé]|coffee|starbucks|espresso|kaffe|kafé|costa|columbus|kitsun/i;

function plural(count: number, word: string) {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/** "€120, €80 and €45": the end of a list in words. */
function listed(items: string[]) {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Fun facts over all the payments of one currency (rows newest first). */
export function funStats(rows: Row[], currency: string, categories: Categories): FunStats | null {
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

  // Friends paying back their share (see linkPaybacks): how much in all, and who the most.
  const paybacks = rows.filter(row => row.refundOf?.byHand);
  if (paybacks.length > 0) {
    const byFriend = new Map<string, {name: string; total: number}>();
    for (const row of paybacks) {
      const friend = byFriend.get(row.storeKey) ?? {name: row.store, total: 0};
      friend.total += row.amount;
      byFriend.set(row.storeKey, friend);
    }
    const most = [...byFriend.values()].sort((first, second) => second.total - first.total)[0];
    facts.push({
      icon: '🤝',
      value: amount(paybacks.reduce((sum, row) => sum + row.amount, 0)),
      title: 'Paid back by friends',
      detail: `${plural(paybacks.length, 'payback')}, the most from ${most.name} (${amount(most.total)})`,
    });
  }

  // The regular payments of the latest month (subscriptions, bills, rent), over a year.
  const regular = findSubscriptions(rows, to.slice(0, 7), categories);
  if (regular.length > 0) {
    const biggest = [...regular].sort((first, second) => second.monthly - first.monthly).slice(0, 3);
    facts.push({
      icon: '🔁',
      value: amount(regular.reduce((sum, item) => sum + item.monthly, 0) * 12),
      title: 'Regular payments a year',
      detail: `${plural(regular.length, 'regular payment')}, the biggest ${listed(biggest.map(item => item.name))}`,
    });
  }

  // Your own categories, the costliest first: the ones paid mostly by a regular payment (a loan, charges) are no
  // hobby, so they stay out.
  const regularKeys = new Set(regular.map(item => item.key));
  const own = new Map<string, {total: number; regular: number}>();
  for (const row of payments) {
    if (!categories.byKey[row.category]?.custom) continue;
    const entry = own.get(row.category) ?? {total: 0, regular: 0};
    entry.total += row.spend;
    if (regularKeys.has(`${row.storeKey}|${row.category}`)) entry.regular += row.spend;
    own.set(row.category, entry);
  }
  const hobbies = [...own]
    .filter(([, entry]) => entry.regular < entry.total / 2)
    .sort((first, second) => second[1].total - first[1].total);
  if (hobbies.length > 0) {
    const [key, entry] = hobbies[0];
    const named = (item: [string, {total: number}]) =>
      `${categories.byKey[item[0]]?.icon} ${categories.byKey[item[0]]?.label} (${amount(item[1].total)})`;
    facts.push({
      icon: categories.byKey[key]?.icon ?? '🎨',
      value: categories.byKey[key]?.label ?? key,
      title: 'Your costliest hobby',
      detail:
        hobbies.length > 1
          ? `${amount(entry.total)} since ${from.slice(0, 4)}, then ${listed(hobbies.slice(1, 3).map(named))}`
          : `${amount(entry.total)} since ${from.slice(0, 4)}`,
    });
  }

  // Everything under €5, added up.
  const small = payments.filter(row => row.spend < 5);
  if (small.length >= 10) {
    const smallTotal = small.reduce((sum, row) => sum + row.spend, 0);
    facts.push({
      icon: '🪙',
      value: amount(smallTotal),
      title: 'Small stuff adds up',
      detail: `${plural(small.length, 'payment')} under ${amount(5)}, about ${amount(smallTotal / Math.max(1, span / 365))} a year`,
    });
  }

  // Stores: how many, how many new in the latest year, and the very first payment.
  const firstVisit = new Map<string, string>();
  for (const row of payments) firstVisit.set(row.storeKey, row.date);
  const year = to.slice(0, 4);
  const newThisYear = [...firstVisit.values()].filter(date => date.startsWith(year)).length;
  const first = payments[payments.length - 1];
  facts.push({
    icon: '🏪',
    value: plural(visits.size, 'store'),
    title: "Stores you've paid",
    detail: `${newThisYear} new in ${year}; the very first payment: ${first.store}, ${dayLabel(first.date, true)}`,
  });

  // The grocery basket: the average grocery payment in the latest year against three years before.
  const basket = (inYear: string) => {
    const shop = payments.filter(row => row.category === 'groceries' && row.date.startsWith(inYear));
    return shop.length >= 10 ? shop.reduce((sum, row) => sum + row.spend, 0) / shop.length : null;
  };
  const before = String(Number(year) - 3);
  const [basketNow, basketThen] = [basket(year), basket(before)];
  if (basketNow !== null && basketThen !== null) {
    const change = Math.round((basketNow / basketThen - 1) * 100);
    facts.push({
      icon: '🛒',
      value: money(basketNow, currency, true),
      title: 'Your grocery basket',
      detail: `an average grocery payment in ${year}, against ${money(basketThen, currency, true)} in ${before} (${change > 0 ? '+' : ''}${change}%)`,
    });
  }

  // Labels, the costliest first.
  const labelled = new Map<string, {total: number; count: number}>();
  for (const row of payments) {
    for (const label of row.labels) {
      const entry = labelled.get(label) ?? {total: 0, count: 0};
      entry.total += row.spend;
      entry.count += 1;
      labelled.set(label, entry);
    }
  }
  const labels = [...labelled].sort((first, second) => second[1].total - first[1].total);
  if (labels.length > 0) {
    const [label, entry] = labels[0];
    facts.push({
      icon: '🏷️',
      value: `#${label}`,
      title: 'Your costliest label',
      detail:
        `${amount(entry.total)} over ${plural(entry.count, 'payment')}` +
        (labels.length > 1
          ? `, then ${listed(labels.slice(1, 3).map(([name, item]) => `#${name} (${amount(item.total)})`))}`
          : ''),
    });
  }

  // This year so far against last year by the same day, all spending and each category.
  const lastYear = String(Number(year) - 1);
  const sameDay = `${lastYear}${to.slice(4)}`;
  const thisSoFar = payments.filter(row => row.date >= `${year}-01-01` && row.date <= to);
  const lastSoFar = payments.filter(row => row.date >= `${lastYear}-01-01` && row.date <= sameDay);
  const sum = (list: Row[]) => list.reduce((total, row) => total + row.spend, 0);
  if (lastSoFar.length > 0 && thisSoFar.length > 0) {
    const [now, then] = [sum(thisSoFar), sum(lastSoFar)];
    facts.push({
      icon: '📆',
      value: `${now >= then ? '+' : '−'}${amount(Math.abs(now - then))}`,
      title: 'This year so far',
      detail: `${amount(now)} by ${dayLabel(to)}, against ${amount(then)} by the same day of ${lastYear}`,
    });
    const byCategory = (list: Row[]) => {
      const totals = new Map<string, number>();
      for (const row of list) totals.set(row.category, (totals.get(row.category) ?? 0) + row.spend);
      return totals;
    };
    const [nowBy, thenBy] = [byCategory(thisSoFar), byCategory(lastSoFar)];
    // Categories of €100 or more last year, so a few euros more is no "+300%".
    const changes = [...thenBy]
      .filter(([, value]) => value >= 100)
      .map(([key, value]) => ({key, now: nowBy.get(key) ?? 0, then: value}))
      .sort((first, second) => second.now - second.then - (first.now - first.then));
    const named = (key: string) => `${categories.byKey[key]?.icon ?? ''} ${categories.byKey[key]?.label ?? key}`.trim();
    const percent = (change: {now: number; then: number}) => Math.round((change.now / change.then - 1) * 100);
    const rise = changes[0];
    const drop = changes.at(-1);
    if (rise && rise.now > rise.then) {
      facts.push({
        icon: '📈',
        value: `${named(rise.key)} +${percent(rise)}%`,
        title: 'Biggest rise since last year',
        detail: `${amount(rise.now)} so far this year, against ${amount(rise.then)} by the same day of ${lastYear}`,
      });
    }
    if (drop && drop.now < drop.then) {
      facts.push({
        icon: '📉',
        value: `${named(drop.key)} −${Math.abs(percent(drop))}%`,
        title: 'Biggest drop since last year',
        detail: `${amount(drop.now)} so far this year, against ${amount(drop.then)} by the same day of ${lastYear}`,
      });
    }
  }

  // How long pay lasts: from each payday (money in of €500 or more, in Money in), the days until what was spent since
  // reaches it. Pay not caught up with within 45 days is left out.
  const pays = new Map<string, number>();
  for (const row of rows) {
    if (row.category === 'income' && row.amount >= 500) pays.set(row.date, (pays.get(row.date) ?? 0) + row.amount);
  }
  const lasts: number[] = [];
  for (const [payday, pay] of pays) {
    let spent = 0;
    for (let step = 0; step < 45; step += 1) {
      const date = addDays(payday, step);
      if (date > to) break;
      spent += byDay.get(date)?.total ?? 0;
      if (spent >= pay) {
        lasts.push(step + 1);
        break;
      }
    }
  }
  if (lasts.length >= 3) {
    const average = Math.round(lasts.reduce((total, days) => total + days, 0) / lasts.length);
    facts.push({
      icon: '⏳',
      value: plural(average, 'day'),
      title: 'How long your pay lasts',
      detail: `on average, what you spend from payday on catches up with that pay ${plural(average, 'day')} later (${plural(lasts.length, 'payday')})`,
    });
  }

  // The 80/20 rule: how few of the biggest payments make 80% of the spending.
  let running = 0;
  let biggestShare = 0;
  for (const row of [...sorted].reverse()) {
    running += row.spend;
    biggestShare += 1;
    if (running >= total * 0.8) break;
  }
  facts.push({
    icon: '⚖️',
    value: `${Math.max(1, Math.round((biggestShare / payments.length) * 100))}%`,
    title: 'The 80/20 rule',
    detail: `your ${plural(biggestShare, 'biggest payment')} make 80% of what you spent, out of ${plural(payments.length, 'payment')}`,
  });

  // The amount paid most often, to the cent, and where mostly.
  const amounts = new Map<number, {count: number; stores: Map<string, number>}>();
  for (const row of payments) {
    const cents = Math.round(row.spend * 100);
    const entry = amounts.get(cents) ?? {count: 0, stores: new Map<string, number>()};
    entry.count += 1;
    entry.stores.set(row.store, (entry.stores.get(row.store) ?? 0) + 1);
    amounts.set(cents, entry);
  }
  const [repeatedCents, repeated] = [...amounts].sort((first, second) => second[1].count - first[1].count)[0];
  if (repeated.count >= 3) {
    const [where, times] = [...repeated.stores].sort((first, second) => second[1] - first[1])[0];
    facts.push({
      icon: '🔂',
      value: money(repeatedCents / 100, currency, true),
      title: 'Your most repeated amount',
      detail: `${plural(repeated.count, 'time')}, ${times === repeated.count ? 'all' : `${times}`} at ${where}`,
    });
  }

  // Stores paid once, and the one kept the longest (its first payment to its last).
  const lastVisit = new Map<string, string>();
  for (const row of payments) if (!lastVisit.has(row.storeKey)) lastVisit.set(row.storeKey, row.date);
  const once = [...visits.values()].filter(store => store.count === 1).length;
  facts.push({
    icon: '👋',
    value: plural(once, 'store'),
    title: 'Stores paid only once',
    detail: `${Math.round((once / visits.size) * 100)}% of the ${plural(visits.size, 'store')} you've paid`,
  });
  const longest = [...visits]
    .map(([key, store]) => ({...store, first: firstVisit.get(key) ?? to, last: lastVisit.get(key) ?? to}))
    .sort((first, second) => daysBetween(second.first, second.last) - daysBetween(first.first, first.last))[0];
  if (longest && longest.count > 1) {
    facts.push({
      icon: '💍',
      value: longest.name,
      title: 'Your longest-running store',
      detail: `${dayLabel(longest.first, true)} to ${dayLabel(longest.last, true)}, ${plural(longest.count, 'payment')}`,
    });
  }

  // Money back from stores (not friends' paybacks): in all, and the store that gave back the most.
  const refunds = rows.filter(row => row.refund && !row.refundOf?.byHand && row.amount > 0);
  if (refunds.length > 0) {
    const byStore = new Map<string, number>();
    for (const row of refunds) byStore.set(row.store, (byStore.get(row.store) ?? 0) + row.amount);
    const [generous, given] = [...byStore].sort((first, second) => second[1] - first[1])[0];
    facts.push({
      icon: '↩️',
      value: amount(refunds.reduce((total, row) => total + row.amount, 0)),
      title: 'Refunded by stores',
      detail: `${plural(refunds.length, 'refund')}, the most from ${generous} (${amount(given)})`,
    });
  }

  // Days with nothing spent this year so far, against last year by the same day.
  const quietDays = (start: string, end: string) => {
    let count = 0;
    for (let date = start; date <= end; date = addDays(date, 1)) if (!byDay.has(date)) count += 1;
    return count;
  };
  if (`${lastYear}-01-01` >= from) {
    const [quietNow, quietThen] = [quietDays(`${year}-01-01`, to), quietDays(`${lastYear}-01-01`, sameDay)];
    facts.push({
      icon: '🌿',
      value: plural(quietNow, 'day'),
      title: 'No-spend days this year',
      detail: `against ${plural(quietThen, 'day')} by the same day of ${lastYear}`,
    });
  }

  // Seasons: each month of the year on average, from the full months (the first and last may be partly covered).
  const seasonTotals = Array.from({length: 12}, () => 0);
  const seasonCounts = Array.from({length: 12}, () => 0);
  for (const [month, value] of months) {
    if (month <= from.slice(0, 7) || month >= to.slice(0, 7)) continue;
    seasonTotals[Number(month.slice(5, 7)) - 1] += value;
    seasonCounts[Number(month.slice(5, 7)) - 1] += 1;
  }
  const seasons = seasonCounts.every(count => count > 0)
    ? seasonTotals.map((sum, index) => sum / seasonCounts[index])
    : null;

  return {from, to, weekdays, hours, seasons, facts};
}
