import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {toRows} from './rows';
import {tripCandidates, tripDays, tripFacts, tripSummaries} from './trips';
import type {Transaction} from './types';

let lastId = 0;

/** A card payment, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

const flight = payment({description: 'Volotea', amount: -140, date: '2026-06-01'});
const hotel = payment({description: 'Hotel Zara Napoli', amount: -200, date: '2026-09-12'});
const pizza = payment({description: 'Da Michele', amount: -30, date: '2026-09-14'});
const ferry = payment({description: 'Alilauro', amount: -40, date: '2026-09-15'});
const bakery = payment({description: 'Boulangerie Eugénie', amount: -3, date: '2026-09-13'});
const bakeryBefore = payment({description: 'Boulangerie Eugénie', amount: -3, date: '2026-08-20'});
const rows = toRows([flight, hotel, pizza, ferry, bakery, bakeryBefore], {
  rules: {},
  categories: categoriesFrom([]),
  merges: {},
  labels: {[flight.id]: ['Napoli'], [hotel.id]: ['Napoli'], [pizza.id]: ['Napoli']},
  paymentCategories: {},
});

describe('trips', () => {
  it("takes a trip's days from its last run of payments, leaving the booking months before out", () => {
    expect(tripDays(rows, 'napoli')).toEqual({from: '2026-09-12', to: '2026-09-14'});
    expect(tripDays(rows, 'Napoli', {to: '2026-09-16'})).toEqual({from: '2026-09-12', to: '2026-09-16'});
  });

  it('offers the payments of those days without the label, by day, a place paid around the trip not likely', () => {
    const offered = tripCandidates(rows, 'Napoli', '2026-09-12', '2026-09-16');
    expect(offered.map(item => [item.row.store, item.likely])).toEqual([
      ['Boulangerie Eugénie', false],
      ['Alilauro', true],
    ]);
  });

  it('sums up each trip and compares them', () => {
    const [napoli] = tripSummaries(rows, {Napoli: {}});
    expect([napoli.total, napoli.days, napoli.payments]).toEqual([370, 3, 3]);
    const facts = tripFacts([napoli], 'EUR', categoriesFrom([]), '2026');
    expect(facts[0].detail).toBe('1 trip, 3 days away, about €123 a day');
    expect(facts.find(fact => fact.title === 'Trips in 2026')?.value).toBe('€370');
  });
});
