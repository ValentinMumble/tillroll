import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {toRows} from './rows';
import type {Transaction} from './types';
import {yearFacts} from './year';

let lastId = 0;

/** A card payment, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

const categories = categoriesFrom([]);
const rows = toRows(
  [
    payment({description: 'Boulangerie Eugénie', amount: -100, date: '2025-03-04'}),
    payment({description: 'Boulangerie Eugénie', amount: -3, date: '2026-01-05'}),
    payment({description: 'Boulangerie Eugénie', amount: -3, date: '2026-01-12'}),
    payment({description: 'Boulangerie Eugénie', amount: -4, date: '2026-02-02'}),
    payment({description: 'Hotel Zara Napoli', amount: -200, date: '2026-02-14'}),
    payment({description: 'Da Michele', amount: -30, date: '2026-02-15'}),
  ],
  {rules: {}, categories, merges: {}, labels: {}, paymentCategories: {}},
);
const facts = (moneyIn: number) =>
  yearFacts({year: '2026', rows, moneyIn, toSavings: 50, trips: {}, currency: 'EUR', categories});

describe('yearFacts', () => {
  it('sums the year against the one before, with its months, places and biggest day', () => {
    const byTitle = Object.fromEntries(facts(1000).map(fact => [fact.title, fact]));
    expect(byTitle['Spent in 2026'].value).toBe('€240');
    expect(byTitle['Spent in 2026'].detail).toContain('140% more than 2025 (€100)');
    expect(byTitle.Kept.value).toBe('€760');
    expect(byTitle.Kept.detail).toContain('€50 to savings');
    expect(byTitle['Biggest month'].value).toBe('February');
    expect(byTitle['Where the most went'].value).toBe('Hotel Zara Napoli');
    expect(byTitle['Your regular'].value).toBe('Boulangerie Eugénie');
    expect(byTitle['New places'].value).toBe('2');
    expect(byTitle['Biggest day'].value).toBe('Sat 14 Feb');
  });

  it('leaves what was kept out when the pay is not in the data', () => {
    expect(facts(50).some(fact => fact.title === 'Kept')).toBe(false);
  });
});
