import {describe, expect, it} from 'vitest';
import {categoriesFrom} from './categories';
import {bankMergeKey, type Row, toRows} from './rows';
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
    expect(row(bank).viaPayPal).toBe(true);
    expect(row(shop).spend).toBe(10);
  });

  it('marks a card payment naming the shop, paired with PayPal’s top-up, as paid via PayPal', () => {
    const shop = payment({
      bank: 'PayPal',
      description: 'MGP Vinted - Kleiderkreisel',
      amount: -11.84,
      date: '2022-09-15',
    });
    const topUp = payment({
      bank: 'PayPal',
      description: 'Dépôt sur carte standard',
      kind: 'topup',
      amount: 11.84,
      date: '2022-09-15',
    });
    const card = payment({description: 'Vinted', amount: -11.84, date: '2022-09-15'});
    const row = rowsOf([shop, topUp, card]);
    expect(row(card).category).toBe('own');
    expect(row(card).viaPayPal).toBe(true);
    expect(row(shop).spend).toBe(11.84);
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

describe('paybacks', () => {
  const sorting = (paybacks: Record<string, string>) => ({
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories: {},
    paybacks,
  });

  it('takes a friend’s share off the payment it pays back, in that payment’s month', () => {
    const flat = payment({description: 'Airbnb', amount: -865.82, date: '2026-09-22', mcc: '7011'});
    const share = payment({description: 'Alexandre Mazure', kind: 'income', amount: 286, date: '2026-10-03'});
    const rows = toRows([flat, share], sorting({[share.id]: flat.id}));
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(flat).spend).toBeCloseTo(579.82);
    expect(row(share).spend).toBe(0);
    expect(row(share).category).toBe(row(flat).category);
    expect(row(share).refundOf).toMatchObject({id: flat.id, store: 'Airbnb', byHand: true});
  });

  it('lets a payback round a payment up, which then costs nothing', () => {
    const stay = payment({description: 'AIRBNB * HMA8WY', amount: -17.99, date: '2026-10-20'});
    const share = payment({description: 'MR Dubost Axel', kind: 'income', amount: 18, date: '2026-10-26'});
    const rows = toRows([stay, share], sorting({[share.id]: stay.id}));
    expect(rows.find(item => item.id === stay.id)?.spend).toBe(0);
    expect(rows.find(item => item.id === share.id)?.spend).toBe(0);
  });

  it('lets a payback add a little on top, which lowers its own month’s spending', () => {
    const pizza = payment({description: 'Pizza Posto', amount: -26.5, date: '2026-05-03'});
    const share = payment({description: 'Anne-Cecile Martinet', kind: 'income', amount: 30, date: '2026-05-03'});
    const rows = toRows([pizza, share], sorting({[share.id]: pizza.id}));
    expect(rows.find(item => item.id === pizza.id)?.spend).toBe(0);
    expect(rows.find(item => item.id === share.id)?.refundOf).toMatchObject({id: pizza.id, byHand: true});
    expect(rows.find(item => item.id === share.id)?.spend).toBe(-3.5);
  });

  it('pays back what is left of a payment when something is sold on for more', () => {
    const order = payment({description: 'Lordgun', amount: -238.99, date: '2023-06-14'});
    const part = payment({description: 'Leboncoin', kind: 'income', amount: 159.5, date: '2024-03-02'});
    const sale = payment({description: 'LBC France SAS', kind: 'income', amount: 280, date: '2025-07-21'});
    const rows = toRows([order, part, sale], sorting({[part.id]: order.id, [sale.id]: order.id}));
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(order).spend).toBe(0);
    expect(row(part).spend).toBe(0);
    expect(row(sale).beyond).toBeCloseTo(200.51);
    expect(row(sale).spend).toBeCloseTo(-200.51);
  });

  it('leaves aside a link to a payment paid back in full already', () => {
    const coffee = payment({description: 'Cafe Pop', amount: -4.5, date: '2026-09-22'});
    const first = payment({description: 'Alexandre Mazure', kind: 'income', amount: 4.5, date: '2026-09-23'});
    const second = payment({description: 'Alexandre Mazure', kind: 'income', amount: 4.5, date: '2026-09-24'});
    const rows = toRows([coffee, first, second], sorting({[first.id]: coffee.id, [second.id]: coffee.id}));
    expect(rows.find(item => item.id === first.id)?.refundOf).not.toBeNull();
    expect(rows.find(item => item.id === second.id)?.refundOf).toBeNull();
  });
});

describe('sales', () => {
  it('lowers its own category’s spending, not the latest payment at its store', () => {
    const racket = payment({description: 'Leboncoin', amount: -74.2, date: '2025-06-12'});
    const sale = payment({description: 'Leboncoin', kind: 'income', amount: 35, date: '2025-08-04'});
    const bike = categoriesFrom([{key: 'bike', label: 'Bike', icon: '🚲', spending: true}]);
    const rows = toRows([racket, sale], {
      rules: {},
      categories: bike,
      merges: {},
      labels: {},
      paymentCategories: {[racket.id]: 'fun', [sale.id]: 'bike'},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(sale).refundOf).toBeNull();
    expect(row(sale).spend).toBe(-35);
    expect(row(racket).spend).toBe(74.2);
  });

  it('never gives back a payment of the same category with other labels', () => {
    const bag = payment({description: 'Leboncoin', amount: -102.79, date: '2024-01-02'});
    const sale = payment({description: 'Leboncoin', kind: 'income', amount: 50, date: '2024-03-05'});
    const rows = toRows([bag, sale], {
      rules: {},
      categories: categoriesFrom([]),
      merges: {},
      labels: {[bag.id]: ['Sacoche Ortlieb'], [sale.id]: ['Restrap']},
      paymentCategories: {[bag.id]: 'shopping', [sale.id]: 'shopping'},
    });
    expect(rows.find(item => item.id === sale.id)?.refundOf).toBeNull();
  });

  it('still gives back a payment of its category, a refund sent by transfer', () => {
    const ticket = payment({description: 'SNCF', amount: -176, date: '2026-07-26'});
    const refund = payment({description: 'SNCF', kind: 'income', amount: 88, date: '2026-08-03'});
    const rows = toRows([ticket, refund], {
      rules: {sncf: 'transport'},
      categories: categoriesFrom([]),
      merges: {},
      labels: {},
      paymentCategories: {[refund.id]: 'transport'},
    });
    expect(rows.find(item => item.id === refund.id)?.refundOf?.id).toBe(ticket.id);
    expect(rows.find(item => item.id === ticket.id)?.spend).toBe(88);
  });
});

describe('card refunds named after the holder', () => {
  const sorting = {
    rules: {},
    categories: categoriesFrom([]),
    merges: {},
    labels: {},
    paymentCategories: {},
    me: ['Valentin Dijkstra'],
  };

  it('gives back the card payment of the same amount, a shop’s refund', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, refund], sorting);
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(refund).refundOf).toMatchObject({id: order.id, store: 'Amazon', byHand: false});
    expect(row(order).spend).toBe(0);
  });

  it('still gives it back when its store is renamed into one filed under moves between my accounts', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const refund = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, refund], {
      ...sorting,
      rules: {'other account': 'own'},
      merges: {'valentin jan dijkstra': 'Valentin Dijkstra', 'valentin dijkstra': 'Other account'},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(refund).store).toBe('Other account');
    expect(row(refund).refundOf).toMatchObject({id: order.id, store: 'Amazon'});
    expect(row(order).spend).toBe(0);
  });

  it('stays a move between one’s accounts when as much left another bank', () => {
    const order = payment({description: 'Amazon', amount: -12.57, date: '2026-10-19'});
    const sent = payment({
      bank: 'Crédit Coopératif',
      description: 'VIR SEPA Valentin Dijkstra',
      kind: 'transfer',
      amount: -12.57,
      date: '2026-10-27',
    });
    const received = payment({description: 'Valentin Jan Dijkstra', kind: 'income', amount: 12.57, date: '2026-10-28'});
    const rows = toRows([order, sent, received], sorting);
    expect(rows.find(item => item.id === received.id)?.refundOf).toBeNull();
    expect(rows.find(item => item.id === order.id)?.spend).toBe(12.57);
  });

  it('never gives back a card top-up of another account', () => {
    const topUp = payment({description: 'Revolut', amount: -1000, date: '2026-08-17'});
    const fromSavings = payment({
      description: 'VIR SEPA M DIJKSTRA VALENTIN',
      kind: 'income',
      amount: 1000,
      date: '2026-08-17',
    });
    const rows = toRows([topUp, fromSavings], {
      ...sorting,
      rules: {revolut: 'own', 'vir sepa m dijkstra valentin': 'own'},
    });
    expect(rows.find(item => item.id === fromSavings.id)?.refundOf).toBeNull();
  });
});

describe('merges', () => {
  it('merges one bank’s payments only, before the store’s own merge', () => {
    const coop = payment({
      bank: 'Crédit Coopératif',
      description: 'VIREMENT VERS VALENTIN DIJKSTRA',
      amount: -1000,
      date: '2026-05-11',
    });
    const revolut = payment({description: 'To Valentin Dijkstra', kind: 'transfer', amount: -50, date: '2022-09-27'});
    const rows = toRows([coop, revolut], {
      rules: {},
      categories: categoriesFrom([]),
      merges: {
        [bankMergeKey('valentin dijkstra', 'Crédit Coopératif')]: 'To Revolut',
        'valentin dijkstra': 'Other account',
      },
      labels: {},
      paymentCategories: {},
    });
    const row = (transaction: Transaction) => rows.find(item => item.id === transaction.id) as Row;
    expect(row(coop).store).toBe('To Revolut');
    expect(row(coop).partName).toBe('Valentin Dijkstra (Crédit Coopératif)');
    expect(row(revolut).store).toBe('Other account');
    expect(row(revolut).partKey).toBe('valentin dijkstra');
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
