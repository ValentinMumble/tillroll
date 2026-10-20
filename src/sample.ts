import { addDays, today, weekdayOf } from './periods'
import type { Kind, Transaction } from './types'

/**
 * Fourteen months of made-up spending for one person in Paris, up to today: the same every time (a seeded random),
 * with habits, monthly bills, a December peak and two holidays, so every view and insight has something to show.
 */

/** mulberry32: a small seeded random number generator. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

interface Habit {
  description: string | string[]
  /** Chance per day, by weekday (Monday first) or the same every day. */
  chance: number | number[]
  min: number
  max: number
  kind?: Kind
  /** Merchant category code, as a bank sync would give it. */
  mcc?: string
  /** Months (1 to 12) when the habit is stronger, and by how much. */
  peak?: { months: number[]; factor: number }
}

const HABITS: Habit[] = [
  { description: 'CARREFOUR CITY 75011', chance: 0.32, min: 6, max: 38 },
  { description: 'LIDL PARIS', chance: [0, 0, 0.1, 0, 0.1, 0.75, 0.1], min: 32, max: 92 },
  { description: 'SumUp *Boulangerie Ange', chance: 0.36, min: 1.6, max: 8.9 },
  { description: 'MONOPRIX', chance: 0.07, min: 12, max: 58 },
  { description: 'Biocoop Bastille', chance: 0.04, min: 14, max: 46 },
  { description: 'Deliveroo', chance: [0.03, 0.03, 0.05, 0.08, 0.3, 0.28, 0.12], min: 17, max: 36 },
  {
    description: [
      'Le Comptoir Voltaire',
      'Sushi Shop',
      'Big Fernand',
      'Pizzeria Popolare',
      'Chez Gladines',
      'Café Kitsuné',
    ],
    chance: [0.06, 0.06, 0.08, 0.12, 0.24, 0.22, 0.14],
    min: 12,
    max: 58,
    mcc: '5812',
  },
  { description: 'STARBUCKS COFFEE 0412', chance: [0.15, 0.15, 0.15, 0.15, 0.12, 0.02, 0.01], min: 3.9, max: 7.2 },
  { description: 'UBER *TRIP HELP.UBER.COM', chance: [0.03, 0.03, 0.03, 0.05, 0.12, 0.14, 0.05], min: 8, max: 29 },
  { description: 'SNCF CONNECT', chance: 0.025, min: 24, max: 112 },
  { description: 'LIME*RIDE', chance: 0.05, min: 1.8, max: 6.4 },
  { description: 'AMAZON.FR*2K4L09', chance: 0.08, min: 8, max: 84, peak: { months: [11, 12], factor: 2.4 } },
  { description: 'DECATHLON', chance: 0.015, min: 18, max: 129, peak: { months: [4, 5, 6], factor: 2 } },
  { description: 'UNIQLO PARIS', chance: 0.014, min: 19, max: 89, peak: { months: [12, 1, 7], factor: 2.2 } },
  { description: 'FNAC', chance: 0.016, min: 14, max: 149, peak: { months: [12], factor: 3 } },
  { description: 'UGC CINE CITE', chance: [0.02, 0.02, 0.06, 0.02, 0.07, 0.1, 0.08], min: 11.9, max: 11.9 },
  { description: 'Steam Purchase', chance: 0.02, min: 4.99, max: 39.99, peak: { months: [12, 6], factor: 2 } },
  { description: 'PHARMACIE LAFAYETTE', chance: 0.04, min: 5.5, max: 34, peak: { months: [1, 2], factor: 1.8 } },
  { description: 'IKEA PARIS', chance: 0.008, min: 25, max: 210 },
  { description: 'Leroy Merlin', chance: 0.008, min: 12, max: 76 },
  { description: 'ATM CASH WITHDRAWAL', chance: 0.01, min: 40, max: 40, kind: 'atm' },
  { description: 'To Marie Dupont', chance: 0.03, min: 10, max: 60, kind: 'transfer' },
]

/** Same day every month. */
const MONTHLY: { day: number; description: string; amount: number; kind?: Kind }[] = [
  { day: 1, description: 'To Atelier Immobilier (rent)', amount: -890, kind: 'transfer' },
  { day: 2, description: 'RATP NAVIGO', amount: -88.8 },
  { day: 3, description: 'FREE MOBILE', amount: -19.99 },
  { day: 5, description: 'NETFLIX.COM', amount: -13.49 },
  { day: 12, description: 'Spotify P1B2C3', amount: -11.12 },
  { day: 15, description: 'BASIC-FIT', amount: -29.99 },
  { day: 20, description: 'EDF', amount: -64.3 },
  { day: 22, description: 'APPLE.COM/BILL', amount: -2.99 },
  { day: 26, description: 'To EUR Savings', amount: -250, kind: 'transfer' },
  { day: 28, description: 'Payment from Acme SAS', amount: 2950, kind: 'income' },
]

/** Holidays: days before the start the trip is booked, during it the spending moves. */
const TRIPS = [
  {
    daysAgo: 95,
    length: 9,
    stay: 'Airbnb',
    flight: 'RYANAIR',
    city: ['Trattoria da Enzo', 'Gelateria Dondoli', 'Mercato Centrale'],
  },
  {
    daysAgo: 300,
    length: 5,
    stay: 'Booking.com Hotel',
    flight: 'EASYJET',
    city: ['Taberna La Bola', 'Mercado San Miguel'],
  },
]

const round = (value: number) => Math.round(value * 100) / 100

export function sampleTransactions(): Transaction[] {
  const random = seeded(20261020)
  const end = today()
  const start = addDays(end, -425)
  const transactions: Transaction[] = []
  const add = (
    date: string,
    description: string,
    amount: number,
    kind: Kind = amount < 0 ? 'card' : 'income',
    mcc: string | null = null,
  ) => {
    transactions.push({
      id: `sample:${transactions.length}`,
      date,
      amount: round(amount),
      currency: 'EUR',
      description,
      kind,
      mcc,
      // The last two days' card payments are not booked yet.
      pending: kind === 'card' && date >= addDays(end, -1),
      source: 'sample',
    })
  }
  const trips = TRIPS.map((trip) => ({
    ...trip,
    from: addDays(end, -trip.daysAgo),
    to: addDays(end, -trip.daysAgo + trip.length - 1),
  }))
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const daysFromStart = Math.round((Date.parse(date) - Date.parse(start)) / 86_400_000)
    // Prices and habits creep up a little over the months.
    const drift = 1 + daysFromStart / 425 / 12
    const month = Number(date.slice(5, 7))
    const weekday = weekdayOf(date)
    const away = trips.find((trip) => date >= trip.from && date <= trip.to)
    for (const item of MONTHLY) {
      if (Number(date.slice(8, 10)) !== item.day) continue
      add(date, item.description, item.amount * (item.kind ? 1 : drift), item.kind)
    }
    for (const trip of trips) {
      if (date === addDays(trip.from, -40)) add(date, trip.stay, -(320 + random() * 340))
      if (date === addDays(trip.from, -55)) add(date, trip.flight, -(90 + random() * 120))
    }
    if (away) {
      if (random() < 0.9) {
        add(date, away.city[Math.floor(random() * away.city.length)], -(14 + random() * 52), 'card', '5812')
      }
      if (random() < 0.3) add(date, 'Museo degli Uffizi', -(12 + random() * 14))
      continue
    }
    for (const habit of HABITS) {
      const base = Array.isArray(habit.chance) ? habit.chance[weekday] : habit.chance
      const chance = base * drift * (habit.peak?.months.includes(month) ? habit.peak.factor : 1)
      if (random() >= chance) continue
      const names = Array.isArray(habit.description) ? habit.description : [habit.description]
      const description = names[Math.floor(random() * names.length)]
      add(date, description, -(habit.min + random() * (habit.max - habit.min)) * drift, habit.kind, habit.mcc)
    }
    // Now and then something goes back to the store.
    if (random() < 0.006) add(date, 'AMAZON.FR*REFUND', 12 + random() * 40, 'refund')
  }
  return transactions
}
