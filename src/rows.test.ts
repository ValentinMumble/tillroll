import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {type Row, toRows} from './rows';
import type {Transaction} from './types';

let lastId = 0;

/** A bank payment, a card one by default, with what a test cares about. */
function payment(fields: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'description'>): Transaction {
  lastId += 1;
  return {id: `t${lastId}`, currency: 'EUR', kind: 'card', mcc: null, pending: false, source: 'bank', ...fields};
}

function rowsOf(transactions: Transaction[], paymentCategories: Record<string, string> = {}) {
  const rows = toRows(transactions, {
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories,
  });
  return (transaction: Transaction) => rows.find(row => row.id === transaction.id) as Row;
}

describe('PayPal', () => {
  it('counts a purchase once, at its shop, and the bank payment that paid it as a move', () => {
    const shop = payment({bank: 'PayPal', description: 'Bandcamp', amount: -10, date: '2026-10-01'});
    const bank = payment({description: 'PAYPAL *BANDCAMP', amount: -10, date: '2026-10-02'});
    const row = rowsOf([shop, bank]);
    expect(row(bank).category).toBe('own');
    expect(row(bank).spend).toBe(0);
    expect(row(shop).spend).toBe(10);
  });

  it('pairs a withdrawal with the bank money in of as much, both moves', () => {
    const out = payment({bank: 'PayPal', description: 'Unknown', kind: 'transfer', amount: -50, date: '2026-10-05'});
    const back = payment({description: 'PAYPAL EUROPE', kind: 'income', amount: 50, date: '2026-10-06'});
    const row = rowsOf([out, back]);
    expect(row(out).category).toBe('own');
    expect(row(back).category).toBe('own');
  });

  it('pairs a purchase with a card payment naming the shop instead of PayPal', () => {
    const shop = payment({bank: 'PayPal', description: 'AliExpress', amount: -23.45, date: '2026-10-03'});
    const card = payment({description: 'Alipay', amount: -23.45, date: '2026-10-04'});
    const row = rowsOf([shop, card]);
    expect(row(card).category).toBe('own');
    expect(row(shop).spend).toBe(23.45);
  });
});

describe('refunds', () => {
  it('gives a refund back to the payment it matches', () => {
    const bought = payment({description: 'FNAC', amount: -40, date: '2026-09-01'});
    const refund = payment({description: 'FNAC', kind: 'refund', amount: 15, date: '2026-09-10'});
    const row = rowsOf([bought, refund]);
    expect(row(refund).refundOf?.id).toBe(bought.id);
    expect(row(refund).spend).toBe(0);
    expect(row(bought).spend).toBe(25);
  });

  it('leaves a refund older than any payment at the store unmatched', () => {
    const refund = payment({description: 'FNAC', kind: 'refund', amount: 15, date: '2026-09-10'});
    const later = payment({description: 'FNAC', amount: -40, date: '2026-09-20'});
    const row = rowsOf([refund, later]);
    expect(row(refund).refundOf).toBeNull();
    expect(row(later).spend).toBe(40);
  });
});

describe('days and picks', () => {
  it('dates a deferred debit card payment on the day it was paid', () => {
    const deferred = payment({description: 'CB CAFE POP FACT 270826', amount: -4.5, date: '2026-09-01'});
    expect(rowsOf([deferred])(deferred).date).toBe('2026-08-27');
  });

  it('gives a store and amount the category picked twice for it', () => {
    const first = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-08-05'});
    const second = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-09-05'});
    const third = payment({description: 'Barbin', kind: 'transfer', amount: -852, date: '2026-10-05'});
    const row = rowsOf([first, second, third], {[first.id]: 'home', [second.id]: 'home'});
    expect(row(third).category).toBe('home');
    expect(row(third).basis).toBe('picked');
  });
});
