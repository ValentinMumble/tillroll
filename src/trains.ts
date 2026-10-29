import {money} from './format';
import {dayLabel, today} from './periods';
import type {Row} from './rows';
import type {Fact} from './stats';
import {plain} from './text';

/** A train ticket: bought from a railway or a ticket site, by its store's name or the bank's text. */
const TRAIN =
  /\bsncf\b|trainline|ouigo|\bter\b|trenitalia|\bitalo\b|(?:^|[^a-z])[öo]e?bb\b|eurostar|thalys|deutsche bahn|\bdb vertrieb|renfe|\bsbb\b|breizhgo|al[ée]op|intercit/i;

/** A railcard or a pass bought from the railway, by its label: not a ticket, it makes the tickets cheaper. */
const RAILCARD = /carte avantage|carte jeune|carte libert|railcard|abonnement|\bforfait\b|\bpass\b/i;

/** A route label, as the train tickets are labelled: "Nantes ⇄ Lorient", "Lyon → Orange". */
const ROUTE = /^(.+?) (⇄|→) (.+)$/;

/**
 * Where the stations of the routes are (latitude, longitude), for the distances: the places the labels name, in plain
 * words. A route with a place missing here is left out of the distances.
 */
const PLACES: Record<string, [number, number]> = {
  nantes: [47.217, -1.542],
  lorient: [47.755, -3.366],
  rennes: [48.103, -1.672],
  paris: [48.841, 2.32],
  'paris cdg': [49.004, 2.571],
  chateaubriant: [47.717, -1.374],
  pontchateau: [47.437, -2.09],
  redon: [47.652, -2.084],
  tours: [47.39, 0.694],
  clisson: [47.087, -1.282],
  vannes: [47.666, -2.756],
  machecoul: [46.994, -1.822],
  ancenis: [47.366, -1.178],
  quimperle: [47.872, -3.548],
  rosporden: [47.962, -3.835],
  saumur: [47.268, -0.07],
  cholet: [47.06, -0.879],
  angers: [47.464, -0.557],
  landerneau: [48.451, -4.249],
  'la rochelle': [46.153, -1.145],
  lusignan: [46.436, 0.122],
  lyon: [45.761, 4.859],
  orange: [44.136, 4.809],
  'marseille arenc': [43.31, 5.366],
  'carry-le-rouet': [43.331, 5.153],
  'aime-la plagne': [45.556, 6.649],
  moutiers: [45.484, 6.531],
  'bourg-st-maurice': [45.619, 6.771],
  lille: [50.637, 3.071],
  metz: [49.11, 6.177],
  'lorraine tgv': [48.948, 6.169],
  'olonne-sur-mer': [46.536, -1.773],
  salzburg: [47.813, 13.046],
  saalbach: [47.392, 12.766],
  naples: [40.853, 14.272],
  'torre del greco': [40.787, 14.363],
  milan: [45.487, 9.205],
};

/** The places above outside France, with their country's flag; the others are in France. */
const ABROAD: Record<string, string> = {
  salzburg: '🇦🇹',
  saalbach: '🇦🇹',
  naples: '🇮🇹',
  'torre del greco': '🇮🇹',
  milan: '🇮🇹',
};

/** Rails are longer than a straight line: about a quarter more. */
const DETOUR = 1.25;

/**
 * Carbon dioxide for a kilometre and one person, in kilograms (rough figures from ADEME, the French environment
 * agency): a car with its driver alone, and a mix of regional trains and TGV.
 */
const CAR_CO2 = 0.218;
const TRAIN_CO2 = 0.03;

/** A month ("2025-11") as it reads: "Nov 2025". */
function monthLabel(key: string) {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function kilometres(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [latitude, longitude] = [radians(to[0] - from[0]), radians(to[1] - from[1])];
  const arc =
    Math.sin(latitude / 2) ** 2 + Math.cos(radians(from[0])) * Math.cos(radians(to[0])) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)) * DETOUR;
}

function plural(count: number, word: string, words = `${word}s`) {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? word : words}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface TrainStats {
  facts: Fact[];
  /** What the tickets cost each year, from the first year to the last (a year with none is in, at 0). */
  years: {year: string; total: number; count: number}[];
  /** What the tickets cost by month of the year, January first, every year together. */
  months: number[];
  /** The lines taken most, from the route labels, the most taken first: six at most. */
  lines: {name: string; count: number; total: number}[];
}

/**
 * Playful facts about the train tickets (rows of one currency), with what they cost each year and by month, and the
 * lines taken most. Routes come from the tickets' labels ("Nantes ⇄ Lorient"): the line's price over the years, the
 * places and countries reached, the distance and the carbon dioxide it saved against a car, the longest ride and the
 * best value for money. A ticket's price is what was paid for it; what it cost counts refunds and paybacks off.
 * Railcards (by their label) are not tickets: they have their own fact. None without at least three tickets.
 */
export function trainStats(rows: Row[], currency: string): TrainStats | null {
  const bought = rows.filter(
    row => row.amount < 0 && row.counts && row.spend > 0 && TRAIN.test(`${row.store} ${row.description}`),
  );
  const railcards = bought.filter(row => row.labels.some(label => RAILCARD.test(label)));
  const tickets = bought.filter(row => !railcards.includes(row));
  if (tickets.length < 3) return null;
  const amount = (value: number) => money(value, currency);
  const cents = (value: number) => money(value, currency, true);
  const total = tickets.reduce((sum, row) => sum + row.spend, 0);
  const first = tickets.reduce((oldest, row) => (row.date < oldest ? row.date : oldest), tickets[0].date);
  const last = tickets.reduce((newest, row) => (row.date > newest ? row.date : newest), tickets[0].date);
  const span = Math.max(1, (Date.parse(last) - Date.parse(first)) / (365.25 * 86_400_000));
  const facts: Fact[] = [
    {
      icon: '🚆',
      value: amount(total),
      title: 'Spent on train tickets',
      detail: `${plural(tickets.length, 'ticket')} since ${dayLabel(first, true)}, about ${amount(total / span)} a year; a usual ticket is ${amount(median(tickets.map(row => -row.amount)))}`,
    },
  ];

  const years: TrainStats['years'] = [];
  for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year += 1) {
    const ofYear = tickets.filter(row => row.date.startsWith(String(year)));
    years.push({year: String(year), total: ofYear.reduce((sum, row) => sum + row.spend, 0), count: ofYear.length});
  }
  const months = Array.from({length: 12}, () => 0);
  for (const row of tickets) months[Number(row.date.slice(5, 7)) - 1] += row.spend;

  // Routes from the labels, and the places at their ends.
  const routes = tickets.flatMap(row => {
    const label = row.labels.map(item => ROUTE.exec(item)).find(Boolean);
    return label ? [{row, name: label[0], ends: [label[1], label[3]]}] : [];
  });
  const byLine = new Map<string, Row[]>();
  for (const {row, name} of routes) byLine.set(name, [...(byLine.get(name) ?? []), row]);
  const lines = [...byLine]
    .map(([name, list]) => ({name, count: list.length, total: list.reduce((sum, row) => sum + row.spend, 0)}))
    .sort((first, second) => second.count - first.count || second.total - first.total)
    .slice(0, 6);

  if (routes.length > 0) {
    // The line taken most, its price the first year and the last (the usual one each year).
    const [main] = lines;
    const priced = new Map<string, number[]>();
    for (const row of byLine.get(main.name) ?? []) {
      priced.set(row.date.slice(0, 4), [...(priced.get(row.date.slice(0, 4)) ?? []), -row.amount]);
    }
    const ofYears = [...priced].sort((first, second) => (first[0] < second[0] ? -1 : 1));
    if (ofYears.length > 1) {
      const [then, now] = [median(ofYears[0][1]), median(ofYears[ofYears.length - 1][1])];
      const change = Math.round(((now - then) / then) * 100);
      facts.push({
        icon: '🛤️',
        value: `${cents(then)} → ${cents(now)}`,
        title: `${main.name} over the years`,
        detail: `the usual ticket on your line, ${ofYears[0][0]} to ${ofYears[ofYears.length - 1][0]}: ${change >= 0 ? '+' : ''}${change}%, over ${plural(main.count, 'ticket')}`,
      });
    }

    // Home is the place most routes start or end at; the places reached are all the others.
    const visits = new Map<string, number>();
    for (const {ends} of routes) for (const end of ends) visits.set(end, (visits.get(end) ?? 0) + 1);
    const home = [...visits].sort((first, second) => second[1] - first[1])[0][0];
    const places = [...visits].filter(([place]) => place !== home).sort((first, second) => second[1] - first[1]);
    const flags = new Set(
      [...visits.keys()].filter(place => PLACES[plain(place)]).map(place => ABROAD[plain(place)] ?? '🇫🇷'),
    );
    facts.push({
      icon: '🗺️',
      value: plural(places.length, 'place'),
      title: 'Reached by train',
      detail: `from ${home}${flags.size > 1 ? `, in ${flags.size} countries ${[...flags].join(' ')}` : ''}; most often ${places
        .slice(0, 3)
        .map(([place, count]) => `${place} (${count})`)
        .join(', ')}`,
    });

    const where = (place: string) => PLACES[plain(place)];
    const measured = routes
      .filter(({ends}) => where(ends[0]) && where(ends[1]))
      .map(route => ({...route, km: kilometres(where(route.ends[0]), where(route.ends[1]))}));
    if (measured.length >= 3) {
      const distance = measured.reduce((sum, {km}) => sum + km, 0);
      facts.push({
        icon: '🌍',
        value: `≈ ${Math.round(distance).toLocaleString('en-GB')} km`,
        title: 'Distance by train',
        detail: `about ${(distance / 40_075).toFixed(2)} times around the Earth, over ${plural(measured.length, 'ticket')} with a route`,
      });
      const saved = distance * (CAR_CO2 - TRAIN_CO2);
      facts.push({
        icon: '🌱',
        value: saved >= 1000 ? `≈ ${(saved / 1000).toFixed(1)} t of CO₂` : `≈ ${Math.round(saved)} kg of CO₂`,
        title: 'Kept out of the air',
        detail: 'against driving alone the same distance; a rough count',
      });
      const longest = measured.reduce((top, route) => (route.km > top.km ? route : top), measured[0]);
      facts.push({
        icon: '📏',
        value: longest.name,
        title: 'Longest ride',
        detail: `about ${Math.round(longest.km).toLocaleString('en-GB')} km of track, ${amount(-longest.row.amount)} on ${dayLabel(longest.row.date, true)}`,
      });
      // Price for a kilometre, over the rides long enough for it to mean something.
      const fair = measured.filter(({km}) => km >= 20);
      if (fair.length >= 3) {
        const average = fair.reduce((sum, {row}) => sum - row.amount, 0) / fair.reduce((sum, {km}) => sum + km, 0);
        const best = fair.reduce((top, route) =>
          -route.row.amount / route.km < -top.row.amount / top.km ? route : top,
        );
        facts.push({
          icon: '🪙',
          value: `${cents(-best.row.amount / best.km)} a km`,
          title: 'Best value',
          detail: `${best.name}, ${cents(-best.row.amount)} for about ${Math.round(best.km)} km, against ${cents(average)} a km on average`,
        });
      }
    }
  }

  const priciest = tickets.reduce((top, row) => (-row.amount > -top.amount ? row : top), tickets[0]);
  facts.push({
    icon: '💸',
    value: amount(-priciest.amount),
    title: 'Priciest ticket',
    detail: `${priciest.labels[0] ?? priciest.store}, ${dayLabel(priciest.date, true)}`,
  });

  // Trips away (filed under Travel) against everyday trains (Transport).
  const away = tickets.filter(row => row.category === 'travel');
  if (away.length > 0 && away.length < tickets.length) {
    const awayTotal = away.reduce((sum, row) => sum + row.spend, 0);
    facts.push({
      icon: '🧳',
      value: amount(awayTotal),
      title: 'Trains for trips away',
      detail: `${plural(away.length, 'ticket')} under Travel, against ${amount(total - awayTotal)} for everyday trains`,
    });
  }

  // The busiest month, and the longest run of months with a ticket in each.
  const byMonth = new Map<string, Row[]>();
  for (const row of tickets) byMonth.set(row.date.slice(0, 7), [...(byMonth.get(row.date.slice(0, 7)) ?? []), row]);
  const [busiest, busiestRows] = [...byMonth].sort((first, second) => second[1].length - first[1].length)[0];
  facts.push({
    icon: '📅',
    value: monthLabel(busiest),
    title: 'Busiest month on the rails',
    detail: `${plural(busiestRows.length, 'ticket')}, ${amount(busiestRows.reduce((sum, row) => sum + row.spend, 0))}`,
  });
  const next = (key: string) => {
    const [year, month] = key.split('-').map(Number);
    return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  };
  const keys = [...byMonth.keys()].sort();
  let run = {from: keys[0], to: keys[0], length: 1};
  let current = {...run};
  for (const key of keys.slice(1)) {
    current =
      key === next(current.to) ? {...current, to: key, length: current.length + 1} : {from: key, to: key, length: 1};
    if (current.length > run.length) run = current;
  }
  // Still going when it reaches this month or the last one.
  const ongoing = run.to === today().slice(0, 7) || next(run.to) === today().slice(0, 7);
  if (run.length >= 3) {
    facts.push({
      icon: '🔥',
      value: `${run.length} months in a row`,
      title: 'Longest run',
      detail: `a ticket every month from ${monthLabel(run.from)} to ${monthLabel(run.to)}${ongoing ? ', and counting' : ''}`,
    });
  }

  if (railcards.length > 0) {
    facts.push({
      icon: '🎫',
      value: amount(railcards.reduce((sum, row) => sum + row.spend, 0)),
      title: 'Railcards',
      detail: `${plural(railcards.length, 'card or pass', 'cards or passes')} since ${railcards
        .map(row => row.date)
        .sort()[0]
        .slice(0, 4)}, not counted as tickets`,
    });
  }
  return {facts, years, months, lines};
}
