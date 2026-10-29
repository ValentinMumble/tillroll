import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {toRows} from './rows';
import {funStats} from './stats';
import {trainStats} from './trains';
import {hobbyStats} from './hobbies';
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

describe('train stats', () => {
  it('finds the line taken most, the places reached and how far', () => {
    const tickets = [
      payment({description: 'SNCF-VOYAGEURS', amount: -17, date: '2026-01-10'}),
      payment({description: 'SNCF-VOYAGEURS', amount: -17, date: '2026-01-12'}),
      payment({description: 'Trainline', amount: -92, date: '2026-02-01'}),
      payment({description: 'Cafe Pop', amount: -4, date: '2026-02-02'}),
    ];
    const rows = toRows(tickets, {
      rules: {},
      categories,
      merges: {},
      labels: {
        [tickets[0].id]: ['Nantes ⇄ Lorient'],
        [tickets[1].id]: ['Nantes ⇄ Lorient'],
        [tickets[2].id]: ['Nantes ⇄ Paris'],
      },
      paymentCategories: {},
    });
    const facts = trainStats(rows, 'EUR');
    const fact = (title: string) => facts.find(item => item.title === title);
    expect(fact('Spent on train tickets')?.detail).toMatch(/^3 tickets/);
    expect(fact('Your line')?.value).toBe('Nantes ⇄ Lorient');
    expect(fact('Reached by train')?.detail).toBe('from Nantes, most often Lorient (2), Paris (1)');
    expect(fact('Furthest by train')?.value).toBe('Paris');
    expect(fact('Priciest ticket')?.value).toBe('€92');
  });
});

describe('hobby stats', () => {
  it('shows each hobby with what came back from resales', () => {
    const bike = categoriesFrom([{key: 'bike', label: 'Bike', icon: '🚲', spending: true, hobby: true}]);
    const wheels = payment({description: 'Bike shop', amount: -300, date: '2026-01-10'});
    const sold = payment({description: 'Leboncoin', kind: 'income', amount: 120, date: '2026-05-10'});
    const rows = toRows([wheels, sold], {
      rules: {},
      categories: bike,
      merges: {},
      labels: {[wheels.id]: ['Wheels']},
      paymentCategories: {[wheels.id]: 'bike', [sold.id]: 'bike'},
    });
    const [all, tile] = hobbyStats(rows, 'EUR', bike);
    expect(all.detail).toMatch(/^1 hobby/);
    expect(tile.title).toBe('Bike');
    expect(tile.value).toBe('€180');
    expect(tile.detail).toBe('1 purchase since 2026; €120 back from resales and refunds; the biggest Wheels (€300)');
  });
});
