import {money} from './format';
import {dayLabel} from './periods';
import type {Row} from './rows';
import type {Fact} from './stats';
import {plain} from './text';

/** A train ticket: bought from a railway or a ticket site, by its store's name or the bank's text. */
const TRAIN =
  /\bsncf\b|trainline|ouigo|\bter\b|trenitalia|\bitalo\b|(?:^|[^a-z])[öo]e?bb\b|eurostar|thalys|deutsche bahn|\bdb vertrieb|renfe|\bsbb\b|breizhgo|al[ée]op|intercit/i;

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

/** Rails are longer than a straight line: about a quarter more. */
const DETOUR = 1.25;

function kilometres(from: [number, number], to: [number, number]) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [latitude, longitude] = [radians(to[0] - from[0]), radians(to[1] - from[1])];
  const arc =
    Math.sin(latitude / 2) ** 2 + Math.cos(radians(from[0])) * Math.cos(radians(to[0])) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)) * DETOUR;
}

function plural(count: number, word: string) {
  return `${count.toLocaleString('en-GB')} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Playful facts about the train tickets (rows of one currency): what they cost, the line taken most, the places
 * reached and how far, the priciest ticket, trips away against everyday trains, the busiest year. Routes come from
 * the tickets' labels ("Nantes ⇄ Lorient"); none without at least three tickets.
 */
export function trainStats(rows: Row[], currency: string): Fact[] {
  const tickets = rows.filter(
    row => row.amount < 0 && row.counts && row.spend > 0 && TRAIN.test(`${row.store} ${row.description}`),
  );
  if (tickets.length < 3) return [];
  const amount = (value: number) => money(value, currency);
  const total = tickets.reduce((sum, row) => sum + row.spend, 0);
  const first = tickets.reduce((oldest, row) => (row.date < oldest ? row.date : oldest), tickets[0].date);
  const last = tickets.reduce((newest, row) => (row.date > newest ? row.date : newest), tickets[0].date);
  const years = Math.max(1, (Date.parse(last) - Date.parse(first)) / (365.25 * 86_400_000));
  const facts: Fact[] = [
    {
      icon: '🚆',
      value: amount(total),
      title: 'Spent on train tickets',
      detail: `${plural(tickets.length, 'ticket')} since ${dayLabel(first, true)}, about ${amount(total / years)} a year`,
    },
  ];

  // Routes from the labels, and the places at their ends.
  const routes = tickets.flatMap(row => {
    const label = row.labels.map(item => ROUTE.exec(item)).find(Boolean);
    return label ? [{row, name: label[0], ends: [label[1], label[3]]}] : [];
  });
  if (routes.length > 0) {
    const lines = new Map<string, {count: number; total: number}>();
    for (const {row, name} of routes) {
      const line = lines.get(name) ?? {count: 0, total: 0};
      line.count += 1;
      line.total += row.spend;
      lines.set(name, line);
    }
    const [name, line] = [...lines].sort((first, second) => second[1].count - first[1].count)[0];
    facts.push({
      icon: '🛤️',
      value: name,
      title: 'Your line',
      detail: `${plural(line.count, 'ticket')}, ${amount(line.total)} in all, about ${amount(line.total / line.count)} each`,
    });

    // Home is the place most routes start or end at; the places reached are all the others.
    const visits = new Map<string, number>();
    for (const {ends} of routes) for (const end of ends) visits.set(end, (visits.get(end) ?? 0) + 1);
    const home = [...visits].sort((first, second) => second[1] - first[1])[0][0];
    const places = [...visits].filter(([place]) => place !== home).sort((first, second) => second[1] - first[1]);
    facts.push({
      icon: '🗺️',
      value: plural(places.length, 'place'),
      title: 'Reached by train',
      detail: `from ${home}, most often ${places
        .slice(0, 3)
        .map(([place, count]) => `${place} (${count})`)
        .join(', ')}`,
    });

    const where = (place: string) => PLACES[plain(place)];
    const measured = routes.filter(({ends}) => where(ends[0]) && where(ends[1]));
    if (measured.length >= 3) {
      const distance = measured.reduce((sum, {ends}) => sum + kilometres(where(ends[0]), where(ends[1])), 0);
      facts.push({
        icon: '🌍',
        value: `≈ ${Math.round(distance).toLocaleString('en-GB')} km`,
        title: 'Distance by train',
        detail: `about ${(distance / 40_075).toFixed(2)} times around the Earth, over ${plural(measured.length, 'ticket')} with a route`,
      });
      const furthest = places
        .filter(([place]) => where(place) && where(home))
        .map(([place]) => [place, kilometres(where(home), where(place))] as const)
        .sort((first, second) => second[1] - first[1])[0];
      if (furthest) {
        facts.push({
          icon: '🧭',
          value: furthest[0],
          title: 'Furthest by train',
          detail: `about ${Math.round(furthest[1]).toLocaleString('en-GB')} km of track from ${home}`,
        });
      }
    }
  }

  const priciest = tickets.reduce((top, row) => (row.spend > top.spend ? row : top), tickets[0]);
  const route = priciest.labels.find(item => ROUTE.test(item));
  facts.push({
    icon: '💸',
    value: amount(priciest.spend),
    title: 'Priciest ticket',
    detail: `${route ?? priciest.store}, ${dayLabel(priciest.date, true)}`,
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

  const byYear = new Map<string, {count: number; total: number}>();
  for (const row of tickets) {
    const year = byYear.get(row.date.slice(0, 4)) ?? {count: 0, total: 0};
    year.count += 1;
    year.total += row.spend;
    byYear.set(row.date.slice(0, 4), year);
  }
  const [busiest, busiestYear] = [...byYear].sort((first, second) => second[1].count - first[1].count)[0];
  facts.push({
    icon: '📅',
    value: busiest,
    title: 'Busiest year on the rails',
    detail: `${plural(busiestYear.count, 'ticket')}, ${amount(busiestYear.total)}`,
  });
  return facts;
}
