import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {toRows} from './rows';
import {funStats} from './stats';
import type {Transaction} from './types';

let lastId = 0;

/** A bank payment, a card one by default, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

const categories = categoriesFrom([]);
const titled = (title: string, transactions: Transaction[], paybacks: Record<string, string> = {}) => {
  const rows = toRows(transactions, {
    rules: {},
    categories,
    merges: {},
    labels: {},
    paymentCategories: {},
    paybacks,
  });
  return funStats(rows, 'EUR', categories)?.facts.find(fact => fact.title === title);
};

describe('fun stats', () => {
  it('adds up what friends paid back, and names who paid the most', () => {
    const flat = payment({description: 'Airbnb', amount: -900, date: '2026-09-22'});
    const alex = payment({description: 'Alexandre Mazure', kind: 'income', amount: 300, date: '2026-10-03'});
    const fact = titled('Paid back by friends', [flat, alex], {[alex.id]: flat.id});
    expect(fact?.value).toBe('€300');
    expect(fact?.detail).toContain('Alexandre Mazure');
  });

  it('adds up the payments under €5', () => {
    const coffees = Array.from({length: 10}, (_value, index) =>
      payment({description: 'Boulangerie', amount: -2, date: `2026-10-${String(index + 1).padStart(2, '0')}`}),
    );
    expect(titled('Small stuff adds up', coffees)?.value).toBe('€20');
  });
});
